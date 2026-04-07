const express = require('express');
const router = express.Router();

const {
  createOffer,
  getAllOffers,
  applyOffer,
  deleteOffer,
} = require('../controllers/OfferController');

const { protect, admin } = require('../middleware/authMiddleware');

// Admin - Create Offer
router.post('/', protect, admin, createOffer);

// Get all offers (Public/User)
router.get('/', getAllOffers);

// Apply coupon
router.post('/apply', protect, applyOffer);

// Admin - Delete offer
router.delete('/:id', protect, admin, deleteOffer);

module.exports = router;