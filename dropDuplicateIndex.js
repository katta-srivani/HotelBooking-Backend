const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    
    try {
      // Drop the bad index
      const db = mongoose.connection.db;
      const bookingCollection = db.collection('bookings');
      
      // Get all indexes
      const indexes = await bookingCollection.listIndexes().toArray();
      const indexNames = indexes.map(idx => idx.name);
      console.log('Current indexes:', indexNames);
      
      // Drop bookingId index if it exists
      if (indexNames.includes('bookingId_1')) {
        await bookingCollection.dropIndex('bookingId_1');
        console.log('✅ Dropped bad "bookingId_1" index');
      }
      
      // Drop all indexes except _id_
      for (const indexName of indexNames) {
        if (indexName !== '_id_') {
          try {
            await bookingCollection.dropIndex(indexName);
            console.log(`✅ Dropped index: ${indexName}`);
          } catch (err) {
            console.log(`⚠️ Could not drop ${indexName}:`, err.message);
          }
        }
      }
      
      console.log('\n✅ Indexes cleanup completed!');
      console.log('New indexes will be created automatically when server restarts.\n');
      
      process.exit(0);
    } catch (err) {
      console.error('❌ Error:', err.message);
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });
