const Offer = require('../models/Offer');

// Create Offer (Admin)
const createOffer = async (req, res) => {
  try {
    const offer = await Offer.create(req.body);
    res.status(201).json({ success: true, offer });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all Offers (Public)
const getAllOffers = async (req, res) => {
  try {
    const offers = await Offer.find({ isActive: true });
    res.json({ success: true, offers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Apply Coupon
const applyOffer = async (req, res) => {
  try {
    const { code, amount } = req.body;

    const offer = await Offer.findOne({ code: code.toUpperCase() });

    if (!offer || !offer.isActive)
      return res.status(400).json({ message: 'Invalid offer' });

    if (offer.expiryDate < new Date())
      return res.status(400).json({ message: 'Offer expired' });

    const discount = (amount * offer.discountPercentage) / 100;
    const finalAmount = amount - discount;

    res.json({ success: true, discount, finalAmount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete Offer (Admin)
const deleteOffer = async (req, res) => {
  try {
    await Offer.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Offer deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ Export all functions properly
module.exports = {
  createOffer,
  getAllOffers,
  applyOffer,
  deleteOffer,
};