const Booking = require('../models/Booking');
const sendEmail = require('./email');
const sendSMS = require('./sms');

async function sendBookingReminders() {
  try {
    // Example: send reminders for bookings tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const bookings = await Booking.find({ fromDate: tomorrow })
      .populate('user', 'name email phoneNumber')
      .populate('room', 'title');

    for (const booking of bookings) {
      const { user, room, fromDate } = booking;

      // ✅ Send Email
      await sendEmail(
        user.email,
        'Booking Reminder',
        `Hi ${user.name}, this is a reminder for your booking at "${room.title}" on ${fromDate.toDateString()}. We look forward to hosting you!`
      );

      // ✅ Send SMS
      if (user.phoneNumber) {
        await sendSMS(
          user.phoneNumber,
          `Hi ${user.name}, reminder: your booking at "${room.title}" is on ${fromDate.toDateString()}.`
        );
      }

      console.log(`✅ Reminder sent to ${user.email} & ${user.phoneNumber}`);
    }

  } catch (error) {
    console.error('❌ Error sending booking reminders:', error);
  }
}

// Export the function — do NOT call it here
module.exports = sendBookingReminders;