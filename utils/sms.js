const Twilio = require('twilio');
require('dotenv').config();

const client = new Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
  throw new Error("Twilio credentials are missing in .env");
}

async function sendSMS(to, body) {
  try {
    const message = await client.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
    console.log(`✅ SMS sent to ${to}, SID: ${message.sid}`);
    return message;
  } catch (err) {
    console.error("❌ Twilio Error:", err);
    throw err;
  }
}


module.exports = sendSMS;