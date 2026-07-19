const QRCode = require('qrcode');
const crypto = require('crypto');

function getQrTokenSecret() {
  return process.env.QR_LINK_SECRET || process.env.JWT_SECRET || 'reddymatka-qr-link-secret';
}

function fromBase64Url(value) {
  const normalized = `${value}`.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
}

function signQrPayload(encodedPayload) {
  return crypto
    .createHmac('sha256', getQrTokenSecret())
    .update(encodedPayload)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function verifyQrLaunchToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return null;
  }

  const [encodedPayload, signature] = token.split('.', 2);
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signQrPayload(encodedPayload);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (providedBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  try {
    return JSON.parse(fromBase64Url(encodedPayload));
  } catch {
    return null;
  }
}

/**
 * Generate a UPI payment link.
 */
function buildUpiLink({ upiId, payeeName, amount, orderRef }) {
  const txnNote = `Deposit ${orderRef}`;
  return `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(txnNote)}`;
}

/**
 * Generate a base64 PNG QR code from any QR value.
 * Returns a data URI string: "data:image/png;base64,..."
 */
async function generateQrDataUri(qrValue) {
  return QRCode.toDataURL(qrValue, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 300,
  });
}

module.exports = { buildUpiLink, verifyQrLaunchToken, generateQrDataUri };
