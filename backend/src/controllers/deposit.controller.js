const pool = require('../config/database');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { recordWalletTransaction, recordModeratorWalletTransaction } = require('../utils/wallet-ledger');
const { IST_NOW_SQL } = require('../utils/sql-time');

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
const LARGE_NEW_USER_DEPOSIT_THRESHOLD = 5000;
const LARGE_NEW_USER_DEPOSIT_MAX_AGE_DAYS = 3;

function buildReceiptUrl(req, fileName) {
  if (!fileName) {
    return null;
  }

  return `${req.protocol}://${req.get('host')}/uploads/${fileName}`;
}

function cleanupUploadedFile(file) {
  if (!file || !file.filename) {
    return;
  }

  const filePath = path.join(uploadDir, file.filename);
  fs.promises.unlink(filePath).catch(() => {});
}

async function logDuplicateDepositAttempt(userId, utrNumber, originalUserId) {
  await pool.query(
    'INSERT INTO utr_attempt_logs (attempt_user_id, utr, original_user_id) VALUES (?, ?, ?)',
    [userId, utrNumber, originalUserId || null]
  );
}

async function getFileHash(fileName) {
  if (!fileName) {
    return null;
  }

  const filePath = path.join(uploadDir, fileName);
  const buffer = await fs.promises.readFile(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function getAssignedModerator(userId) {
  const [rows] = await pool.query(
    `SELECT m.id, m.name, m.phone, m.upi_id, m.qr_code_image, m.scanner_label, m.scanner_enabled
     FROM users u
     JOIN users m ON m.id = u.moderator_id
     WHERE u.id = ? AND m.role = 'moderator'
     LIMIT 1`,
    [userId]
  );

  return rows[0] || null;
}

async function notifyDuplicateDepositAttempt(userId, utrNumber, originalUserId) {
  const [[attemptingUsers], [originalUsers], [admins]] = await Promise.all([
    pool.query('SELECT name, phone FROM users WHERE id = ? LIMIT 1', [userId]),
    pool.query('SELECT name, phone, moderator_id FROM users WHERE id = ? LIMIT 1', [originalUserId]),
    pool.query("SELECT id FROM users WHERE role = 'admin'")
  ]);

  const [attemptingUserRows] = await pool.query('SELECT moderator_id FROM users WHERE id = ? LIMIT 1', [userId]);
  const uniqueRecipients = new Set(admins.map((user) => user.id).filter(Boolean));
  if (attemptingUserRows[0]?.moderator_id) {
    uniqueRecipients.add(attemptingUserRows[0].moderator_id);
  }
  if (originalUsers[0]?.moderator_id) {
    uniqueRecipients.add(originalUsers[0].moderator_id);
  }

  const recipientIds = [...uniqueRecipients];
  if (recipientIds.length === 0) {
    return;
  }

  const attemptedBy = attemptingUsers[0]
    ? `${attemptingUsers[0].name || 'Unknown'} (${attemptingUsers[0].phone || userId})`
    : `User ${userId}`;
  const existingOwner = originalUsers[0]
    ? `${originalUsers[0].name || 'Unknown'} (${originalUsers[0].phone || originalUserId})`
    : `User ${originalUserId}`;
  const message = `Duplicate deposit UTR attempt detected. UTR ${utrNumber} was submitted by ${attemptedBy} and already exists for ${existingOwner}.`;
  await insertNotifications(recipientIds, 'system', message);
}

async function insertNotifications(recipientIds, type, message) {
  const uniqueRecipientIds = [...new Set((recipientIds || []).map((id) => Number(id)).filter(Boolean))];
  if (uniqueRecipientIds.length === 0) {
    return;
  }

  const values = uniqueRecipientIds.map((recipientId) => [recipientId, type, message]);
  await pool.query(
    'INSERT INTO notifications (user_id, type, message) VALUES ?',
    [values]
  );
}

async function getStaffRecipientIds(extraRecipientIds = []) {
  const [admins] = await pool.query("SELECT id FROM users WHERE role = 'admin'");
  return [...new Set([
    ...admins.map((user) => user.id),
    ...extraRecipientIds,
  ].map((id) => Number(id)).filter(Boolean))];
}

async function notifyReusedReceiptImage({ depositId, userId, moderatorId, amount, utrNumber, receiptImageHash }) {
  if (!receiptImageHash) {
    return;
  }

  const [[userRows], [matches]] = await Promise.all([
    pool.query('SELECT id, name, phone FROM users WHERE id = ? LIMIT 1', [userId]),
    pool.query(
      `SELECT d.id, d.utr_number, u.name AS user_name, u.phone AS user_phone, u.moderator_id
       FROM deposits d
       JOIN users u ON u.id = d.user_id
       WHERE d.receipt_image_hash = ? AND d.id <> ?
       ORDER BY d.created_at DESC`,
      [receiptImageHash, depositId]
    ),
  ]);

  if (matches.length === 0) {
    return;
  }

  const recipients = await getStaffRecipientIds([
    moderatorId,
    ...matches.map((match) => match.moderator_id),
  ]);

  const user = userRows[0];
  const matchingSummary = matches
    .slice(0, 3)
    .map((match) => `#${match.id} ${match.user_name || 'Unknown'} (${match.user_phone || '-'})`)
    .join(', ');
  const suffix = matches.length > 3 ? ` and ${matches.length - 3} more` : '';
  const message = `Fraud alert: reused receipt image detected for deposit #${depositId} (UTR ${utrNumber}, amount ₹${Number(amount || 0).toLocaleString('en-IN')}) from ${user?.name || `User ${userId}`} (${user?.phone || '-'}) with matching deposits ${matchingSummary}${suffix}.`;
  await insertNotifications(recipients, 'system', message);
}

async function notifyLargeNewUserDeposit({ depositId, userId, moderatorId, amount, utrNumber }) {
  const [users] = await pool.query(
    `SELECT id, name, phone, created_at
     FROM users
     WHERE id = ?
       AND TIMESTAMPDIFF(DAY, created_at, ${IST_NOW_SQL}) <= ?
     LIMIT 1`,
    [userId, LARGE_NEW_USER_DEPOSIT_MAX_AGE_DAYS]
  );

  if (users.length === 0 || parseFloat(amount || 0) < LARGE_NEW_USER_DEPOSIT_THRESHOLD) {
    return;
  }

  const recipients = await getStaffRecipientIds([moderatorId]);
  const user = users[0];
  const ageHours = Math.max(0, Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60)));
  const message = `Fraud alert: large new-user deposit #${depositId} submitted by ${user.name || `User ${userId}`} (${user.phone || '-'}) for ₹${Number(amount || 0).toLocaleString('en-IN')} with UTR ${utrNumber}. Account age: ${ageHours} hours.`;
  await insertNotifications(recipients, 'system', message);
}

async function notifyDuplicateDepositAttempt(userId, utrNumber, originalUserId) {
  const [[attemptingUsers], [originalUsers], [admins]] = await Promise.all([
    pool.query('SELECT name, phone FROM users WHERE id = ? LIMIT 1', [userId]),
    pool.query('SELECT name, phone, moderator_id FROM users WHERE id = ? LIMIT 1', [originalUserId]),
    pool.query("SELECT id FROM users WHERE role = 'admin'")
  ]);

  const [attemptingUserRows] = await pool.query('SELECT moderator_id FROM users WHERE id = ? LIMIT 1', [userId]);
  const uniqueRecipients = new Set(admins.map((user) => user.id).filter(Boolean));
  if (attemptingUserRows[0]?.moderator_id) {
    uniqueRecipients.add(attemptingUserRows[0].moderator_id);
  }
  if (originalUsers[0]?.moderator_id) {
    uniqueRecipients.add(originalUsers[0].moderator_id);
  }

  const recipientIds = [...uniqueRecipients];
  if (recipientIds.length === 0) {
    return;
  }

  const attemptedBy = attemptingUsers[0]
    ? `${attemptingUsers[0].name || 'Unknown'} (${attemptingUsers[0].phone || userId})`
    : `User ${userId}`;
  const existingOwner = originalUsers[0]
    ? `${originalUsers[0].name || 'Unknown'} (${originalUsers[0].phone || originalUserId})`
    : `User ${originalUserId}`;
  const message = `Duplicate deposit UTR attempt detected. UTR ${utrNumber} was submitted by ${attemptedBy} and already exists for ${existingOwner}.`;
  for (const recipientId of recipientIds) {
    await pool.query(
      'INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)',
      [recipientId, 'system', message]
    );
  }
}

exports.getDepositScanner = async (req, res, next) => {
  try {
    const moderator = await getAssignedModerator(req.user.id);

    if (!moderator || !moderator.scanner_enabled) {
      return res.status(404).json({ error: 'No active deposit scanner is assigned to your account.' });
    }

    res.json({
      moderator_id: moderator.id,
      upi_id: moderator.upi_id || null,
      qr_code_image: moderator.qr_code_image || null,
      qr_image: moderator.qr_code_image || null,
      qr_code_image_url: buildReceiptUrl(req, moderator.qr_code_image),
      qr_image_url: buildReceiptUrl(req, moderator.qr_code_image),
      scanner_label: moderator.scanner_label || moderator.name || 'Assigned Moderator Scanner',
    });
  } catch (error) {
    next(error);
  }
};

exports.requestDeposit = async (req, res, next) => {
  try {
    const { amount, utr_number } = req.body;

    if (!amount || !utr_number) {
      cleanupUploadedFile(req.file);
      return res.status(400).json({ error: 'Amount and UTR number are required.' });
    }

    const parsedAmount = parseFloat(amount);
    if (parsedAmount <= 0) {
      cleanupUploadedFile(req.file);
      return res.status(400).json({ error: 'Amount must be positive.' });
    }

    // Check min deposit
    const [settings] = await pool.query("SELECT setting_value FROM settings WHERE setting_key = 'min_deposit'");
    const minDeposit = settings.length > 0 ? parseFloat(settings[0].setting_value) : 100;
    if (parsedAmount < minDeposit) {
      cleanupUploadedFile(req.file);
      return res.status(400).json({ error: `Minimum deposit is ₹${minDeposit}.` });
    }

    const moderator = await getAssignedModerator(req.user.id);
    if (!moderator || !moderator.scanner_enabled) {
      cleanupUploadedFile(req.file);
      return res.status(400).json({ error: 'No active moderator scanner is assigned to your account.' });
    }

    // Check duplicate UTR
    const [existingUTR] = await pool.query('SELECT id, user_id FROM deposits WHERE utr_number = ?', [utr_number]);
    if (existingUTR.length > 0) {
      cleanupUploadedFile(req.file);
      await logDuplicateDepositAttempt(req.user.id, utr_number, existingUTR[0].user_id);
      await notifyDuplicateDepositAttempt(req.user.id, utr_number, existingUTR[0].user_id);
      return res.status(409).json({ error: 'This UTR number has already been used.' });
    }

    const screenshot = req.file ? req.file.filename : null;
    const receiptImageHash = screenshot ? await getFileHash(screenshot) : null;

    const [result] = await pool.query(
      `INSERT INTO deposits (user_id, moderator_id, amount, utr_number, screenshot, receipt_image, receipt_image_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, moderator.id, parsedAmount, utr_number, screenshot, screenshot, receiptImageHash]
    );

    try {
      await Promise.all([
        notifyReusedReceiptImage({
          depositId: result.insertId,
          userId: req.user.id,
          moderatorId: moderator.id,
          amount: parsedAmount,
          utrNumber: utr_number,
          receiptImageHash,
        }),
        notifyLargeNewUserDeposit({
          depositId: result.insertId,
          userId: req.user.id,
          moderatorId: moderator.id,
          amount: parsedAmount,
          utrNumber: utr_number,
        }),
      ]);
    } catch (notificationError) {
      console.error('Failed to create fraud notifications:', notificationError);
    }

    res.status(201).json({
      message: 'Deposit request submitted.',
      deposit: { id: result.insertId, amount: parsedAmount, utr_number, status: 'pending' }
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      cleanupUploadedFile(req.file);
      const [existingUTR] = await pool.query('SELECT user_id FROM deposits WHERE utr_number = ?', [req.body.utr_number]);
      if (existingUTR.length > 0) {
        await logDuplicateDepositAttempt(req.user.id, req.body.utr_number, existingUTR[0].user_id);
        await notifyDuplicateDepositAttempt(req.user.id, req.body.utr_number, existingUTR[0].user_id);
      }
      return res.status(409).json({ error: 'This UTR number has already been used.' });
    }

    next(error);
  }
};

exports.getDepositHistory = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM deposits WHERE user_id = ?', [req.user.id]
    );

    const [deposits] = await pool.query(
      `SELECT d.id, d.amount, d.utr_number, COALESCE(d.receipt_image, d.screenshot) AS receipt_image,
              d.status, d.reject_reason, COALESCE(d.approved_by_role, approver.role) AS approved_by_role,
              approver.name AS approved_by_name,
              CASE WHEN d.status = 'pending' THEN NULL ELSE COALESCE(d.approved_at, d.updated_at) END AS approved_at,
              d.created_at, d.updated_at
       FROM deposits d
       LEFT JOIN users approver ON approver.id = COALESCE(d.approved_by_id, d.approved_by)
       WHERE d.user_id = ?
       ORDER BY d.created_at DESC LIMIT ? OFFSET ?`,
      [req.user.id, parseInt(limit), offset]
    );

    res.json({
      deposits,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / parseInt(limit)),
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.approveDeposit = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;

    await conn.beginTransaction();

    let depositQuery = `
      SELECT d.*, COALESCE(d.moderator_id, u.moderator_id) AS effective_moderator_id
      FROM deposits d
      JOIN users u ON d.user_id = u.id
      WHERE d.id = ? AND d.status = ?
      FOR UPDATE
    `;
    const depositParams = [id, 'pending'];

    if (req.user.role === 'moderator') {
      depositQuery = `
        SELECT d.*, COALESCE(d.moderator_id, u.moderator_id) AS effective_moderator_id
        FROM deposits d
        JOIN users u ON d.user_id = u.id
        WHERE d.id = ? AND d.status = ? AND COALESCE(d.moderator_id, u.moderator_id) = ?
        FOR UPDATE
      `;
      depositParams.push(req.user.id);
    } else {
      depositQuery = `
        SELECT d.*, COALESCE(d.moderator_id, u.moderator_id) AS effective_moderator_id
        FROM deposits d
        JOIN users u ON d.user_id = u.id
        WHERE d.id = ? AND d.status IN (?, ?)
        FOR UPDATE
      `;
      depositParams.pop();
      depositParams.push('pending', 'rejected');
    }

    const [deposits] = await conn.query(depositQuery, depositParams);
    if (deposits.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Deposit not found or already processed.' });
    }

    const deposit = deposits[0];

    const [existingCredit] = await conn.query(
      `SELECT id FROM wallet_transactions WHERE user_id = ? AND type = ? AND reference_type = ? AND reference_id = ? LIMIT 1`,
      [deposit.user_id, 'deposit', 'deposit', `deposit_${id}`]
    );
    if (existingCredit.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'This deposit has already been credited.' });
    }

    // Only deduct moderator float if approver is a moderator
    if (deposit.effective_moderator_id && req.user.role === 'moderator') {
      await recordModeratorWalletTransaction(conn, {
        moderatorId: deposit.effective_moderator_id,
        type: 'deposit',
        amount: -parseFloat(deposit.amount),
        referenceId: `deposit_${id}`,
        remark: `Deposit approval for deposit #${id}`,
        createdBy: req.user.id,
      });
    }

    // Update deposit status
    await conn.query(
      `UPDATE deposits
       SET status = ?, reject_reason = NULL, approved_by = ?, approved_by_role = ?, approved_by_id = ?, approved_at = ${IST_NOW_SQL}
       WHERE id = ?`,
      ['approved', req.user.id, req.user.role, req.user.id, id]
    );

    const newBalance = await recordWalletTransaction(conn, {
      userId: deposit.user_id,
      type: 'deposit',
      amount: parseFloat(deposit.amount),
      referenceType: 'deposit',
      referenceId: `deposit_${id}`,
      remark: 'Deposit approved',
    });

    // Check for first deposit bonus
    const [depositCount] = await conn.query(
      'SELECT COUNT(*) as count FROM deposits WHERE user_id = ? AND status = ?',
      [deposit.user_id, 'approved']
    );

    if (depositCount[0].count === 1) {
      // First deposit - apply bonus
      const [bonusSettings] = await conn.query(
        "SELECT setting_value FROM settings WHERE setting_key = 'first_deposit_bonus_percent'"
      );

      if (bonusSettings.length > 0) {
        const bonusPercent = parseFloat(bonusSettings[0].setting_value);
        const bonusAmount = (parseFloat(deposit.amount) * bonusPercent) / 100;

        // Lock wallet row before updating bonus_balance
        await conn.query('SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE', [deposit.user_id]);
        await conn.query('UPDATE wallets SET bonus_balance = bonus_balance + ? WHERE user_id = ?',
          [bonusAmount, deposit.user_id]);

        await conn.query('INSERT INTO bonuses (user_id, type, amount, reference_id) VALUES (?, ?, ?, ?)',
          [deposit.user_id, 'first_deposit', bonusAmount, `deposit_${id}`]);

        // Record in wallet_transactions ledger
        const [[walletRow]] = await conn.query('SELECT balance FROM wallets WHERE user_id = ?', [deposit.user_id]);
        await conn.query(
          `INSERT INTO wallet_transactions
            (user_id, type, amount, balance_after, status, reference_type, reference_id, remark)
           VALUES (?, 'bonus', ?, ?, 'completed', 'bonus', ?, ?)`,
          [deposit.user_id, bonusAmount, parseFloat(walletRow.balance), `first_deposit_${id}`, `First deposit bonus ${bonusPercent}%`]
        );
      }
    }

    // Check slab bonus
    const slabKeys = ['bonus_slab_10000', 'bonus_slab_5000', 'bonus_slab_2500'];
    for (const key of slabKeys) {
      const threshold = parseInt(key.split('_').pop());
      if (parseFloat(deposit.amount) >= threshold) {
        const [slabSettings] = await conn.query("SELECT setting_value FROM settings WHERE setting_key = ?", [key]);
        if (slabSettings.length > 0) {
          const slabBonus = parseFloat(slabSettings[0].setting_value);

          // Lock wallet row before updating bonus_balance
          await conn.query('SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE', [deposit.user_id]);
          await conn.query('UPDATE wallets SET bonus_balance = bonus_balance + ? WHERE user_id = ?',
            [slabBonus, deposit.user_id]);

          await conn.query('INSERT INTO bonuses (user_id, type, amount, reference_id) VALUES (?, ?, ?, ?)',
            [deposit.user_id, 'slab', slabBonus, `deposit_${id}_slab_${threshold}`]);

          // Record in wallet_transactions ledger
          const [[walletRow]] = await conn.query('SELECT balance FROM wallets WHERE user_id = ?', [deposit.user_id]);
          await conn.query(
            `INSERT INTO wallet_transactions
              (user_id, type, amount, balance_after, status, reference_type, reference_id, remark)
             VALUES (?, 'bonus', ?, ?, 'completed', 'bonus', ?, ?)`,
            [deposit.user_id, slabBonus, parseFloat(walletRow.balance), `slab_${id}_${threshold}`, `Slab bonus for ₹${threshold}+ deposit`]
          );

          break; // Only apply highest matching slab
        }
      }
    }

    // Notification
    await conn.query('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)',
      [deposit.user_id, 'deposit', `Your deposit of ₹${deposit.amount} has been approved.`]);

    await conn.commit();
    res.json({ message: 'Deposit approved.' });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

exports.rejectDeposit = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    let scopeQuery = `
      SELECT d.user_id, d.amount, d.status
      FROM deposits d
      WHERE d.id = ? AND d.status = ?
    `;
    const scopeParams = [id, 'pending'];

    if (req.user.role === 'moderator') {
      scopeQuery = `
        SELECT d.user_id, d.amount, d.status
        FROM deposits d
        JOIN users u ON d.user_id = u.id
        WHERE d.id = ? AND d.status = ? AND COALESCE(d.moderator_id, u.moderator_id) = ?
      `;
      scopeParams.push(req.user.id);
    }

    const [scopedDeposits] = await pool.query(scopeQuery, scopeParams);
    if (scopedDeposits.length === 0) {
      if (req.user.role === 'admin') {
        const [approvedDeposit] = await pool.query('SELECT id FROM deposits WHERE id = ? AND status = ?', [id, 'approved']);
        if (approvedDeposit.length > 0) {
          return res.status(409).json({ error: 'Approved deposits cannot be auto-rejected because the wallet is already credited.' });
        }
      }

      return res.status(404).json({ error: 'Deposit not found or already processed.' });
    }

    const [result] = await pool.query(
      `UPDATE deposits
       SET status = ?, reject_reason = ?, approved_by = ?, approved_by_role = ?, approved_by_id = ?, approved_at = ${IST_NOW_SQL}
       WHERE id = ? AND status = ?`,
      ['rejected', reason || 'Rejected by admin', req.user.id, req.user.role, req.user.id, id, 'pending']
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Deposit not found or already processed.' });
    }

    // Get deposit for notification
    if (scopedDeposits.length > 0) {
      await pool.query('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)',
        [scopedDeposits[0].user_id, 'deposit', `Your deposit of ₹${scopedDeposits[0].amount} has been rejected. Reason: ${reason || 'N/A'}`]);
    }

    res.json({ message: 'Deposit rejected.' });
  } catch (error) {
    next(error);
  }
};

exports.getAllDeposits = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT d.id, d.user_id, d.moderator_id, d.amount, d.utr_number,
             d.screenshot, d.receipt_image, d.receipt_image_hash,
             d.status, d.approved_by, d.approved_by_id, d.reject_reason,
             d.created_at, d.updated_at,
             u.name as user_name, u.phone as user_phone,
             moderator.name as moderator_name,
             COALESCE(d.approved_by_role, approver.role) as approved_by_role,
             approver.name as approved_by_name,
             CASE WHEN d.status = 'pending' THEN NULL ELSE COALESCE(d.approved_at, d.updated_at) END as approved_at
      FROM deposits d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN users moderator ON moderator.id = COALESCE(d.moderator_id, u.moderator_id)
      LEFT JOIN users approver ON approver.id = COALESCE(d.approved_by_id, d.approved_by)
    `;
    const params = [];

    // Moderator can only see their assigned users' deposits
    if (req.user.role === 'moderator') {
      query += ' WHERE COALESCE(d.moderator_id, u.moderator_id) = ?';
      params.push(req.user.id);
      if (status) {
        query += ' AND d.status = ?';
        params.push(status);
      }
    } else if (status) {
      query += ' WHERE d.status = ?';
      params.push(status);
    }

    const countQuery = `SELECT COUNT(*) as total FROM (${query}) as countTable`;
    const [countResult] = await pool.query(countQuery, params);

    query += ' ORDER BY d.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const [deposits] = await pool.query(query, params);

    res.json({
      deposits,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / parseInt(limit)),
      }
    });
  } catch (error) {
    next(error);
  }
};
