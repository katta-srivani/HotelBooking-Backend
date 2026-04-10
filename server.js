const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');

dotenv.config();
connectDB();

const app = express();

// Middlewares
const allowedOrigins = [
  'http://localhost:3000',
  'https://hotel-frontendtasskk.netlify.app'
];
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json()); // ✅ NOW SAFE (no webhook)

// Cron Jobs
const { scheduleBookingReminders } = require('./utils/cron');
scheduleBookingReminders();

// Routes
const notificationRoutes = require('./routes/notificationRoutes');
const userRoutes = require('./routes/userRoutes');
const roomRoutes = require('./routes/roomRoutes');
const bookingRoutes=require('./routes/bookingRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const favoriteRoutes = require('./routes/favoriteRoutes');
const offerRoutes = require('./routes/offerRoutes');

// All routes (normal order)
app.use('/api/bookings', bookingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/offers', offerRoutes);

// Default route
app.get('/', (req, res) => {
  res.send('Hotel Booking API is running...');
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    message: err.message || 'Something went wrong',
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});