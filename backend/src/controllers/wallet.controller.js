const pool = require('../config/database');

exports.getWalletInfo = async (req, res, next) => {
  try {
    const [wallets] = await pool.query('SELECT balance, bonus_balance FROM wallets WHERE user_id = ?', [req.user.id]);
    const wallet = wallets[0] || { balance: 0, bonus_balance: 0 };

    const [[exposureResult], [pendingWithdrawalResult]] = await Promise.all([
      pool.query(
        'SELECT COALESCE(SUM(total_amount), 0) as exposure FROM bets WHERE user_id = ? AND status = ?',
        [req.user.id, 'pending']
      ),
      pool.query(
        "SELECT COUNT(*) AS pending_count, COALESCE(SUM(amount), 0) AS pending_amount FROM withdraw_requests WHERE user_id = ? AND status = 'pending'",
        [req.user.id]
      ),
    ]);

    const exposure = parseFloat(exposureResult[0].exposure);
    const balance = parseFloat(wallet.balance);
    const bonusBalance = parseFloat(wallet.bonus_balance);
    const pendingWithdrawalCount = Number(pendingWithdrawalResult[0].pending_count || 0);
    const pendingWithdrawalAmount = parseFloat(pendingWithdrawalResult[0].pending_amount || 0);

    res.json({
      balance,
      bonus_balance: bonusBalance,
      exposure,
      available_withdrawal: balance,
      pending_withdrawal_count: pendingWithdrawalCount,
      pending_withdrawal_amount: pendingWithdrawalAmount,
      betting_locked: false,
      total: balance + bonusBalance,
    });
  } catch (error) {
    next(error);
  }
};
