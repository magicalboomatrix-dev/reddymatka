const twilio = require('twilio');
const { normalizePhone } = require('./phone');

function applyTemplate(template, values) {
  return String(template || '').replace(/{{\s*(\w+)\s*}}/g, (_, key) => {
    const value = values[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  if (!accountSid || !authToken) {
    throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required in production to send OTPs.');
  }

  if (!from && !messagingServiceSid) {
    throw new Error('Set TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID in production to send OTPs.');
  }

  return {
    client: twilio(accountSid, authToken),
    from,
    messagingServiceSid,
    messageTemplate: process.env.TWILIO_OTP_TEMPLATE || 'Your REDDYMATKA  OTP is {{otp}}. Valid for {{expiryMinutes}} minutes.',
  };
}

async function sendProductionOtpSms({ phone, otp, purpose, expiryMinutes }) {
  const { client, from, messagingServiceSid, messageTemplate } = getTwilioConfig();
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone) {
    throw new Error('Valid phone number with country code required for OTP delivery.');
  }

  const message = applyTemplate(messageTemplate, { phone, otp, purpose, expiryMinutes });
  const payload = {
    to: normalizedPhone,
    body: message,
  };

  if (messagingServiceSid) {
    payload.messagingServiceSid = messagingServiceSid;
  } else {
    payload.from = from;
  }

  return client.messages.create(payload);
}

async function sendOtpSms({ phone, otp, purpose, expiryMinutes }) {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DEV] OTP for ${phone}: ${otp}`);
    return { mode: 'development' };
  }

  return sendProductionOtpSms({ phone, otp, purpose, expiryMinutes });
}

module.exports = {
  sendOtpSms,
};