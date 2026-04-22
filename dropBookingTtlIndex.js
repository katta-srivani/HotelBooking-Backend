require('dotenv').config();
const connectDB = require('./config/db');
const Booking = require('./models/Booking');

async function main() {
  await connectDB();

  const indexes = await Booking.collection.indexes();
  const ttlIndexes = indexes.filter((index) => {
    if (!index) return false;
    if (String(index.name || '').toLowerCase().includes('expiresat')) return true;
    return Boolean(index.key && Object.prototype.hasOwnProperty.call(index.key, 'expiresAt'));
  });

  if (ttlIndexes.length === 0) {
    console.log('No booking expiry index found.');
    process.exit(0);
  }

  for (const index of ttlIndexes) {
    try {
      await Booking.collection.dropIndex(index.name);
      console.log(`Dropped booking index: ${index.name}`);
    } catch (err) {
      console.error(`Failed to drop index ${index.name}:`, err.message || err);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Booking index cleanup failed:', err.message || err);
  process.exit(1);
});
