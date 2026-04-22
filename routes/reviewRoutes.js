const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');

const {
  addReview,
  getRoomReviews,
  deleteReview,
  getUnapprovedReviews,
  approveReview,
  updateReview,
  getAllReviews,
  replyToReview,
} = require('../controllers/ReviewController');

// ✅ Admin FIRST
router.get('/admin/unapproved', protect, admin, getUnapprovedReviews);
router.put('/admin/approve/:id', protect, admin, approveReview);
router.put('/admin/reply/:id', protect, admin, replyToReview);


// ✅ User
router.post('/', protect, addReview);
router.put('/:id', protect, updateReview);
router.delete('/:id', protect, deleteReview);
// Public: Get all reviews (must come before /:roomId)
router.get('/', getAllReviews);
// Admin: Get all reviews
router.get('/admin/reviews', protect, admin, getAllReviews);
router.get('/:roomId', getRoomReviews);

module.exports = router;
