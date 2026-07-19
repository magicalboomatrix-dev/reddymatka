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
 * GET /deposits/all  (admin only)
 * Lists all completed deposits with user info.
 */
exports.getAllDeposits = async (req, res, next) => {
  try {
    const { search, from_date, to_date, moderator_id, status } = req.query;
    const { page, limit, offset } = clampPagination(req.query);
    const isModerator = req.user.role === 'moderator';

    const whereConditions = [];
    const queryParams = [];

    if (isModerator) {
      whereConditions.push('u.moderator_id = ?');
      queryParams.push(req.user.id);
    } else if (moderator_id) {
      whereConditions.push('u.moderator_id = ?');
      queryParams.push(moderator_id);
    }

    if (status) {
      whereConditions.push('d.status = ?');
      queryParams.push(status);
    }

    if (from_date) {
      whereConditions.push('DATE(d.created_at) >= ?');
      queryParams.push(from_date);
    }

    if (to_date) {
      whereConditions.push('DATE(d.created_at) <= ?');
      queryParams.push(to_date);
    }

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      whereConditions.push(`(
        u.name LIKE ? OR
        u.phone LIKE ? OR
        d.utr_number LIKE ? OR
        d.payer_name LIKE ? OR
        CAST(d.id AS CHAR) LIKE ? OR
        COALESCE(CAST(d.order_id AS CHAR), '') LIKE ? OR
        COALESCE(CAST(d.webhook_txn_id AS CHAR), '') LIKE ?
      )`);
      queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM deposits d JOIN users u ON d.user_id = u.id ${whereClause}`,
      queryParams
    );

    const [deposits] = await pool.query(
      `SELECT d.id, d.user_id, d.amount, d.utr_number, d.payer_name,
              d.webhook_txn_id, d.order_id, d.status,
              d.created_at,
              u.name AS user_name, u.phone AS user_phone,
              u.moderator_id,
              moderator_user.name AS moderator_name
       FROM deposits d
       JOIN users u ON d.user_id = u.id
       LEFT JOIN users moderator_user ON moderator_user.id = u.moderator_id
       ${whereClause}
       ORDER BY d.created_at DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
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
