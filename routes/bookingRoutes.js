
const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');

// Public: Get all approved bookings for a room (for date picker)
router.get('/room/:roomId', async (req, res) => {
  try {
    const bookings = await Booking.find({
      room: req.params.roomId,
      status: 'approved',
    }).select('fromDate toDate');
    res.json({ success: true, bookings });
  } catch (err) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

const { protect, admin } = require('../middleware/authMiddleware');

const {
  createBooking,
  verifyBookingPayment,
  getMyBookings,
  getAllBookings,
  updateBookingStatus,
  getAnalytics,
  cancelBooking
} = require('../controllers/BookingController');

// ===== USER ROUTES =====

// Create booking + Razorpay order
router.post('/', protect, createBooking);

// Verify payment (MOST IMPORTANT)

// Add generic verify route for frontend
router.post('/verify', protect, verifyBookingPayment);

// Get logged-in user's bookings
router.get('/my', protect, getMyBookings);

// ===== ADMIN ROUTES =====

// Get all bookings
router.get('/admin', protect, admin, getAllBookings);

// Update booking status
router.put('/admin/:id/status', protect, admin, updateBookingStatus);

// Analytics (revenue, bookings)
router.get('/admin/analytics', protect, admin, getAnalytics);

// Get a booking by ID (for billing/receipt)
router.get('/:id', protect, async (req, res) => {
  try {
    const booking = await require('../models/Booking').findById(req.params.id).populate('room');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Cancel booking
router.delete('/:id', protect, cancelBooking);

module.exports = router;