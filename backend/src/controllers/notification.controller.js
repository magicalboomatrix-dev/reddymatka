const pool = require('../config/database');

exports.getRecentNotifications = async (req, res, next) => {
  try {
    // Get recent win notifications (for public ticker)
    const [notifications] = await pool.query(`
      SELECT n.message, n.created_at, u.name as user_name
      FROM notifications n
      LEFT JOIN users u ON n.user_id = u.id
      WHERE n.type = 'win'
      ORDER BY n.created_at DESC LIMIT 20
    `);
    res.json({ notifications });
  } catch (error) {
    next(error);
  }
};

exports.getUserNotifications = async (req, res, next) => {
  try {
    const [notifications] = await pool.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json({ notifications });
  } catch (error) {
    next(error);
  }
};

exports.markRead = async (req, res, next) => {
  try {
    await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id = ?',
      [req.user.id, req.params.id]);
    res.json({ message: 'Notification marked as read.' });
  } catch (error) {
    next(error);
  }
};
