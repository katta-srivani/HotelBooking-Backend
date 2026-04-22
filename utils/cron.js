const cron = require('node-cron');
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const sendEmail = require('./email');
const sendSMS = require('./sms');

const scheduleBookingReminders = () => {
  cron.schedule('0 8 * * *', async () => {
    console.log('Running booking reminders...');

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
      const guestName =
        [booking.guestDetails?.firstName, booking.guestDetails?.lastName].filter(Boolean).join(' ') ||
        [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
        'Guest';
      const emailAddress = booking.guestDetails?.email || user?.email || '';
      const phoneNumber = booking.guestDetails?.phone || user?.phone || '';
      const formattedDate = fromDate.toDateString();

      try {
        await Notification.create({
          user: booking.user?._id || booking.user,
          type: 'booking',
          message: `Reminder: your stay for ${room.title} starts on ${formattedDate}.`,
          link: `/booking/${booking._id}`,
        });
      } catch (notificationError) {
        console.error('Reminder notification failed:', notificationError.message || notificationError);
      }

      try {
        await sendEmail(
          emailAddress,
          'Upcoming Reservation Reminder',
          `
            <div style="padding:20px;font-family:Arial,sans-serif;line-height:1.6">
              <h2>Upcoming Reservation Reminder</h2>
              <p>Hi ${guestName},</p>
              <p>This is a reminder that your stay at <b>${room.title}</b> starts on <b>${formattedDate}</b>.</p>
              <p>We look forward to hosting you.</p>
            </div>
          `
        );
      } catch (emailError) {
        console.error('Reminder email failed:', emailError.message || emailError);
      }

      if (phoneNumber) {
        try {
          await sendSMS(
            phoneNumber,
            `Hi ${guestName}, reminder: your stay at ${room.title} starts on ${formattedDate}.`
          );
        } catch (smsError) {
          console.error('Reminder SMS failed:', smsError.message || smsError);
        }
      }

      console.log(`Reminder processed for ${emailAddress}${phoneNumber ? ` & ${phoneNumber}` : ''}`);
    }
  });
};

module.exports = { scheduleBookingReminders };
