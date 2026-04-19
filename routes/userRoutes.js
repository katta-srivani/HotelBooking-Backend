const express = require('express');
const router = express.Router();
const asyncHandler = require('../utils/asyncHandler');

const {
  registerUser,
  loginUser,
  getProfile,
  updateProfile,
  changePassword,
  getUserBookings,
  getAllUsers,
  deleteUser,
  forgotPassword,     // ✅ ADD HERE
  resetPassword       // ✅ ADD HERE
} = require('../controllers/UserController');

const { protect, admin } = require('../middleware/authMiddleware');

// Public routes
router.post('/register', asyncHandler(registerUser));
router.post('/login', asyncHandler(loginUser));

// ✅ Forgot/Reset Password
router.post('/forgot-password', asyncHandler(forgotPassword));
router.post('/reset-password/:token', asyncHandler(resetPassword));

// Protected routes
router.get('/profile', protect, asyncHandler(getProfile));
router.put('/update-profile', protect, asyncHandler(updateProfile));
router.post('/change-password', protect, asyncHandler(changePassword));
router.get('/bookings', protect, asyncHandler(getUserBookings));

// Admin routes
router.get('/', protect, admin, asyncHandler(getAllUsers));
router.delete('/:id', protect, admin, asyncHandler(deleteUser));

module.exports = router;