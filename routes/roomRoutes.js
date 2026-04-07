const express = require('express');
const router = express.Router();

const {
  addRoom,
  getAllRooms,
  getRoomById,
  updateRoom,
  deleteRoom,
  getAvailableRooms,
  searchRooms
} = require('../controllers/RoomController');

const { protect, admin } = require('../middleware/authMiddleware');


// =============================
// ✅ PUBLIC ROUTES (IMPORTANT ORDER)
// =============================

// 🔍 Search Rooms (MUST be before :id)
router.get('/search', searchRooms);

// 🟢 Available Rooms
router.get('/available', getAvailableRooms);

// 📦 Get All Rooms
router.get('/', getAllRooms);


// =============================
// 🔐 ADMIN ROUTES
// =============================

// ➕ Create Room
router.post('/', protect, admin, addRoom);

// ✏️ Update Room
router.put('/:id', protect, admin, updateRoom);

// ❌ Delete Room
router.delete('/:id', protect, admin, deleteRoom);


// =============================
// ⚠️ DYNAMIC ROUTE (ALWAYS LAST)
// =============================

// 📄 Get Room By ID
router.get('/:id', getRoomById);


module.exports = router;