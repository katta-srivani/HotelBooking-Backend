const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
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

    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },

    totalAmount: { type: Number, required: true },
    totalDays: { type: Number, required: true },
    subtotal: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    grossAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },

    paymentStatus: {
      type: String,
      enum: ['pending', 'paid'],
      default: 'pending',
    },

    status: {
      type: String,
      enum: ['pending', 'approved', 'cancelled', 'completed'],
      default: 'pending',
    },

    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    paymentMethod: { type: String, enum: ['online', 'cash'], default: 'online' },

    coupon: { type: String },

   
    expiresAt: {
      type: Date,
    },

    rating: { type: Number, min: 1, max: 5 },
  },
  { timestamps: true }
);

bookingSchema.index({ room: 1, fromDate: 1, toDate: 1 });
bookingSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Booking', bookingSchema);