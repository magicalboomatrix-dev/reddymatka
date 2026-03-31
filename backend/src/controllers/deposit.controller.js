/**
 * Deposit Controller (refactored)
 *
 * All manual deposit verification has been removed.
 * Deposits are now created exclusively by the auto-deposit matching engine
 * (Telegram webhook -> UPI parser -> matcher -> wallet credit).
 *
 * This controller only exposes read-only endpoints for deposit history.
 */

const pool = require('../config/database');
const { clampPagination } = require('../utils/pagination');

/**
 * GET /deposits/history
 * Returns authenticated user's confirmed deposit history.
 */
exports.getDepositHistory = async (req, res, next) => {
  try {
    const { page, limit, offset } = clampPagination(req.query);

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM deposits WHERE user_id = ?',
      [req.user.id]
    );

    const [deposits] = await pool.query(
      `SELECT id, amount, utr_number, payer_name, status, created_at
       FROM deposits
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, limit, offset]
    );

    res.json({
      deposits,
      pagination: {
        page,
        limit,
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /deposits/all  (admin only)
 * Lists all completed deposits with user info.
 */
exports.getAllDeposits = async (req, res, next) => {
  try {
    const { page, limit, offset } = clampPagination(req.query);

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM deposits'
    );

    const [deposits] = await pool.query(
      `SELECT d.id, d.user_id, d.amount, d.utr_number, d.payer_name,
              d.webhook_txn_id, d.order_id, d.status,
              d.created_at,
              u.name AS user_name, u.phone AS user_phone
       FROM deposits d
       JOIN users u ON d.user_id = u.id
       ORDER BY d.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    res.json({
      deposits,
      pagination: {
        page,
        limit,
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};
