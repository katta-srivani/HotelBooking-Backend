// Script to update all rooms in the database to ensure amenities object has all required boolean keys
// Run this with: node updateAmenities.js

const mongoose = require('mongoose');
const Room = require('./models/Room'); // Adjust path if needed

const MONGO_URI = 'mongodb://localhost:27017/YOUR_DB_NAME'; // <-- Replace with your DB name

const REQUIRED_AMENITIES = ['wifi', 'parking', 'breakfast', 'pool'];

async function updateAmenities() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const rooms = await Room.find();

  for (const room of rooms) {
    let updated = false;
    if (!room.amenities) room.amenities = {};
    for (const key of REQUIRED_AMENITIES) {
      if (typeof room.amenities[key] !== 'boolean') {
        room.amenities[key] = false;
        updated = true;
      }
    }
    if (updated) {
      await room.save();
      console.log(`Updated room: ${room._id}`);
    }
  }
  console.log('Amenities update complete.');
  mongoose.disconnect();
}

updateAmenities().catch(console.error);
