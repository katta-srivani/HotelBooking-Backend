const Twilio = require('twilio');
require('dotenv').config();

const client = new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function sendSMS(to, body) {
  try {
    const message = await client.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
    console.log(`✅ SMS sent to ${to}`);
    return message;
  } catch (err) {
    console.error(`❌ Failed to send SMS: ${err.message}`);
    throw err;
  }
}

module.exports = sendSMS;