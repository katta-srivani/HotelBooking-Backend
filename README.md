
# Hotel Booking Backend

This is the backend for a full-stack Hotel Booking application built with the MERN stack (MongoDB, Express, React, Node.js).

## Project Overview
This backend powers a hotel booking platform where users can:
- Browse and search for hotel rooms
- Register and log in securely
- Book rooms with online payment or cash on delivery
- Submit and view reviews for rooms (with admin approval)
- Manage their bookings and profile

Admins can:
- Manage rooms, bookings, and users
- Approve or reject user reviews
- View analytics and notifications

The backend exposes a RESTful API, handles authentication/authorization, and integrates with payment and notification services.


## Features
- User authentication (JWT)
- Room management
- Booking management
- Review system (with admin approval)
- Admin/user role separation

## Main Dependencies
- express
- mongoose
- bcryptjs
- jsonwebtoken
- dotenv
- cors
- nodemailer
- razorpay
- twilio
- node-cron


## Folder Structure & Functionality

```
hotel-booking-backend/
├── config/           # Database config (db.js: connects to MongoDB)
├── controllers/      # Route controllers (business logic for each resource)
│   ├── BookingController.js      # Booking creation, cancellation, payment
│   ├── FavoriteController.js     # User favorites management
│   ├── OfferController.js        # Special offers and discounts
│   ├── ReviewController.js       # Add, fetch, approve reviews
│   ├── RoomController.js         # Room CRUD and search
│   └── UserController.js         # User registration, login, profile
├── middleware/       # Express middleware
│   └── authMiddleware.js         # JWT authentication, admin check
├── models/           # Mongoose models (MongoDB schemas)
│   ├── Booking.js                # Booking schema
│   ├── Favorite.js               # Favorites schema
│   ├── Notification.js           # Notification schema
│   ├── Offer.js                  # Offer schema
│   ├── Review.js                 # Review schema
│   ├── Room.js                   # Room schema
│   └── User.js                   # User schema
├── routes/           # Express route definitions
│   ├── bookingRoutes.js          # /api/bookings endpoints
│   ├── FavoriteRoutes.js         # /api/favorites endpoints
│   ├── notificationRoutes.js     # /api/notifications endpoints
│   ├── offerRoutes.js            # /api/offers endpoints
│   ├── reviewRoutes.js           # /api/reviews endpoints
│   ├── roomRoutes.js             # /api/rooms endpoints
│   └── userRoutes.js             # /api/users endpoints
├── utils/            # Utility/helper functions
│   ├── asyncHandler.js           # Async error handling
│   ├── cron.js                   # Scheduled jobs (e.g., reminders)
│   ├── email.js                  # Email sending logic
│   ├── generateToken.js          # JWT token generation
│   ├── payment.js                # Payment integration helpers
│   ├── sendBAookingreminders.js  # Booking reminder logic
│   └── sms.js                    # SMS sending logic
├── .env              # Environment variables (not committed)
├── package.json       # Project dependencies and scripts
├── server.js         # App entry point (Express server)
├── seed.js           # DB seeding script (sample data)
├── dropDuplicateIndex.js # Utility script for DB maintenance
├── updateAmenities.js    # Utility script for updating amenities
└── README.md
```

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env` file with the following variables:
   ```env
   MONGO_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   PORT=5000
   ```
3. Start the server:
   ```bash
   npm run dev
   ```

## API Endpoints
- `/api/rooms` - Room CRUD
- `/api/bookings` - Booking CRUD
- `/api/reviews` - Review CRUD
- `/api/users` - User auth/profile

## Notes
- Requires MongoDB running locally or in the cloud.
- Make sure frontend is set up as per frontend README.
