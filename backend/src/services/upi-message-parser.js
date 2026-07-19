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
 *   - UPI Notification: "Payment of ₹500 received", "Received ₹500 via UPI"
 *   - BHIM: "₹500 received from SENDER UPI Ref No: 412345678901"
 */

/**
 * Normalize Unicode digit representations to plain ASCII digits.
 *
 * PhonePe (and some other UPI apps) render notification amounts using non-ASCII
 * Unicode characters as a privacy measure — e.g. combining diacritical marks
 * ("3̈5̈0̈.4̈7̈"), fullwidth digits (３５０.４７), mathematical bold/sans-serif
 * digits (𝟑𝟓𝟎.𝟒𝟕), subscript digits, etc.  JavaScript's \d only matches
 * ASCII [0-9], so those characters break all amount regexes.
 *
 * This function converts every known "digit-like" Unicode form back to the
 * plain ASCII digit it represents.
 */
function normalizeUnicodeDigits(str) {
  // ---- STEP 0: remove emoji keycap digits (1️⃣ 2️⃣ etc) ----
  // Converts "1️⃣0️⃣0️⃣0️⃣.9️⃣2️⃣" -> "1000.92"
  // Handle multiple keycap emoji encodings:
  // - digit + variation selector (U+FE0F) + combining keycap (U+20E3)
  // - digit + combining keycap without variation selector
  // - digit surrounded by other combining marks
  str = str
    .replace(/([0-9])\uFE0F\u20E3/g, '$1') // digit + variation selector + keycap
    .replace(/([0-9])\u20E3/g, '$1')       // digit + keycap (no variation selector)
    .replace(/\uFE0F/g, '')                 // remove any remaining variation selectors

  // Step 1 – NFD decomposition then strip combining marks
  str = str
    .normalize('NFD')
    .replace(/[\u0300-\u036F\u20D0-\u20FF\uFE20-\uFE2F]/g, '');

  // Step 2 – Fullwidth digits ０-９
  str = str.replace(/[\uFF10-\uFF19]/g,
    c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30)
  );

  // Step 3 – Subscript digits ₀-₉
  str = str.replace(/[\u2080-\u2089]/g,
    c => String.fromCharCode(c.charCodeAt(0) - 0x2080 + 0x30)
  );

  // Step 4 – Superscript digits
  const SUPER = {
    '\u2070':'0','\u00B9':'1','\u00B2':'2','\u00B3':'3',
    '\u2074':'4','\u2075':'5','\u2076':'6',
    '\u2077':'7','\u2078':'8','\u2079':'9'
  };

  str = str.replace(/[\u2070\u00B9\u00B2\u00B3\u2074-\u2079]/g,
    c => SUPER[c] || c
  );

  // Step 5 – Mathematical digits
  str = [...str].map(char => {
    const cp = char.codePointAt(0);

    if (cp >= 0x1D7CE && cp <= 0x1D7D7) return String(cp - 0x1D7CE);
    if (cp >= 0x1D7D8 && cp <= 0x1D7E1) return String(cp - 0x1D7D8);
    if (cp >= 0x1D7E2 && cp <= 0x1D7EB) return String(cp - 0x1D7E2);
    if (cp >= 0x1D7EC && cp <= 0x1D7F5) return String(cp - 0x1D7EC);
    if (cp >= 0x1D7F6 && cp <= 0x1D7FF) return String(cp - 0x1D7F6);

    return char;
  }).join('');

  return str;
}

const AMOUNT_PATTERNS = [
  // "Amount: Rs.500" / "Amount: 500" / "Amount = ₹500"
  /Amount\s*[:=]\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "credited by Rs 10.63" / "credited by INR 10.63" (IndusInd bank)
  /credited\s+by\s+(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "INR 500 credited" / "Rs.500 credited" / "Rs 500 received"
  /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:credited|received|deposited)/i,
  // "received Rs.500" / "received ₹500"
  /received\s*(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "You received ₹500.00" (GPay)
  /you\s+received\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  // Slice: "You've got ₹1,500.31 from Mrs PRVESH in your slice bank a/c..."
  /you(?:'|’)?ve\s+got\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)\s+from/i,
  // "Received Rs.500 from" (PhonePe)
  /Received\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)\s*from/i,
  // "Received 90.00 Rupees From" (some wallet/UPI apps where currency word follows amount)
  /Received\s+([\d,]+(?:\.\d{1,2})?)\s+Rupees?\s+From/i,
  // "Received ₹500 via UPI" (notification style)
  /Received\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:via|through)\s/i,
  // "Rs 500 received in" (Paytm)
  /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s*received\s+in/i,
  // CRED: "received Rs.10.0 and your updated wallet balance"
  /received\s+(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)\s+and\s+your/i,
  // "Payment of ₹500 received" / "Payment of Rs 500 received" (UPI notification)
  /Payment\s+of\s+(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:received|credited|successful)/i,
  // ICICI/HDFC: "transfer of INR 500.00"
  /transfer\s+of\s+(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "deposited INR 500" / "deposited Rs 500"
  /deposited\s+(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "credit of Rs 500" / "credit of INR 500"
  /credit\s+of\s+(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  // SBI: "Credited with Rs 500"
  /credited\s+with\s+(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  // Axis: "sent you Rs 500"
  /sent\s+you\s+(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  // "Acct credited INR 500" / "A/c credited"
  /(?:Acct|A\/c|account)\s+credited\s+(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  // Kotak/generic: "money received: Rs 500"
  /money\s+received\s*[:=]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
  // IndusInd: "A/C **8321 Credited; INR 10.18 Ref-UPI/..."
  /Credited[;,]?\s+(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
  // Generic: "INR 10.18 Ref" — amount immediately before Ref/UTR marker
  /(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)\s+Ref[-\s]/i,
  // Standalone ₹ amount as last resort (e.g., "₹100.37 received")
  /₹\s*([\d,]+(?:\.\d{1,2})?)/,
];
const REFERENCE_PATTERNS = [
  /RRN\s*[:=]?\s*([A-Z0-9]{6,40})/i,
  /Ref(?:erence)?\s*(?:No\.?|Number|#|ID)?\s*[:=]?\s*([A-Z0-9]{6,40})/i,
  /UTR\s*(?:No\.?)?\s*[:=]?\s*([A-Z0-9]{6,40})/i,
  /UPI\s+(?:Ref|Reference|transaction)\s*(?:No\.?|ID|#)?\s*[:=]?\s*([A-Z0-9]{6,40})/i,
  /(?:Txn|Transaction)\s*(?:No\.?|ID|Ref|#)?\s*[:=]?\s*([A-Z0-9]{6,40})/i,
  /UPI\/([A-Z0-9]{6,40})/i,

  /\bT\d{12,30}\b/i,     // PhonePe style
  /\b\d{12,30}\b/        // fallback numeric UTR
];

const PAYER_PATTERNS = [
  // "from pandeyhritik897w@okaxis" (IndusInd — UPI VPA as payer)
  /from\s+(\S+@\S+?)(?:\.\s|[.\s]$|\s)/i,
  // "From: Name" / "from SENDER via"
  /From\s*[:=]\s*(.+?)(?:\n|$|\.)/i,
  // Slice: "from Mrs PRVESH in your slice bank a/c..."
  /from\s+(.+?)\s+in\s+your\s+slice/i,
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

// Messages containing these keywords are OUTGOING / debit transactions — reject immediately.
// NOTE: Do NOT add bare "sent" here — it matches legitimate credit messages like
// "Rs 500 sent by Rahul to your account". Use context-specific patterns instead.
const DEBIT_KEYWORDS = /\b(debited|paid|withdrawn|deducted|request|requested|pay\s+₹|pay\s+Rs|you\s+paid|you\s+sent|you\s+transferred)\b/i;

// At least one of these must appear for the message to be treated as an incoming credit.
const CREDIT_KEYWORDS = /\b(credited|received|credit|deposited|deposit|payment\s+of|money\s+received|you(?:'|’)?ve\s+got)\b/i;

function parseUpiMessage(rawMessage) {
  if (!rawMessage || typeof rawMessage !== 'string') {
    return { success: false, error: 'Empty or invalid message' };
  }

  // Clean BharatPe noise: remove %nbt%, %NBT%, stray "BharatPe" header lines,
  // and duplicate lines (BharatPe often repeats the same line twice).
  let message = rawMessage.trim()
    .replace(/%nbt%/gi, '')
    .replace(/^BharatPe\s*/im, '')
    .trim();

  // Normalize Unicode digits → ASCII.
  // PhonePe (and some other apps) put combining diacritical marks on digits or use
  // mathematical/fullwidth/subscript Unicode digit codepoints for privacy, which
  // breaks every \d regex pattern in this parser.
  message = normalizeUnicodeDigits(message);

  // Deduplicate repeated lines (BharatPe / PhonePe forwarder apps often repeat
  // the same line twice — once from the title, once from the body).
  const lines = message.split('\n').map(l => l.trim()).filter(Boolean);
  const seen = new Set();
  const deduped = [];
  for (const line of lines) {
    if (!seen.has(line)) {
      seen.add(line);
      deduped.push(line);
    }
  }
  message = deduped.join(' ');

  // --- Safety filters: reject outgoing / non-credit messages ---
  if (DEBIT_KEYWORDS.test(message)) {
    return { success: false, error: 'Message appears to be a debit/outgoing transaction', rawMessage: message };
  }

  if (!CREDIT_KEYWORDS.test(message)) {
    return { success: false, error: 'Message does not contain a credit keyword', rawMessage: message };
  }

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

  // Reference number is optional — BharatPe and some wallet apps don't include UTR.
  // The caller must generate a synthetic reference when this is null.

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
