const pool = require('../config/database');
const { clampPagination } = require('../utils/pagination');

exports.getProfile = async (req, res, next) => {
  try {
    const [users] = await pool.query('SELECT default_bank_account_id FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    const [wallets] = await pool.query('SELECT balance, bonus_balance FROM wallets WHERE user_id = ?', [req.user.id]);
    const wallet = wallets[0] || { balance: 0, bonus_balance: 0 };

    // Calculate exposure (sum of pending bets)
    const [exposureResult] = await pool.query(
      'SELECT COALESCE(SUM(total_amount), 0) as exposure FROM bets WHERE user_id = ? AND status = ?',
      [req.user.id, 'pending']
    );

    const exposure = parseFloat(exposureResult[0].exposure);

    res.json({
      user: {
        id: req.user.id,
        name: req.user.name,
        phone: req.user.phone,
        role: req.user.role,
        referral_code: req.user.referral_code,
        default_bank_account_id: users[0]?.default_bank_account_id || null,
        created_at: req.user.created_at,
      },
      wallet: {
        balance: parseFloat(wallet.balance),
        bonus_balance: parseFloat(wallet.bonus_balance),
        exposure,
        available_withdrawal: parseFloat(wallet.balance),
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getBankAccounts = async (req, res, next) => {
  try {
    const [accounts] = await pool.query(
      `SELECT ba.id,
              ba.account_number,
              ba.ifsc,
              ba.bank_name,
              ba.account_holder,
              ba.created_at,
              CASE WHEN u.default_bank_account_id = ba.id THEN 1 ELSE 0 END AS is_default
       FROM bank_accounts ba
       JOIN users u ON u.id = ba.user_id
       WHERE ba.user_id = ?`,
      [req.user.id]
    );
    res.json({ accounts });
  } catch (error) {
    next(error);
  }
};

exports.addBankAccount = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { account_number, ifsc, bank_name, account_holder } = req.body;

    if (!account_number || !ifsc || !bank_name || !account_holder) {
      return res.status(400).json({ error: 'All bank details are required.' });
    }

    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.toUpperCase())) {
      return res.status(400).json({ error: 'Invalid IFSC code format.' });
    }

    await conn.beginTransaction();

    // Fraud check: same bank account used by another user
    const [existingAccounts] = await conn.query(
      'SELECT user_id FROM bank_accounts WHERE account_number = ? AND user_id != ?',
      [account_number, req.user.id]
    );

    let isFlagged = false;
    let flagReason = null;

    if (existingAccounts.length > 0) {
      isFlagged = true;
      flagReason = `Account number used by user IDs: ${existingAccounts.map(a => a.user_id).join(', ')}`;
    }

    const [result] = await conn.query(
      'INSERT INTO bank_accounts (user_id, account_number, ifsc, bank_name, account_holder, is_flagged, flag_reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, account_number, ifsc.toUpperCase(), bank_name, account_holder, isFlagged ? 1 : 0, flagReason]
    );

    const [users] = await conn.query('SELECT default_bank_account_id FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    if (!users[0]?.default_bank_account_id) {
      await conn.query('UPDATE users SET default_bank_account_id = ? WHERE id = ?', [result.insertId, req.user.id]);
    }

    await conn.commit();

    res.status(201).json({
      message: isFlagged ? 'Bank account added but flagged for review.' : 'Bank account added successfully.',
      account: { id: result.insertId, account_number, ifsc: ifsc.toUpperCase(), bank_name, account_holder },
      flagged: isFlagged
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

exports.updateBankAccount = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { account_number, ifsc, bank_name, account_holder } = req.body;

    if (!account_number || !ifsc || !bank_name || !account_holder) {
      return res.status(400).json({ error: 'All bank details are required.' });
    }

    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(ifsc).toUpperCase())) {
      return res.status(400).json({ error: 'Invalid IFSC code format.' });
    }

    const [existingAccounts] = await pool.query(
      'SELECT id FROM bank_accounts WHERE id = ? AND user_id = ? LIMIT 1',
      [id, req.user.id]
    );

    if (existingAccounts.length === 0) {
      return res.status(404).json({ error: 'Bank account not found.' });
    }

    const [crossUserMatch] = await pool.query(
      'SELECT user_id FROM bank_accounts WHERE account_number = ? AND user_id != ? LIMIT 1',
      [account_number, req.user.id]
    );

    const isFlagged = crossUserMatch.length > 0;
    const flagReason = isFlagged
      ? `Account number used by user IDs: ${crossUserMatch.map((row) => row.user_id).join(', ')}`
      : null;

    await pool.query(
      `UPDATE bank_accounts
       SET account_number = ?, ifsc = ?, bank_name = ?, account_holder = ?, is_flagged = ?, flag_reason = ?
       WHERE id = ? AND user_id = ?`,
      [account_number, String(ifsc).toUpperCase(), bank_name, account_holder, isFlagged ? 1 : 0, flagReason, id, req.user.id]
    );

    res.json({
      message: 'Bank account updated successfully.',
      account: {
        id: Number(id),
        account_number,
        ifsc: String(ifsc).toUpperCase(),
        bank_name,
        account_holder,
      },
      flagged: isFlagged,
    });
  } catch (error) {
    next(error);
  }
};

exports.deleteBankAccount = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    await conn.beginTransaction();

    await conn.query(
      'UPDATE users SET default_bank_account_id = NULL WHERE id = ? AND default_bank_account_id = ?',
      [req.user.id, id]
    );

    const [result] = await conn.query(
      'DELETE FROM bank_accounts WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Bank account not found.' });
    }

    const [users] = await conn.query('SELECT default_bank_account_id FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    if (!users[0]?.default_bank_account_id) {
      const [firstAccount] = await conn.query('SELECT id FROM bank_accounts WHERE user_id = ? ORDER BY created_at ASC LIMIT 1', [req.user.id]);
      if (firstAccount.length > 0) {
        await conn.query('UPDATE users SET default_bank_account_id = ? WHERE id = ?', [firstAccount[0].id, req.user.id]);
      }
    }

    await conn.commit();

    res.json({ message: 'Bank account deleted.' });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

exports.setDefaultBankAccount = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [accounts] = await pool.query(
      'SELECT id FROM bank_accounts WHERE id = ? AND user_id = ? LIMIT 1',
      [id, req.user.id]
    );

    if (accounts.length === 0) {
      return res.status(404).json({ error: 'Bank account not found.' });
    }

    await pool.query('UPDATE users SET default_bank_account_id = ? WHERE id = ?', [id, req.user.id]);
    res.json({ message: 'Default bank account updated.', default_bank_account_id: Number(id) });
  } catch (error) {
    next(error);
  }
};

exports.getAccountStatement = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const { page, limit, offset } = clampPagination(req.query);

    let query = 'SELECT * FROM wallet_transactions WHERE user_id = ?';
    const params = [req.user.id];

    if (from) {
      query += ' AND created_at >= ?';
      params.push(from);
    }
    if (to) {
      query += ' AND created_at <= ?';
      params.push(to + ' 23:59:59');
    }

    // Count total
    const [countResult] = await pool.query(query.replace('SELECT *', 'SELECT COUNT(*) as total'), params);
    const total = countResult[0].total;

    query += ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [transactions] = await pool.query(query, params);

    res.json({
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getProfitLoss = async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const { page, limit, offset } = clampPagination(req.query);

    let query = `
      SELECT b.id, b.type as event_type, g.name as event, b.total_amount, b.win_amount,
             (b.win_amount - b.total_amount) as profit_loss, b.status, b.created_at
      FROM bets b
      JOIN games g ON b.game_id = g.id
      WHERE b.user_id = ? AND b.status != 'pending'
    `;
    const params = [req.user.id];

    if (from) {
      query += ' AND b.created_at >= ?';
      params.push(from);
    }
    if (to) {
      query += ' AND b.created_at <= ?';
      params.push(to + ' 23:59:59');
    }

    const countQuery = `SELECT COUNT(*) as total FROM (${query}) as countTable`;
    const [countResult] = await pool.query(countQuery, params);
    const total = countResult[0].total;

    query += ' ORDER BY b.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [records] = await pool.query(query, params);

    res.json({
      records,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getUiConfig = async (req, res, next) => {
  try {
    const [settings] = await pool.query(
      `SELECT setting_key, setting_value
       FROM settings
       WHERE setting_key IN (
         'min_deposit',
         'max_deposit',
         'min_withdraw',
         'max_withdraw_time_minutes',
         'first_deposit_bonus_percent',
         'referral_bonus'
       )`
    );

    const settingsMap = settings.reduce((accumulator, item) => {
      accumulator[item.setting_key] = item.setting_value;
      return accumulator;
    }, {});

    const minDeposit = Number(settingsMap.min_deposit || 100);
    const maxDeposit = Number(settingsMap.max_deposit || 50000);
    const minWithdraw = Number(settingsMap.min_withdraw || 200);
    const maxWithdrawTimeMinutes = Number(settingsMap.max_withdraw_time_minutes || 45);
    const firstDepositBonusPercent = Number(settingsMap.first_deposit_bonus_percent || 0);
    const referralBonus = Number(settingsMap.referral_bonus || 0);

    res.json({
      settings: {
        min_deposit: minDeposit,
        max_deposit: maxDeposit,
        min_withdraw: minWithdraw,
        max_withdraw_time_minutes: maxWithdrawTimeMinutes,
        first_deposit_bonus_percent: firstDepositBonusPercent,
        referral_bonus: referralBonus,
      },
      deposit_guidelines: [
        `Minimum deposit amount is Rs ${minDeposit}.`,
        `Maximum deposit amount is Rs ${maxDeposit.toLocaleString('en-IN')}.`,
        'Enter the deposit amount and pay via UPI to the given ID.',
        'Send the exact amount shown on screen.',
        'Your deposit will be automatically detected and credited.',
        'Do not close the page while waiting for confirmation.',
      ],
      withdraw_guidelines: [
        `Minimum withdrawal amount is Rs ${minWithdraw}.`,
        'Withdrawals are processed from the main wallet only.',
        'Bonus wallet balance cannot be withdrawn directly.',
        'Use only your own verified bank account to avoid account review.',
        `Expected withdrawal processing time is up to ${maxWithdrawTimeMinutes} minutes.`,
      ],
    });
  } catch (error) {
    next(error);
  }
};
