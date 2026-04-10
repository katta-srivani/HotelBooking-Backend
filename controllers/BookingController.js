// ---------------- CANCEL BOOKING ----------------
exports.cancelBooking = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    booking.status = 'cancelled';
    await booking.save();
    res.json({ success: true, booking });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
const Booking = require('../models/Booking');
const Room = require('../models/Room');
const Coupon = require('../models/Offer');
const { createOrder, verifyPayment } = require('../utils/payment');
const sendEmail = require('../utils/email');
const sendSMS = require('../utils/sms');

// ---------------- EMAIL TEMPLATE ----------------
const bookingTemplate = (user, room, booking) => `
<div style="padding:20px;font-family:sans-serif">
  <h2>🏨 Booking Confirmed</h2>
  <p>Hi ${user.firstName || user.username || 'Guest'},</p>
  <p>Your booking for <b>${room.title}</b> is confirmed.</p>
  <ul>
    <li>Check-in: ${new Date(booking.fromDate).toDateString()}</li>
    <li>Check-out: ${new Date(booking.toDate).toDateString()}</li>
    <li>Total: ₹${booking.totalAmount}</li>
  </ul>
</div>
`;

// ---------------- CREATE ORDER ONLY ----------------
exports.createBooking = async (req, res) => {
      // Prevent admins from booking rooms
      if (req.user && req.user.role === 'admin') {
        return res.status(403).json({ message: 'Admins are not allowed to book rooms.' });
      }
  try {
    console.log('--- Incoming booking request ---');
    console.log('Payload:', req.body);
    const { roomId, fromDate, toDate, couponCode } = req.body;

    if (!roomId || !fromDate || !toDate) {
      console.error('Missing required fields:', { roomId, fromDate, toDate });
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const room = await Room.findById(roomId);
    if (!room) {
      console.error('Room not found:', roomId);
      return res.status(404).json({ message: 'Room not found' });
    }

    const start = new Date(fromDate);
    const end = new Date(toDate);

    if (start >= end) {
      console.error('Invalid dates:', { fromDate, toDate });
      return res.status(400).json({ message: 'Invalid dates' });
    }

    // ✅ Only check CONFIRMED bookings
    const existing = await Booking.find({
      room: roomId,
      status: 'approved',
      $or: [{ fromDate: { $lte: end }, toDate: { $gte: start } }],
    });

    if (existing.length > 0) {
      console.error('Room already booked:', existing);
      return res.status(400).json({ message: 'Room already booked' });
    }

    // Price calculation
    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    const subtotal = totalDays * room.pricePerNight;
    const taxAmount = Math.round(subtotal * 0.05);
    const grossAmount = subtotal + taxAmount;
    let discountAmount = 0;
    let totalAmount = grossAmount;
    console.log('Calculated totalDays:', totalDays, 'subtotal:', subtotal, 'tax:', taxAmount, 'grossAmount:', grossAmount);

    // Coupon logic
    let appliedCoupon = null;
    if (couponCode) {
      const normalizedCoupon = String(couponCode).trim().toUpperCase();
      const coupon = await Coupon.findOne({ code: normalizedCoupon, isActive: true });
      if (!coupon) {
        console.error('Invalid coupon:', couponCode);
        return res.status(400).json({ message: 'Invalid coupon' });
      }
      if (new Date() > coupon.expiryDate) {
        console.error('Coupon expired:', couponCode);
        return res.status(400).json({ message: 'Coupon expired' });
      }
      if (coupon.usedCount >= coupon.usageLimit) {
        console.error('Coupon limit reached:', couponCode);
        return res.status(400).json({ message: 'Coupon limit reached' });
      }

      if (grossAmount < Number(coupon.minAmount || 0)) {
        return res.status(400).json({ message: `Minimum amount ₹${coupon.minAmount} required for this coupon` });
      }

      // Coupon is applied on final amount (subtotal + tax)
      const rawDiscountValue =
        coupon.discountValue ??
        coupon.get?.('discountValue') ??
        coupon.discountPercentage ??
        coupon.get?.('discountPercentage') ??
        coupon.flatDiscount ??
        coupon.get?.('flatDiscount') ??
        0;
      let discountValue = Number(rawDiscountValue);
      if (isNaN(discountValue) || discountValue < 0) discountValue = 0;

      // Backward compatibility: infer percentage from coupon code like SUMMER50 when value is missing.
      if (discountValue === 0 && coupon.discountType === 'percentage') {
        const inferred = Number(String(coupon.code || '').match(/(\d+)/)?.[1] || 0);
        if (!isNaN(inferred) && inferred > 0) {
          discountValue = inferred;
        }
      }

      const discountType = coupon.discountType || coupon.get?.('discountType') || 'percentage';

      if (discountType === 'percentage') {
        discountAmount = (grossAmount * discountValue) / 100;
      } else if (discountType === 'flat') {
        discountAmount = discountValue;
      } else {
        discountAmount = 0;
      }
      if (coupon.maxDiscount && !isNaN(Number(coupon.maxDiscount))) {
        discountAmount = Math.min(discountAmount, Number(coupon.maxDiscount));
      }
      discountAmount = Math.max(0, Math.min(discountAmount, grossAmount));
      totalAmount = grossAmount - discountAmount;
      appliedCoupon = coupon.code;
      console.log('Coupon applied:', couponCode, 'Discount:', discountAmount, 'New totalAmount:', totalAmount);
    }

    totalAmount = Math.max(0, Math.round(totalAmount));
    console.log('Final totalAmount (rounded):', totalAmount);

    // Validate totalAmount before creating Razorpay order
    if (!totalAmount || isNaN(totalAmount) || totalAmount <= 0) {
      console.error('Invalid totalAmount for payment:', totalAmount);
      return res.status(400).json({ message: 'Invalid total amount for payment. Please check your booking details.' });
    }

    // ✅ Create Razorpay Order ONLY
    const order = await createOrder(totalAmount);
    console.log('Razorpay order created:', order);

    res.status(200).json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID,

      // 👇 Send booking data to frontend (IMPORTANT)
      bookingData: {
        roomId,
        fromDate,
        toDate,
        totalDays,
        subtotal,
        taxAmount,
        grossAmount,
        discountAmount: Math.round(discountAmount),
        totalAmount,
        coupon: appliedCoupon,
      },
    });

  } catch (err) {
    console.error('Booking creation error:', err);
    res.status(500).json({ message: 'Internal Server Error', error: err.message });
  }
};

// ---------------- VERIFY & CREATE BOOKING ----------------
exports.verifyBookingPayment = async (req, res) => {
  try {
    const { paymentId, orderId, signature, bookingData, paymentMethod } = req.body;
    console.log('--- PAYMENT VERIFICATION ATTEMPT ---');
    console.log('From frontend:', { paymentId, orderId, signature, paymentMethod });
    if (bookingData) {
      console.log('BookingData:', bookingData);
    }

    // ✅ COD FLOW
    if (paymentMethod === 'cash') {
      const room = await Room.findById(bookingData.roomId);

      const booking = await Booking.create({
        user: req.user._id,
        room: bookingData.roomId,
        fromDate: bookingData.fromDate,
        toDate: bookingData.toDate,
        totalDays: bookingData.totalDays,
        totalAmount: bookingData.totalAmount,
        subtotal: bookingData.subtotal || 0,
        taxAmount: bookingData.taxAmount || 0,
        grossAmount: bookingData.grossAmount || bookingData.totalAmount,
        discountAmount: bookingData.discountAmount || 0,
        coupon: bookingData.coupon,
        paymentStatus: 'pending',
        status: 'approved',
        paymentMethod: 'cash',
        razorpayPaymentId: `CASH_${Date.now()}`,
      });

      if (req.user.email) {
        await sendEmail(
          req.user.email,
          'Booking Confirmed',
          bookingTemplate(req.user, room, booking)
        );
      }

      return res.json({ success: true, booking });
    }

    // ✅ CARD FLOW (mock/third-party card gateway simulation)
    if (paymentMethod === 'card') {
      if (!paymentId) {
        return res.status(400).json({ message: 'Missing payment details' });
      }

      const room = await Room.findById(bookingData.roomId);

      const booking = await Booking.create({
        user: req.user._id,
        room: bookingData.roomId,
        fromDate: bookingData.fromDate,
        toDate: bookingData.toDate,
        totalDays: bookingData.totalDays,
        totalAmount: bookingData.totalAmount,
        subtotal: bookingData.subtotal || 0,
        taxAmount: bookingData.taxAmount || 0,
        grossAmount: bookingData.grossAmount || bookingData.totalAmount,
        discountAmount: bookingData.discountAmount || 0,
        coupon: bookingData.coupon,
        guestDetails: bookingData.guestDetails || {},
        paymentStatus: 'paid',
        status: 'approved',
        paymentMethod: 'online',
        razorpayPaymentId: paymentId,
      });

      if (booking.coupon) {
        await Coupon.updateOne(
          { code: booking.coupon },
          { $inc: { usedCount: 1 } }
        );
      }

      if (req.user.email) {
        try {
          await sendEmail(
            req.user.email,
            'Booking Confirmed',
            bookingTemplate(req.user, room, booking)
          );
        } catch (emailErr) {
          console.error('❌ Failed to send email:', emailErr);
        }
      }

      return res.json({ success: true, booking });
    }

    // ✅ VERIFY ONLINE PAYMENT
    if (!orderId || !paymentId || !signature) {
      console.error("Missing payment verification fields:", {
        orderId,
        paymentId,
        signature
      });
      return res.status(400).json({ message: 'Missing payment details' });
    }

    // Log the expected signature for debugging
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(orderId + '|' + paymentId)
      .digest('hex');
    console.log('Expected signature:', expectedSignature);
    console.log('Received signature:', signature);

    const isValid = verifyPayment(orderId, paymentId, signature);
    console.log("VERIFY DEBUG:", { orderId, paymentId, signature, isValid });

    if (!isValid) {
      console.error("❌ Razorpay signature mismatch");
      // Send failed payment email
      if (req.user && req.user.email) {
        try {
          await sendEmail(
            req.user.email,
            'Payment Failed',
            `<div style="font-family:sans-serif;padding:20px"><h2>Payment Failed</h2><p>Your payment for booking could not be verified. Please try again or contact support.</p></div>`
          );
        } catch (emailErr) {
          console.error('❌ Failed to send payment failed email:', emailErr);
        }
      }
      return res.status(400).json({ message: 'Payment verification failed', expectedSignature, receivedSignature: signature });
    }

    const room = await Room.findById(bookingData.roomId);

    // ✅ CREATE BOOKING AFTER PAYMENT
    const booking = await Booking.create({
  user: req.user._id,
  room: bookingData.roomId,
  fromDate: bookingData.fromDate,
  toDate: bookingData.toDate,
  totalDays: bookingData.totalDays,
  totalAmount: bookingData.totalAmount,
  subtotal: bookingData.subtotal || 0,
  taxAmount: bookingData.taxAmount || 0,
  grossAmount: bookingData.grossAmount || bookingData.totalAmount,
  discountAmount: bookingData.discountAmount || 0,
  coupon: bookingData.coupon,
  guestDetails: bookingData.guestDetails || {}, // ✅ FIX
  paymentStatus: 'paid',
  status: 'approved',
  paymentMethod: 'online',
  razorpayOrderId: orderId,
  razorpayPaymentId: paymentId,
});

    // ✅ Update coupon usage
    if (booking.coupon) {
      await Coupon.updateOne(
        { code: booking.coupon },
        { $inc: { usedCount: 1 } }
      );
    }

    // ✅ Notifications (send email, then respond, then send SMS in background)
    if (req.user.email) {
      try {
        await sendEmail(
          req.user.email,
          'Booking Confirmed',
          bookingTemplate(req.user, room, booking)
        );
      } catch (emailErr) {
        console.error('❌ Failed to send email:', emailErr);
      }
    }

    // Respond to client BEFORE sending SMS
    res.json({ success: true, booking });

    // Send SMS in background, log errors but do not throw
    if (req.user.phone) {
      sendSMS(req.user.phone, `Booking confirmed for ${room.title}`)
        .then(() => {
          console.log('✅ SMS sent');
        })
        .catch((smsErr) => {
          console.error('❌ Failed to send SMS:', smsErr);
        });
    }
  } catch (err) {
  console.error("❌ VERIFY ERROR:", err);
  res.status(500).json({
    message: "Internal Server Error",
    error: err.message
  });
}
  
};

// ---------------- USER BOOKINGS ----------------
exports.getMyBookings = async (req, res) => {
  const includeAll = String(req.query.includeAll || '').toLowerCase() === 'true';
  const query = { user: req.user._id };

  if (!includeAll) {
    query.status = 'approved';
  }

  const bookings = await Booking.find(query)
    .populate('room')
    .sort({ createdAt: -1 });

  res.json({ success: true, bookings });
};

// ---------------- ADMIN ----------------
exports.getAllBookings = async (req, res) => {
  const bookings = await Booking.find().populate('user room');
  res.json({ success: true, bookings });
};

exports.updateBookingStatus = async (req, res) => {
  const booking = await Booking.findById(req.params.id);

  if (!booking) {
    return res.status(404).json({ message: 'Booking not found' });
  }

  booking.status = req.body.status || booking.status;
  await booking.save();

  res.json({ success: true, booking });
};

exports.getAnalytics = async (req, res) => {
  const from = req.query.from ? new Date(req.query.from) : null;
  const to = req.query.to ? new Date(req.query.to) : null;

  const createdAtMatch = {};
  if (from && !Number.isNaN(from.getTime())) {
    createdAtMatch.$gte = from;
  }
  if (to && !Number.isNaN(to.getTime())) {
    const endOfDay = new Date(to);
    endOfDay.setHours(23, 59, 59, 999);
    createdAtMatch.$lte = endOfDay;
  }

  const baseMatch = {};
  if (Object.keys(createdAtMatch).length > 0) {
    baseMatch.createdAt = createdAtMatch;
  }

  const revenueMatch = { paymentStatus: 'paid', ...baseMatch };

  const [
    totalBookings,
    revenue,
    bookingsPerDay,
    revenuePerDay,
  ] = await Promise.all([
    Booking.countDocuments(baseMatch),
    Booking.aggregate([
      { $match: revenueMatch },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),
    Booking.aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]),
    Booking.aggregate([
      { $match: revenueMatch },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          },
          revenue: { $sum: '$totalAmount' },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
    ]),
  ]);

  const toDateLabel = (id) => {
    const mm = String(id.month).padStart(2, '0');
    const dd = String(id.day).padStart(2, '0');
    return `${id.year}-${mm}-${dd}`;
  };

  res.json({
    success: true,
    totalBookings,
    totalRevenue: revenue[0]?.total || 0,
    bookingsPerDay: bookingsPerDay.map((item) => ({
      date: toDateLabel(item._id),
      count: item.count,
    })),
    revenuePerDay: revenuePerDay.map((item) => ({
      date: toDateLabel(item._id),
      revenue: item.revenue,
    })),
  });
};