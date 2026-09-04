'use strict';

const pool = require('../config/database');
const logger = require('./logger');

/**
 * Record a user activity into user_activity_logs.
 * Asynchronous, does not block caller or throw unhandled exceptions.
 *
 * @param {Object} options
 * @param {number} options.userId
 * @param {string} options.action - e.g. 'register', 'login_mpin', 'request_withdraw', 'verify_withdraw_otp', 'deposit', 'place_bet'
 * @param {string|null} [options.entityType] - e.g. 'user', 'withdraw_request', 'wallet', 'bet', 'bank_account'
 * @param {string|number|null} [options.entityId]
 * @param {Object|null} [options.details] - JSON serializable object
 * @param {Object|null} [options.req] - Express request object for IP and user-agent
 */
async function recordUserActivity({ userId, action, entityType = null, entityId = null, details = null, req = null }) {
  if (!userId || !action) return;

  try {
    const ip = req
      ? (req.headers?.['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null)
      : null;

    const userAgent = req?.headers?.['user-agent']?.slice(0, 255) || null;

    await pool.query(
      `INSERT INTO user_activity_logs (user_id, action, entity_type, entity_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        action,
        entityType,
        entityId ? String(entityId) : null,
        details ? JSON.stringify(details) : null,
        ip,
        userAgent,
      ]
    );
  } catch (err) {
    logger.error('user-activity', 'Failed to record user activity log', err);
  }
}

module.exports = { recordUserActivity };
