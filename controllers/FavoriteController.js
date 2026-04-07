const Favorite = require('../models/Favorite');
const mongoose = require('mongoose');

// ✅ Add to Favorites
exports.addFavorite = async (req, res) => {
  try {
    // 🔐 Check auth
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const { roomId } = req.body;

    // ❌ Validate input
    if (!roomId) {
      return res.status(400).json({ message: "Room ID is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: "Invalid Room ID" });
    }

    const fav = await Favorite.create({
      user: req.user._id,
      room: roomId,
    });

    res.status(201).json({
      success: true,
      fav,
    });

  } catch (error) {
    console.error("ADD FAVORITE ERROR:", error);

    // 🔥 Duplicate favorite
    if (error.code === 11000) {
      return res.status(400).json({
        message: 'Room already in favorites',
      });
    }

    res.status(500).json({ message: error.message });
  }
};


// ✅ Remove from Favorites
exports.removeFavorite = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const { roomId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: "Invalid Room ID" });
    }

    const fav = await Favorite.findOneAndDelete({
      user: req.user._id,
      room: roomId,
    });

    if (!fav) {
      return res.status(404).json({
        message: 'Favorite not found',
      });
    }

    res.json({
      success: true,
      message: 'Removed from favorites',
    });

  } catch (error) {
    console.error("REMOVE FAVORITE ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};


// ✅ Get My Favorites
exports.getFavorites = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const favorites = await Favorite.find({
      user: req.user._id,
    }).populate('room');

    res.json({
      success: true,
      favorites,
    });

  } catch (error) {
    console.error("GET FAVORITES ERROR:", error);
    res.status(500).json({ message: error.message });
  }
};