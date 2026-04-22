require('dotenv').config();
const connectDB = require('./config/db');
const Booking = require('./models/Booking');

async function run() {
  try {
    await connectDB();

    const result = await Booking.updateMany(
      {
        status: { $in: ['approved', 'hold'] },
        expiresAt: { $type: 'date' },
      },
      {
        $set: { expiresAt: null },
      }
    );

    console.log('Booking expiry cleanup complete:', {
      matchedCount: result.matchedCount ?? result.n,
      modifiedCount: result.modifiedCount ?? result.nModified,
    });
  } catch (error) {
    console.error('Failed to clean booking expiry:', error.message || error);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
}

run();
