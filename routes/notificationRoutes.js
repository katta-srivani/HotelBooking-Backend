const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const Booking = require('../models/Booking');
const { protect } = require('../middleware/authMiddleware');

// GET /api/notifications - Get all notifications for the logged-in user
router.get('/', protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ notifications });
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

// POST /api/notifications/payment-success/:bookingId - ensure a payment success notification exists
router.post('/payment-success/:bookingId', protect, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId).populate('room');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    if (String(booking.user) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    if (booking.paymentStatus !== 'paid') {
      return res.status(400).json({ message: 'Payment is not completed for this booking' });
    }

    const message = `Payment received for ${booking.room?.title || 'your booking'}. Your booking is confirmed.`;
    const link = `/billing?id=${booking._id}`;

    const notification = await Notification.findOneAndUpdate(
      {
        user: req.user._id,
        type: 'payment',
        message,
        link,
      },
      {
        $setOnInsert: {
          user: req.user._id,
          type: 'payment',
          message,
          link,
          isRead: false,
        },
      },
      {
        returnDocument: 'after',
        upsert: true,
      }
    );

    res.json({ success: true, notification });
  } catch (err) {
    res.status(500).json({ message: 'Failed to ensure payment notification' });
  }
});

// PUT /api/notifications/:id - Mark a notification as read
router.put('/:id', protect, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { isRead: true },
      { returnDocument: 'after' }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({ success: true, notification });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update notification' });
  }
});

module.exports = router;
