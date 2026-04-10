const express = require('express');
const router = express.Router();

const {
  addFavorite,
  removeFavorite,
  getFavorites,
} = require('../controllers/favoriteController');

const { protect } = require('../middleware/authMiddleware');

// ✅ Add favorite
router.post('/', protect, addFavorite);

// ✅ Remove favorite
router.delete('/:roomId', protect, removeFavorite);

// ✅ Get my favorites
router.get('/', protect, getFavorites);

module.exports = router;