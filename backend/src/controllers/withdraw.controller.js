const pool = require('../config/database');
const { recordWalletTransaction } = require('../utils/wallet-ledger');
const { clampPagination } = require('../utils/pagination');

exports.requestWithdraw = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { bank_id, bank_account_id, amount } = req.body;
    let resolvedBankId = bank_id || bank_account_id;

    if (!resolvedBankId) {
      const [users] = await conn.query('SELECT default_bank_account_id FROM users WHERE id = ? LIMIT 1', [req.user.id]);
      resolvedBankId = users[0]?.default_bank_account_id || null;
    }

    if (!resolvedBankId || !amount) {
      return res.status(400).json({ error: 'Bank account and amount are required.' });
    }

    const parsedAmount = parseFloat(amount);
    if (parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive.' });
    }

    // Check min withdrawal
    const [settings] = await pool.query("SELECT setting_value FROM settings WHERE setting_key = 'min_withdraw'");
    const minWithdraw = settings.length > 0 ? parseFloat(settings[0].setting_value) : 200;
    if (parsedAmount < minWithdraw) {
      return res.status(400).json({ error: `Minimum withdrawal is ₹${minWithdraw}.` });
    }

    await conn.beginTransaction();

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

    // Check available balance (bet amounts are already deducted at placement)
    const [wallets] = await conn.query('SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE', [req.user.id]);
    const balance = parseFloat(wallets[0].balance);

    // Pending withdrawals are already deducted from wallet balance at request time.
    const availableWithdrawal = balance;

    if (parsedAmount > availableWithdrawal) {
      await conn.rollback();
      return res.status(400).json({
        error: `Insufficient available balance. Available: ₹${availableWithdrawal.toFixed(2)}`
      });
    }

    // Create withdraw request
    const [result] = await conn.query(
      'INSERT INTO withdraw_requests (user_id, bank_id, amount) VALUES (?, ?, ?)',
      [req.user.id, resolvedBankId, parsedAmount]
    );

    const newBalance = await recordWalletTransaction(conn, {
      userId: req.user.id,
      type: 'withdraw',
      amount: -parsedAmount,
      status: 'pending',
      referenceType: 'withdraw',
      referenceId: `withdraw_${result.insertId}`,
      remark: 'Withdrawal request',
    });

    await conn.commit();

    res.status(201).json({
      message: 'Withdrawal request submitted.',
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
      SELECT wr.*, ba.account_number, ba.bank_name, ba.account_holder
      FROM withdraw_requests wr
      JOIN bank_accounts ba ON wr.bank_id = ba.id
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

exports.approveWithdraw = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;

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
      return res.status(404).json({ error: 'Withdrawal request not found or already processed.' });
    }

    await conn.query('UPDATE withdraw_requests SET status = ?, approved_by = ? WHERE id = ?',
      ['approved', req.user.id, id]);

    // Update wallet transaction status
    await conn.query("UPDATE wallet_transactions SET status = 'completed' WHERE reference_id = ?",
      [`withdraw_${id}`]);

    // Notification
    await conn.query('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)',
      [requests[0].user_id, 'withdraw', `Your withdrawal of ₹${requests[0].amount} has been approved.`]);

    await conn.commit();
    res.json({ message: 'Withdrawal approved.' });
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
      return res.status(404).json({ error: 'Withdrawal request not found or already processed.' });
    }

    // Refund to wallet
    await conn.query('UPDATE withdraw_requests SET status = ?, reject_reason = ?, approved_by = ? WHERE id = ?',
      ['rejected', reason || 'Rejected', req.user.id, id]);

    // Update wallet transaction
    await conn.query("UPDATE wallet_transactions SET status = 'failed' WHERE reference_id = ?",
      [`withdraw_${id}`]);

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
    const { status } = req.query;
    const { page, limit, offset } = clampPagination(req.query);

    let query = `
      SELECT wr.*, u.name as user_name, u.phone as user_phone,
             ba.account_number, ba.bank_name, ba.account_holder, ba.ifsc, ba.is_flagged
      FROM withdraw_requests wr
      JOIN users u ON wr.user_id = u.id
      JOIN bank_accounts ba ON wr.bank_id = ba.id
    `;
    const params = [];

    if (req.user.role === 'moderator') {
      query += ' WHERE wr.user_id IN (SELECT id FROM users WHERE moderator_id = ? AND is_deleted = 0)';
      params.push(req.user.id);
      if (status) {
        query += ' AND wr.status = ?';
        params.push(status);
      }
    } else if (status) {
      query += ' WHERE wr.status = ?';
      params.push(status);
    }

    const countQuery = `SELECT COUNT(*) as total FROM (${query}) as countTable`;
    const [countResult] = await pool.query(countQuery, params);

    query += ' ORDER BY wr.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [withdrawals] = await pool.query(query, params);

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
