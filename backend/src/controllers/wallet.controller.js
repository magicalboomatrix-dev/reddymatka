const pool = require('../config/database');

exports.getWalletInfo = async (req, res, next) => {
  try {
    const [wallets] = await pool.query('SELECT balance, bonus_balance FROM wallets WHERE user_id = ?', [req.user.id]);
    const wallet = wallets[0] || { balance: 0, bonus_balance: 0 };

    const [exposureResult] = await pool.query(
      'SELECT COALESCE(SUM(total_amount), 0) as exposure FROM bets WHERE user_id = ? AND status = ?',
      [req.user.id, 'pending']
    );

    const exposure = parseFloat(exposureResult[0].exposure);
    const balance = parseFloat(wallet.balance);
    const bonusBalance = parseFloat(wallet.bonus_balance);

    res.json({
      balance,
      bonus_balance: bonusBalance,
      exposure,
      available_withdrawal: balance,
      total: balance + bonusBalance,
    });
  } catch (error) {
    next(error);
  }
};
