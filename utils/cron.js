// utils/cron.js
const cron = require('node-cron');
const Booking = require('../models/Booking');
const sendEmail = require('./email');
const sendSMS = require('./sms');

const scheduleBookingReminders = () => {
  // Run every day at 8:00 AM
  cron.schedule('0 8 * * *', async () => {
    console.log('🔔 Running booking reminders...');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Set time to 00:00:00 for comparison
    tomorrow.setHours(0, 0, 0, 0);

    const bookings = await Booking.find({
      fromDate: tomorrow
    }).populate('user').populate('room');

    for (const booking of bookings) {
      const { user, room, fromDate } = booking;

      // Send Email
      await sendEmail(
        user.email,
        'Booking Reminder',
        `Hi ${user.name}, this is a reminder for your booking at "${room.title}" on ${fromDate.toDateString()}.`
      );

      // Send SMS
      if (user.phoneNumber) {
        await sendSMS(
          user.phoneNumber,
          `Hi ${user.name}, reminder: your booking at "${room.title}" is on ${fromDate.toDateString()}.`
        );
      }

      console.log(`✅ Reminder sent to ${user.email} & ${user.phoneNumber}`);
    }
  });
};

module.exports = { scheduleBookingReminders };