const Booking = require('../models/Booking');
const Room = require('../models/Room');
const Coupon = require('../models/Offer');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { createOrder, verifyPayment } = require('../utils/payment');
const sendEmail = require('../utils/email');

const bookingTemplate = (user, room, booking) => `
<div style="padding:20px;font-family:sans-serif">
  <h2>Booking Confirmed</h2>
  <p>Hi ${user.firstName || 'Guest'},</p>
  <p>Your booking for <b>${room.title}</b> is confirmed.</p>
  <ul>
    <li>Check-in: ${new Date(booking.fromDate).toDateString()}</li>
    <li>Check-out: ${new Date(booking.toDate).toDateString()}</li>
    <li>Total: Rs ${booking.totalAmount}</li>
    <li>Payment method: ${booking.paymentMethod}</li>
  </ul>
</div>
`;

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
  await Notification.create({
    user: userId,
    type: 'payment',
    message: `Billing generated for ${roomTitle}. You can do payment now using Razorpay.`,
    link: `/billing?id=${bookingId}`,
  });
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
        expiresAt: undefined,
      });

      await attachBookingToUser(req.user._id, booking._id);
      await createPaymentReminderNotification(req.user._id, booking._id, pricing.room.title);

      return res.status(201).json({
        success: true,
        booking,
        bookingData,
      });
    }

    const order = await createOrder(pricing.totalAmount);

    return res.json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID,
      bookingData,
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

    booking.paymentStatus = 'paid';
    booking.paymentMethod = 'online';
    booking.razorpayOrderId = orderId || booking.razorpayOrderId;
    booking.razorpayPaymentId = paymentId || null;
    await booking.save();

    await Notification.create({
      user: req.user._id,
      type: 'payment',
      message: `Payment received for ${booking.room?.title || 'your booking'}.`,
      link: `/booking/${booking._id}`,
    });

    return res.json({ success: true, booking });
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
      expiresAt: undefined,
    });

    await attachBookingToUser(req.user._id, booking._id);

    const room = pricing.room;
    if (req.user.email) {
      sendEmail(
        req.user.email,
        'Booking Confirmed',
        bookingTemplate(req.user, room, booking)
      ).catch(console.error);
    }

    return res.json({ success: true, booking });
  } catch (err) {
    console.error('Verify booking error:', err);
    return res.status(500).json({ message: 'Internal Server Error', error: err.message });
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
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    booking.status = req.body.status || booking.status;

    if (booking.status === 'cancelled') {
      booking.paymentStatus = 'cancelled';
    }

    await booking.save();

    return res.json({ success: true, booking });
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
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ message: 'Booking already cancelled' });
    }

    booking.status = 'cancelled';
    booking.paymentStatus = 'cancelled';
    await booking.save();

    return res.json({
      success: true,
      message: 'Booking cancelled successfully',
      booking,
    });
  } catch (err) {
    console.error('Cancel booking error:', err);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

module.exports = {
  createBooking,
  verifyBookingPayment,
  createExistingBookingPaymentOrder,
  verifyExistingBookingPayment,
  getMyBookings,
  getAllBookings,
  updateBookingStatus,
  getAnalytics,
  cancelBooking,
};
