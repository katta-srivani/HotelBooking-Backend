const Favorite = require('../models/Favorite');
const Wishlist = require('../models/Wishlist');
const mongoose = require('mongoose');

const getSavedType = (value) => (value === 'wishlist' ? 'wishlist' : 'favorite');
const getModelForType = (type) => (type === 'wishlist' ? Wishlist : Favorite);

exports.addFavorite = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { roomId, type } = req.body;
    const savedType = getSavedType(type);
    const SavedModel = getModelForType(savedType);

    if (!roomId) {
      return res.status(400).json({ message: 'Room ID is required' });
    }

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: 'Invalid Room ID' });
    }

    const savedRoom = await SavedModel.create({
      user: req.user._id,
      room: roomId,
      ...(savedType === 'favorite' ? { type: 'favorite' } : {}),
    });

    res.status(201).json({
      success: true,
      favorite: savedRoom,
    });
  } catch (error) {
    console.error('ADD SAVED ROOM ERROR:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        message: `Room already in ${getSavedType(req.body?.type)}`,
      });
    }

    res.status(500).json({ message: error.message });
  }
};

exports.removeFavorite = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { roomId } = req.params;
    const savedType = getSavedType(req.query.type);
    const SavedModel = getModelForType(savedType);

    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: 'Invalid Room ID' });
    }

    const criteria = {
      user: req.user._id,
      room: roomId,
    };
    if (savedType === 'favorite') {
      criteria.$or = [{ type: 'favorite' }, { type: { $exists: false } }];
    }

    const savedRoom = await SavedModel.findOneAndDelete(criteria);

    if (!savedRoom) {
      return res.status(404).json({
        message: `${savedType} not found`,
      });
    }

    res.json({
      success: true,
      message: `Removed from ${savedType}`,
    });
  } catch (error) {
    console.error('REMOVE SAVED ROOM ERROR:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.getFavorites = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const savedType = getSavedType(req.query.type);
    const SavedModel = getModelForType(savedType);
    const criteria =
      savedType === 'favorite'
        ? { user: req.user._id, $or: [{ type: 'favorite' }, { type: { $exists: false } }] }
        : { user: req.user._id };

    const favorites = await SavedModel.find(criteria).populate('room');

    res.json({
      success: true,
      favorites,
    });
  } catch (error) {
    console.error('GET SAVED ROOMS ERROR:', error);
    res.status(500).json({ message: error.message });
  }
};
