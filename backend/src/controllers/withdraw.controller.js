const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const { recordWalletTransaction } = require('../utils/wallet-ledger');
const { clampPagination } = require('../utils/pagination');
const { sendOtpSms } = require('../utils/sms');
const { getPhoneCandidates, toE164Phone } = require('../utils/phone');
const { recordUserActivity } = require('../utils/user-activity');

// Send OTP for withdrawal verification
exports.sendWithdrawOtp = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const phone = req.user.phone;
    const phoneCandidates = getPhoneCandidates(phone);
    const e164Phone = toE164Phone(phone);

    if (!phone || phoneCandidates.length === 0) {
      return res.status(400).json({ error: 'Valid registered phone number is required.' });
    }

    // Invalidate previous unexpired withdrawal OTPs
    await pool.query(
      "UPDATE otps SET is_used = 1 WHERE phone IN (?) AND purpose = 'withdraw' AND is_used = 0",
      [phoneCandidates]
    );

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 8);
    const otpExpiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 5;
    const expiresAt = new Date(Date.now() + otpExpiryMinutes * 60 * 1000);

    const [insertResult] = await pool.query(
      'INSERT INTO otps (phone, purpose, otp, expires_at) VALUES (?, ?, ?, ?)',
      [phone, 'withdraw', otpHash, expiresAt]
    );

    try {
      await sendOtpSms({
        phone: e164Phone || phone,
        otp,
        purpose: 'withdraw',
        expiryMinutes: otpExpiryMinutes,
      });
    } catch (smsError) {
      await pool.query('UPDATE otps SET is_used = 1 WHERE id = ?', [insertResult.insertId]);
      throw smsError;
    }

    await recordUserActivity({
      userId,
      action: 'request_withdraw_otp',
      entityType: 'user',
      entityId: userId,
      details: { phone },
      req,
    });

    res.json({
      message: 'Withdrawal OTP sent successfully.',
      ...(process.env.NODE_ENV !== 'production' && { otp }),
    });
  } catch (error) {
    next(error);
  }
};

exports.requestWithdraw = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { bank_id, bank_account_id, amount, withdraw_method, upi_id, phone_number, otp } = req.body;
    let { scanner_image } = req.body;
    if (req.file) {
      scanner_image = `/uploads/scanners/${req.file.filename}`;
    }
    const method = withdraw_method || 'bank';

    if (!['bank', 'upi', 'phone', 'scanner'].includes(method)) {
      return res.status(400).json({ error: 'Invalid withdrawal method.' });
    }

    // Require and verify OTP
    if (!otp || !/^\d{6}$/.test(String(otp).trim())) {
      return res.status(400).json({ error: 'Valid 6-digit withdrawal OTP is required.' });
    }

    let resolvedBankId = null;
    let cleanedUpi = null;
    let cleanedPhone = null;
    let cleanedScannerImage = null;

    if (method === 'bank') {
      resolvedBankId = bank_id || bank_account_id;
      if (!resolvedBankId) {
        const [users] = await conn.query('SELECT default_bank_account_id FROM users WHERE id = ? LIMIT 1', [req.user.id]);
        resolvedBankId = users[0]?.default_bank_account_id || null;
      }
      if (!resolvedBankId) {
        return res.status(400).json({ error: 'Bank account is required.' });
      }
    } else if (method === 'upi') {
      if (!upi_id || !upi_id.trim()) {
        return res.status(400).json({ error: 'UPI ID is required.' });
      }
      if (!/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(upi_id.trim())) {
        return res.status(400).json({ error: 'Invalid UPI ID format (e.g. name@upi).' });
      }
      cleanedUpi = upi_id.trim();
    } else if (method === 'phone') {
      if (!phone_number || !phone_number.trim()) {
        return res.status(400).json({ error: 'Phone number is required.' });
      }
      const digits = phone_number.replace(/\D/g, '');
      if (digits.length < 10 || digits.length > 13) {
        return res.status(400).json({ error: 'Invalid phone number. Must be 10 digits.' });
      }
      cleanedPhone = digits;
    } else if (method === 'scanner') {
      if (!scanner_image || !scanner_image.trim()) {
        return res.status(400).json({ error: 'Scanner image URL is required.' });
      }
      cleanedScannerImage = scanner_image.trim();
    }

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required.' });
    }

    const parsedAmount = parseFloat(amount);
    if (parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive.' });
    }

    // Check min withdrawal and withdrawal time windows
    const [settings] = await pool.query(
      "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('min_withdraw', 'withdrawal_time_windows')"
    );
    const settingsMap = {};
    for (const s of settings) settingsMap[s.setting_key] = s.setting_value;

    const minWithdraw = settingsMap.min_withdraw ? parseFloat(settingsMap.min_withdraw) : 200;
    if (parsedAmount < minWithdraw) {
      return res.status(400).json({ error: `Minimum withdrawal is ₹${minWithdraw}.` });
    }

    // Validate withdrawal time windows (IST)
    if (settingsMap.withdrawal_time_windows) {
      let windows = [];
      try { windows = JSON.parse(settingsMap.withdrawal_time_windows); } catch (_) { windows = []; }
      if (Array.isArray(windows) && windows.length > 0) {
        const now = new Date();
        const istOffset = 5 * 60 + 30;
        const istNow = new Date(now.getTime() + istOffset * 60 * 1000);
        const currentMinutes = istNow.getUTCHours() * 60 + istNow.getUTCMinutes();

        const parseHHMM = (str) => {
          const [h, m] = String(str).split(':').map(Number);
          return (h || 0) * 60 + (m || 0);
        };

        const isAllowed = windows.some((w) => {
          const start = parseHHMM(w.start);
          const end = parseHHMM(w.end);
          return currentMinutes >= start && currentMinutes <= end;
        });

        if (!isAllowed) {
          const windowList = windows.map((w) => `${w.start} – ${w.end}`).join(', ');
          return res.status(400).json({
            error: `Withdrawals are only allowed during: ${windowList}. Please try again in the next withdrawal window.`,
            code: 'OUTSIDE_WITHDRAWAL_WINDOW',
          });
        }
      }
    }

    await conn.beginTransaction();

    // Verify OTP in DB
    const phoneCandidates = getPhoneCandidates(req.user.phone);
    const [otpRecords] = await conn.query(
      `SELECT * FROM otps WHERE phone IN (?) AND purpose = 'withdraw' AND is_used = 0 AND expires_at > UTC_TIMESTAMP() ORDER BY id DESC LIMIT 1 FOR UPDATE`,
      [phoneCandidates.length > 0 ? phoneCandidates : [req.user.phone]]
    );

    if (otpRecords.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'Invalid or expired withdrawal OTP. Please request a new OTP.' });
    }

    const isValidOtp = await bcrypt.compare(String(otp).trim(), otpRecords[0].otp);
    if (!isValidOtp) {
      await conn.rollback();
      return res.status(400).json({ error: 'Invalid or expired withdrawal OTP.' });
    }

    // Mark OTP as used
    await conn.query('UPDATE otps SET is_used = 1 WHERE id = ?', [otpRecords[0].id]);

    if (method === 'bank') {
      // Verify bank account belongs to user
      const [banks] = await conn.query(
        'SELECT * FROM bank_accounts WHERE id = ? AND user_id = ?',
        [resolvedBankId, req.user.id]
      );
      if (banks.length === 0) {
        await conn.rollback();
        return res.status(404).json({ error: 'Bank account not found.' });
      }
      if (banks[0].is_flagged) {
        await conn.rollback();
        return res.status(400).json({ error: 'This bank account is flagged. Contact support.' });
      }
    }

    // Check available balance
    const [wallets] = await conn.query('SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE', [req.user.id]);
    const balance = parseFloat(wallets[0].balance);
    const availableWithdrawal = balance;

    if (parsedAmount > availableWithdrawal) {
      await conn.rollback();
      return res.status(400).json({
        error: `Insufficient available balance. Available: ₹${availableWithdrawal.toFixed(2)}`
      });
    }

    // Create withdraw request with otp_verified = 1 and status = 'pending'
    const [result] = await conn.query(
      'INSERT INTO withdraw_requests (user_id, bank_id, withdraw_method, upi_id, phone_number, scanner_image, amount, otp_verified, status) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)',
      [req.user.id, resolvedBankId || null, method, cleanedUpi, cleanedPhone, cleanedScannerImage, parsedAmount, 'pending']
    );

    await recordWalletTransaction(conn, {
      userId: req.user.id,
      type: 'withdraw',
      amount: -parsedAmount,
      status: 'completed',
      referenceType: 'withdraw',
      referenceId: `withdraw_${result.insertId}`,
      remark: 'Withdrawal request',
    });

    await conn.commit();

    await recordUserActivity({
      userId: req.user.id,
      action: 'request_withdraw',
      entityType: 'withdraw_request',
      entityId: result.insertId,
      details: {
        amount: parsedAmount,
        withdraw_method: method,
        bank_id: resolvedBankId || null,
        upi_id: cleanedUpi,
        phone_number: cleanedPhone,
        otp_verified: true,
      },
      req,
    });

    res.status(201).json({
      message: 'Withdrawal request submitted successfully.',
      withdraw: { id: result.insertId, amount: parsedAmount, status: 'pending' }
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

exports.getWithdrawHistory = async (req, res, next) => {
  try {
    const { page, limit, offset } = clampPagination(req.query);

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM withdraw_requests WHERE user_id = ?', [req.user.id]
    );

    const [withdrawals] = await pool.query(`
      SELECT wr.id, wr.user_id, wr.bank_id, wr.withdraw_method, wr.upi_id, wr.phone_number, wr.scanner_image,
             wr.amount, wr.status, wr.reject_reason, wr.created_at, wr.updated_at,
             ba.account_number, ba.bank_name, ba.account_holder
      FROM withdraw_requests wr
      LEFT JOIN bank_accounts ba ON wr.bank_id = ba.id
      WHERE wr.user_id = ?
      ORDER BY wr.created_at DESC LIMIT ? OFFSET ?
    `, [req.user.id, limit, offset]);

    res.json({
      withdrawals,
      pagination: {
        page,
        limit,
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit),
      }
    });
  } catch (error) {
    next(error);
  }
};

// Maker-Checker Step 1: Checker verifies details and moves from 'pending' -> 'checked'
exports.checkWithdraw = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { notes } = req.body;

    await conn.beginTransaction();

    let requestQuery = 'SELECT wr.* FROM withdraw_requests wr WHERE wr.id = ? AND wr.status = ? FOR UPDATE';
    const requestParams = [id, 'pending'];

    if (req.user.role === 'moderator') {
      requestQuery = `
        SELECT wr.*
        FROM withdraw_requests wr
        JOIN users u ON wr.user_id = u.id
        WHERE wr.id = ? AND wr.status = ? AND u.moderator_id = ?
        FOR UPDATE
      `;
      requestParams.push(req.user.id);
    }

    const [requests] = await conn.query(requestQuery, requestParams);
    if (requests.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Withdrawal request not found or not in pending status.' });
    }

    await conn.query(
      'UPDATE withdraw_requests SET status = ?, checked_by = ?, checked_at = NOW(), checker_notes = ? WHERE id = ?',
      ['checked', req.user.id, notes ? String(notes).trim().slice(0, 255) : null, id]
    );

    await conn.commit();
    res.json({
      message: 'Withdrawal verified by checker and forwarded for payout approval.',
      status: 'checked',
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

// Maker-Checker Step 2: Final approval.
// DIRECT PAYOUT IS DISABLED: Requests in 'pending' status cannot be directly approved without checker verification!
exports.approveWithdraw = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;

    await conn.beginTransaction();

    // Check status first
    let statusQuery = 'SELECT wr.* FROM withdraw_requests wr WHERE wr.id = ? FOR UPDATE';
    const statusParams = [id];

    if (req.user.role === 'moderator') {
      statusQuery = `
        SELECT wr.*
        FROM withdraw_requests wr
        JOIN users u ON wr.user_id = u.id
        WHERE wr.id = ? AND u.moderator_id = ?
        FOR UPDATE
      `;
      statusParams.push(req.user.id);
    }

    const [requests] = await conn.query(statusQuery, statusParams);
    if (requests.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Withdrawal request not found.' });
    }

    const request = requests[0];

    // Enforce Maker-Checker: "Direct payout NO; need a checker"
    if (request.status === 'pending') {
      await conn.rollback();
      return res.status(400).json({
        error: 'Direct payout is disabled. This withdrawal must be verified by a checker before payout approval.',
        code: 'CHECKER_REQUIRED',
      });
    }

    if (request.status !== 'checked') {
      await conn.rollback();
      return res.status(400).json({
        error: `Cannot approve withdrawal with status "${request.status}". Must be in "checked" status.`,
      });
    }

    await conn.query('UPDATE withdraw_requests SET status = ?, approved_by = ? WHERE id = ?',
      ['approved', req.user.id, id]);

    // Notification
    await conn.query('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)',
      [request.user_id, 'withdraw', `Your withdrawal of ₹${request.amount} has been approved.`]);

    await conn.commit();
    res.json({ message: 'Withdrawal payout approved successfully.' });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

exports.rejectWithdraw = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { reason } = req.body;

    await conn.beginTransaction();

    let requestQuery = 'SELECT wr.* FROM withdraw_requests wr WHERE wr.id = ? AND wr.status IN (?, ?) FOR UPDATE';
    const requestParams = [id, 'pending', 'checked'];

    if (req.user.role === 'moderator') {
      requestQuery = `
        SELECT wr.*
        FROM withdraw_requests wr
        JOIN users u ON wr.user_id = u.id
        WHERE wr.id = ? AND wr.status IN (?, ?) AND u.moderator_id = ?
        FOR UPDATE
      `;
      requestParams.push(req.user.id);
    }

    const [requests] = await conn.query(requestQuery, requestParams);
    if (requests.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Withdrawal request not found or already processed.' });
    }

    // Refund to wallet
    await conn.query('UPDATE withdraw_requests SET status = ?, reject_reason = ?, approved_by = ? WHERE id = ?',
      ['rejected', reason || 'Rejected', req.user.id, id]);

    // Refund transaction
    const newBalance = await recordWalletTransaction(conn, {
      userId: requests[0].user_id,
      type: 'adjustment',
      amount: parseFloat(requests[0].amount),
      referenceType: 'withdraw',
      referenceId: `withdraw_refund_${id}`,
      remark: `Withdrawal rejected: ${reason || 'N/A'}`,
    });

    // Notification
    await conn.query('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)',
      [requests[0].user_id, 'withdraw', `Your withdrawal of ₹${requests[0].amount} was rejected. Reason: ${reason || 'N/A'}. Amount refunded.`]);

    await conn.commit();
    res.json({ message: 'Withdrawal rejected and refunded.' });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

exports.getAllWithdrawals = async (req, res, next) => {
  try {
    const { status, search, from_date, to_date, moderator_id, method } = req.query;
    const { page, limit, offset } = clampPagination(req.query);

    const whereConditions = [];
    const params = [];

    if (req.user.role === 'moderator') {
      whereConditions.push('u.moderator_id = ?');
      params.push(req.user.id);
    } else if (moderator_id) {
      whereConditions.push('u.moderator_id = ?');
      params.push(moderator_id);
    }

    if (status) {
      whereConditions.push('wr.status = ?');
      params.push(status);
    }

    if (method) {
      whereConditions.push('wr.withdraw_method = ?');
      params.push(method);
    }

    if (from_date) {
      whereConditions.push('DATE(wr.created_at) >= ?');
      params.push(from_date);
    }

    if (to_date) {
      whereConditions.push('DATE(wr.created_at) <= ?');
      params.push(to_date);
    }

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      whereConditions.push(`(
        u.name LIKE ? OR
        u.phone LIKE ? OR
        COALESCE(wr.upi_id, '') LIKE ? OR
        COALESCE(wr.phone_number, '') LIKE ? OR
        COALESCE(ba.account_number, '') LIKE ? OR
        COALESCE(ba.bank_name, '') LIKE ? OR
        COALESCE(ba.account_holder, '') LIKE ? OR
        CAST(wr.id AS CHAR) LIKE ?
      )`);
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const baseQuery = `
      SELECT wr.id, wr.user_id, wr.bank_id, wr.withdraw_method, wr.upi_id, wr.phone_number, wr.scanner_image,
             wr.amount, wr.status, wr.reject_reason, wr.checked_by, wr.checked_at, wr.checker_notes, wr.otp_verified,
             wr.created_at, wr.updated_at,
             u.name as user_name, u.phone as user_phone, u.moderator_id,
             moderator_user.name AS moderator_name,
             checker_user.name AS checked_by_name,
             approver_user.name AS approved_by_name,
             ba.account_number, ba.bank_name, ba.account_holder, ba.ifsc, ba.is_flagged
      FROM withdraw_requests wr
      JOIN users u ON wr.user_id = u.id
      LEFT JOIN users moderator_user ON moderator_user.id = u.moderator_id
      LEFT JOIN users checker_user ON checker_user.id = wr.checked_by
      LEFT JOIN users approver_user ON approver_user.id = wr.approved_by
      LEFT JOIN bank_accounts ba ON wr.bank_id = ba.id
      ${whereClause}
    `;

    const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as countTable`;
    const [countResult] = await pool.query(countQuery, params);

    const query = `${baseQuery} ORDER BY wr.created_at DESC LIMIT ? OFFSET ?`;
    const queryWithPagination = [...params, limit, offset];

    const [withdrawals] = await pool.query(query, queryWithPagination);

    res.json({
      withdrawals,
      pagination: {
        page,
        limit,
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit),
      }
    });
  } catch (error) {
    next(error);
  }
};
