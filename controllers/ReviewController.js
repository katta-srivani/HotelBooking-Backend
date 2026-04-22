const mongoose = require("mongoose");
const Review = require("../models/Review");
const Booking = require("../models/Booking");
const Room = require("../models/Room");

// ✅ Get All Reviews
exports.getAllReviews = async (req, res) => {
  try {
    const reviews = await Review.find()
      .populate("user", "firstName lastName email")
      .populate("room", "title")
      .populate("adminReply.respondedBy", "firstName lastName email");

    res.json({ success: true, reviews });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Add Review (FIXED)
exports.addReview = async (req, res) => {
  try {
    const { roomId, rating, comment } = req.body;

    if (!roomId || !rating || !comment) {
      return res.status(400).json({ message: "roomId, rating and comment are required" });
    }

    const numericRating = Number(rating);
    if (Number.isNaN(numericRating) || numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const roomObjectId = new mongoose.Types.ObjectId(roomId);

    // Removed restriction: allow reviews before stay completion

    // ✅ One review per user per room: re-submit updates existing review
    const existingReview = await Review.findOne({
      user: req.user._id,
      room: roomObjectId,
    });

    let review;
    let message;

    if (existingReview) {
      existingReview.rating = numericRating;
      existingReview.comment = comment;
      existingReview.isApproved = true;
      review = await existingReview.save();
      message = "Review updated successfully";
    } else {
      // No admin approval required for first review submission.
      review = await Review.create({
        user: req.user._id,
        room: roomObjectId,
        rating: numericRating,
        comment,
        isApproved: true,
      });
      message = "Review submitted successfully";
    }

    // ✅ Update rating
    const stats = await Review.aggregate([
      { $match: { room: roomObjectId, isApproved: true } },
      {
        $group: {
          _id: "$room",
          avgRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
        },
      },
    ]);

    await Room.findByIdAndUpdate(roomObjectId, {
      averageRating: stats[0]?.avgRating || 0,
      totalReviews: stats[0]?.totalReviews || 0,
    });

    res.status(201).json({
      success: true,
      message,
      review,
    });

  } catch (error) {
    console.error("Add Review Error:", error);
    res.status(500).json({ message: error.message });
  }
};

// ✅ Get Room Reviews
exports.getRoomReviews = async (req, res) => {
  try {
    const roomId = req.params.roomId;

    const reviews = await Review.find({
      room: roomId,
      isApproved: true,
    })
      .sort({ createdAt: -1 })
      .populate("user", "firstName lastName email")
      .populate("adminReply.respondedBy", "firstName lastName email");

    const avgRating =
      reviews.length > 0
        ? reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length
        : 0;

    res.json({
      success: true,
      totalReviews: reviews.length,
      avgRating: avgRating.toFixed(1),
      reviews,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ Update Review
exports.updateReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) return res.status(404).json({ message: "Not found" });

    if (review.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    review.rating = req.body.rating || review.rating;
    review.comment = req.body.comment || review.comment;

    await review.save();

    res.json({ success: true, review });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Delete Review
exports.deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ message: "Not found" });
    }

    if (
      review.user.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await review.deleteOne();

    res.json({
      success: true,
      message: "Deleted",
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
// ✅ Get Unapproved Reviews (Admin)
exports.getUnapprovedReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ isApproved: false })
      .populate("user", "firstName lastName email")
      .populate("room", "title");

    res.json({
      success: true,
      reviews,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ Approve Review (Admin)
exports.approveReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    review.isApproved = true;
    await review.save();

    // ✅ Update room rating after approval
    const stats = await Review.aggregate([
      { $match: { room: review.room, isApproved: true } },
      {
        $group: {
          _id: "$room",
          avgRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
        },
      },
    ]);

    await Room.findByIdAndUpdate(review.room, {
      averageRating: stats[0]?.avgRating || 0,
      totalReviews: stats[0]?.totalReviews || 0,
    });

    res.json({
      success: true,
      message: "Review approved",
      review,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.replyToReview = async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();

    if (!message) {
      return res.status(400).json({ message: 'Reply message is required' });
    }

    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    review.adminReply = {
      message,
      respondedBy: req.user._id,
      respondedAt: new Date(),
    };

    await review.save();
    await review.populate("adminReply.respondedBy", "firstName lastName email");

    res.json({
      success: true,
      message: 'Reply saved',
      review,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
