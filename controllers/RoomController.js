const Room = require('../models/Room');
const Booking = require('../models/Booking');

const addRoom = async (req, res) => {
  try {
    const room = new Room(req.body);
    const savedRoom = await room.save();
    res.status(201).json(savedRoom);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAllRooms = async (req, res) => {
  try {
    const rooms = await Room.find({}).sort({ createdAt: -1 });
    const now = new Date();

    const bookings = await Booking.find({
      status: { $in: ['approved', 'hold'] },
      toDate: { $gte: now },
    }).select('room');

    const bookedRoomIds = new Set(bookings.map((booking) => booking.room.toString()));

    const roomsWithStatus = rooms.map((room) => ({
      ...room.toObject(),
      isCurrentlyBooked: bookedRoomIds.has(room._id.toString()),
    }));

    res.status(200).json(roomsWithStatus);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getRoomById = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    res.status(200).json(room);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const updatedRoom = await Room.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.json({
      success: true,
      data: updatedRoom,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deleteRoom = async (req, res) => {
  try {
    const room = await Room.findByIdAndDelete(req.params.id);

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    res.status(200).json({ message: 'Room deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getAvailableRooms = async (req, res) => {
  try {
    const { fromDate, toDate, roomType, guests } = req.query;

    if (!fromDate || !toDate) {
      return res.status(400).json({
        message: 'Please provide fromDate and toDate',
      });
    }

    const start = new Date(fromDate);
    const end = new Date(toDate);

    const bookings = await Booking.find({
      status: { $in: ['approved', 'hold'] },
      fromDate: { $lt: end },
      toDate: { $gt: start },
    }).select('room');

    const bookedRoomIds = bookings.map((booking) => booking.room.toString());

    const query = {
      _id: { $nin: bookedRoomIds },
      isAvailable: true,
    };

    if (roomType) {
      query.roomType = new RegExp(`^${roomType}$`, 'i');
    }

    if (guests) {
      query.maxGuests = { $gte: Number(guests) };
    }

    const availableRooms = await Room.find(query).sort({ pricePerNight: 1 });

    res.status(200).json({
      success: true,
      count: availableRooms.length,
      availableRooms,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const searchRooms = async (req, res) => {
  try {
    const {
      keyword,
      fromDate,
      toDate,
      roomType,
      category,
      guests,
      minPrice,
      maxPrice,
      amenities,
      sortBy,
      page = 1,
      limit = 8,
    } = req.query;

    const query = { isAvailable: true };

    if (keyword) {
      query.$or = [
        { title: { $regex: keyword, $options: 'i' } },
        { description: { $regex: keyword, $options: 'i' } },
        { view: { $regex: keyword, $options: 'i' } },
      ];
    }

    const effectiveRoomType = roomType || category;
    if (effectiveRoomType && effectiveRoomType.toLowerCase() !== 'all') {
      query.roomType = new RegExp(`^${effectiveRoomType}$`, 'i');
    }

    if (guests) {
      query.maxGuests = { $gte: Number(guests) };
    }

    if (minPrice || maxPrice) {
      query.pricePerNight = {};
      if (minPrice) query.pricePerNight.$gte = Number(minPrice);
      if (maxPrice) query.pricePerNight.$lte = Number(maxPrice);
    }

    if (amenities) {
      amenities
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => {
          query[`amenities.${item}`] = true;
        });
    }

    let rooms = await Room.find(query).lean();

    const now = new Date();
    const currentBookings = await Booking.find({
      status: { $in: ['approved', 'hold'] },
      toDate: { $gte: now },
    }).select('room');

    const currentlyBookedIds = new Set(
      currentBookings.map((booking) => booking.room.toString())
    );

    rooms = rooms.map((room) => ({
      ...room,
      isCurrentlyBooked: currentlyBookedIds.has(room._id.toString()),
    }));

    if (fromDate && toDate) {
      const start = new Date(fromDate);
      const end = new Date(toDate);

      const bookingsInRange = await Booking.find({
        status: { $in: ['approved', 'hold'] },
        fromDate: { $lt: end },
        toDate: { $gt: start },
      }).select('room');

      const bookedRoomIdsInRange = new Set(
        bookingsInRange.map((booking) => booking.room.toString())
      );

      rooms = rooms.filter((room) => !bookedRoomIdsInRange.has(room._id.toString()));
    }

    if (sortBy === 'price_asc') {
      rooms.sort((a, b) => (a.pricePerNight || 0) - (b.pricePerNight || 0));
    } else if (sortBy === 'price_desc') {
      rooms.sort((a, b) => (b.pricePerNight || 0) - (a.pricePerNight || 0));
    } else if (sortBy === 'rating') {
      rooms.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
    }

    const pageNumber = Math.max(1, Number(page));
    const pageSize = Math.max(1, Number(limit));
    const total = rooms.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const startIndex = (pageNumber - 1) * pageSize;

    res.status(200).json({
      success: true,
      count: total,
      page: pageNumber,
      totalPages,
      rooms: rooms.slice(startIndex, startIndex + pageSize),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  addRoom,
  getAllRooms,
  getRoomById,
  updateRoom,
  deleteRoom,
  getAvailableRooms,
  searchRooms,
};
