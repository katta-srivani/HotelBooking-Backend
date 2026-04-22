const Twilio = require('twilio');
require('dotenv').config();

const hasCredentials = Boolean(
  process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
);

const client = hasCredentials
  ? new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

async function sendSMS(to, body) {
  if (!hasCredentials) {
    console.warn('SMS skipped: Twilio is not configured');
    return { skipped: true, reason: 'twilio_not_configured' };
  }

  if (!to) {
    console.warn('SMS skipped: recipient phone number is missing');
    return { skipped: true, reason: 'missing_recipient' };
  }

  try {
    const message = await client.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });

    console.log(`SMS sent to ${to}, SID: ${message.sid}`);
    return message;
  } catch (err) {
    console.error('Twilio Error:', err.message || err);
    throw err;
  }
}

sendSMS.isConfigured = hasCredentials;

module.exports = sendSMS;
