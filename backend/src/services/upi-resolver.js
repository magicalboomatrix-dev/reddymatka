const pool = require('../config/database');

/**
 * Resolve the UPI ID and payee name for a deposit order.
 *
 * Resolution order:
 *   1. User's assigned moderator (if scanner_enabled=1 AND upi_id set)
 *   2. Any active admin with a upi_id set
 *
 * Throws if no UPI ID can be resolved — deposit creation must fail gracefully.
 */
async function resolveUpiForUser(userId, conn) {
  const queryTarget = conn || pool;

  // 1. Check if user has a moderator with an active scanner
  const [modRows] = await queryTarget.query(
    `SELECT m.upi_id, m.scanner_label, m.name
     FROM users u
     JOIN users m ON m.id = u.moderator_id
     WHERE u.id = ?
       AND m.role = 'moderator'
       AND m.scanner_enabled = 1
       AND m.upi_id IS NOT NULL
       AND m.upi_id != ''
       AND m.is_blocked = 0
       AND COALESCE(m.is_deleted, 0) = 0
     LIMIT 1`,
    [userId]
  );

  if (modRows.length > 0) {
    return {
      upiId: modRows[0].upi_id,
      payeeName: modRows[0].scanner_label || modRows[0].name || 'Pay',
    };
  }

  // 2. Fallback to admin UPI
  const [adminRows] = await queryTarget.query(
    `SELECT upi_id, name
     FROM users
     WHERE role = 'admin'
       AND upi_id IS NOT NULL
       AND upi_id != ''
       AND is_blocked = 0
     LIMIT 1`
  );

  if (adminRows.length > 0) {
    return {
      upiId: adminRows[0].upi_id,
      payeeName: adminRows[0].name || 'Pay',
    };
  }

  return null;
}

module.exports = { resolveUpiForUser };
