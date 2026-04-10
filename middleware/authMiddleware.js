const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ✅ PROTECT ROUTES (User must be logged in)
exports.protect = async (req, res, next) => {
  let token;

  try {
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        const err = new Error('User not found');
        err.statusCode = 401;
        return next(err);
      }

      req.user = user;
      return next();
    }

    const err = new Error('No token provided');
    err.statusCode = 401;
    return next(err);
  } catch (error) {
    error.statusCode = 401;
    return next(error);
  }
};

// ✅ ADMIN MIDDLEWARE
exports.admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  const err = new Error('Admin access denied');
  err.statusCode = 403;
  return next(err);
};