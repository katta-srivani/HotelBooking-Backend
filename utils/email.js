const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

transporter.verify((error, success) => {
  if (error) {
    console.error("❌ SMTP configuration error:", error);
  } else {
    console.log("✅ SMTP server ready to send emails");
  }
});

async function sendEmail(to, subject, htmlContent) {
  try {
    const info = await transporter.sendMail({
      from: `"Hotel Booking App" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html: htmlContent,
    });

    console.log(`✅ Email sent to ${to}: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error(`❌ Failed to send email:`, err);
    throw err;
  }
}

module.exports = sendEmail;