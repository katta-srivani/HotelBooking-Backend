const User = require('../models/User');
const Notification = require('../models/Notification'); // ✅ NEW
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// ====================== TOKEN ======================
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

// ====================== EMAIL ======================
const sendEmail = async (email, subject, message) => {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: email,
      subject,
      html: message,
    });
  } catch (error) {
    console.error('Email Error:', error.message);
  }
};

// ====================== REGISTER ======================
exports.registerUser = async (req, res, next) => {
  try {
    const { firstName, lastName, email, phone, password, passwordConfirm } = req.body;

    if (!firstName || !email || !phone || !password || !passwordConfirm)
      return res.status(400).json({ success: false, message: 'All fields are required' });

    if (password !== passwordConfirm)
      return res.status(400).json({ success: false, message: 'Passwords do not match' });

    const userExists = await User.findOne({ email });
    if (userExists)
      return res.status(409).json({ success: false, message: 'Email already exists' });

    const user = await User.create({
      firstName,
      lastName,
      email,
      phone,
      password
    });

    const token = generateToken(user._id);

    // Notification
    await Notification.create({
      user: user._id,
      message: '🎉 Welcome! Your account has been created.',
      type: 'welcome',
    });

    res.status(201).json({
      success: true,
      message: 'Registered successfully.',
      data: { user, token },
    });
  } catch (error) {
    next(error);
  }
};

// Email verification logic removed

// ====================== LOGIN ======================
exports.loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email & password required' });

    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.matchPassword(password)))
      return res.status(401).json({ success: false, message: 'Invalid credentials' });

    // Email verification check removed

    const token = generateToken(user._id);

    await Notification.create({
      user: user._id,
      message: '👋 Logged in successfully',
      type: 'login',
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: { user, token },
    });
  } catch (error) {
    next(error);
  }
};

// ====================== PROFILE ======================
exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('bookingHistory')
      .populate('favoriteRooms');

    res.status(200).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

// ====================== UPDATE PROFILE ======================
exports.updateProfile = async (req, res, next) => {
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Profile updated',
      data: updatedUser,
    });
  } catch (error) {
    next(error);
  }
};

// ====================== CHANGE PASSWORD ======================
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword)
      return res.status(400).json({ success: false, message: 'Passwords mismatch' });

    const user = await User.findById(req.user.id).select('+password');

    if (!(await user.matchPassword(currentPassword)))
      return res.status(401).json({ success: false, message: 'Wrong current password' });

    user.password = newPassword;
    await user.save();

    await Notification.create({
      user: user._id,
      message: '🔐 Password updated',
      type: 'security',
    });

    res.status(200).json({ success: true, message: 'Password changed' });
  } catch (error) {
    next(error);
  }
};

// ====================== BOOKINGS ======================
exports.getUserBookings = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: 'bookingHistory',
      populate: { path: 'room' },
    });

    res.status(200).json({
      success: true,
      data: user.bookingHistory || [],
    });
  } catch (error) {
    next(error);
  }
};

// ====================== FAVORITES ======================
exports.getFavoriteRooms = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).populate('favoriteRooms');

    res.status(200).json({ success: true, data: user.favoriteRooms });
  } catch (error) {
    next(error);
  }
};

exports.addFavoriteRoom = async (req, res, next) => {
  try {
    const { roomId } = req.params;

    const user = await User.findById(req.user.id);

    if (user.favoriteRooms.includes(roomId))
      return res.status(400).json({ success: false, message: 'Already added' });

    user.favoriteRooms.push(roomId);
    await user.save();

    await Notification.create({
      user: user._id,
      message: '❤️ Room added to favorites',
      type: 'favorite',
    });

    res.status(200).json({ success: true, data: user.favoriteRooms });
  } catch (error) {
    next(error);
  }
};

exports.removeFavoriteRoom = async (req, res, next) => {
  try {
    const { roomId } = req.params;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $pull: { favoriteRooms: roomId } },
      { new: true }
    ).populate('favoriteRooms');

    res.status(200).json({ success: true, data: user.favoriteRooms });
  } catch (error) {
    next(error);
  }
};

// ====================== ADMIN ======================
exports.getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find().select('-password');

    res.status(200).json({
      success: true,
      total: users.length,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteUser = async (req, res, next) => {
  try {
    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'User deleted',
    });
  } catch (error) {
    next(error);
  }
};