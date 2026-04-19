const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');

dotenv.config();
connectDB();

const app = express();


// ✅ CORS FIX (supports localhost + Netlify + Vercel)
const allowedOrigins = [
  "http://localhost:3000",
  /https:\/\/hotel-frontend-[a-z0-9]+\.vercel\.app$/,
  /https:\/\/hotel-frontend[a-z0-9\-]*\.netlify\.app$/
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow Postman / mobile apps (no origin)
      if (!origin) return callback(null, true);

      for (const allowed of allowedOrigins) {
        if (typeof allowed === 'string' && allowed === origin) {
          return callback(null, true);
        }
        if (allowed instanceof RegExp && allowed.test(origin)) {
          return callback(null, true);
        }
      }
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);





// Middlewares
app.use(express.json());


// Cron Jobs
const { scheduleBookingReminders } = require('./utils/cron');
scheduleBookingReminders();


// Routes
const notificationRoutes = require('./routes/notificationRoutes');
const userRoutes = require('./routes/userRoutes');
const roomRoutes = require('./routes/roomRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const favoriteRoutes = require('./routes/FavoriteRoutes'); 
const offerRoutes = require('./routes/offerRoutes');


// API Routes
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
  console.error("❌ ERROR:", err.message);

  res.status(err.statusCode || 500).json({
    message: err.message || 'Something went wrong',
  });
});


// PORT
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
