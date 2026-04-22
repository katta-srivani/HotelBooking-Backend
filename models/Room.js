// models/Room.js
const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      enum: ['Luxury', 'Standard', 'Deluxe', 'Suite', 'Villa'],
    },

    pricePerNight: {
      type: Number,
      required: true,
    },

    description: {
      type: String,
      required: true,
    },

    location: {
      type: String,
      trim: true,
      default: '',
    },

    maxGuests: {
      type: Number,
      required: true,
    },

    bedType: {
      type: String,
      required: true,
    },

    size: {
      type: String,
    },

    view: {
      type: String,
    },

    amenities: {
      wifi: { type: Boolean, default: false },
      parking: { type: Boolean, default: false },
      breakfast: { type: Boolean, default: false },
      pool: { type: Boolean, default: false },
    },

    imageUrls: {
      type: [String],
      required: true,
    },

    isAvailable: {
      type: Boolean,
      default: true,
    },

    ratings: [
      {
        type: Number,
        min: 1,
        max: 5,
      },
    ],

    averageRating: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// ✅ FIXED (use category, not roomType)
roomSchema.virtual('fullTitle').get(function () {
  return `${this.title} - ${this.category} (${this.size || 'N/A'})`;
});

// Update average rating
roomSchema.methods.updateAverageRating = function () {
  if (this.ratings.length === 0) {
    this.averageRating = 0;
  } else {
    const sum = this.ratings.reduce((acc, val) => acc + val, 0);
    this.averageRating = sum / this.ratings.length;
  }
  return this.save();
};

module.exports = mongoose.model('Room', roomSchema);
