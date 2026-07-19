const pool = require('../config/database');

// ─── helpers ─────────────────────────────────────────────────────────────────

async function getTicketOrFail(res, ticketId, requestingUser) {
  const [rows] = await pool.query(
    `SELECT st.*, u.name AS user_name, u.phone AS user_phone,
            m.name AS moderator_name
     FROM support_tickets st
     JOIN users u ON u.id = st.user_id
     LEFT JOIN users m ON m.id = st.moderator_id
     WHERE st.id = ?
     LIMIT 1`,
    [ticketId]
  );

  if (rows.length === 0) {
    res.status(404).json({ error: 'Ticket not found.' });
    return null;
  }

  const ticket = rows[0];
  const { role, id: userId, moderator_id: modId } = requestingUser;

  // Users can only access their own tickets
  if (role === 'user' && ticket.user_id !== userId) {
    res.status(403).json({ error: 'Access denied.' });
    return null;
  }

  // Moderators can only access tickets of users assigned to them
  if (role === 'moderator') {
    // req.user.id is the moderator's user row id; check ticket's moderator_id
    if (ticket.moderator_id !== userId) {
      res.status(403).json({ error: 'Access denied. This ticket belongs to another moderator\'s user.' });
      return null;
    }
  }

  return ticket;
}

// ─── User: create ticket ──────────────────────────────────────────────────────

exports.createTicket = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { subject, message } = req.body;

    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: 'Subject is required.' });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Initial message is required.' });
    }
    if (subject.trim().length > 255) {
      return res.status(400).json({ error: 'Subject must be 255 characters or fewer.' });
    }

    // Resolve the user's assigned moderator
    const [userRows] = await pool.query(
      'SELECT moderator_id FROM users WHERE id = ?',
      [userId]
    );
    const moderatorId = userRows[0]?.moderator_id || null;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [ticketResult] = await conn.query(
        `INSERT INTO support_tickets (user_id, moderator_id, subject, status)
         VALUES (?, ?, ?, 'open')`,
        [userId, moderatorId, subject.trim()]
      );
      const ticketId = ticketResult.insertId;

      await conn.query(
        `INSERT INTO support_messages (ticket_id, sender_id, sender_role, message)
         VALUES (?, ?, 'user', ?)`,
        [ticketId, userId, message.trim()]
      );

      await conn.commit();
      res.status(201).json({ message: 'Support ticket created.', ticketId });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (error) {
    next(error);
  }
};

// ─── User: list own tickets ───────────────────────────────────────────────────

exports.getMyTickets = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const status = req.query.status || null;

    let query = `
      SELECT st.id, st.subject, st.status, st.created_at, st.updated_at, st.closed_at,
             (SELECT COUNT(*) FROM support_messages sm WHERE sm.ticket_id = st.id) AS message_count,
             (SELECT sm2.message FROM support_messages sm2 WHERE sm2.ticket_id = st.id ORDER BY sm2.created_at DESC LIMIT 1) AS last_message,
             (SELECT sm2.created_at FROM support_messages sm2 WHERE sm2.ticket_id = st.id ORDER BY sm2.id DESC LIMIT 1) AS last_message_at
      FROM support_tickets st
      WHERE st.user_id = ?
    `;
    const params = [userId];

    if (status) {
      query += ' AND st.status = ?';
      params.push(status);
    }

    query += ' ORDER BY st.updated_at DESC';

    const [tickets] = await pool.query(query, params);
    res.json({ tickets });
  } catch (error) {
    next(error);
  }
};

// ─── Admin/Moderator: list all tickets (scoped) ───────────────────────────────

exports.listTickets = async (req, res, next) => {
  try {
    const { role, id: adminId } = req.user;
    const { status, search, page: rawPage, limit: rawLimit } = req.query;

    const page = Math.max(parseInt(rawPage, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 50, 1), 200);
    const offset = (page - 1) * limit;

    const filters = [];
    const params = [];

    if (role === 'moderator') {
      filters.push('st.moderator_id = ?');
      params.push(adminId);
    }

    if (status) {
      filters.push('st.status = ?');
      params.push(status);
    }

    if (search) {
      filters.push('(u.name LIKE ? OR u.phone LIKE ? OR st.subject LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like);
    }

    const where = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM support_tickets st
       JOIN users u ON u.id = st.user_id
       ${where}`,
      params
    );

    const [tickets] = await pool.query(
      `SELECT st.id, st.subject, st.status, st.created_at, st.updated_at, st.closed_at,
              u.id AS user_id, u.name AS user_name, u.phone AS user_phone,
              m.name AS moderator_name,
              (SELECT COUNT(*) FROM support_messages sm WHERE sm.ticket_id = st.id) AS message_count,
              (SELECT sm2.message FROM support_messages sm2 WHERE sm2.ticket_id = st.id ORDER BY sm2.created_at DESC LIMIT 1) AS last_message,
              (SELECT sm2.created_at FROM support_messages sm2 WHERE sm2.ticket_id = st.id ORDER BY sm2.id DESC LIMIT 1) AS last_message_at
       FROM support_tickets st
       JOIN users u ON u.id = st.user_id
       LEFT JOIN users m ON m.id = st.moderator_id
       ${where}
       ORDER BY st.updated_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      tickets,
      pagination: { page, limit, total: countRows[0]?.total || 0 },
    });
  } catch (error) {
    next(error);
  }
};

// ─── Get single ticket with messages ─────────────────────────────────────────

exports.getTicket = async (req, res, next) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: 'Invalid ticket id.' });

    const ticket = await getTicketOrFail(res, ticketId, req.user);
    if (!ticket) return;

    const [messages] = await pool.query(
      `SELECT sm.id, sm.sender_id, sm.sender_role, sm.message, sm.created_at,
              u.name AS sender_name
       FROM support_messages sm
       JOIN users u ON u.id = sm.sender_id
       WHERE sm.ticket_id = ?
       ORDER BY sm.created_at ASC`,
      [ticketId]
    );

    res.json({ ticket, messages });
  } catch (error) {
    next(error);
  }
};

// ─── Send message ─────────────────────────────────────────────────────────────

exports.addMessage = async (req, res, next) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: 'Invalid ticket id.' });

    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    const ticket = await getTicketOrFail(res, ticketId, req.user);
    if (!ticket) return;

    if (ticket.status === 'closed') {
      return res.status(409).json({ error: 'This ticket is closed. Reopen it to send messages.' });
    }

    const { role, id: senderId } = req.user;
    const senderRole = role === 'user' ? 'user' : role; // 'admin' | 'moderator' | 'user'

    await pool.query(
      `INSERT INTO support_messages (ticket_id, sender_id, sender_role, message)
       VALUES (?, ?, ?, ?)`,
      [ticketId, senderId, senderRole, message.trim()]
    );

    // Auto-move to in_progress when support staff replies
    if (senderRole !== 'user' && ticket.status === 'open') {
      await pool.query(
        `UPDATE support_tickets SET status = 'in_progress', updated_at = NOW() WHERE id = ?`,
        [ticketId]
      );
    } else {
      await pool.query(
        `UPDATE support_tickets SET updated_at = NOW() WHERE id = ?`,
        [ticketId]
      );
    }

    res.status(201).json({ message: 'Message sent.' });
  } catch (error) {
    next(error);
  }
};

// ─── Close / reopen ticket ────────────────────────────────────────────────────

exports.setTicketStatus = async (req, res, next) => {
  try {
    const ticketId = parseInt(req.params.id, 10);
    if (!ticketId) return res.status(400).json({ error: 'Invalid ticket id.' });

    const { status } = req.body;
    if (!['open', 'in_progress', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Status must be open, in_progress, or closed.' });
    }

    const ticket = await getTicketOrFail(res, ticketId, req.user);
    if (!ticket) return;

    const closedAt = status === 'closed' ? new Date() : null;
    await pool.query(
      `UPDATE support_tickets SET status = ?, closed_at = ?, updated_at = NOW() WHERE id = ?`,
      [status, closedAt, ticketId]
    );

    res.json({ message: `Ticket ${status === 'closed' ? 'closed' : 'reopened'} successfully.` });
  } catch (error) {
    next(error);
  }
};

// ─── Stats (admin dashboard card) ────────────────────────────────────────────

exports.getStats = async (req, res, next) => {
  try {
    const { role, id: adminId } = req.user;
    const scopeClause = role === 'moderator' ? 'WHERE moderator_id = ?' : '';
    const params = role === 'moderator' ? [adminId] : [];

    const [rows] = await pool.query(
      `SELECT
         SUM(status = 'open')        AS open_count,
         SUM(status = 'in_progress') AS in_progress_count,
         SUM(status = 'closed')      AS closed_count,
         COUNT(*)                    AS total
       FROM support_tickets
       ${scopeClause}`,
      params
    );

    res.json(rows[0]);
  } catch (error) {
    next(error);
  }
};
