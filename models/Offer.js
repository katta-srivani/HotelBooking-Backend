const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    // 🔥 support both types
    discountType: {
      type: String,
      enum: ['percentage', 'flat'],
      default: 'percentage',
    },

    discountValue: {
      type: Number,
      required: true,
    },

    // 🧠 prevent misuse
    minAmount: {
      type: Number,
      default: 0,
    },

    maxDiscount: {
      type: Number, // only for %
    },

    expiryDate: {
      type: Date,
      required: true,
    },

    // 🔥 usage control
    usageLimit: {
      type: Number,
      default: 100,
    },

    usedCount: {
      type: Number,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    emailDispatch: {
      totalRecipients: { type: Number, default: 0 },
      sentCount: { type: Number, default: 0 },
      failedCount: { type: Number, default: 0 },
      lastSentAt: { type: Date },
      status: {
        type: String,
        enum: ['pending', 'completed', 'failed', 'no-users'],
        default: 'pending',
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Offer', offerSchema);