async function ensureWalletRow(conn, userId) {
  await conn.query(
    'INSERT IGNORE INTO wallets (user_id, balance, bonus_balance) VALUES (?, 0.00, 0.00)',
    [userId]
  );

  const [wallets] = await conn.query(
    'SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE',
    [userId]
  );

  if (wallets.length === 0) {
    throw Object.assign(new Error('Wallet not found.'), { statusCode: 404 });
  }

  return wallets[0];
}

async function recordWalletTransaction(conn, {
  userId,
  type,
  amount,
  referenceType,
  referenceId,
  status = 'completed',
  remark = null,
}) {
  // Idempotency guard: if this reference was already recorded, return current balance.
  // The UNIQUE(reference_type, reference_id) constraint prevents double-credits on retry.
  if (referenceType && referenceId) {
    const [existing] = await conn.query(
      'SELECT id, balance_after FROM wallet_transactions WHERE reference_type = ? AND reference_id = ? LIMIT 1',
      [referenceType, referenceId]
    );
    if (existing.length > 0) {
      return parseFloat(existing[0].balance_after);
    }
  }

  const wallet = await ensureWalletRow(conn, userId);
  const currentBalance = parseFloat(wallet.balance || 0);
  const parsedAmount = parseFloat(amount || 0);
  const nextBalance = Math.round((currentBalance + parsedAmount) * 100) / 100;

  if (nextBalance < 0) {
    throw Object.assign(new Error('Insufficient wallet balance.'), { statusCode: 400 });
  }

  await conn.query('UPDATE wallets SET balance = ? WHERE user_id = ?', [nextBalance, userId]);
  await conn.query(
    `INSERT INTO wallet_transactions
      (user_id, type, amount, balance_after, status, reference_type, reference_id, remark)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, type, parsedAmount, nextBalance, status, referenceType || null, referenceId || null, remark]
  );

  return nextBalance;
}

module.exports = {
  ensureWalletRow,
  recordWalletTransaction,
};