/**
 * Auto Deposit Controller
 * Handles user deposit order creation, admin monitoring, and order management.
 */

const pool = require('../config/database');
const crypto = require('crypto');
const {
  ORDER_EXPIRY_MINUTES,
  LATE_MATCH_GRACE_MINUTES,
  getDepositLimits,
  expirePendingOrders,
  applyDepositBonuses,
} = require('../services/auto-deposit-matcher');
const { resolveUpiForUser } = require('../services/upi-resolver');
const { buildUpiLink, verifyQrLaunchToken, generateQrDataUri } = require('../services/qr-generator');
const { clampPagination } = require('../utils/pagination');
const { recordWalletTransaction } = require('../utils/wallet-ledger');
const eventBus = require('../utils/event-bus');

function getDepositPageUrl() {
  const frontendBase = process.env.FRONTEND_URL?.split(',')[0]?.trim();
  if (!frontendBase) {
    return '/deposit';
  }
  return `${frontendBase.replace(/\/$/, '')}/deposit`;
}

async function buildQrPayload({ orderId, orderRef, upiId, payeeName, payAmount, expiresAt }) {
  const upiLink = buildUpiLink({ upiId, payeeName, amount: payAmount, orderRef });
  const qrDataUri = await generateQrDataUri(upiLink);
  const downloadQrUrl = upiLink;
  const downloadQrDataUri = qrDataUri;

  return {
    upiLink,
    qrDataUri,
    downloadQrUrl,
    downloadQrDataUri,
  };
}

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
  for (let attempt = 0; attempt < 20; attempt++) {
    const paise = Math.floor(Math.random() * 99) + 1; // 1-99
    const payAmount = parseFloat((Math.floor(baseAmount) + paise / 100).toFixed(2));
    const [existing] = await pool.query(
      `SELECT id
       FROM pending_deposit_orders
       WHERE pay_amount = ?
         AND (
           (status = 'pending' AND expires_at > NOW())
           OR
           (status = 'expired' AND expires_at > DATE_SUB(NOW(), INTERVAL ? MINUTE))
         )
       LIMIT 1`,
      [payAmount, LATE_MATCH_GRACE_MINUTES]
    );
    if (existing.length === 0) return payAmount;
  }
  // All 99 paise slots are occupied across active + late-matchable recent orders.
  // Reject rather than reusing an amount that could cause a wrong credit.
  throw new Error('Unable to generate unique payment amount right now. Please wait a few minutes and try again.');
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

    // Get user details and moderator assignment for event
    const [userRows] = await pool.query('SELECT name, phone, moderator_id FROM users WHERE id = ?', [req.user.id]);
    const user = userRows[0] || {};

    // Emit real-time event
    eventBus.emit('deposit_order_created', {
      orderId: result.insertId,
      userId: req.user.id,
      amount: parsedAmount,
      payAmount,
      userName: user.name,
      userPhone: user.phone,
      moderatorId: user.moderator_id,
    });

    // Build UPI payment link with reference in transaction note
    const { upiLink, qrDataUri, downloadQrUrl, downloadQrDataUri } = await buildQrPayload({
      orderId: result.insertId,
      orderRef,
      upiId,
      payeeName,
      payAmount,
      expiresAt,
    });

    res.status(201).json({
      message: `Deposit order created. Please complete UPI payment within ${ORDER_EXPIRY_MINUTES} minutes.`,
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
        download_qr_url: downloadQrUrl,
        download_qr_code: downloadQrDataUri,
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
        const { upiLink, qrDataUri, downloadQrUrl, downloadQrDataUri } = await buildQrPayload({
          orderId: order.id,
          orderRef: order.order_ref,
          upiId: upiInfo.upiId,
          payeeName: upiInfo.payeeName,
          payAmount,
          expiresAt: order.expires_at,
        });
        o.upi_id = upiInfo.upiId;
        o.payee_name = upiInfo.payeeName;
        o.upi_link = upiLink;
        o.qr_code = qrDataUri;
        o.download_qr_url = downloadQrUrl;
        o.download_qr_code = downloadQrDataUri;
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

exports.openProtectedQr = async (req, res, next) => {
  try {
    const payload = verifyQrLaunchToken(req.params.token);
    const depositUrl = getDepositPageUrl();

    if (!payload?.oid || !payload?.ref || !payload?.upi || !payload?.amt || !payload?.exp) {
      return res.redirect(302, depositUrl);
    }

    const payloadAmount = Number.parseFloat(payload.amt);

    if (!Number.isFinite(payloadAmount) || payloadAmount <= 0) {
      return res.redirect(302, depositUrl);
    }

    const upiLink = buildUpiLink({
      upiId: payload.upi,
      payeeName: payload.pn || '',
      amount: payloadAmount,
      orderRef: payload.ref,
    });

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.redirect(302, upiLink);
  } catch (error) {
    next(error);
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
              CASE WHEN uwt.status IN ('parse_error','unmatched') THEN uwt.raw_message ELSE NULL END as raw_message,
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
      `SELECT pdo.id, pdo.user_id, pdo.amount, pdo.pay_amount, pdo.status, pdo.matched_deposit_id,
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
        (SELECT COUNT(*) FROM upi_webhook_transactions WHERE status = 'duplicate' AND DATE(created_at) = CURDATE()) as webhook_duplicate_today,
        (SELECT COUNT(*) FROM pending_deposit_orders WHERE status = 'pending') as pending_orders,
        (SELECT COUNT(*) FROM pending_deposit_orders WHERE status = 'matched') as matched_orders,
        (SELECT COUNT(*) FROM pending_deposit_orders WHERE status = 'expired') as expired_orders,
        (SELECT COUNT(*) FROM pending_deposit_orders WHERE status = 'cancelled') as cancelled_orders
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
/**
 * POST /api/auto-deposit/admin/orders/:id/cancel
 * Admin cancels any pending deposit order on behalf of the user.
 */
exports.adminCancelOrder = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const adminId = req.user.id;

    await conn.beginTransaction();

    const [rows] = await conn.query(
      "SELECT id, user_id, amount, status FROM pending_deposit_orders WHERE id = ? LIMIT 1 FOR UPDATE",
      [id]
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order not found.' });
    }

    if (rows[0].status !== 'pending') {
      await conn.rollback();
      return res.status(409).json({ error: `Order is already ${rows[0].status} and cannot be cancelled.` });
    }

    await conn.query(
      "UPDATE pending_deposit_orders SET status = 'cancelled' WHERE id = ?",
      [id]
    );

    await conn.query(
      `INSERT INTO auto_deposit_logs (order_id, user_id, action, details)
       VALUES (?, ?, 'admin_cancelled', ?)`,
      [id, rows[0].user_id, JSON.stringify({ admin_id: adminId, amount: rows[0].amount })]
    );

    // Get moderator ID for event
    const [userRows] = await conn.query('SELECT moderator_id FROM users WHERE id = ?', [rows[0].user_id]);
    const moderatorId = userRows[0]?.moderator_id;

    await conn.commit();

    // Emit real-time event
    eventBus.emit('deposit_order_cancelled', {
      orderId: id,
      userId: rows[0].user_id,
      amount: rows[0].amount,
      cancelledBy: adminId,
      moderatorId,
    });

    res.json({ message: 'Order cancelled successfully.' });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

/**
 * POST /api/auto-deposit/admin/orders/:id/credit
 * Admin manually credits a pending deposit order when auto-match failed.
 */
exports.adminCreditOrder = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { utr_number } = req.body;
    const adminId = req.user.id;

    if (!utr_number || !String(utr_number).trim()) {
      return res.status(400).json({ error: 'UTR / reference number is required for manual credit.' });
    }

    const utr = String(utr_number).trim();

    await conn.beginTransaction();

    // Load order — allow crediting pending OR expired orders
    const [orders] = await conn.query(
      "SELECT id, user_id, amount, status FROM pending_deposit_orders WHERE id = ? AND status IN ('pending','expired') LIMIT 1 FOR UPDATE",
      [id]
    );

    if (orders.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order not found or already matched/cancelled.' });
    }

    const order = orders[0];
    const creditAmount = Math.round(parseFloat(order.amount) * 100) / 100;

    // Duplicate UTR guard
    const [dupUtr] = await conn.query(
      'SELECT id FROM deposits WHERE utr_number = ? LIMIT 1',
      [utr]
    );
    if (dupUtr.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'This UTR number has already been used.' });
    }

    // Idempotency: ensure order not already credited
    const [dupOrder] = await conn.query(
      "SELECT id FROM deposits WHERE order_id = ? LIMIT 1",
      [id]
    );
    if (dupOrder.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'This order has already been credited.' });
    }

    // Create deposit record
    const [depositResult] = await conn.query(
      `INSERT INTO deposits (user_id, amount, utr_number, order_id, status)
       VALUES (?, ?, ?, ?, 'completed')`,
      [order.user_id, creditAmount, utr, id]
    );
    const depositId = depositResult.insertId;

    // Credit wallet
    const newBalance = await recordWalletTransaction(conn, {
      userId: order.user_id,
      type: 'deposit',
      amount: creditAmount,
      referenceType: 'deposit',
      referenceId: `deposit_${depositId}`,
      remark: `Manual deposit credit by admin (UTR: ${utr})`,
    });

    // Apply bonuses
    await applyDepositBonuses(conn, { depositId, userId: order.user_id, amount: creditAmount });

    // Mark order as matched
    await conn.query(
      "UPDATE pending_deposit_orders SET status = 'matched', matched_deposit_id = ? WHERE id = ?",
      [depositId, id]
    );

    // Notify user
    await conn.query(
      'INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)',
      [order.user_id, 'deposit', `Your deposit of ₹${creditAmount} has been manually verified and credited by admin. UTR: ${utr}`]
    );

    // Audit log
    await conn.query(
      `INSERT INTO auto_deposit_logs (order_id, deposit_id, user_id, action, details)
       VALUES (?, ?, ?, 'admin_manual_credit', ?)`,
      [id, depositId, order.user_id, JSON.stringify({ admin_id: adminId, amount: creditAmount, utr, new_balance: newBalance })]
    );

    // Get moderator ID for event
    const [userRows] = await conn.query('SELECT moderator_id FROM users WHERE id = ?', [order.user_id]);
    const moderatorId = userRows[0]?.moderator_id;

    await conn.commit();

    // Emit real-time event
    eventBus.emit('deposit_order_credited', {
      orderId: id,
      depositId,
      userId: order.user_id,
      amount: creditAmount,
      utrNumber: utr,
      creditedBy: adminId,
      moderatorId,
    });

    res.json({ message: `₹${creditAmount} credited successfully.`, deposit_id: depositId, new_balance: newBalance });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

exports.triggerExpireOrders = async (req, res, next) => {
  try {
    const expired = await expirePendingOrders();
    res.json({ message: `Expired ${expired} stale orders.`, expired_count: expired });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/auto-deposit/admin/webhook-transactions/older-than-24h
 * Admin cleanup for old UPI webhook messages.
 */
exports.clearOldWebhookTransactions = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[{ total }]] = await conn.query(
      'SELECT COUNT(*) as total FROM upi_webhook_transactions WHERE created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)'
    );

    if (total === 0) {
      await conn.commit();
      return res.json({ message: 'No UPI messages older than 24 hours found.', deleted_count: 0 });
    }

    await conn.query(
      `UPDATE pending_deposit_orders
       SET matched_webhook_id = NULL
       WHERE matched_webhook_id IN (
         SELECT id FROM upi_webhook_transactions WHERE created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
       )`
    );
    await conn.query(
      `UPDATE deposits
       SET webhook_txn_id = NULL
       WHERE webhook_txn_id IN (
         SELECT id FROM upi_webhook_transactions WHERE created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
       )`
    );
    await conn.query(
      `UPDATE auto_deposit_logs
       SET webhook_txn_id = NULL
       WHERE webhook_txn_id IN (
         SELECT id FROM upi_webhook_transactions WHERE created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
       )`
    );

    const [deleteResult] = await conn.query(
      'DELETE FROM upi_webhook_transactions WHERE created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)'
    );

    await conn.commit();
    res.json({
      message: `Cleared ${deleteResult.affectedRows} UPI messages older than 24 hours.`,
      deleted_count: deleteResult.affectedRows,
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

/**
 * DELETE /api/auto-deposit/admin/closed-orders/older-than-24h
 * Admin cleanup for cancelled/expired deposit orders older than 24 hours.
 */
exports.clearOldClosedOrders = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[{ total }]] = await conn.query(
      `SELECT COUNT(*) as total
       FROM pending_deposit_orders
       WHERE status IN ('cancelled', 'expired')
         AND updated_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`
    );

    if (total === 0) {
      await conn.commit();
      return res.json({ message: 'No cancelled/expired orders older than 24 hours found.', deleted_count: 0 });
    }

    await conn.query(
      `UPDATE deposits
       SET order_id = NULL
       WHERE order_id IN (
         SELECT id
         FROM pending_deposit_orders
         WHERE status IN ('cancelled', 'expired')
           AND updated_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
       )`
    );
    await conn.query(
      `UPDATE auto_deposit_logs
       SET order_id = NULL
       WHERE order_id IN (
         SELECT id
         FROM pending_deposit_orders
         WHERE status IN ('cancelled', 'expired')
           AND updated_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
       )`
    );
    await conn.query(
      `UPDATE upi_webhook_transactions
       SET matched_order_id = NULL
       WHERE matched_order_id IN (
         SELECT id
         FROM pending_deposit_orders
         WHERE status IN ('cancelled', 'expired')
           AND updated_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
       )`
    );

    const [closedOrderDeleteResult] = await conn.query(
      `DELETE FROM pending_deposit_orders
       WHERE status IN ('cancelled', 'expired')
         AND updated_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)`
    );

    await conn.commit();
    res.json({
      message: `Cleared ${closedOrderDeleteResult.affectedRows} cancelled/expired orders older than 24 hours.`,
      deleted_count: closedOrderDeleteResult.affectedRows,
    });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

/**
 * DELETE /api/auto-deposit/admin/logs/older-than-24h
 * Admin cleanup for old auto-deposit audit logs.
 */
exports.clearOldAutoDepositLogs = async (req, res, next) => {
  try {
    const [result] = await pool.query(
      'DELETE FROM auto_deposit_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)'
    );

    res.json({
      message: result.affectedRows > 0
        ? `Cleared ${result.affectedRows} audit logs older than 24 hours.`
        : 'No audit logs older than 24 hours found.',
      deleted_count: result.affectedRows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auto-deposit/admin/search-utr/:utr
 * Search webhook transactions by UTR / reference number.
 */
exports.searchByUtr = async (req, res, next) => {
  try {
    const utr = String(req.params.utr || '').trim();
    if (!utr || utr.length < 6) {
      return res.status(400).json({ error: 'Please provide at least 6 characters of the UTR.' });
    }

    // Search webhook transactions
    const [webhookRows] = await pool.query(
      `SELECT uwt.id, uwt.reference_number, uwt.amount, uwt.payer_name, uwt.status,
              uwt.raw_message, uwt.matched_order_id, uwt.created_at,
              pdo.order_ref
       FROM upi_webhook_transactions uwt
       LEFT JOIN pending_deposit_orders pdo ON pdo.id = uwt.matched_order_id
       WHERE uwt.reference_number LIKE ?
       ORDER BY uwt.created_at DESC
       LIMIT 20`,
      [`%${utr}%`]
    );

    // Also search existing deposits
    const [depositRows] = await pool.query(
      `SELECT d.id, d.user_id, d.amount, d.utr_number, d.status, d.created_at, u.phone, u.username
       FROM deposits d
       LEFT JOIN users u ON u.id = d.user_id
       WHERE d.utr_number LIKE ?
       ORDER BY d.created_at DESC
       LIMIT 20`,
      [`%${utr}%`]
    );

    res.json({ webhook_transactions: webhookRows, deposits: depositRows });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auto-deposit/admin/credit-by-utr
 * Admin credits a user's wallet using an unmatched webhook transaction.
 * Body: { webhook_transaction_id, user_id }
 */
exports.creditByUtr = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { webhook_transaction_id, user_id } = req.body;
    const adminId = req.user.id;

    if (!webhook_transaction_id || !user_id) {
      return res.status(400).json({ error: 'webhook_transaction_id and user_id are required.' });
    }

    await conn.beginTransaction();

    // Load the webhook transaction
    const [txnRows] = await conn.query(
      `SELECT id, reference_number, amount, payer_name, status, matched_order_id
       FROM upi_webhook_transactions WHERE id = ? FOR UPDATE`,
      [webhook_transaction_id]
    );

    if (txnRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Webhook transaction not found.' });
    }

    const txn = txnRows[0];

    if (txn.status === 'matched') {
      await conn.rollback();
      return res.status(409).json({ error: 'This transaction has already been matched.' });
    }

    const creditAmount = Math.round(parseFloat(txn.amount) * 100) / 100;
    const utr = txn.reference_number;

    if (!creditAmount || creditAmount <= 0) {
      await conn.rollback();
      return res.status(400).json({ error: 'Transaction has invalid amount.' });
    }

    // Verify user exists
    const [userRows] = await conn.query('SELECT id FROM users WHERE id = ? LIMIT 1', [user_id]);
    if (userRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'User not found.' });
    }

    // Duplicate UTR guard
    const [dupUtr] = await conn.query('SELECT id FROM deposits WHERE utr_number = ? LIMIT 1', [utr]);
    if (dupUtr.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'This UTR has already been credited to a deposit.' });
    }

    // Create deposit record
    const [depositResult] = await conn.query(
      `INSERT INTO deposits (user_id, amount, utr_number, status)
       VALUES (?, ?, ?, 'completed')`,
      [user_id, creditAmount, utr]
    );
    const depositId = depositResult.insertId;

    // Credit wallet
    const newBalance = await recordWalletTransaction(conn, {
      userId: user_id,
      type: 'deposit',
      amount: creditAmount,
      referenceType: 'deposit',
      referenceId: `deposit_${depositId}`,
      remark: `Admin credit by UTR (UTR: ${utr})`,
    });

    // Apply bonuses
    await applyDepositBonuses(conn, { depositId, userId: user_id, amount: creditAmount });

    // Update webhook transaction status
    await conn.query(
      "UPDATE upi_webhook_transactions SET status = 'matched', matched_order_id = NULL WHERE id = ?",
      [webhook_transaction_id]
    );

    // Notify user
    await conn.query(
      'INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)',
      [user_id, 'deposit', `Your deposit of ₹${creditAmount} has been verified and credited. UTR: ${utr}`]
    );

    // Audit log
    await conn.query(
      `INSERT INTO auto_deposit_logs (deposit_id, user_id, action, details)
       VALUES (?, ?, 'admin_credit_by_utr', ?)`,
      [depositId, user_id, JSON.stringify({ admin_id: adminId, amount: creditAmount, utr, webhook_transaction_id, new_balance: newBalance })]
    );

    await conn.commit();
    res.json({ message: `₹${creditAmount} credited to user #${user_id}.`, deposit_id: depositId, new_balance: newBalance });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

/**
 * GET /api/auto-deposit/admin/unmatched-transactions
 * Fetch unmatched/received webhook transactions for admin review.
 */
exports.getUnmatchedTransactions = async (req, res, next) => {
  try {
    const { page, limit } = clampPagination(req.query);
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(
      `SELECT uwt.id, uwt.reference_number, uwt.amount, uwt.payer_name, uwt.status,
              uwt.raw_message, uwt.matched_order_id, uwt.created_at,
              pdo.order_ref
       FROM upi_webhook_transactions uwt
       LEFT JOIN pending_deposit_orders pdo ON pdo.id = uwt.matched_order_id
       WHERE uwt.status IN ('unmatched', 'received')
       ORDER BY uwt.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) as total FROM upi_webhook_transactions WHERE status IN ('unmatched', 'received')"
    );

    res.json({ transactions: rows, total, page, limit });
  } catch (error) {
    next(error);
  }
};

/**
 * Admin endpoint: Match all today's unmatched webhook transactions
 * This processes unmatched UPI transactions received today and attempts to match them
 * to pending deposit orders by order reference or amount.
 */
exports.matchTodayUnmatched = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Query today's unmatched transactions that haven't been attempted yet
    const [unmatchedTxns] = await conn.query(
      `SELECT id, raw_message, amount, reference_number, payer_name, txn_time, created_at
       FROM upi_webhook_transactions 
       WHERE status = 'unmatched' 
         AND DATE(created_at) = ?
         AND match_attempted_at IS NULL
       ORDER BY created_at ASC
       LIMIT 100`,
      [today]
    );

    if (unmatchedTxns.length === 0) {
      return res.json({
        message: `No unmatched transactions found for today (${today})`,
        processed: 0,
        matched: 0,
        failed: 0,
        results: []
      });
    }

    const results = [];
    let matched = 0;
    let failed = 0;

    for (const txn of unmatchedTxns) {
      try {
        await conn.beginTransaction();

        const amount = parseFloat(txn.amount);
        const referenceNumber = txn.reference_number;
        const payerName = txn.payer_name;

        // Extract order reference from raw message if available
        let orderRef = null;
        if (txn.raw_message) {
          const orderRefMatch = txn.raw_message.match(/\bRM([A-Z0-9]{6})\b/i);
          if (orderRefMatch) {
            orderRef = 'RM' + orderRefMatch[1].toUpperCase();
          }
        }

        // Check for duplicate reference number
        const [existingRef] = await conn.query(
          'SELECT id FROM upi_webhook_transactions WHERE reference_number = ? AND id != ? LIMIT 1',
          [referenceNumber, txn.id]
        );
        
        if (existingRef.length > 0) {
          await conn.query(
            'UPDATE upi_webhook_transactions SET status = ?, error_message = ?, match_attempted_at = NOW() WHERE id = ?',
            ['duplicate', 'Duplicate reference number', txn.id]
          );
          await conn.commit();
          failed++;
          results.push({ txnId: txn.id, amount, matched: false, reason: 'duplicate_reference' });
          continue;
        }

        // Check against deposits UTR numbers
        const [existingDeposit] = await conn.query(
          'SELECT id FROM deposits WHERE utr_number = ? LIMIT 1',
          [referenceNumber]
        );
        
        if (existingDeposit.length > 0) {
          await conn.query(
            'UPDATE upi_webhook_transactions SET status = ?, error_message = ?, match_attempted_at = NOW() WHERE id = ?',
            ['duplicate', 'Reference already used in deposits', txn.id]
          );
          await conn.commit();
          failed++;
          results.push({ txnId: txn.id, amount, matched: false, reason: 'duplicate_utr' });
          continue;
        }

        // Validate amount range
        const minDeposit = 100;
        const maxDeposit = 50000;
        if (amount < minDeposit || amount > maxDeposit) {
          await conn.query(
            'UPDATE upi_webhook_transactions SET status = ?, error_message = ?, match_attempted_at = NOW() WHERE id = ?',
            ['unmatched', `Amount ${amount} outside range ${minDeposit}-${maxDeposit}`, txn.id]
          );
          await conn.commit();
          failed++;
          results.push({ txnId: txn.id, amount, matched: false, reason: 'amount_out_of_range' });
          continue;
        }

        // Find matching order by reference or amount (including recently-expired orders within grace window)
        let pendingOrders = [];
        let lateMatch = false;
        
        if (orderRef) {
          // First try active pending orders
          const [refMatch] = await conn.query(
            `SELECT id, user_id, amount, pay_amount, order_ref
             FROM pending_deposit_orders
             WHERE status = 'pending'
               AND order_ref = ?
               AND expires_at > NOW()
             LIMIT 1
             FOR UPDATE`,
            [orderRef]
          );
          pendingOrders = refMatch;

          // Grace window: also match recently-expired orders (within LATE_MATCH_GRACE_MINUTES)
          if (pendingOrders.length === 0) {
            const [lateRefMatch] = await conn.query(
              `SELECT id, user_id, amount, pay_amount, order_ref
               FROM pending_deposit_orders
               WHERE status = 'expired'
                 AND order_ref = ?
                 AND expires_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
               LIMIT 1
               FOR UPDATE`,
              [orderRef, LATE_MATCH_GRACE_MINUTES]
            );
            if (lateRefMatch.length > 0) {
              pendingOrders = lateRefMatch;
              lateMatch = true;
            }
          }
        }

        // Match by amount if no order reference match
        if (pendingOrders.length === 0) {
          const [amountMatch] = await conn.query(
            `SELECT id, user_id, amount, pay_amount, order_ref
             FROM pending_deposit_orders
             WHERE status = 'pending'
               AND pay_amount = ?
               AND expires_at > NOW()
             ORDER BY created_at ASC
             LIMIT 1
             FOR UPDATE`,
            [amount]
          );
          pendingOrders = amountMatch;

          // Grace window for pay_amount match on recently-expired orders
          if (pendingOrders.length === 0) {
            const [lateAmountMatch] = await conn.query(
              `SELECT id, user_id, amount, pay_amount, order_ref
               FROM pending_deposit_orders
               WHERE status = 'expired'
                 AND pay_amount = ?
                 AND expires_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
               ORDER BY created_at ASC
               LIMIT 1
               FOR UPDATE`,
              [amount, LATE_MATCH_GRACE_MINUTES]
            );
            if (lateAmountMatch.length > 0) {
              pendingOrders = lateAmountMatch;
              lateMatch = true;
            }
          }
        }

        if (pendingOrders.length === 0) {
          await conn.query(
            'UPDATE upi_webhook_transactions SET status = ?, error_message = ?, match_attempted_at = NOW() WHERE id = ?',
            ['unmatched', `No pending or recently-expired order found for amount ${amount}`, txn.id]
          );
          await conn.commit();
          failed++;
          results.push({ txnId: txn.id, amount, matched: false, reason: 'no_matching_order' });
          continue;
        }

        const order = pendingOrders[0];

        // Strict amount validation
        const expectedAmount = parseFloat(order.pay_amount);
        if (!expectedAmount || amount !== expectedAmount) {
          await conn.query(
            'UPDATE upi_webhook_transactions SET status = ?, error_message = ?, match_attempted_at = NOW() WHERE id = ?',
            ['unmatched', `Amount mismatch: received ${amount}, expected ${expectedAmount}`, txn.id]
          );
          await conn.commit();
          failed++;
          results.push({ txnId: txn.id, amount, matched: false, reason: 'amount_mismatch' });
          continue;
        }

        // Check user is not blocked
        const [userRows] = await conn.query(
          'SELECT id, is_blocked FROM users WHERE id = ? LIMIT 1',
          [order.user_id]
        );
        
        if (userRows.length === 0 || userRows[0].is_blocked) {
          await conn.query(
            'UPDATE upi_webhook_transactions SET status = ?, error_message = ?, match_attempted_at = NOW() WHERE id = ?',
            ['unmatched', 'User blocked or not found', txn.id]
          );
          await conn.commit();
          failed++;
          results.push({ txnId: txn.id, amount, matched: false, reason: 'user_blocked' });
          continue;
        }

        // Create deposit record
        const creditAmount = Math.round(parseFloat(order.amount) * 100) / 100;
        const [depositResult] = await conn.query(
          `INSERT INTO deposits (user_id, amount, utr_number, webhook_txn_id, order_id, payer_name, status)
           VALUES (?, ?, ?, ?, ?, ?, 'completed')`,
          [order.user_id, creditAmount, referenceNumber, txn.id, order.id, payerName || null]
        );
        const depositId = depositResult.insertId;

        // Credit wallet
        await conn.query('SELECT balance FROM wallets WHERE user_id = ? FOR UPDATE', [order.user_id]);
        await conn.query('UPDATE wallets SET balance = balance + ? WHERE user_id = ?', [creditAmount, order.user_id]);
        
        const [[walletRow]] = await conn.query('SELECT balance FROM wallets WHERE user_id = ?', [order.user_id]);
        const newBalance = parseFloat(walletRow.balance);
        
        await conn.query(
          `INSERT INTO wallet_transactions
            (user_id, type, amount, balance_after, status, reference_type, reference_id, remark)
           VALUES (?, 'deposit', ?, ?, 'completed', 'deposit', ?, ?)`,
          [order.user_id, creditAmount, newBalance, `deposit_${depositId}`, `Auto deposit via UPI (Ref: ${referenceNumber})`]
        );

        // Update order status
        await conn.query(
          'UPDATE pending_deposit_orders SET status = ?, matched_deposit_id = ?, matched_webhook_id = ? WHERE id = ?',
          ['matched', depositId, txn.id, order.id]
        );

        // Update webhook transaction status
        await conn.query(
          'UPDATE upi_webhook_transactions SET status = ?, matched_order_id = ?, matched_deposit_id = ?, match_attempted_at = NOW() WHERE id = ?',
          ['matched', order.id, depositId, txn.id]
        );

        // Notify user
        await conn.query(
          'INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)',
          [order.user_id, 'deposit', `Your deposit of Rs.${creditAmount} has been automatically verified and credited. Ref: ${referenceNumber}`]
        );

        await conn.commit();
        matched++;
        results.push({
          txnId: txn.id,
          amount,
          matched: true,
          depositId,
          orderId: order.id,
          userId: order.user_id,
          newBalance,
          lateMatch
        });

      } catch (error) {
        await conn.rollback();
        failed++;
        results.push({
          txnId: txn.id,
          amount: txn.amount,
          matched: false,
          error: error.message
        });
      }
    }

    res.json({
      processed: unmatchedTxns.length,
      matched,
      failed,
      results
    });

  } catch (error) {
    next(error);
  } finally {
    conn.release();
  }
};

// ========== MODERATOR ENDPOINTS (filtered to their assigned users only) ==========

/**
 * GET /api/auto-deposit/moderator/pending-orders
 * Moderator views pending orders for their assigned users only
 */
exports.getModeratorPendingOrders = async (req, res, next) => {
  try {
    const { status = 'pending' } = req.query;
    const { page, limit, offset } = clampPagination(req.query);
    const moderatorId = req.user.id;

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM pending_deposit_orders pdo
       JOIN users u ON u.id = pdo.user_id
       WHERE pdo.status = ? AND u.moderator_id = ?`,
      [status, moderatorId]
    );

    const [orders] = await pool.query(
      `SELECT pdo.id, pdo.user_id, pdo.amount, pdo.pay_amount, pdo.status, pdo.matched_deposit_id,
              pdo.created_at, pdo.expires_at,
              u.name as user_name, u.phone as user_phone
       FROM pending_deposit_orders pdo
       JOIN users u ON u.id = pdo.user_id
       WHERE pdo.status = ? AND u.moderator_id = ?
       ORDER BY pdo.created_at DESC
       LIMIT ? OFFSET ?`,
      [status, moderatorId, limit, offset]
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
 * POST /api/auto-deposit/moderator/orders/:id/cancel
 * Moderator cancels a pending order for their user only
 */
exports.moderatorCancelOrder = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const moderatorId = req.user.id;

    await conn.beginTransaction();

    // Verify the order belongs to a user assigned to this moderator
    const [rows] = await conn.query(
      `SELECT pdo.id, pdo.user_id, pdo.amount, pdo.status
       FROM pending_deposit_orders pdo
       JOIN users u ON u.id = pdo.user_id
       WHERE pdo.id = ? AND u.moderator_id = ?
       LIMIT 1 FOR UPDATE`,
      [id, moderatorId]
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order not found or not assigned to you.' });
    }

    if (rows[0].status !== 'pending') {
      await conn.rollback();
      return res.status(409).json({ error: `Order is already ${rows[0].status} and cannot be cancelled.` });
    }

    await conn.query(
      "UPDATE pending_deposit_orders SET status = 'cancelled' WHERE id = ?",
      [id]
    );

    await conn.query(
      `INSERT INTO auto_deposit_logs (order_id, user_id, action, details)
       VALUES (?, ?, 'moderator_cancelled', ?)`,
      [id, rows[0].user_id, JSON.stringify({ moderator_id: moderatorId, amount: rows[0].amount })]
    );

    await conn.commit();

    // Emit real-time event
    eventBus.emit('deposit_order_cancelled', {
      orderId: id,
      userId: rows[0].user_id,
      amount: rows[0].amount,
      cancelledBy: moderatorId,
      moderatorId,
    });

    res.json({ message: 'Order cancelled successfully.' });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

/**
 * POST /api/auto-deposit/moderator/orders/:id/credit
 * Moderator manually credits a pending order for their user only
 */
exports.moderatorCreditOrder = async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { utr_number } = req.body;
    const moderatorId = req.user.id;

    if (!utr_number || !String(utr_number).trim()) {
      return res.status(400).json({ error: 'UTR / reference number is required for manual credit.' });
    }

    const utr = String(utr_number).trim();

    await conn.beginTransaction();

    // Verify the order belongs to a user assigned to this moderator
    const [orders] = await conn.query(
      `SELECT pdo.id, pdo.user_id, pdo.amount, pdo.status
       FROM pending_deposit_orders pdo
       JOIN users u ON u.id = pdo.user_id
       WHERE pdo.id = ? AND u.moderator_id = ? AND pdo.status IN ('pending','expired')
       LIMIT 1 FOR UPDATE`,
      [id, moderatorId]
    );

    if (orders.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order not found, already processed, or not assigned to you.' });
    }

    const order = orders[0];
    const creditAmount = Math.round(parseFloat(order.amount) * 100) / 100;

    // Duplicate UTR guard
    const [dupUtr] = await conn.query(
      'SELECT id FROM deposits WHERE utr_number = ? LIMIT 1',
      [utr]
    );
    if (dupUtr.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'This UTR number has already been used.' });
    }

    // Idempotency: ensure order not already credited
    const [dupOrder] = await conn.query(
      "SELECT id FROM deposits WHERE order_id = ? LIMIT 1",
      [id]
    );
    if (dupOrder.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'This order has already been credited.' });
    }

    // Create deposit record
    const [depositResult] = await conn.query(
      `INSERT INTO deposits (user_id, amount, utr_number, order_id, status)
       VALUES (?, ?, ?, ?, 'completed')`,
      [order.user_id, creditAmount, utr, id]
    );
    const depositId = depositResult.insertId;

    // Credit wallet
    const newBalance = await recordWalletTransaction(conn, {
      userId: order.user_id,
      type: 'deposit',
      amount: creditAmount,
      referenceType: 'deposit',
      referenceId: `deposit_${depositId}`,
      remark: `Manual deposit credit by moderator (UTR: ${utr})`,
    });

    // Apply bonuses
    await applyDepositBonuses(conn, { depositId, userId: order.user_id, amount: creditAmount });

    // Mark order as matched
    await conn.query(
      "UPDATE pending_deposit_orders SET status = 'matched', matched_deposit_id = ? WHERE id = ?",
      [depositId, id]
    );

    // Notify user
    await conn.query(
      'INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)',
      [order.user_id, 'deposit', `Your deposit of ₹${creditAmount} has been manually verified and credited by your moderator. UTR: ${utr}`]
    );

    // Audit log
    await conn.query(
      `INSERT INTO auto_deposit_logs (order_id, deposit_id, user_id, action, details)
       VALUES (?, ?, ?, 'moderator_manual_credit', ?)`,
      [id, depositId, order.user_id, JSON.stringify({ moderator_id: moderatorId, amount: creditAmount, utr, new_balance: newBalance })]
    );

    await conn.commit();

    // Emit real-time event
    eventBus.emit('deposit_order_credited', {
      orderId: id,
      depositId,
      userId: order.user_id,
      amount: creditAmount,
      utrNumber: utr,
      creditedBy: moderatorId,
      moderatorId,
    });

    res.json({ message: `₹${creditAmount} credited successfully.`, deposit_id: depositId, new_balance: newBalance });
  } catch (error) {
    await conn.rollback();
    next(error);
  } finally {
    conn.release();
  }
};

/**
 * GET /api/auto-deposit/moderator/stats
 * Moderator dashboard stats for their assigned users only
 */
exports.getModeratorStats = async (req, res, next) => {
  try {
    const moderatorId = req.user.id;

    const [stats] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM pending_deposit_orders pdo
         JOIN users u ON u.id = pdo.user_id
         WHERE pdo.status = 'pending' AND pdo.expires_at > NOW() AND u.moderator_id = ?) as active_orders,
        (SELECT COUNT(*) FROM pending_deposit_orders pdo
         JOIN users u ON u.id = pdo.user_id
         WHERE pdo.status = 'matched' AND DATE(pdo.created_at) = CURDATE() AND u.moderator_id = ?) as matched_today,
        (SELECT COUNT(*) FROM pending_deposit_orders pdo
         JOIN users u ON u.id = pdo.user_id
         WHERE pdo.status = 'expired' AND DATE(pdo.created_at) = CURDATE() AND u.moderator_id = ?) as expired_today,
        (SELECT COALESCE(SUM(pdo.amount), 0) FROM pending_deposit_orders pdo
         JOIN users u ON u.id = pdo.user_id
         WHERE pdo.status = 'matched' AND DATE(pdo.created_at) = CURDATE() AND u.moderator_id = ?) as matched_amount_today,
        (SELECT COUNT(*) FROM upi_webhook_transactions uwt
         JOIN pending_deposit_orders pdo ON pdo.id = uwt.matched_order_id
         JOIN users u ON u.id = pdo.user_id
         WHERE DATE(uwt.created_at) = CURDATE() AND u.moderator_id = ?) as webhook_matched_today,
        (SELECT COUNT(*) FROM users WHERE moderator_id = ? AND role = 'user' AND is_blocked = 0 AND COALESCE(is_deleted, 0) = 0) as total_users,
        (SELECT COUNT(*) FROM pending_deposit_orders pdo
         JOIN users u ON u.id = pdo.user_id
         WHERE pdo.status = 'pending' AND u.moderator_id = ?) as pending_orders,
        (SELECT COUNT(*) FROM pending_deposit_orders pdo
         JOIN users u ON u.id = pdo.user_id
         WHERE pdo.status = 'matched' AND u.moderator_id = ?) as matched_orders,
        (SELECT COUNT(*) FROM pending_deposit_orders pdo
         JOIN users u ON u.id = pdo.user_id
         WHERE pdo.status = 'expired' AND u.moderator_id = ?) as expired_orders,
        (SELECT COUNT(*) FROM pending_deposit_orders pdo
         JOIN users u ON u.id = pdo.user_id
         WHERE pdo.status = 'cancelled' AND u.moderator_id = ?) as cancelled_orders
    `, [moderatorId, moderatorId, moderatorId, moderatorId, moderatorId, moderatorId, moderatorId, moderatorId, moderatorId, moderatorId]);

    res.json(stats[0]);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/auto-deposit/moderator/webhook-transactions
 * Moderator views webhook transactions matched to their users only
 */
exports.getModeratorWebhookTransactions = async (req, res, next) => {
  try {
    const { status } = req.query;
    const { page, limit, offset } = clampPagination(req.query);
    const moderatorId = req.user.id;

    let whereClause = 'WHERE u.moderator_id = ?';
    const params = [moderatorId];

    if (status) {
      whereClause += ' AND uwt.status = ?';
      params.push(status);
    }

    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM upi_webhook_transactions uwt
       JOIN pending_deposit_orders pdo ON pdo.id = uwt.matched_order_id
       JOIN users u ON u.id = pdo.user_id
       ${whereClause}`,
      params
    );

    const [transactions] = await pool.query(
      `SELECT uwt.id, uwt.amount, uwt.reference_number, uwt.payer_name, uwt.txn_time,
              uwt.status, uwt.error_message, uwt.matched_order_id, uwt.matched_deposit_id,
              uwt.created_at,
              CASE WHEN uwt.status IN ('parse_error','unmatched') THEN uwt.raw_message ELSE NULL END as raw_message,
              u.name as matched_user_name, u.phone as matched_user_phone
       FROM upi_webhook_transactions uwt
       JOIN pending_deposit_orders pdo ON pdo.id = uwt.matched_order_id
       JOIN users u ON u.id = pdo.user_id
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
 * GET /api/auto-deposit/moderator/search-utr/:utr
 * Moderator searches UTR (limited to their users' deposits)
 */
exports.moderatorSearchByUtr = async (req, res, next) => {
  try {
    const utr = String(req.params.utr || '').trim();
    const moderatorId = req.user.id;

    if (!utr || utr.length < 6) {
      return res.status(400).json({ error: 'Please provide at least 6 characters of the UTR.' });
    }

    // Search webhook transactions matched to moderator's users
    const [webhookRows] = await pool.query(
      `SELECT uwt.id, uwt.reference_number, uwt.amount, uwt.payer_name, uwt.status,
              uwt.raw_message, uwt.matched_order_id, uwt.created_at,
              pdo.order_ref
       FROM upi_webhook_transactions uwt
       JOIN pending_deposit_orders pdo ON pdo.id = uwt.matched_order_id
       JOIN users u ON u.id = pdo.user_id
       WHERE u.moderator_id = ? AND uwt.reference_number LIKE ?
       ORDER BY uwt.created_at DESC
       LIMIT 20`,
      [moderatorId, `%${utr}%`]
    );

    // Also search deposits for moderator's users
    const [depositRows] = await pool.query(
      `SELECT d.id, d.user_id, d.amount, d.utr_number, d.status, d.created_at, u.phone, u.username
       FROM deposits d
       JOIN users u ON u.id = d.user_id
       WHERE u.moderator_id = ? AND d.utr_number LIKE ?
       ORDER BY d.created_at DESC
       LIMIT 20`,
      [moderatorId, `%${utr}%`]
    );

    res.json({ webhook_transactions: webhookRows, deposits: depositRows });
  } catch (error) {
    next(error);
  }
};
