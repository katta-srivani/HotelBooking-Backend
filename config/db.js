const mongoose = require('mongoose');

const cleanupLegacyBookingExpiry = async () => {
  try {
    const bookingCollection = mongoose.connection.collection('bookings');
    const indexes = await bookingCollection.indexes();
    const ttlIndexes = indexes.filter((index) => {
      if (!index) return false;
      if (String(index.name || '').toLowerCase().includes('expiresat')) return true;
      return Boolean(index.key && Object.prototype.hasOwnProperty.call(index.key, 'expiresAt'));
    });

    for (const index of ttlIndexes) {
      try {
        await bookingCollection.dropIndex(index.name);
        console.log(`Removed legacy booking expiry index: ${index.name}`);
      } catch (dropError) {
        console.error(`Failed to drop booking index ${index.name}:`, dropError.message || dropError);
      }
    }

    const result = await bookingCollection.updateMany(
      {
        expiresAt: { $type: 'date' },
        status: { $in: ['approved', 'hold'] },
      },
      {
        $set: { expiresAt: null },
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`Cleared stale booking expiry from ${result.modifiedCount} booking(s).`);
    }
  } catch (cleanupError) {
    console.error('Booking expiry cleanup failed:', cleanupError.message || cleanupError);
  }
};

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected');
    await cleanupLegacyBookingExpiry();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
