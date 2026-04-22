const mongoose = require('mongoose');
require('dotenv').config();

const Room = require('./models/Room');

const fallbackRoomImage =
  'data:image/svg+xml;charset=UTF-8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#e5e7eb"/><rect x="72" y="74" width="256" height="152" rx="20" fill="#f8fafc" stroke="#cbd5e1" stroke-width="4"/><rect x="102" y="112" width="90" height="72" rx="10" fill="#dbeafe"/><rect x="208" y="112" width="90" height="72" rx="10" fill="#dbeafe"/><rect x="160" y="182" width="80" height="18" rx="9" fill="#94a3b8"/><text x="200" y="260" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#64748b">Room</text></svg>'
  );

const isPrivateHost = (hostname = '') => {
  const host = String(hostname).toLowerCase();

  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
};

const isSafeImageUrl = (value) => {
  const url = String(value || '').trim();

  if (!url) {
    return false;
  }

  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('https://')) {
    return true;
  }

  if (url.startsWith('//')) {
    return true;
  }

  if (url.startsWith('http://')) {
    try {
      const parsed = new URL(url);
      return !isPrivateHost(parsed.hostname);
    } catch {
      return false;
    }
  }

  if (url.startsWith('/')) {
    return true;
  }

  return false;
};

const normalizeImages = (imageUrls = [], room = {}) => {
  const safeUrls = imageUrls.filter(isSafeImageUrl);

  if (safeUrls.length > 0) {
    return safeUrls;
  }

  const title = String(room.title || '').toLowerCase();
  const view = String(room.view || '').toLowerCase();
  const category = String(room.category || '').toLowerCase();

  if (view.includes('beach') || title.includes('beach') || category.includes('luxury')) {
    return ['https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80'];
  }

  if (view.includes('city') || title.includes('city') || category.includes('deluxe')) {
    return ['https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&w=1200&q=80'];
  }

  if (view.includes('garden') || title.includes('villa') || category.includes('villa')) {
    return ['https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=1200&q=80'];
  }

  return [fallbackRoomImage];
};

async function run() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not configured');
    }

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 30000,
    });

    console.log('Connected to MongoDB');

    const rooms = await Room.find({});
    let updatedCount = 0;

    for (const room of rooms) {
      const normalized = normalizeImages(room.imageUrls || [], room);
      const current = JSON.stringify(room.imageUrls || []);
      const next = JSON.stringify(normalized);

      if (current !== next) {
        room.imageUrls = normalized;
        await room.save();
        updatedCount += 1;
        console.log(`Updated room images for: ${room._id}`);
      }
    }

    console.log(`Room image cleanup complete. Updated ${updatedCount} room(s).`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Image cleanup failed:', error.message || error);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  }
}

run();
