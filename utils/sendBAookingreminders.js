const Booking = require('../models/Booking');
const sendEmail = require('./email');
const sendSMS = require('./sms');

async function sendBookingReminders() {
  try {
    const tomorrowStart = new Date();
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0, 0);

    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const bookings = await Booking.find({
      fromDate: { $gte: tomorrowStart, $lte: tomorrowEnd },
      status: { $ne: 'cancelled' },
    })
      .populate('user', 'firstName lastName email phone')
      .populate('room', 'title');

    for (const booking of bookings) {
      const { user, room, fromDate } = booking;
      const guestName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Guest';
      const phoneNumber = user?.phone || '';

      await sendEmail(
        user.email,
        'Booking Reminder',
        `Hi ${guestName}, this is a reminder for your booking at "${room.title}" on ${fromDate.toDateString()}. We look forward to hosting you!`
      );

      if (phoneNumber) {
        await sendSMS(
          phoneNumber,
          `Hi ${guestName}, reminder: your booking at "${room.title}" is on ${fromDate.toDateString()}.`
        );
      }

      console.log(`Reminder sent to ${user.email}${phoneNumber ? ` & ${phoneNumber}` : ''}`);
    }
  } catch (error) {
    console.error('Error sending booking reminders:', error);
  }
}

module.exports = sendBookingReminders;
