const Booking = require('../models/Booking');
const Room = require('../models/Room');
const Coupon = require('../models/Offer');
const User = require('../models/User');
const Notification = require('../models/Notification');
const crypto = require('crypto');
const { createOrder, verifyPayment } = require('../utils/payment');
const sendEmail = require('../utils/email');
const sendSMS = require('../utils/sms');

const bookingTemplate = (user, room, booking) => {
  const isPaymentReceived = String(booking?.paymentStatus || '').toLowerCase() === 'paid';
  const heading = isPaymentReceived ? 'Payment Successful - Booking Confirmed' : 'Booking Confirmed';
  const intro = isPaymentReceived
    ? `Your payment has been received and your booking for <b>${room.title}</b> is confirmed.`
    : `Your booking for <b>${room.title}</b> is confirmed. Payment is currently pending.`;

  return `
<div style="padding:20px;font-family:sans-serif">
  <h2>${heading}</h2>
  <p>Hi ${user.firstName || 'Guest'},</p>
  <p>${intro}</p>
  <ul>
    <li>Check-in: ${new Date(booking.fromDate).toDateString()}</li>
    <li>Check-out: ${new Date(booking.toDate).toDateString()}</li>
    <li>Total: Rs ${booking.totalAmount}</li>
    <li>Payment method: ${booking.paymentMethod}</li>
    <li>Payment status: ${booking.paymentStatus}</li>
    <li>Booking ID: ${booking._id}</li>
  </ul>
</div>
`;
};

const bookingSmsTemplate = ({ guestName, roomTitle, booking, isPaymentReceived }) =>
  isPaymentReceived
    ? `Hi ${guestName}, payment received for ${roomTitle}. Your booking is confirmed for ${new Date(
        booking.fromDate
      ).toDateString()} to ${new Date(booking.toDate).toDateString()}. Booking ID: ${booking._id}.`
    : `Hi ${guestName}, your booking for ${roomTitle} is confirmed from ${new Date(
        booking.fromDate
      ).toDateString()} to ${new Date(booking.toDate).toDateString()}. Payment is pending. Booking ID: ${
        booking._id
      }.`;

const validateBookingDates = (fromDate, toDate) => {
  const start = new Date(fromDate);
  const end = new Date(toDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { error: 'Invalid dates' };
  }

  if (start >= end) {
    return { error: 'Check-out date must be after check-in date' };
  }

  return { start, end };
};

const buildPricing = async ({ roomId, fromDate, toDate, couponCode }) => {
  const room = await Room.findById(roomId);

  if (!room) {
    return { error: 'Room not found', status: 404 };
  }

  const { start, end, error } = validateBookingDates(fromDate, toDate);
  if (error) {
    return { error, status: 400 };
  }

  const overlappingBookings = await Booking.find({
    room: roomId,
    status: { $in: ['approved', 'hold'] },
    fromDate: { $lt: end },
    toDate: { $gt: start },
  }).select('_id');

  if (overlappingBookings.length > 0) {
    return { error: 'Room already booked for the selected dates', status: 400 };
  }

  const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  const subtotal = totalDays * Number(room.pricePerNight || 0);
  const taxAmount = Math.round(subtotal * 0.05);
  const grossAmount = subtotal + taxAmount;

  let discountAmount = 0;
  let appliedCoupon = null;

  if (couponCode) {
    const coupon = await Coupon.findOne({
      code: couponCode.toUpperCase(),
      isActive: true,
    });

    if (!coupon) {
      return { error: 'Invalid coupon', status: 400 };
    }

    if (new Date() > new Date(coupon.expiryDate)) {
      return { error: 'Coupon expired', status: 400 };
    }

    if (coupon.usedCount >= coupon.usageLimit) {
      return { error: 'Coupon limit reached', status: 400 };
    }

    if (grossAmount < Number(coupon.minAmount || 0)) {
      return {
        error: `Minimum Rs ${coupon.minAmount} required`,
        status: 400,
      };
    }

    if (coupon.discountType === 'percentage') {
      discountAmount = (grossAmount * Number(coupon.discountValue || 0)) / 100;
    } else {
      discountAmount = Number(coupon.discountValue || 0);
    }

    if (coupon.maxDiscount) {
      discountAmount = Math.min(discountAmount, Number(coupon.maxDiscount));
    }

    appliedCoupon = coupon.code;
  }

  const totalAmount = Math.max(0, Math.round(grossAmount - discountAmount));

  return {
    room,
    start,
    end,
    totalDays,
    subtotal,
    taxAmount,
    grossAmount,
    discountAmount,
    totalAmount,
    coupon: appliedCoupon,
  };
};

const attachBookingToUser = async (userId, bookingId) => {
  await User.findByIdAndUpdate(userId, {
    $addToSet: { bookingHistory: bookingId },
  });
};

const createPaymentReminderNotification = async (userId, bookingId, roomTitle) => {
  return Notification.create({
    user: userId,
    type: 'payment',
    message: `Billing generated for ${roomTitle}. You can do payment now using Razorpay.`,
    link: `/billing?id=${bookingId}`,
  });
};

const createPaymentSuccessNotification = async (userId, bookingId, roomTitle) => {
  return Notification.create({
    user: userId,
    type: 'payment',
    message: `Payment received for ${roomTitle || 'your booking'}. Your booking is confirmed.`,
    link: `/billing?id=${bookingId}`,
  });
};

const createBookingReminderAlert = async (userId, bookingId, roomTitle, fromDate) => {
  return Notification.create({
    user: userId,
    type: 'booking',
    message: `Reminder: your stay for ${roomTitle || 'your booking'} starts on ${new Date(
      fromDate
    ).toDateString()}.`,
    link: `/booking/${bookingId}`,
  });
};

const createBookingStatusNotification = async (userId, bookingId, roomTitle, status) => {
  const normalizedStatus = String(status || '').toLowerCase();

  const statusMap = {
    approved: {
      type: 'booking',
      message: `Your booking for ${roomTitle || 'your room'} has been approved.`,
      link: `/booking/${bookingId}`,
    },
    cancelled: {
      type: 'booking',
      message: `Your booking for ${roomTitle || 'your room'} has been cancelled.`,
      link: `/booking/${bookingId}`,
    },
    hold: {
      type: 'booking',
      message: `Your booking for ${roomTitle || 'your room'} is on hold pending confirmation.`,
      link: `/booking/${bookingId}`,
    },
  };

  const config = statusMap[normalizedStatus];
  if (!config) {
    return null;
  }

  return Notification.create({
    user: userId,
    type: config.type,
    message: config.message,
    link: config.link,
  });
};

const getBookingEmailRecipients = async (userId, guestDetails = {}) => {
  try {
    const user = await User.findById(userId).select('firstName lastName email');
    const userEmail = String(user?.email || '').trim().toLowerCase();
    const guestEmail = String(guestDetails?.email || '').trim().toLowerCase();

    const recipients = [userEmail, guestEmail && guestEmail !== userEmail ? guestEmail : '']
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index);

    return { user, recipients };
  } catch (err) {
    console.error('Booking email recipient lookup failed:', err.message || err);
    return { user: null, recipients: [] };
  }
};

const getBookingPhoneRecipients = async (userId, guestDetails = {}) => {
  try {
    const user = await User.findById(userId).select('firstName lastName phone');
    const userPhone = String(user?.phone || '').trim();
    const guestPhone = String(guestDetails?.phone || '').trim();

    const recipients = [userPhone, guestPhone && guestPhone !== userPhone ? guestPhone : '']
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index);

    return { user, recipients };
  } catch (err) {
    console.error('Booking SMS recipient lookup failed:', err.message || err);
    return { user: null, recipients: [] };
  }
};

const sendBookingConfirmation = async ({ userId, room, booking, guestDetails, subject }) => {
  const { user, recipients } = await getBookingEmailRecipients(userId, guestDetails);

  if (!recipients.length) {
    console.warn('Booking email skipped: recipient email not found');
    return 'skipped';
  }

  console.log('Booking confirmation email recipients:', {
    bookingId: booking?._id,
    recipients,
    subject,
  });

  const results = await Promise.allSettled(
    recipients.map((recipient) =>
      sendEmail(
        recipient,
        subject || 'Booking Confirmed',
        bookingTemplate(user || { firstName: 'Guest' }, room, booking)
      )
    )
  );

  const sentCount = results.filter((result) => {
    if (result.status !== 'fulfilled') {
      return false;
    }

    const acceptedRecipients = Array.isArray(result.value?.accepted)
      ? result.value.accepted.map((value) => String(value || '').trim().toLowerCase())
      : [];

    return acceptedRecipients.length > 0;
  }).length;

  if (sentCount === 0) {
    return 'failed';
  }

  return sentCount === results.length ? 'sent' : 'partial';
};

const sendBookingConfirmationWithStatus = async (params) => {
  try {
    return await sendBookingConfirmation(params);
  } catch (err) {
    console.error('Booking confirmation email failed:', err.message || err);
    return 'failed';
  }
};

const sendBookingSmsWithStatus = async ({ userId, room, booking, guestDetails, isPaymentReceived }) => {
  try {
    const { user, recipients } = await getBookingPhoneRecipients(userId, guestDetails);

    if (!recipients.length) {
      console.warn('Booking SMS skipped: recipient phone not found');
      return 'skipped';
    }

    const guestName =
      [guestDetails?.firstName, guestDetails?.lastName].filter(Boolean).join(' ') ||
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
      'Guest';

    const smsBody = bookingSmsTemplate({
      guestName,
      roomTitle: room?.title || 'your room',
      booking,
      isPaymentReceived,
    });

    const results = await Promise.allSettled(recipients.map((recipient) => sendSMS(recipient, smsBody)));
    const sentCount = results.filter(
      (result) => result.status === 'fulfilled' && !result.value?.skipped
    ).length;

    if (sentCount === 0) {
      const skippedOnly = results.every(
        (result) => result.status === 'fulfilled' && result.value?.skipped
      );
      return skippedOnly ? 'skipped' : 'failed';
    }

    return sentCount === results.length ? 'sent' : 'partial';
  } catch (err) {
    console.error('Booking SMS failed:', err.message || err);
    return 'failed';
  }
};

const verifyWebhookSignature = (payloadBuffer, signature) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    const error = new Error('Missing Razorpay webhook secret');
    error.statusCode = 500;
    throw error;
  }

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(payloadBuffer)
    .digest('hex');

  if (expectedSignature !== signature) {
    const error = new Error('Invalid webhook signature');
    error.statusCode = 400;
    throw error;
  }
};

const finalizePaidBooking = async ({
  booking,
  paymentId,
  orderId,
  fallbackUser,
  subject,
  logLabel,
}) => {
  const alreadyPaid = booking.paymentStatus === 'paid';

  if (alreadyPaid) {
    return { booking, emailStatus: 'skipped', alreadyPaid: true };
  }

  if (!booking.room || typeof booking.room !== 'object') {
    booking = await Booking.findById(booking._id).populate('room');
  }

  booking.paymentStatus = 'paid';
  booking.paymentMethod = 'online';
  booking.status = booking.status === 'cancelled' ? 'cancelled' : 'approved';
  booking.razorpayOrderId = orderId || booking.razorpayOrderId || null;
  booking.razorpayPaymentId = paymentId || booking.razorpayPaymentId || null;
  booking.expiresAt = null;
  await booking.save();

  const bookingUserId = booking.user || fallbackUser?._id || null;
  const room = booking.room || (await Room.findById(booking.room));
  const emailStatus = bookingUserId
    ? await sendBookingConfirmationWithStatus({
        userId: bookingUserId,
        room,
        booking,
        guestDetails: booking.guestDetails,
        subject: subject || 'Payment Successful - Booking Confirmed',
      })
    : 'skipped';
  const smsStatus = bookingUserId
    ? await sendBookingSmsWithStatus({
        userId: bookingUserId,
        room,
        booking,
        guestDetails: booking.guestDetails,
        isPaymentReceived: true,
      })
    : 'skipped';

  let notificationCreated = false;
  let notification = null;

  if (bookingUserId) {
    try {
      notification = await createPaymentSuccessNotification(bookingUserId, booking._id, room?.title);
      notificationCreated = true;
    } catch (notificationError) {
      console.error(
        `${logLabel || 'Paid booking'} notification failed:`,
        notificationError.message || notificationError
      );
    }
  }

  return { booking, emailStatus, smsStatus, alreadyPaid: false, notificationCreated, notification };
};

const createBooking = async (req, res) => {
  if (!req.user?._id) {
    return res.status(401).json({ message: 'No token provided' });
  }

  if (req.user.role === 'admin') {
    return res.status(403).json({ message: 'Admins are not allowed to book rooms.' });
  }

  try {
    const { roomId, fromDate, toDate, couponCode, paymentMethod, guestDetails } = req.body;

    if (
      !roomId ||
      !fromDate ||
      !toDate ||
      !guestDetails ||
      !guestDetails.firstName ||
      !guestDetails.lastName ||
      !guestDetails.email ||
      !guestDetails.phone
    ) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const pricing = await buildPricing({ roomId, fromDate, toDate, couponCode });
    if (pricing.error) {
      return res.status(pricing.status || 400).json({ message: pricing.error });
    }

    const bookingData = {
      roomId,
      fromDate,
      toDate,
      totalDays: pricing.totalDays,
      subtotal: pricing.subtotal,
      taxAmount: pricing.taxAmount,
      grossAmount: pricing.grossAmount,
      discountAmount: pricing.discountAmount,
      totalAmount: pricing.totalAmount,
      coupon: pricing.coupon,
      guestDetails,
    };

    if (!paymentMethod) {
      return res.json({
        success: true,
        bookingData,
        pricingPreview: true,
      });
    }

    if (paymentMethod === 'cash') {
      const booking = await Booking.create({
        user: req.user._id,
        room: roomId,
        fromDate,
        toDate,
        totalDays: pricing.totalDays,
        subtotal: pricing.subtotal,
        taxAmount: pricing.taxAmount,
        grossAmount: pricing.grossAmount,
        discountAmount: pricing.discountAmount,
        totalAmount: pricing.totalAmount,
        coupon: pricing.coupon,
        paymentMethod: 'cash',
        paymentStatus: 'pending',
        status: 'approved',
        guestDetails,
        expiresAt: null,
      });

      await attachBookingToUser(req.user._id, booking._id);
      const emailStatus = await sendBookingConfirmationWithStatus({
        userId: req.user._id,
        room: pricing.room,
        booking,
        guestDetails,
        subject: 'Booking Confirmed, Payment Pending',
      });
      const smsStatus = await sendBookingSmsWithStatus({
        userId: req.user._id,
        room: pricing.room,
        booking,
        guestDetails,
        isPaymentReceived: false,
      });

      let notificationCreated = false;
      let notification = null;
      try {
        notification = await createPaymentReminderNotification(req.user._id, booking._id, pricing.room.title);
        notificationCreated = true;
      } catch (notificationError) {
        console.error('Cash booking notification failed:', notificationError.message || notificationError);
      }

      return res.status(201).json({
        success: true,
        booking,
        bookingData,
        emailStatus,
        smsStatus,
        notificationCreated,
        notification,
      });
    }

    const order = await createOrder(pricing.totalAmount);
    const booking = await Booking.create({
      user: req.user._id,
      room: roomId,
      fromDate,
      toDate,
      totalDays: pricing.totalDays,
      subtotal: pricing.subtotal,
      taxAmount: pricing.taxAmount,
      grossAmount: pricing.grossAmount,
      discountAmount: pricing.discountAmount,
      totalAmount: pricing.totalAmount,
      coupon: pricing.coupon,
      paymentMethod: 'online',
      paymentStatus: 'pending',
      status: 'hold',
      guestDetails,
      razorpayOrderId: order.id,
      expiresAt: null,
    });

    await attachBookingToUser(req.user._id, booking._id);

    const emailStatus = await sendBookingConfirmationWithStatus({
      userId: req.user._id,
      room: pricing.room,
      booking,
      guestDetails,
      subject: 'Booking Confirmed, Payment Pending',
    });
    const smsStatus = await sendBookingSmsWithStatus({
      userId: req.user._id,
      room: pricing.room,
      booking,
      guestDetails,
      isPaymentReceived: false,
    });

    let notificationCreated = false;
    let notification = null;
    try {
      notification = await createPaymentReminderNotification(req.user._id, booking._id, pricing.room.title);
      notificationCreated = true;
    } catch (notificationError) {
      console.error('Online booking notification failed:', notificationError.message || notificationError);
    }

    return res.json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID,
      booking,
      bookingId: booking._id,
      bookingData,
      emailStatus,
      smsStatus,
      notificationCreated,
      notification,
    });
  } catch (err) {
    console.error('Create booking error:', err);
    return res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
};

const createExistingBookingPaymentOrder = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('room');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (String(booking.user) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ message: 'Cancelled bookings cannot be paid' });
    }

    if (booking.paymentStatus === 'paid') {
      return res.status(400).json({ message: 'Booking is already paid' });
    }

    const order = await createOrder(booking.totalAmount);

    booking.razorpayOrderId = order.id;
    await booking.save();

    return res.json({
      success: true,
      key: process.env.RAZORPAY_KEY_ID,
      order,
      booking,
    });
  } catch (err) {
    console.error('Create existing payment order error:', err);
    return res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
};

const verifyExistingBookingPayment = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('room');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (String(booking.user) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ message: 'Cancelled bookings cannot be paid' });
    }

    if (booking.paymentStatus === 'paid') {
      return res.status(400).json({ message: 'Booking is already paid' });
    }

    const { paymentId, orderId, signature } = req.body;

    if (!verifyPayment(orderId, paymentId, signature)) {
      return res.status(400).json({ message: 'Payment verification failed' });
    }

    const result = await finalizePaidBooking({
      booking,
      paymentId,
      orderId,
      fallbackUser: req.user,
      subject: 'Payment Successful - Booking Confirmed',
      logLabel: 'Existing booking payment',
    });

    return res.json({
      success: true,
      booking: result.booking,
      emailStatus: result.emailStatus,
      smsStatus: result.smsStatus,
      notificationCreated: result.notificationCreated,
      notification: result.notification,
      alreadyPaid: result.alreadyPaid,
    });
  } catch (err) {
    console.error('Verify existing booking payment error:', err);
    return res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
};

const verifyBookingPayment = async (req, res) => {
  try {
    const { paymentId, orderId, signature, bookingData } = req.body;

    if (!req.user?._id) {
      return res.status(401).json({ message: 'No token provided' });
    }

    if (!bookingData?.roomId || !bookingData?.fromDate || !bookingData?.toDate) {
      return res.status(400).json({ message: 'Incomplete booking data' });
    }

    const pricing = await buildPricing({
      roomId: bookingData.roomId,
      fromDate: bookingData.fromDate,
      toDate: bookingData.toDate,
      couponCode: bookingData.coupon,
    });

    if (pricing.error) {
      return res.status(pricing.status || 400).json({ message: pricing.error });
    }

    if (!verifyPayment(orderId, paymentId, signature)) {
      return res.status(400).json({ message: 'Payment verification failed' });
    }

    const existing = await Booking.findOne({
      user: req.user._id,
      room: bookingData.roomId,
      fromDate: { $lt: pricing.end },
      toDate: { $gt: pricing.start },
      status: { $in: ['approved', 'hold'] },
    });

    if (existing) {
      return res.status(400).json({ message: 'Already booked' });
    }

    const booking = await Booking.create({
      user: req.user._id,
      room: bookingData.roomId,
      fromDate: bookingData.fromDate,
      toDate: bookingData.toDate,
      totalDays: pricing.totalDays,
      subtotal: pricing.subtotal,
      taxAmount: pricing.taxAmount,
      grossAmount: pricing.grossAmount,
      discountAmount: pricing.discountAmount,
      totalAmount: pricing.totalAmount,
      coupon: pricing.coupon,
      paymentStatus: 'paid',
      status: 'approved',
      paymentMethod: 'online',
      razorpayOrderId: orderId || null,
      razorpayPaymentId: paymentId || null,
      guestDetails: bookingData.guestDetails,
      expiresAt: null,
    });

    await attachBookingToUser(req.user._id, booking._id);
    const emailStatus = await sendBookingConfirmationWithStatus({
      userId: req.user._id,
      room: pricing.room,
      booking,
      guestDetails: bookingData.guestDetails,
      subject: 'Payment Successful - Booking Confirmed',
    });
    const smsStatus = await sendBookingSmsWithStatus({
      userId: req.user._id,
      room: pricing.room,
      booking,
      guestDetails: bookingData.guestDetails,
      isPaymentReceived: true,
    });

    let notificationCreated = false;
    let notification = null;
    try {
      notification = await createPaymentSuccessNotification(req.user._id, booking._id, pricing.room?.title);
      notificationCreated = true;
    } catch (notificationError) {
      console.error('Online booking payment notification failed:', notificationError.message || notificationError);
    }

    return res.json({ success: true, booking, emailStatus, smsStatus, notificationCreated, notification });
  } catch (err) {
    console.error('Verify booking error:', err);
    return res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
};

const handleRazorpayWebhook = async (req, res) => {
  try {
    const payloadBuffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(JSON.stringify(req.body || {}));

    verifyWebhookSignature(payloadBuffer, req.headers['x-razorpay-signature']);

    const event = JSON.parse(payloadBuffer.toString('utf8'));
    const eventName = String(event?.event || '');

    if (eventName === 'payment.failed') {
      const failedOrderId = event?.payload?.payment?.entity?.order_id || null;
      if (failedOrderId) {
        await Booking.updateOne(
          {
            razorpayOrderId: failedOrderId,
            paymentStatus: 'pending',
            status: 'hold',
          },
          {
            $set: {
              paymentStatus: 'failed',
            },
          }
        );
      }

      return res.json({ received: true, event: eventName });
    }

    if (!['payment.captured', 'order.paid'].includes(eventName)) {
      return res.json({ received: true, ignored: true, event: eventName });
    }

    const paymentEntity = event?.payload?.payment?.entity || {};
    const orderEntity = event?.payload?.order?.entity || {};
    const orderId = paymentEntity.order_id || orderEntity.id || null;
    const paymentId = paymentEntity.id || null;

    if (!orderId) {
      return res.json({ received: true, ignored: true, reason: 'missing_order_id' });
    }

    const booking = await Booking.findOne({ razorpayOrderId: orderId }).populate('room');

    if (!booking || booking.status === 'cancelled') {
      return res.json({ received: true, ignored: true, reason: 'booking_not_found_or_cancelled' });
    }

    const result = await finalizePaidBooking({
      booking,
      paymentId,
      orderId,
      fallbackUser: null,
      subject: booking.status === 'approved' ? 'Payment Successful - Booking Confirmed' : 'Booking Confirmed',
      logLabel: 'Razorpay webhook',
    });

    return res.json({
      received: true,
      bookingId: result.booking._id,
      emailStatus: result.emailStatus,
      smsStatus: result.smsStatus,
      alreadyPaid: result.alreadyPaid,
      notificationCreated: result.notificationCreated,
      notification: result.notification,
    });
  } catch (err) {
    console.error('Razorpay webhook error:', err);
    return res.status(err.statusCode || 500).json({
      message: err.message || 'Webhook processing failed',
    });
  }
};

const getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({ user: req.user._id })
      .populate('room')
      .sort({ createdAt: -1 });

    return res.json({ success: true, bookings });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

const getAllBookings = async (req, res) => {
  try {
    const query = {};
    const { from, to, status } = req.query;

    if (status) {
      query.status = status;
    }

    if (from || to) {
      query.fromDate = {};
      if (from) {
        query.fromDate.$gte = new Date(from);
      }
      if (to) {
        query.fromDate.$lte = new Date(to);
      }
    }

    const bookings = await Booking.find(query)
      .populate('user room')
      .sort({ createdAt: -1 });

    return res.json({ success: true, bookings });
  } catch (err) {
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

const updateBookingStatus = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('room');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    booking.status = req.body.status || booking.status;

    if (booking.status === 'cancelled') {
      booking.paymentStatus = 'cancelled';
    }

    await booking.save();

    let notification = null;
    let notificationCreated = false;

    try {
      notification = await createBookingStatusNotification(
        booking.user,
        booking._id,
        booking.room?.title,
        booking.status
      );
      notificationCreated = Boolean(notification);
    } catch (notificationError) {
      console.error('Update booking status notification failed:', notificationError.message || notificationError);
    }

    return res.json({ success: true, booking, notificationCreated, notification });
  } catch (err) {
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

const getAnalytics = async (req, res) => {
  try {
    const match = {};
    const { from, to } = req.query;

    if (from || to) {
      match.createdAt = {};
      if (from) {
        match.createdAt.$gte = new Date(from);
      }
      if (to) {
        const endDate = new Date(to);
        endDate.setHours(23, 59, 59, 999);
        match.createdAt.$lte = endDate;
      }
    }

    const bookings = await Booking.find(match).lean();
    const paidBookings = bookings.filter((booking) => booking.paymentStatus === 'paid');
    const approvedBookings = bookings.filter((booking) => booking.status === 'approved');

    const byDay = new Map();
    const revenueByDay = new Map();

    approvedBookings.forEach((booking) => {
      const day = new Date(booking.createdAt).toISOString().slice(0, 10);
      byDay.set(day, (byDay.get(day) || 0) + 1);
    });

    paidBookings.forEach((booking) => {
      const day = new Date(booking.createdAt).toISOString().slice(0, 10);
      revenueByDay.set(day, (revenueByDay.get(day) || 0) + Number(booking.totalAmount || 0));
    });

    const totalRooms = await Room.countDocuments();
    const occupiedRoomIds = new Set(
      bookings
        .filter((booking) => booking.status === 'approved')
        .map((booking) => String(booking.room))
    );

    return res.json({
      success: true,
      totalBookings: approvedBookings.length,
      totalRevenue: paidBookings.reduce((sum, booking) => sum + Number(booking.totalAmount || 0), 0),
      occupancyRate: totalRooms > 0 ? Math.round((occupiedRoomIds.size / totalRooms) * 100) : 0,
      bookingsPerDay: Array.from(byDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
      revenuePerDay: Array.from(revenueByDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, revenue]) => ({ date, revenue })),
    });
  } catch (err) {
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

const cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('room');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ message: 'Booking already cancelled' });
    }

    booking.status = 'cancelled';
    booking.paymentStatus = 'cancelled';
    await booking.save();

    let notification = null;
    let notificationCreated = false;

    try {
      notification = await createBookingStatusNotification(
        booking.user,
        booking._id,
        booking.room?.title,
        booking.status
      );
      notificationCreated = Boolean(notification);
    } catch (notificationError) {
      console.error('Cancel booking notification failed:', notificationError.message || notificationError);
    }

    return res.json({
      success: true,
      message: 'Booking cancelled successfully',
      booking,
      notificationCreated,
      notification,
    });
  } catch (err) {
    console.error('Cancel booking error:', err);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

const resendBookingConfirmationEmail = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('room');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (String(booking.user) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ message: 'Cancelled booking email cannot be resent' });
    }

    const emailStatus = await sendBookingConfirmationWithStatus({
      userId: req.user._id,
      room: booking.room,
      booking,
      guestDetails: booking.guestDetails,
      subject:
        booking.paymentStatus === 'paid'
          ? 'Payment Successful - Booking Confirmed'
          : 'Booking Confirmed, Payment Pending',
    });

    return res.json({
      success: true,
      booking,
      emailStatus,
    });
  } catch (err) {
    console.error('Resend booking confirmation email error:', err);
    return res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
};

module.exports = {
  createBooking,
  verifyBookingPayment,
  createExistingBookingPaymentOrder,
  verifyExistingBookingPayment,
  handleRazorpayWebhook,
  getMyBookings,
  getAllBookings,
  updateBookingStatus,
  getAnalytics,
  cancelBooking,
  resendBookingConfirmationEmail,
};
