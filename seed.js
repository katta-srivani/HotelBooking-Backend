const mongoose = require('mongoose');
const bcryptjs = require('bcryptjs');
require('dotenv').config();

// Import models
const User = require('./models/User');
const Room = require('./models/Room');
const Offer = require('./models/Offer');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI);

const seedDatabase = async () => {
  try {
    console.log('🌱 Starting database seeding...');

    // Clear existing data
    await User.deleteMany({});
    await Room.deleteMany({});
    await Offer.deleteMany({});

    // Create sample users
    const saltRounds = 10;
    const hashedPassword = await bcryptjs.hash('Password@123', saltRounds);
    const adminPassword = await bcryptjs.hash('Admin@123', saltRounds);


    const users = await User.insertMany([
      {
        firstName: 'John',
        lastName: 'Doe',
        email: 'user@example.com',
        password: hashedPassword,
        phone: '9876543210',
        role: 'user',
      },
      {
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@example.com',
        password: adminPassword,
        phone: '9876543212',
        role: 'admin',
      },
    ]);

    console.log(`✅ Created ${users.length} users`);

    // Create sample rooms
    const rooms = await Room.insertMany([
      {
        title: 'Luxury Suite - Ocean View',
        roomType: 'Suite',
        description: 'Premium ocean-facing suite with stunning views',
        pricePerNight: 5000,
        maxGuests: 4,
        bedType: 'King Bed',
        size: 600,
        view: 'Ocean',
        amenities: ['WiFi', 'AC', 'TV', 'Mini Bar', 'Bathrobe', 'Balcony'],
        imageUrls: ['https://images.unsplash.com/photo-1631049307038-da0ec9d70304?w=800'],
        isActive: true,
      },
      {
        title: 'Deluxe Room - City View',
        roomType: 'Deluxe',
        description: 'Modern deluxe room with city skyline views',
        pricePerNight: 3500,
        maxGuests: 2,
        bedType: 'Queen Bed',
        size: 400,
        view: 'City',
        amenities: ['WiFi', 'AC', 'TV', 'Desk', 'Work Area'],
        imageUrls: ['https://images.unsplash.com/photo-1611892437281-00bae58ab22b?w=800'],
        isActive: true,
      },
      {
        title: 'Standard Room',
        roomType: 'Standard',
        description: 'Comfortable and affordable room',
        pricePerNight: 1500,
        maxGuests: 2,
        bedType: 'Twin Beds',
        size: 250,
        amenities: ['WiFi', 'AC', 'TV', 'Private Bathroom'],
        imageUrls: ['https://images.unsplash.com/photo-1570129477492-45201b8c7e89?w=800'],
        isActive: true,
      },
      {
        title: 'Family Villa',
        roomType: 'Suite',
        description: 'Spacious family villa with garden views',
        pricePerNight: 6000,
        maxGuests: 6,
        bedType: 'Multiple Beds',
        size: 800,
        view: 'Garden',
        amenities: ['WiFi', 'Kitchen', 'Pool', 'Garden', 'Multiple Bathrooms'],
        imageUrls: ['https://images.unsplash.com/photo-1568084308411-241c6d0daeb0?w=800'],
        isActive: true,
      },
      {
        title: 'Mountain Cabin',
        roomType: 'Deluxe',
        description: 'Cozy mountain cabin with fireplace',
        pricePerNight: 2500,
        maxGuests: 3,
        bedType: 'King & Single',
        size: 350,
        view: 'Mountain',
        amenities: ['WiFi', 'Fireplace', 'Hot Tub', 'Mountain View'],
        imageUrls: ['https://images.unsplash.com/photo-1519821905807-4bae5b34bc5d?w=800'],
        isActive: true,
      },
    ]);

    console.log(`✅ Created ${rooms.length} rooms`);

    // Create sample offers
    const offers = await Offer.insertMany([
      {
        code: 'WELCOME20',
        description: 'Welcome offer - 20% discount',
        discountPercentage: 20,
        validFrom: new Date(),
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        maxUsageCount: 100,
        isActive: true,
      },
      {
        code: 'SUMMER50',
        description: 'Summer special - ₹5000 off',
        discountPercentage: 10,
        validFrom: new Date(),
        expiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        maxUsageCount: 50,
        isActive: true,
      },
    ]);

    console.log(`✅ Created ${offers.length} promotional offers`);

    console.log('\n✨ Database seeding completed successfully!');
    console.log(`
📊 Summary:
   - Users: ${users.length}
   - Rooms: ${rooms.length}
   - Offers: ${offers.length}

🔐 Test Credentials:
   Regular User:
   - Email: user@example.com
   - Password: Password@123

   Admin User:
   - Email: admin@example.com
   - Password: Admin@123
    `);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();
