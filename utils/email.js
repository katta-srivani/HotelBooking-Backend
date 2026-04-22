const nodemailer = require('nodemailer');
require('dotenv').config();

const smtpHost = String(process.env.SMTP_HOST || 'smtp.gmail.com').trim();
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure =
  String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || smtpPort === 465;
const smtpUser = String(process.env.SMTP_USER || process.env.EMAIL_USER || '').trim();
const smtpPass = String(process.env.SMTP_PASS || process.env.EMAIL_PASS || '').trim();
const fromName = String(process.env.SMTP_FROM_NAME || 'Hotel Booking App').trim();
const fromEmail = String(process.env.SMTP_FROM_EMAIL || smtpUser).trim();

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
  pool: true,
  tls: {
    rejectUnauthorized: false,
  },
});

transporter.verify((error) => {
  if (error) {
    console.error('SMTP configuration error:', error.message || error);
  } else {
    console.log('SMTP server ready to send emails');
  }
});

const htmlToText = (html = '') =>
  String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/p>|<\/div>|<\/li>|<br\s*\/?>/gi, '\n')
    .replace(/<li>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\n\s+\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

async function sendEmail(to, subject, htmlContent) {
  if (!smtpUser || !smtpPass) {
    throw new Error('SMTP credentials are missing in environment variables');
  }

  const normalizedRecipients = Array.isArray(to)
    ? to.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
    : [String(to || '').trim().toLowerCase()].filter(Boolean);

  if (!normalizedRecipients.length) {
    throw new Error('Recipient email is missing');
  }

  try {
    const info = await transporter.sendMail({
      from: {
        name: fromName,
        address: fromEmail,
      },
      to: normalizedRecipients,
      subject,
      replyTo: fromEmail,
      html: htmlContent,
      text: htmlToText(htmlContent),
    });

    const accepted = Array.isArray(info.accepted)
      ? info.accepted.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const rejected = Array.isArray(info.rejected)
      ? info.rejected.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean)
      : [];

    if (!accepted.length) {
      const error = new Error(
        `SMTP did not accept the email for ${normalizedRecipients.join(', ')}${
          rejected.length ? `; rejected: ${rejected.join(', ')}` : ''
        }`
      );
      error.code = 'EMAIL_NOT_ACCEPTED';
      error.rejected = rejected;
      throw error;
    }

    console.log(`Email sent to ${normalizedRecipients.join(', ')}: ${info.messageId}`);
    console.log(`Accepted: ${JSON.stringify(info.accepted || [])}, Rejected: ${JSON.stringify(info.rejected || [])}`);
    return info;
  } catch (err) {
    console.error('Failed to send email:', err.message || err);
    throw err;
  }
}

module.exports = sendEmail;
