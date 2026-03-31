const pool = require('../config/database');
const bcrypt = require('bcryptjs');

function generateReferralCode() {
  return 'MOD' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function normalizeScannerEnabled(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === true || value === 'true' || value === '1' || value === 1) {
    return 1;
  }

  return 0;
}

function validateUpiId(upiId) {
  const value = String(upiId || '').trim();

  if (!value) {
    return { isValid: true, message: '' };
  }

  if (!value.includes('@')) {
    return { isValid: false, message: 'UPI ID must include @handle.' };
  }

  const [username = '', handle = '', ...extra] = value.split('@');

  if (!username || !handle || extra.length > 0) {
    return { isValid: false, message: 'UPI ID must be in the format name@provider.' };
  }

  if (!/^[a-zA-Z0-9._-]{2,}$/.test(username)) {
    return { isValid: false, message: 'UPI user part contains invalid characters.' };
  }

  if (!/^[a-zA-Z0-9.-]{2,}$/.test(handle)) {
    return { isValid: false, message: 'UPI handle contains invalid characters.' };
  }

  return { isValid: true, message: '' };
}

function validateScannerLabel(scannerLabel) {
  const value = String(scannerLabel || '').trim();

  if (!value) {
    return { isValid: true, message: '' };
  }

  if (value.length < 3) {
    return { isValid: false, message: 'Scanner label must be at least 3 characters long.' };
  }

  if (value.length > 100) {
    return { isValid: false, message: 'Scanner label must be 100 characters or less.' };
  }

  if (!/^[a-zA-Z0-9 ._()\-&/]+$/.test(value)) {
    return { isValid: false, message: 'Scanner label contains invalid characters.' };
  }

  return { isValid: true, message: '' };
}

function normalizeAuditValue(fieldName, value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (fieldName === 'scanner_enabled') {
    return Number(value) === 1 ? 'enabled' : 'disabled';
  }

  return String(value).trim();
}

function buildScannerAuditEntries({ moderatorId, actor, previousScanner, nextScanner }) {
  const fields = ['scanner_label', 'upi_id', 'scanner_enabled'];

  return fields.reduce((entries, fieldName) => {
    const previousValue = normalizeAuditValue(fieldName, previousScanner[fieldName]);
    const nextValue = normalizeAuditValue(fieldName, nextScanner[fieldName]);

    if (previousValue === nextValue) {
      return entries;
    }

    entries.push([
      moderatorId,
      actor?.id || null,
      actor?.role || null,
      fieldName,
      previousValue,
      nextValue,
    ]);

    return entries;
  }, []);
}

async function insertScannerAuditEntries(entries) {
  if (!entries.length) {
    return;
  }

  await pool.query(
    'INSERT INTO moderator_scanner_audit_logs (moderator_id, actor_id, actor_role, field_name, old_value, new_value) VALUES ?',
    [entries]
  );
}

exports.createModerator = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { name, phone, password } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Name, phone, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    await conn.beginTransaction();

    const hashedPassword = await bcrypt.hash(password, 10);
    const referralCode = generateReferralCode();

    const [result] = await conn.query(
      'INSERT INTO users (name, phone, password, role, referral_code) VALUES (?, ?, ?, ?, ?)',
      [name, phone, hashedPassword, 'moderator', referralCode]
    );

    await conn.query('INSERT INTO wallets (user_id, balance, bonus_balance) VALUES (?, 0.00, 0.00)', [result.insertId]);

    await conn.commit();

    res.status(201).json({
      message: 'Moderator created.',
      moderator: { id: result.insertId, name, phone, referral_code: referralCode }
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

exports.listModerators = async (req, res, next) => {
  try {
    const [moderators] = await pool.query(`
          SELECT u.id, u.name, u.phone, u.referral_code, u.upi_id,
             u.scanner_label, u.scanner_enabled, u.is_blocked, u.created_at,
             (SELECT COUNT(*) FROM users WHERE moderator_id = u.id) as user_count
          FROM users u
          WHERE u.role = 'moderator' AND u.is_deleted = 0
      ORDER BY u.created_at DESC
    `);
    res.json({ moderators });
  } catch (error) {
    next(error);
  }
};

exports.updateModerator = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, phone, is_blocked, password, upi_id, scanner_label, scanner_enabled } = req.body;

    const [moderators] = await pool.query(
      `SELECT id, scanner_enabled FROM users WHERE id = ? AND role = 'moderator' LIMIT 1`,
      [id]
    );

    if (moderators.length === 0) {
      return res.status(404).json({ error: 'Moderator not found.' });
    }

    const currentModerator = moderators[0];

    if (upi_id !== undefined) {
      const validation = validateUpiId(upi_id);
      if (!validation.isValid) {
        return res.status(400).json({ error: validation.message });
      }
    }

    if (scanner_label !== undefined) {
      const validation = validateScannerLabel(scanner_label);
      if (!validation.isValid) {
        return res.status(400).json({ error: validation.message });
      }
    }

    // Require UPI ID when enabling scanner
    const nextScannerEnabled = scanner_enabled !== undefined
      ? normalizeScannerEnabled(scanner_enabled)
      : currentModerator.scanner_enabled;

    if (nextScannerEnabled && !upi_id) {
      // Check if existing UPI is set
      const [existing] = await pool.query('SELECT upi_id FROM users WHERE id = ?', [id]);
      if (!existing[0]?.upi_id) {
        return res.status(400).json({ error: 'UPI ID is required when scanner is enabled.' });
      }
    }

    const fields = [];
    const values = [];

    if (name) { fields.push('name = ?'); values.push(name); }
    if (phone) { fields.push('phone = ?'); values.push(phone); }
    if (is_blocked !== undefined) { fields.push('is_blocked = ?'); values.push(is_blocked); }
    if (upi_id !== undefined) { fields.push('upi_id = ?'); values.push(upi_id ? String(upi_id).trim() : null); }
    if (scanner_label !== undefined) { fields.push('scanner_label = ?'); values.push(scanner_label ? String(scanner_label).trim() : null); }
    if (scanner_enabled !== undefined) { fields.push('scanner_enabled = ?'); values.push(normalizeScannerEnabled(scanner_enabled)); }
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      fields.push('password = ?');
      values.push(hashedPassword);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update.' });
    }

    values.push(id);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ? AND role = 'moderator'`, values);

    const scannerAuditEntries = buildScannerAuditEntries({
      moderatorId: Number(id),
      actor: req.user,
      previousScanner: currentModerator,
      nextScanner: {
        scanner_label: scanner_label !== undefined ? (scanner_label ? String(scanner_label).trim() : null) : currentModerator.scanner_label,
        upi_id: upi_id !== undefined ? (upi_id ? String(upi_id).trim() : null) : currentModerator.upi_id,
        scanner_enabled: scanner_enabled !== undefined ? normalizeScannerEnabled(scanner_enabled) : currentModerator.scanner_enabled,
      },
    });

    await insertScannerAuditEntries(scannerAuditEntries);

    if (req.user.role === 'admin' && scannerAuditEntries.length > 0) {
      const actorName = req.user.name || 'Admin';
      await pool.query(
        'INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)',
        [id, 'system', `${actorName} updated your payment scanner settings.`]
      );
    }

    res.json({ message: 'Moderator updated.' });
  } catch (error) {
    next(error);
  }
};

exports.updateScanner = async (req, res, next) => {
  try {
    const { id } = req.params;
    const moderatorId = parseInt(id, 10);

    if (req.user.role === 'moderator' && req.user.id !== moderatorId) {
      return res.status(403).json({ error: 'You can update only your own scanner.' });
    }

    const [moderators] = await pool.query(
      `SELECT id, scanner_enabled, upi_id, scanner_label FROM users WHERE id = ? AND role = 'moderator' LIMIT 1`,
      [moderatorId]
    );

    if (moderators.length === 0) {
      return res.status(404).json({ error: 'Moderator not found.' });
    }

    const { upi_id, scanner_label, scanner_enabled } = req.body;
    const fields = [];
    const values = [];

    if (upi_id !== undefined) {
      const validation = validateUpiId(upi_id);
      if (!validation.isValid) {
        return res.status(400).json({ error: validation.message });
      }
    }

    if (scanner_label !== undefined) {
      const validation = validateScannerLabel(scanner_label);
      if (!validation.isValid) {
        return res.status(400).json({ error: validation.message });
      }
    }

    // Require UPI ID when enabling scanner
    const nextScannerEnabled = scanner_enabled !== undefined
      ? normalizeScannerEnabled(scanner_enabled)
      : moderators[0].scanner_enabled;
    const nextUpiId = upi_id !== undefined ? (upi_id ? String(upi_id).trim() : null) : moderators[0].upi_id;

    if (nextScannerEnabled && !nextUpiId) {
      return res.status(400).json({ error: 'UPI ID is required when scanner is enabled.' });
    }

    if (upi_id !== undefined) {
      fields.push('upi_id = ?');
      values.push(upi_id ? String(upi_id).trim() : null);
    }

    if (scanner_label !== undefined) {
      fields.push('scanner_label = ?');
      values.push(scanner_label ? String(scanner_label).trim() : null);
    }

    if (scanner_enabled !== undefined) {
      fields.push('scanner_enabled = ?');
      values.push(normalizeScannerEnabled(scanner_enabled));
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No scanner fields to update.' });
    }

    values.push(moderatorId);
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ? AND role = 'moderator'`, values);

    const scannerAuditEntries = buildScannerAuditEntries({
      moderatorId,
      actor: req.user,
      previousScanner: moderators[0],
      nextScanner: {
        scanner_label: scanner_label !== undefined ? (scanner_label ? String(scanner_label).trim() : null) : moderators[0].scanner_label,
        upi_id: nextUpiId,
        scanner_enabled: nextScannerEnabled,
      },
    });

    await insertScannerAuditEntries(scannerAuditEntries);

    if (req.user.role === 'admin' && scannerAuditEntries.length > 0) {
      const actorName = req.user.name || 'Admin';
      await pool.query(
        'INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)',
        [moderatorId, 'system', `${actorName} updated your payment scanner settings.`]
      );
    }

    res.json({ message: 'Moderator scanner updated.' });
  } catch (error) {
    next(error);
  }
};

exports.getOwnScanner = async (req, res, next) => {
  try {
    if (req.user.role !== 'moderator') {
      return res.status(403).json({ error: 'Only moderators can access this scanner.' });
    }

    const [rows] = await pool.query(
      `SELECT u.id AS moderator_id, u.upi_id, u.scanner_label, u.scanner_enabled
       FROM users u
       WHERE u.id = ? AND u.role = 'moderator' LIMIT 1`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Moderator scanner not found.' });
    }

    res.json({ scanner: rows[0] });
  } catch (error) {
    next(error);
  }
};

exports.updateOwnScanner = async (req, res, next) => {
  req.params.id = String(req.user.id);
  return exports.updateScanner(req, res, next);
};

exports.deleteModerator = async (req, res, next) => {
  try {
    const { id } = req.params;
    // Soft delete: mark as deleted, unassign users, disable scanner
    await pool.query('UPDATE users SET moderator_id = NULL WHERE moderator_id = ?', [id]);
    await pool.query(
      "UPDATE users SET is_deleted = 1, is_blocked = 1, scanner_enabled = 0 WHERE id = ? AND role = 'moderator'",
      [id]
    );
    res.json({ message: 'Moderator archived.' });
  } catch (error) {
    next(error);
  }
};

exports.assignUsers = async (req, res, next) => {
  try {
    const { moderator_id, user_ids } = req.body;
    if (!moderator_id || !Array.isArray(user_ids)) {
      return res.status(400).json({ error: 'moderator_id and user_ids array required.' });
    }

    const placeholders = user_ids.map(() => '?').join(',');
    await pool.query(
      `UPDATE users SET moderator_id = ? WHERE id IN (${placeholders}) AND role = 'user'`,
      [moderator_id, ...user_ids]
    );

    res.json({ message: `${user_ids.length} users assigned to moderator.` });
  } catch (error) {
    next(error);
  }
};
