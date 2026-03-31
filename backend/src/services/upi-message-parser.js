/**
 * UPI Message Parser
 * Parses forwarded bank SMS / UPI app notifications from Telegram.
 *
 * Supported formats:
 *   - Bank SMS: "Rs.500 credited to A/c XX1234 by UPI Ref 412345678901"
 *   - CRED: "You have received Rs.500.0 and your updated wallet balance..."
 *   - PhonePe: "Received Rs.500 from SENDER via UPI. UPI Ref: 412345678901"
 *   - GPay: "You received ₹500.00 from SENDER. UPI transaction ID: 412345678901"
 *   - Generic: "Amount: 500\nRef: 412345678901\nFrom: Sender"
 *   - Paytm: "Rs 500 received in Paytm wallet/bank from SENDER. Txn ID: 412345678901"
 */

const AMOUNT_PATTERNS = [
  // "Amount: Rs.500" / "Amount: 500" / "Amount = ₹500"
  /Amount\s*[:=]\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "credited by Rs 10.63" (IndusInd bank)
  /credited\s+by\s+(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "Rs.500 credited" / "Rs 500 received" / "INR 500 credited"
  /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:credited|received|deposited)/i,
  // "received Rs.500" / "received ₹500"
  /received\s*(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "You received ₹500.00" (GPay)
  /you\s+received\s*(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "Received Rs.500 from" (PhonePe)
  /Received\s*(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s*from/i,
  // "Rs 500 received in" (Paytm)
  /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s*received\s+in/i,
  // CRED: "received Rs.10.0 and your updated wallet balance"
  /received\s+(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)\s+and\s+your/i,
];

const REFERENCE_PATTERNS = [
  // "RRN:645664106610" (IndusInd bank)
  /RRN\s*[:=]?\s*(\d{6,30})/i,
  // "Ref No: 412345678901" / "Ref: 412345678901" / "Reference Number: ..."
  /Ref(?:erence)?\s*(?:No\.?|Number|#|ID)?\s*[:=]?\s*(\d{6,30})/i,
  // "UTR: 412345678901" / "UTR No 412345678901"
  /UTR\s*(?:No\.?)?\s*[:=]?\s*(\d{6,30})/i,
  // "UPI Ref 412345678901" / "UPI Ref: 412345678901" / "UPI Ref No. 412345678901"
  /UPI\s+(?:Ref|Reference|transaction)\s*(?:No\.?|ID|#)?\s*[:=]?\s*(\d{6,30})/i,
  // "Txn No: 412345678901" / "Txn ID: 412345678901" / "Transaction ID 412345678901"
  /(?:Txn|Transaction)\s*(?:No\.?|ID|Ref|#)?\s*[:=]?\s*(\d{6,30})/i,
  // "UPI/412345678901" (some bank SMS)
  /UPI\/(\d{6,30})/i,
  // Fallback: any 12-30 digit sequence (likely a UTR)
  /(\d{12,30})/,
];

const PAYER_PATTERNS = [
  // "from pandeyhritik897w@okaxis" (IndusInd — UPI VPA as payer)
  /from\s+(\S+@\S+?)(?:\.\s|[.\s]$|\s)/i,
  // "From: Name" / "from SENDER via"
  /From\s*[:=]\s*(.+?)(?:\n|$|\.)/i,
  /from\s+(.+?)\s+(?:via|through|by)\s/i,
  // "Sender: Name"
  /Sender\s*[:=]\s*(.+?)(?:\n|$)/i,
  // "Paid by: Name" / "Paid by Name"
  /Paid\s+by\s*[:=]?\s*(.+?)(?:\n|$|\.)/i,
  // "by Name to your" — some bank formats
  /by\s+(.+?)\s+to\s+your/i,
];

const TIME_PATTERNS = [
  /Time\s*[:=]\s*(.+?)(?:\n|$)/i,
  /at\s+(\d{1,2}[:.]\d{2}\s*(?:AM|PM)?)/i,
  /on\s+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\s*\d{1,2}[:.]\d{2}\s*(?:AM|PM)?)/i,
  /(\d{1,2}[:.]\d{2}\s*(?:AM|PM))/i,
];

// Order reference pattern: "RM" followed by exactly 6 alphanumeric chars
// Matches in context like "Pay RM7X3K9P", "Deposit RM7X3K9P", or standalone "RM7X3K9P"
const ORDER_REF_PATTERN = /\bRM([A-Z0-9]{6})\b/i;

function parseUpiMessage(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'string') {
    return { success: false, error: 'Empty or invalid message' };
  }

  const message = rawMessage.trim();

  // Parse amount (try each pattern in priority order)
  let amount = null;
  for (const pattern of AMOUNT_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      amount = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(amount) && amount > 0) break;
      amount = null;
    }
  }

  if (!amount) {
    return { success: false, error: 'Could not parse amount', rawMessage: message };
  }

  // Parse reference number
  let referenceNumber = null;
  for (const pattern of REFERENCE_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      const candidate = match[1].trim();
      // Avoid matching phone numbers (10 digits starting with 6-9) or wallet balances
      if (candidate.length === 10 && /^[6-9]/.test(candidate)) continue;
      referenceNumber = candidate;
      break;
    }
  }

  if (!referenceNumber) {
    return { success: false, error: 'Could not parse reference number. Please forward the bank SMS that contains UTR/Ref number.', rawMessage: message };
  }

  // Parse payer name (optional)
  let payerName = null;
  for (const pattern of PAYER_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      payerName = match[1].trim();
      break;
    }
  }

  // Parse time (optional - don't fail if missing)
  let txnTime = null;
  for (const pattern of TIME_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      txnTime = match[1].trim();
      break;
    }
  }

  // Extract order reference (e.g., "RM7X3K9P") from transaction note if present
  let orderRef = null;
  const refMatch = message.match(ORDER_REF_PATTERN);
  if (refMatch) {
    orderRef = 'RM' + refMatch[1].toUpperCase();
  }

  return {
    success: true,
    data: {
      amount,
      referenceNumber,
      payerName: payerName || 'Unknown',
      txnTime: txnTime || null,
      orderRef,
    },
  };
}

module.exports = { parseUpiMessage };
