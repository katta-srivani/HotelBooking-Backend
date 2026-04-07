const Room = require('../models/Room');
const Booking = require('../models/Booking');

// ✅ Add Room
const addRoom = async (req, res) => {
  try {
    const room = new Room(req.body);
    const savedRoom = await room.save();

    res.status(201).json(savedRoom);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ Get All Rooms (with isCurrentlyBooked)
const getAllRooms = async (req, res) => {
  try {
    const rooms = await Room.find({});
    const now = new Date();

    // Get all bookings with status pending/approved and toDate in the future
    const bookings = await Booking.find({
      status: { $in: ["pending", "approved"] },
      toDate: { $gte: now },
    }).select("room");
    const bookedRoomIds = bookings.map((b) => b.room.toString());

    // Add isCurrentlyBooked to each room (booked until checkout date)
    const roomsWithStatus = rooms.map((room) => {
      return {
        ...room.toObject(),
        isCurrentlyBooked: bookedRoomIds.includes(room._id.toString()),
      };
    });
    res.status(200).json(roomsWithStatus);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ Get Room By ID
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

// ✅ Update Room
const updateRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const updatedRoom = await Room.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json({
      success: true,
      updatedRoom,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ Delete Room
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

// ✅ Get Available Rooms (OPTIMIZED 🔥)
const getAvailableRooms = async (req, res) => {
  try {
    const { fromDate, toDate, roomType } = req.query;

    if (!fromDate || !toDate) {
      return res.status(400).json({
        message: 'Please provide fromDate and toDate',
      });
    }

    const start = new Date(fromDate);
    const end = new Date(toDate);

    // 🔥 Get all booked room IDs in one query
    const bookings = await Booking.find({
      $or: [
        {
          fromDate: { $lte: end },
          toDate: { $gte: start },
        },
      ],
    }).select('room');

    const bookedRoomIds = bookings.map(b => b.room.toString());

    let query = {
      _id: { $nin: bookedRoomIds },
    };

    if (roomType) {
      query.roomType = roomType;
    }

    const availableRooms = await Room.find(query);

    res.status(200).json({
      success: true,
      count: availableRooms.length,
      availableRooms,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ Search + Filter + Availability + Sorting (FINAL 🔥)
const searchRooms = async (req, res) => {
  try {
    const {
      keyword,
      fromDate,
      toDate,
      roomType,
      minPrice,
      maxPrice,
      amenities,
      sortBy,
    } = req.query;

    let query = {};

    // 🔍 Keyword
    if (keyword) {
      query.title = { $regex: keyword, $options: 'i' };
    }

    // 🏨 Room Type
    if (roomType) {
      query.roomType = roomType;
    }

    // 💰 Price Filter
    if (minPrice || maxPrice) {
      query.pricePerNight = {};
      if (minPrice) query.pricePerNight.$gte = Number(minPrice);
      if (maxPrice) query.pricePerNight.$lte = Number(maxPrice);
    }

   // 🛎 Amenities FIXED
if (amenities) {
  const amenitiesList = amenities.split(',');

  amenitiesList.forEach((item) => {
    query[`amenities.${item}`] = true;
  });
}


    let rooms = await Room.find(query);

    // Get all bookings with status pending/approved and toDate in the future
    const now = new Date();
    const bookings = await Booking.find({
      status: { $in: ["pending", "approved"] },
      toDate: { $gte: now },
    }).select("room");
    const bookedRoomIds = bookings.map((b) => b.room.toString());

    // Add isCurrentlyBooked to each room
    rooms = rooms.map((room) => {
      return {
        ...room.toObject(),
        isCurrentlyBooked: bookedRoomIds.includes(room._id.toString()),
      };
    });

    // 📅 Availability filter (if searching by date, filter out booked rooms in that range)
    if (fromDate && toDate) {
      const start = new Date(fromDate);
      const end = new Date(toDate);

      const bookingsInRange = await Booking.find({
        $or: [
          {
            fromDate: { $lte: end },
            toDate: { $gte: start },
          },
        ],
      }).select('room');

      const bookedRoomIdsInRange = bookingsInRange.map(b => b.room.toString());

      rooms = rooms.filter(
        room => !bookedRoomIdsInRange.includes(room._id.toString())
      );
    }

    // 📊 Sorting
    if (sortBy === 'price_asc') {
      rooms.sort((a, b) => a.pricePerNight - b.pricePerNight);
    } else if (sortBy === 'price_desc') {
      rooms.sort((a, b) => b.pricePerNight - a.pricePerNight);
    } else if (sortBy === 'rating') {
      rooms.sort((a, b) => (b.averageRating || 0) - (a.averageRating || 0));
    }

    res.status(200).json({
      success: true,
      count: rooms.length,
      rooms,
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ EXPORTS
module.exports = {
  addRoom,
  getAllRooms,
  getRoomById,
  updateRoom,
  deleteRoom,
  getAvailableRooms,
  searchRooms,
};