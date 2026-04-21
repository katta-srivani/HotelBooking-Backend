const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ✅ PROTECT ROUTES (User must be logged in)
exports.protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ message: "No token provided" });
    }

    // safer split (handles extra spaces)
    const parts = authHeader.trim().split(" ");

    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
      return res.status(401).json({ message: "Invalid token format" });
    }

    const token = parts[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user;
    next();

  } catch (error) {
    console.error("AUTH ERROR:", error.message);

    return res.status(401).json({
      message: "Invalid or expired token"
    });
  }
};
// ✅ ADMIN MIDDLEWARE
exports.admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  const err = new Error('Admin access denied');
  err.statusCode = 403;
  return next(err);
};