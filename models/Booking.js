const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
    },

    fromDate: {
      type: Date,
      required: true,
    },

    toDate: {
      type: Date,
      required: true,
    },

    totalDays: {
      type: Number,
      required: true,
    },

    subtotal: {
      type: Number,
      required: true,
    },

    taxAmount: {
      type: Number,
      required: true,
    },

    grossAmount: {
      type: Number,
      required: true,
    },

    discountAmount: {
      type: Number,
      default: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
    },

    coupon: {
      type: String,
      default: null,
    },

    paymentMethod: {
      type: String,
      enum: ["cash", "online"],
      required: true,
      default: "online",
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "cancelled"],
      default: "pending",
    },

    status: {
      type: String,
      enum: ["hold", "approved", "cancelled", "expired"],
      default: "hold",
    },

    razorpayOrderId: {
      type: String,
      default: null,
    },

    razorpayPaymentId: {
      type: String,
      default: null,
    },

    guestDetails: {
      type: Object,
      required: true,
    },

    // ⏳ Auto-expiry (Mongo TTL index)
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      index: { expires: "10m" },
    },
  },
  {
    timestamps: true,
  }
);

/**
 * ✅ SAFE INDEXES (for performance, not constraints)
 */

// User bookings (fast dashboard)
bookingSchema.index({ user: 1, createdAt: -1 });

// Room availability queries
bookingSchema.index({ room: 1, fromDate: 1, toDate: 1 });

// Status filtering
bookingSchema.index({ status: 1 });

module.exports = mongoose.model("Booking", bookingSchema);