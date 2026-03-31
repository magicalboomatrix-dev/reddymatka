/**
 * Auto Deposit Controller
 * Handles user deposit order creation, admin monitoring, and order management.
 */

const pool = require('../config/database');
const crypto = require('crypto');
const { ORDER_EXPIRY_MINUTES, getDepositLimits, expirePendingOrders } = require('../services/auto-deposit-matcher');
const { resolveUpiForUser } = require('../services/upi-resolver');
const { buildUpiLink, generateQrDataUri } = require('../services/qr-generator');
const { clampPagination } = require('../utils/pagination');

/**
 * Generate a short unique order reference (e.g., "RM7X3K9P")
 */
function generateOrderRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion
  let ref = 'RM';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    ref += chars[bytes[i] % chars.length];
  }
  return ref;
}

/**
 * Add random paise (01-99) to make the payment amount unique.
 * Also ensures no other pending order has the same pay_amount.
 */
async function generateUniquePayAmount(baseAmount) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const paise = Math.floor(Math.random() * 99) + 1; // 1-99
    const payAmount = parseFloat((Math.floor(baseAmount) + paise / 100).toFixed(2));
    const [existing] = await pool.query(
      "SELECT id FROM pending_deposit_orders WHERE pay_amount = ? AND status = 'pending' AND expires_at > NOW() LIMIT 1",
      [payAmount]
    );
    if (existing.length === 0) return payAmount;
  }
  // Fallback: use base amount (rare edge case)
  return parseFloat(parseFloat(baseAmount).toFixed(2));
}

/**
 * POST /api/auto-deposit/order
 * User creates a pending deposit order (just amount, no UTR needed)
 */
exports.createDepositOrder = async (req, res, next) => {
  try {
    const { amount } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required.' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number.' });
    }

    const { minDeposit, maxDeposit } = await getDepositLimits();

    if (parsedAmount < minDeposit) {
      return res.status(400).json({ error: `Minimum deposit is ₹${minDeposit}.` });
    }

    if (parsedAmount > maxDeposit) {
      return res.status(400).json({ error: `Maximum deposit is ₹${maxDeposit}.` });
    }

    // Check if this user already has an active pending order for the same base amount
    const [existingOrders] = await pool.query(
      `SELECT id, amount, pay_amount, order_ref, created_at, expires_at
       FROM pending_deposit_orders
       WHERE user_id = ? AND status = 'pending' AND amount = ? AND expires_at > NOW()
       LIMIT 1`,
      [req.user.id, parsedAmount]
    );

    if (existingOrders.length > 0) {
      return res.status(409).json({
        error: 'You already have a pending deposit order for this amount.',
        existing_order: {
          id: existingOrders[0].id,
          amount: parseFloat(existingOrders[0].amount),
          created_at: existingOrders[0].created_at,
          expires_at: existingOrders[0].expires_at,
        },
      });
    }

    // Limit total active orders per user (prevent abuse)
    const [activeOrders] = await pool.query(
      "SELECT COUNT(*) as count FROM pending_deposit_orders WHERE user_id = ? AND status = 'pending' AND expires_at > NOW()",
      [req.user.id]
    );

    if (activeOrders[0].count >= 3) {
      return res.status(429).json({ error: 'Too many pending deposit orders. Please wait for existing orders to process or expire.' });
    }

    // Resolve UPI ID from moderator or admin
    const upiInfo = await resolveUpiForUser(req.user.id);
    if (!upiInfo) {
      return res.status(503).json({ error: 'No payment UPI is currently available. Please try again later.' });
    }

    const { upiId, payeeName } = upiInfo;

    // Create the order with unique ref and pay amount
    const orderRef = generateOrderRef();
    const payAmount = await generateUniquePayAmount(parsedAmount);
    const expiresAt = new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60 * 1000);
    const [result] = await pool.query(
      'INSERT INTO pending_deposit_orders (user_id, amount, order_ref, pay_amount, expires_at) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, parsedAmount, orderRef, payAmount, expiresAt]
    );

    // Build UPI payment link with reference in transaction note
    const upiLink = buildUpiLink({ upiId, payeeName, amount: payAmount, orderRef });
    const qrDataUri = await generateQrDataUri(upiLink);

    res.status(201).json({
      message: 'Deposit order created. Please complete UPI payment within 10 minutes.',
      order: {
        id: result.insertId,
        amount: parsedAmount,
        pay_amount: payAmount,
        order_ref: orderRef,
        expires_at: expiresAt.toISOString(),
        expires_in_seconds: ORDER_EXPIRY_MINUTES * 60,
      },
      payment_details: {
        upi_id: upiId,
        payee_name: payeeName,
        amount: payAmount,
        order_ref: orderRef,
        upi_link: upiLink,
        qr_code: qrDataUri,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auto-deposit/order/status/:id
 * User checks status of their deposit order
 */
exports.getOrderStatus = async (req, res, next) => {
  try {
    const { id } = req.params;

    const [orders] = await pool.query(
      `SELECT pdo.id, pdo.amount, pdo.pay_amount, pdo.order_ref, pdo.status, pdo.matched_deposit_id, pdo.created_at, pdo.expires_at,
              d.utr_number, d.status as deposit_status
       FROM pending_deposit_orders pdo
       LEFT JOIN deposits d ON d.id = pdo.matched_deposit_id
       WHERE pdo.id = ? AND pdo.user_id = ?`,
      [id, req.user.id]
    );

    if (orders.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = orders[0];
    const now = new Date();
    const expiresAt = new Date(order.expires_at);
    const isExpired = order.status === 'pending' && expiresAt <= now;

    // If expired but not yet updated, mark it
    if (isExpired) {
      await pool.query("UPDATE pending_deposit_orders SET status = 'expired' WHERE id = ? AND status = 'pending'", [id]);
      order.status = 'expired';
    }

    res.json({
      order: {
        id: order.id,
        amount: parseFloat(order.amount),
        status: order.status,
        utr_number: order.utr_number || null,
        deposit_status: order.deposit_status || null,
        created_at: order.created_at,
        expires_at: order.expires_at,
        remaining_seconds: order.status === 'pending' ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : 0,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auto-deposit/orders
 * User gets their deposit order history
 */
exports.getMyOrders = async (req, res, next) => {
  try {
    const { page, limit, offset } = clampPagination(req.query);

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM pending_deposit_orders WHERE user_id = ?',
      [req.user.id]
    );

    const [orders] = await pool.query(
      `SELECT pdo.id, pdo.amount, pdo.pay_amount, pdo.order_ref, pdo.status, pdo.matched_deposit_id,
              pdo.created_at, pdo.expires_at,
              d.utr_number
       FROM pending_deposit_orders pdo
       LEFT JOIN deposits d ON d.id = pdo.matched_deposit_id
       WHERE pdo.user_id = ?
       ORDER BY pdo.created_at DESC
       LIMIT ? OFFSET ?`,
      [req.user.id, limit, offset]
    );

    // Resolve UPI for pending order enrichment
    const upiInfo = await resolveUpiForUser(req.user.id);
    const enrichedOrders = await Promise.all(orders.map(async (order) => {
      const o = { ...order };
      if (order.status === 'pending' && order.pay_amount && order.order_ref && upiInfo) {
        const payAmount = parseFloat(order.pay_amount);
        const upiLink = buildUpiLink({ upiId: upiInfo.upiId, payeeName: upiInfo.payeeName, amount: payAmount, orderRef: order.order_ref });
        o.upi_id = upiInfo.upiId;
        o.payee_name = upiInfo.payeeName;
        o.upi_link = upiLink;
        o.qr_code = await generateQrDataUri(upiLink);
      }
      return o;
    }));

    res.json({
      orders: enrichedOrders,
      pagination: {
        page,
        limit,
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auto-deposit/order/:id/cancel
 * User cancels their pending deposit order
 */
exports.cancelOrder = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;

    await conn.beginTransaction();

    const [result] = await conn.query(
      "UPDATE pending_deposit_orders SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'pending'",
      [id, req.user.id]
    );

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order not found or already processed.' });
    }

    await conn.commit();
    res.json({ message: 'Deposit order cancelled.' });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

// ========== ADMIN ENDPOINTS ==========

/**
 * GET /api/auto-deposit/admin/webhook-transactions
 * Admin views all incoming webhook transactions
 */
exports.getWebhookTransactions = async (req, res, next) => {
  try {
    const { status } = req.query;
    const { page, limit, offset } = clampPagination(req.query);

    let whereClause = '';
    const params = [];

    if (status) {
      whereClause = 'WHERE uwt.status = ?';
      params.push(status);
    }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM upi_webhook_transactions uwt ${whereClause}`,
      params
    );

    const [transactions] = await pool.query(
      `SELECT uwt.id, uwt.amount, uwt.reference_number, uwt.payer_name, uwt.txn_time,
              uwt.status, uwt.error_message, uwt.matched_order_id, uwt.matched_deposit_id,
              uwt.created_at,
              u.name as matched_user_name, u.phone as matched_user_phone
       FROM upi_webhook_transactions uwt
       LEFT JOIN pending_deposit_orders pdo ON pdo.id = uwt.matched_order_id
       LEFT JOIN users u ON u.id = pdo.user_id
       ${whereClause}
       ORDER BY uwt.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    res.json({
      transactions,
      pagination: {
        page,
        limit,
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auto-deposit/admin/pending-orders
 * Admin views all pending deposit orders
 */
exports.getPendingOrders = async (req, res, next) => {
  try {
    const { status = 'pending' } = req.query;
    const { page, limit, offset } = clampPagination(req.query);

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM pending_deposit_orders WHERE status = ?',
      [status]
    );

    const [orders] = await pool.query(
      `SELECT pdo.id, pdo.user_id, pdo.amount, pdo.status, pdo.matched_deposit_id,
              pdo.created_at, pdo.expires_at,
              u.name as user_name, u.phone as user_phone
       FROM pending_deposit_orders pdo
       JOIN users u ON u.id = pdo.user_id
       WHERE pdo.status = ?
       ORDER BY pdo.created_at DESC
       LIMIT ? OFFSET ?`,
      [status, limit, offset]
    );

    res.json({
      orders,
      pagination: {
        page,
        limit,
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auto-deposit/admin/logs
 * Admin views auto deposit audit logs
 */
exports.getAutoDepositLogs = async (req, res, next) => {
  try {
    const { page, limit, offset } = clampPagination(req.query);

    const [countResult] = await pool.query('SELECT COUNT(*) as total FROM auto_deposit_logs');

    const [logs] = await pool.query(
      `SELECT adl.*, u.name as user_name, u.phone as user_phone
       FROM auto_deposit_logs adl
       LEFT JOIN users u ON u.id = adl.user_id
       ORDER BY adl.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    res.json({
      logs,
      pagination: {
        page,
        limit,
        total: countResult[0].total,
        totalPages: Math.ceil(countResult[0].total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auto-deposit/admin/stats
 * Admin dashboard stats for auto deposits
 */
exports.getStats = async (req, res, next) => {
  try {
    const [stats] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM pending_deposit_orders WHERE status = 'pending' AND expires_at > NOW()) as active_orders,
        (SELECT COUNT(*) FROM pending_deposit_orders WHERE status = 'matched' AND DATE(created_at) = CURDATE()) as matched_today,
        (SELECT COUNT(*) FROM pending_deposit_orders WHERE status = 'expired' AND DATE(created_at) = CURDATE()) as expired_today,
        (SELECT COALESCE(SUM(amount), 0) FROM pending_deposit_orders WHERE status = 'matched' AND DATE(created_at) = CURDATE()) as matched_amount_today,
        (SELECT COUNT(*) FROM upi_webhook_transactions WHERE DATE(created_at) = CURDATE()) as webhook_messages_today,
        (SELECT COUNT(*) FROM upi_webhook_transactions WHERE status = 'matched' AND DATE(created_at) = CURDATE()) as webhook_matched_today,
        (SELECT COUNT(*) FROM upi_webhook_transactions WHERE status = 'unmatched' AND DATE(created_at) = CURDATE()) as webhook_unmatched_today,
        (SELECT COUNT(*) FROM upi_webhook_transactions WHERE status = 'duplicate' AND DATE(created_at) = CURDATE()) as webhook_duplicate_today
    `);

    res.json(stats[0]);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auto-deposit/admin/expire-orders
 * Admin manually triggers order expiry cleanup
 */
exports.triggerExpireOrders = async (req, res, next) => {
  try {
    const expired = await expirePendingOrders();
    res.json({ message: `Expired ${expired} stale orders.`, expired_count: expired });
  } catch (error) {
    next(error);
  }
};
