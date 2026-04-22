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
      returnDocument: 'after',
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
      isAvailable: { $ne: false },
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
      category,
      guests,
      minPrice,
      maxPrice,
      amenities,
      sortBy,
      page = 1,
      limit = 8,
    } = req.query;

    let query = {
      $and: [
        {
          $or: [
            { isAvailable: { $ne: false } },
            { isAvailable: { $exists: false } },
          ],
        },
        {
          $or: [
            { isActive: { $ne: false } },
            { isActive: { $exists: false } },
          ],
        },
      ],
    };
    const andConditions = [];

    // 🔍 KEYWORD SEARCH
    if (keyword) {
      andConditions.push({
        $or: [
        { title: { $regex: keyword, $options: "i" } },
        { description: { $regex: keyword, $options: "i" } },
        { view: { $regex: keyword, $options: "i" } },
        { location: { $regex: keyword, $options: "i" } },
        ],
      });
    }

    // 🏷 CATEGORY FILTER
    if (category && category.toLowerCase() !== "all") {
      const catLower = category.toLowerCase();
      const categoryPatterns = {
        luxury: [/luxury/i, /suite/i, /ocean/i, /premium/i],
        standard: [/standard/i, /basic/i, /comfort/i],
        deluxe: [/deluxe/i, /premium/i, /city/i, /mountain/i],
        suite: [/suite/i, /luxury/i, /family/i],
        villa: [/villa/i, /garden/i, /resort/i],
      };

      const patterns = categoryPatterns[catLower] || [new RegExp(catLower, "i")];
      andConditions.push({
        $or: [
          { category: { $regex: new RegExp(catLower, "i") } },
          { title: { $regex: new RegExp(catLower, "i") } },
          { description: { $regex: new RegExp(catLower, "i") } },
          { view: { $regex: new RegExp(catLower, "i") } },
          { location: { $regex: new RegExp(catLower, "i") } },
          ...patterns.map((pattern) => ({
            $or: [
              { title: { $regex: pattern } },
              { description: { $regex: pattern } },
              { view: { $regex: pattern } },
              { location: { $regex: pattern } },
            ],
          })),
        ],
      });
    }

    // 👥 GUEST FILTER
    if (guests) {
      query.maxGuests = { $gte: Number(guests) };
    }

    // 💰 PRICE FILTER
    if (minPrice || maxPrice) {
      query.pricePerNight = {};
      if (minPrice) query.pricePerNight.$gte = Number(minPrice);
      if (maxPrice) query.pricePerNight.$lte = Number(maxPrice);
    }

    // 🏊 AMENITIES FILTER
    if (amenities) {
      amenities
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => {
          query[`amenities.${item}`] = true;
        });
    }

    if (andConditions.length > 0) {
      query.$and = andConditions;
    }

    // 📦 FETCH ROOMS
    let rooms = await Room.find(query).lean();

    // 📅 CURRENT BOOKINGS (for UI badge)
    const now = new Date();
    const currentBookings = await Booking.find({
      status: { $in: ["approved", "hold"] },
      toDate: { $gte: now },
    }).select("room");

    const bookedIds = new Set(
      currentBookings.map((b) => b.room.toString())
    );

    rooms = rooms.map((room) => ({
      ...room,
      isCurrentlyBooked: bookedIds.has(room._id.toString()),
    }));

    // 📅 DATE RANGE FILTER (availability)
    if (fromDate && toDate) {
      const start = new Date(fromDate);
      const end = new Date(toDate);

      const bookingsInRange = await Booking.find({
        status: { $in: ["approved", "hold"] },
        fromDate: { $lt: end },
        toDate: { $gt: start },
      }).select("room");

      const bookedRangeIds = new Set(
        bookingsInRange.map((b) => b.room.toString())
      );

      rooms = rooms.filter(
        (room) => !bookedRangeIds.has(room._id.toString())
      );
    }

    // 🔄 SORTING (FIXED)
    if (sortBy === "price_asc") {
      rooms.sort((a, b) => (a.pricePerNight || 0) - (b.pricePerNight || 0));
    } else if (sortBy === "price_desc") {
      rooms.sort((a, b) => (b.pricePerNight || 0) - (a.pricePerNight || 0));
    } else if (sortBy === "rating") {
      rooms.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
    }

    // 📄 PAGINATION
    const pageNumber = Math.max(1, Number(page));
    const pageSize = Math.max(1, Number(limit));

    const total = rooms.length;
    const totalPages = Math.ceil(total / pageSize);

    const paginatedRooms = rooms.slice(
      (pageNumber - 1) * pageSize,
      pageNumber * pageSize
    );

    res.status(200).json({
      success: true,
      count: total,
      page: pageNumber,
      totalPages,
      rooms: paginatedRooms,
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
