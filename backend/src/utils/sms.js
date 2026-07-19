const twilio = require('twilio');
const { normalizePhone } = require('./phone');

async function sendTwilioOtp({ phone, otp }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    throw new Error('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER are required in production to send OTPs.');
  }

  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    throw new Error('A valid phone number is required to send OTP.');
  }

  const client = twilio(accountSid, authToken);
  const message = await client.messages.create({
    body: `Your reddymatka  OTP is: ${otp}. Valid for 5 minutes. Do not share with anyone.`,
    from: fromNumber,
    to: normalizedPhone,
  });

  return { sid: message.sid };
}

async function sendOtpSms({ phone, otp, purpose, expiryMinutes }) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DEV] OTP for ${phone}: ${otp}`);
    return { mode: 'development' };
  }

  return sendTwilioOtp({ phone, otp });
}

module.exports = {
  sendOtpSms,
};