const Offer = require('../models/Offer');

// Create Offer (Admin)
const createOffer = async (req, res) => {
  try {
    const offer = await Offer.create({
      ...req.body,
      emailDispatch: {
        totalRecipients: 0,
        sentCount: 0,
        failedCount: 0,
        status: 'pending',
      },
    });

    // Respond immediately so admin can create offer without waiting for SMTP.
    res.status(201).json({ success: true, offer, message: 'Offer created successfully. Email notifications are being sent.' });

    // Send offer email notifications in background.
    const User = require('../models/User');
    const sendEmail = require('../utils/email');
    const users = await User.find({ email: { $exists: true, $ne: '' } }, 'email firstName').lean();

    if (!users.length) {
      await Offer.findByIdAndUpdate(offer._id, {
        emailDispatch: {
          totalRecipients: 0,
          sentCount: 0,
          failedCount: 0,
          status: 'no-users',
          lastSentAt: new Date(),
        },
      });
      console.log(`ℹ️ Offer ${offer.code}: no registered users with email found`);
      return;
    }

    const subject = `New Offer: ${offer.code} is live`;
    const expiry = offer.expiryDate ? new Date(offer.expiryDate).toLocaleDateString() : 'N/A';
    const discountLabel = offer.discountType === 'flat'
      ? `Flat ₹${offer.discountValue} OFF`
      : `${offer.discountValue}% OFF`;

    const tasks = users.map((user) => {
      const name = user.firstName || 'Guest';
      const html = `
        <div style="padding:20px;font-family:Arial,sans-serif;line-height:1.6">
          <h2 style="margin:0 0 10px">Special Offer For You</h2>
          <p>Hi ${name},</p>
          <p>Your new discount code is ready:</p>
          <p style="font-size:18px"><b>${offer.code}</b> - ${discountLabel}</p>
          <p>Valid till: <b>${expiry}</b></p>
          <p>Book now and save more on your next stay.</p>
        </div>
      `;
      return sendEmail(user.email, subject, html);
    });

    const results = await Promise.allSettled(tasks);
    const successCount = results.filter((r) => r.status === 'fulfilled').length;
    const failedCount = results.length - successCount;

    await Offer.findByIdAndUpdate(offer._id, {
      emailDispatch: {
        totalRecipients: results.length,
        sentCount: successCount,
        failedCount,
        status: failedCount > 0 ? 'failed' : 'completed',
        lastSentAt: new Date(),
      },
    });

    console.log(`📧 Offer ${offer.code}: emails sent ${successCount}/${results.length}, failed ${failedCount}`);
  } catch (error) {
    console.error('Create offer error:', error);
    if (res.headersSent) {
      return;
    }
    res.status(500).json({ message: error.message });
  }
};

// Get email delivery stats for offers (Admin)
const getOfferEmailStats = async (req, res) => {
  try {
    const offers = await Offer.find({}, 'code emailDispatch createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const stats = offers.map((offer) => ({
      offerId: offer._id,
      code: offer.code,
      createdAt: offer.createdAt,
      totalRecipients: offer.emailDispatch?.totalRecipients || 0,
      sentCount: offer.emailDispatch?.sentCount || 0,
      failedCount: offer.emailDispatch?.failedCount || 0,
      status: offer.emailDispatch?.status || 'pending',
      lastSentAt: offer.emailDispatch?.lastSentAt || null,
    }));

    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update Offer (Admin)
const updateOffer = async (req, res) => {
  try {
    const offer = await Offer.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!offer) {
      return res.status(404).json({ message: 'Offer not found' });
    }

    res.json({ success: true, offer });
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

    const normalizedAmount = Number(amount);
    if (!code || Number.isNaN(normalizedAmount) || normalizedAmount <= 0) {
      return res.status(400).json({ message: 'Code and valid amount are required' });
    }

    const offer = await Offer.findOne({ code: code.toUpperCase() });

    if (!offer || !offer.isActive)
      return res.status(400).json({ message: 'Invalid offer' });

    if (offer.expiryDate < new Date())
      return res.status(400).json({ message: 'Offer expired' });

    if (normalizedAmount < Number(offer.minAmount || 0)) {
      return res.status(400).json({ message: `Minimum amount ₹${offer.minAmount} required for this offer` });
    }

    let discount = 0;
    if (offer.discountType === 'flat') {
      discount = Number(offer.discountValue || 0);
    } else {
      discount = (normalizedAmount * Number(offer.discountValue || 0)) / 100;
      if (offer.maxDiscount) {
        discount = Math.min(discount, Number(offer.maxDiscount));
      }
    }

    discount = Math.max(0, Math.min(discount, normalizedAmount));
    const finalAmount = normalizedAmount - discount;

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
  updateOffer,
  getOfferEmailStats,
  getAllOffers,
  applyOffer,
  deleteOffer,
};