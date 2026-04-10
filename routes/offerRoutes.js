const express = require('express');
const router = express.Router();

const {
  createOffer,
  updateOffer,
  getOfferEmailStats,
  getAllOffers,
  applyOffer,
  deleteOffer,
} = require('../controllers/OfferController');

const { protect, admin } = require('../middleware/authMiddleware');

// Admin - Create Offer
router.post('/', protect, admin, createOffer);

// Admin - Email delivery stats
router.get('/admin/email-stats', protect, admin, getOfferEmailStats);

// Get all offers (Public/User)
router.get('/', getAllOffers);

// Apply coupon
router.post('/apply', protect, applyOffer);

// Admin - Delete offer
router.delete('/:id', protect, admin, deleteOffer);

// Admin - Update offer
router.put('/:id', protect, admin, updateOffer);

module.exports = router;