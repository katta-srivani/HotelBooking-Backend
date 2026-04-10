const User = require('../models/User');
const Notification = require('../models/Notification'); // ✅ NEW
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// ====================== TOKEN ======================
const generateToken = (id) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

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
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!firstName || !normalizedEmail || !phone || !password || !passwordConfirm)
      return res.status(400).json({ success: false, message: 'All fields are required' });

    if (password !== passwordConfirm)
      return res.status(400).json({ success: false, message: 'Passwords do not match' });

    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists)
      return res.status(409).json({ success: false, message: 'Email already exists' });

    const user = await User.create({
      firstName,
      lastName,
      email: normalizedEmail,
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

    // Send welcome email
    try {
      await sendEmail(
        user.email,
        'Welcome to Hotel Booking!',
        `<div style="font-family:sans-serif;padding:20px"><h2>Welcome, ${user.firstName}!</h2><p>Thank you for registering at our hotel booking platform. We hope you enjoy your experience!</p></div>`
      );
    } catch (emailErr) {
      console.error('❌ Failed to send welcome email:', emailErr);
    }

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
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '').trim();

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email & password required',
      });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const isPasswordValid = await user.matchPassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
    }

    const token = generateToken(user._id);
    const safeUser = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      profileImage: user.profileImage,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    // Fire-and-forget to avoid login delays from notification failures/timeouts.
    Notification.create({
      user: user._id,
      message: '👋 Logged in successfully',
      type: 'login',
    }).catch((notifyError) => {
      console.error('Login notification failed:', notifyError.message);
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: safeUser,
        token,
      },
    });
  } catch (error) {
    return next(error);
  }
};

// ====================== PROFILE ======================
exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('bookingHistory');

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