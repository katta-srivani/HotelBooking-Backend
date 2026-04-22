const mongoose = require('mongoose');
const bcryptjs = require('bcryptjs');
require('dotenv').config();

const User = require('./models/User');
const Room = require('./models/Room');
const Offer = require('./models/Offer');

const seedDatabase = async () => {
  try {
    console.log('🌱 Safe seeding - preserving existing rooms...');

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
    });

    // Check for Luxury and Villa rooms
    const luxuryCount = await Room.countDocuments({category: 'Luxury'});
    const villaCount = await Room.countDocuments({category: 'Villa'});
    console.log(`Luxury rooms: ${luxuryCount}, Villa rooms: ${villaCount}`);

    const saltRounds = 10;
    const hashedPassword = await bcryptjs.hash('Password@123', saltRounds);
    const adminPassword = await bcryptjs.hash('Admin@123', saltRounds);

    const demoUsers = [
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
    ];

    let usersCreated = 0;
    for (const demoUser of demoUsers) {
      const existingUser = await User.findOne({ email: demoUser.email });
      if (!existingUser) {
        await User.create(demoUser);
        usersCreated += 1;
      }
    }
    console.log(`✅ Created ${usersCreated} users`);

    // Add missing categories only (preserve all existing rooms)
    const roomsToInsert = [];
    if (luxuryCount === 0) {
      roomsToInsert.push({
        title: 'Luxury Suite - Ocean View',
        category: 'Luxury',
        pricePerNight: 5000,
        description: 'Premium ocean-facing suite with stunning views',
        maxGuests: 4,
        bedType: 'King Bed',
        size: '600 sq.ft',
        view: 'Ocean',
        amenities: { wifi: true, parking: true, breakfast: true, pool: true },
        imageUrls: ['https://images.unsplash.com/photo-1631049307038-da0ec9d70304?w=800'],
        ratings: [4,5,5,4,5],
        averageRating: 4.6
      });
    }
    if (villaCount === 0) {
      roomsToInsert.push({
        title: 'Family Villa - Garden View',
        category: 'Villa',
        pricePerNight: 6000,
        description: 'Spacious family villa with private garden',
        maxGuests: 6,
        bedType: 'Multiple Beds',
        size: '800 sq.ft',
        view: 'Garden',
        amenities: { wifi: true, parking: true, breakfast: true, pool: true },
        imageUrls: ['https://images.unsplash.com/photo-1568084308411-241c6d0daeb0?w=800'],
        ratings: [5,5,4,5,4],
        averageRating: 4.6
      });
    }

    let roomsAdded = 0;
    if (roomsToInsert.length > 0) {
      const rooms = await Room.insertMany(roomsToInsert);
      roomsAdded = rooms.length;
      console.log(`✅ Added ${roomsAdded} new rooms (Luxury/Villa)`);
    } else {
      console.log('ℹ️ Luxury and Villa rooms already exist - skipping');
    }

    const offersToEnsure = [
      {
        code: 'WELCOME20',
        discountType: 'percentage',
        discountValue: 20,
        minAmount: 0,
        maxDiscount: 20,
        expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        usageLimit: 100,
        isActive: true,
      },
      {
        code: 'SUMMER50',
        discountType: 'percentage',
        discountValue: 10,
        minAmount: 0,
        maxDiscount: 10,
        expiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
        usageLimit: 50,
        isActive: true,
      },
    ];

    let offersCreated = 0;
    for (const offerData of offersToEnsure) {
      const existingOffer = await Offer.findOne({ code: offerData.code });
      if (!existingOffer) {
        await Offer.create(offerData);
        offersCreated += 1;
      }
    }
    console.log(`✅ Created ${offersCreated} offers`);

    console.log('\n✨ Safe seeding complete!');
    console.log(`
📊 Summary:
  - Users: ${usersCreated}
  - New Rooms Added: ${roomsAdded} (existing preserved)
  - Offers: ${offersCreated}

🔐 Test Credentials:
  - User: user@example.com / Password@123
  - Admin: admin@example.com / Admin@123
`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  }
};

seedDatabase();

