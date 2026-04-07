const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
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

// PUT /api/notifications/:id - Mark a notification as read
router.put('/:id', protect, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update notification' });
  }
});

module.exports = router;
