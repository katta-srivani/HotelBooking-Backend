// models/Review.js
const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
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

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    comment: {
      type: String,
      required: true,
    },

    isApproved: {
      type: Boolean,
      default: true, // later admin can control
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Review', reviewSchema);