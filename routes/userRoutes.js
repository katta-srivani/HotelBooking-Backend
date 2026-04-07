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
  getFavoriteRooms,
  addFavoriteRoom,
  removeFavoriteRoom,
  getAllUsers,
  deleteUser,
} = require('../controllers/UserController');

const { protect, admin } = require('../middleware/authMiddleware');

// Public routes
router.post('/register', asyncHandler(registerUser));
router.post('/login', asyncHandler(loginUser));

// Email verification route removed

// Protected routes
router.get('/profile', protect, asyncHandler(getProfile));
router.put('/update-profile', protect, asyncHandler(updateProfile));
router.post('/change-password', protect, asyncHandler(changePassword));
router.get('/bookings', protect, asyncHandler(getUserBookings));
router.get('/favorites', protect, asyncHandler(getFavoriteRooms));
router.post('/add-favorite/:roomId', protect, asyncHandler(addFavoriteRoom));
router.delete('/remove-favorite/:roomId', protect, asyncHandler(removeFavoriteRoom));

// Admin routes
router.get('/', protect, admin, asyncHandler(getAllUsers));
router.delete('/:id', protect, admin, asyncHandler(deleteUser));

module.exports = router;