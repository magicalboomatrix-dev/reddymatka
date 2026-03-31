const QRCode = require('qrcode');

/**
 * Generate a UPI payment link.
 */
function buildUpiLink({ upiId, payeeName, amount, orderRef }) {
  const txnNote = `Deposit ${orderRef}`;
  return `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(txnNote)}`;
}

/**
 * Generate a base64 PNG QR code from a UPI link.
 * Returns a data URI string: "data:image/png;base64,..."
 */
async function generateQrDataUri(upiLink) {
  return QRCode.toDataURL(upiLink, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 300,
  });
}

module.exports = { buildUpiLink, generateQrDataUri };
