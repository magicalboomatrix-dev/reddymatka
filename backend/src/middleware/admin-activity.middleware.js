'use strict';

const pool = require('../config/database');
const logger = require('../utils/logger');

/**
 * Records admin / moderator actions to admin_activity_logs.
 * Runs after the response is sent — never delays the API.
 *
 * Usage:
 *   router.put('/users/:id/block', authenticate, authorize('admin'),
 *              adminActivity('block_user', 'user'), adminController.blockUser);
 *
 * @param {string} action       Short action name, e.g. 'approve_withdrawal'
 * @param {string|null} entityType  Table / resource name, e.g. 'withdraw_request'
 */
function adminActivity(action, entityType = null) {
  return (req, res, next) => {
    const originalJson = res.json.bind(res);

    res.json = (data) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entityId =
          req.params.id ||
          req.params.userId ||
          req.params.requestId ||
          null;
        const ip =
          req.ip ||
          (req.headers['x-forwarded-for']?.split(',')[0]?.trim()) ||
          null;

        pool.query(
          `INSERT INTO admin_activity_logs
             (admin_id, admin_role, action, entity_type, entity_id, details, ip_address)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            req.user?.id || null,
            req.user?.role || 'unknown',
            action,
            entityType,
            entityId ? String(entityId) : null,
            req.body ? JSON.stringify(req.body) : null,
            ip,
          ]
        ).catch((err) =>
          logger.error('admin-activity', 'Failed to write activity log', err)
        );
      }

      return originalJson(data);
    };

    next();
  };
}

module.exports = { adminActivity };
