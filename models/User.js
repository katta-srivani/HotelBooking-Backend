const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, default: '' },
  email: { type: String, required: true, unique: true, lowercase: true },
  phone: { type: String, required: true },
  password: { type: String, required: true, select: false },
  role: { type: String, default: 'user' },
  profileImage: { type: String, default: '' },
  bookingHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }],
  favoriteRooms: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Room' }],

  // Email verification removed
}, { timestamps: true });

// Hash password
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 10);
});

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);