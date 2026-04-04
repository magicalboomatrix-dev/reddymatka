'use strict';

const pool = require('../config/database');

/** GET /api/wallet-audit/user/:userId */
exports.getUserLedger = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    const [transactions] = await pool.query(
      `SELECT wt.id, wt.type, wt.amount, wt.balance_after, wt.status,
              wt.reference_type, wt.reference_id, wt.remark, wt.created_at,
              u.name, u.phone
       FROM wallet_transactions wt
       JOIN users u ON u.id = wt.user_id
       WHERE wt.user_id = ?
       ORDER BY wt.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    const [countRow] = await pool.query(
      'SELECT COUNT(*) AS total FROM wallet_transactions WHERE user_id = ?',
      [userId]
    );

    const [walletRow] = await pool.query(
      'SELECT balance, bonus_balance FROM wallets WHERE user_id = ?',
      [userId]
    );

    res.json({
      transactions,
      total: countRow[0].total,
      wallet: walletRow[0] || { balance: 0, bonus_balance: 0 },
    });
  } catch (error) {
    next(error);
  }
};

/** GET /api/wallet-audit/reconciliation */
exports.getReconciliationSummary = async (req, res, next) => {
  try {
    const [walletTotal] = await pool.query(
      'SELECT COALESCE(SUM(balance), 0) AS total FROM wallets'
    );

    const [txnSummary] = await pool.query(`
      SELECT
        type,
        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END)      AS credits,
        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS debits,
        COUNT(*) AS count
      FROM wallet_transactions
      GROUP BY type
      ORDER BY type
    `);

    const [pendingWithdrawals] = await pool.query(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM withdraw_requests WHERE status = 'pending'"
    );

    res.json({
      wallet_total: walletTotal[0].total,
      transaction_summary: txnSummary,
      pending_withdrawals: pendingWithdrawals[0].total,
    });
  } catch (error) {
    next(error);
  }
};
