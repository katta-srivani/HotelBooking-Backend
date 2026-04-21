const mongoose = require('mongoose');

const favoriteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },
    type: {
      type: String,
      enum: ['favorite', 'wishlist'],
      default: 'favorite',
    },
  },
  { timestamps: true }
);

// ✅ Prevent duplicates
favoriteSchema.index({ user: 1, room: 1, type: 1 }, { unique: true });

module.exports = mongoose.model('Favorite', favoriteSchema);
