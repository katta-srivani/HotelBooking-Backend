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
    let totalAmount = totalDays * room.pricePerNight;
    console.log('Calculated totalDays:', totalDays, 'totalAmount:', totalAmount);

    // Coupon logic
    let appliedCoupon = null;
    if (couponCode) {
      const coupon = await Coupon.findOne({ code: couponCode, isActive: true });
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

      // Robust coupon logic
      let discountValue = Number(coupon.discountValue);
      if (isNaN(discountValue) || discountValue < 0) discountValue = 0;
      let discount = 0;
      if (coupon.discountType === 'percentage') {
        discount = (totalAmount * discountValue) / 100;
      } else if (coupon.discountType === 'flat') {
        discount = discountValue;
      } else {
        // Unknown type, treat as no discount
        discount = 0;
      }
      if (coupon.maxDiscount && !isNaN(Number(coupon.maxDiscount))) {
        discount = Math.min(discount, Number(coupon.maxDiscount));
      }
      discount = Math.max(0, discount);
      totalAmount -= discount;
      appliedCoupon = coupon.code;
      console.log('Coupon applied:', couponCode, 'Discount:', discount, 'New totalAmount:', totalAmount);
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
  const bookings = await Booking.find({
    user: req.user._id,
    status: 'approved', // ✅ only confirmed bookings
  }).populate('room');

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
  const totalBookings = await Booking.countDocuments();

  const revenue = await Booking.aggregate([
    { $match: { paymentStatus: 'paid' } },
    { $group: { _id: null, total: { $sum: '$totalAmount' } } },
  ]);

  res.json({
    success: true,
    totalBookings,
    totalRevenue: revenue[0]?.total || 0,
  });
};