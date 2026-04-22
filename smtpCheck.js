require('dotenv').config();

const sendEmail = require('./utils/email');

const maskEmail = (value = '') => {
  const email = String(value).trim();
  if (!email || !email.includes('@')) {
    return email || null;
  }

  const [localPart, domainPart] = email.split('@');
  const maskedLocal = localPart.length <= 3 ? `${localPart[0] || ''}***` : `${localPart.slice(0, 3)}***`;
  return `${maskedLocal}@${domainPart}`;
};

const run = async () => {
  const diagnostics = sendEmail.smtpDiagnostics || {};
  const recipient = process.argv[2] || process.env.SMTP_TEST_TO || process.env.SMTP_USER;

  console.log('SMTP diagnostics:', {
    host: diagnostics.host,
    port: diagnostics.port,
    secure: diagnostics.secure,
    service: diagnostics.service,
    user: diagnostics.user || maskEmail(process.env.SMTP_USER || process.env.EMAIL_USER || ''),
    fromEmail: diagnostics.fromEmail || maskEmail(process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || ''),
    hasPassword: diagnostics.hasPassword,
    recipient: maskEmail(recipient),
  });

  if (!recipient) {
    console.log('No recipient provided. Set SMTP_TEST_TO or pass an email as the first argument to send a test email.');
    return;
  }

  try {
    const info = await sendEmail(
      recipient,
      'SMTP Sanity Check',
      '<div style="font-family:sans-serif;padding:20px"><h2>SMTP Sanity Check</h2><p>If you received this, the email backend is working.</p></div>'
    );

    console.log('Test email sent successfully:', {
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
    });
  } catch (error) {
    console.error('SMTP test failed:', error.message || error);
    process.exitCode = 1;
  }
};

run();
