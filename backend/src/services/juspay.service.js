const https = require('https');
const http = require('http');
const crypto = require('crypto');
const logger = require('../utils/logger');

class JuspayService {
  constructor() {
    this.baseUrl = process.env.JUSPAY_BASE_URL || 'https://sandbox.juspay.in';
    this.apiKey = process.env.JUSPAY_API_KEY || '53f5bc22-c1e8-4c3e-b59c-7e4cd480f14f';
    this.merchantCode = process.env.JUSPAY_MERCHANT_CODE || 'MTK';
    this.partnerCode = process.env.JUSPAY_PARTNER_CODE || 'RDM';
  }

  getAuthHeader() {
    return 'Basic ' + Buffer.from(`${this.apiKey}:`).toString('base64');
  }

  getHeaders() {
    return {
      'Authorization': this.getAuthHeader(),
      'x-merchantid': this.merchantCode,
      'x-partner-id': this.partnerCode,
      'x-partner-code': this.partnerCode,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
  }

  async _request(urlPath, method = 'GET', data = null) {
    const fullUrl = new URL(urlPath, this.baseUrl);
    const options = {
      method,
      headers: this.getHeaders(),
      timeout: 15000,
    };

    return new Promise((resolve, reject) => {
      const client = fullUrl.protocol === 'https:' ? https : http;
      const req = client.request(fullUrl, options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = { raw: body };
          }
          resolve({ status: res.statusCode, data: parsed });
        });
      });

      req.on('error', (err) => reject(err));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Juspay API request timed out'));
      });

      if (data) {
        req.write(typeof data === 'string' ? data : JSON.stringify(data));
      }
      req.end();
    });
  }

  /**
   * Create an order / checkout session with Juspay
   */
  async createPaymentOrder({ orderId, amount, customerId, customerPhone, customerEmail, returnUrl }) {
    const payload = {
      order_id: String(orderId),
      amount: parseFloat(amount).toFixed(2),
      currency: 'INR',
      customer_id: String(customerId),
      customer_phone: String(customerPhone || '9876543210').slice(-10),
      customer_email: customerEmail || `user_${customerId}@reddymatka.com`,
      return_url: returnUrl,
      payment_page_client_id: this.merchantCode,
      merchant_code: this.merchantCode,
      partner_code: this.partnerCode,
      action: 'paymentPage',
      description: `Deposit for Order #${orderId}`,
    };

    logger.info('juspay', `Creating payment order ${orderId} for amount ${amount}`, {
      merchantCode: this.merchantCode,
      partnerCode: this.partnerCode,
      baseUrl: this.baseUrl,
    });

    try {
      // First attempt Hypercheckout /session endpoint
      const res = await this._request('/session', 'POST', payload);

      if (res.status >= 200 && res.status < 300 && res.data) {
        const paymentUrl = res.data.payment_links?.web ||
                           res.data.payment_links?.mobile ||
                           res.data.url ||
                           res.data.payment_url ||
                           res.data.action?.url;

        return {
          success: true,
          orderId,
          gatewayOrderId: res.data.order_id || orderId,
          paymentUrl: paymentUrl || returnUrl,
          sdkPayload: res.data.sdk_payload || null,
          raw: res.data,
        };
      }

      // If /session returned an error, try standard /orders endpoint
      if (res.status === 404 || res.status === 405) {
        const orderRes = await this._request('/orders', 'POST', payload);
        if (orderRes.status >= 200 && orderRes.status < 300 && orderRes.data) {
          const paymentUrl = orderRes.data.payment_links?.web ||
                             orderRes.data.payment_links?.mobile ||
                             orderRes.data.url ||
                             orderRes.data.payment_url;

          return {
            success: true,
            orderId,
            gatewayOrderId: orderRes.data.order_id || orderId,
            paymentUrl: paymentUrl || returnUrl,
            sdkPayload: orderRes.data.sdk_payload || null,
            raw: orderRes.data,
          };
        }
      }

      logger.warn('juspay', `Juspay API response not OK: HTTP ${res.status}`, { data: res.data });

      // In development / sandbox testing ONLY with explicit ENABLE_MOCK_PAYMENTS=true:
      // provide a testing simulation redirect to allow local integration testing.
      if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_MOCK_PAYMENTS === 'true') {
        logger.info('juspay', 'Providing testing simulation session for sandbox testing');
        const fallbackUrl = `${returnUrl.split('?')[0]}?order_id=${encodeURIComponent(orderId)}&status=CHARGED&mock=true`;
        return {
          success: true,
          orderId,
          gatewayOrderId: `MOCK_${orderId}`,
          paymentUrl: fallbackUrl,
          sdkPayload: null,
          isMock: true,
          raw: res.data,
        };
      }

      throw new Error(res.data?.error_info?.user_message || res.data?.error_info?.developer_message || `Juspay error HTTP ${res.status}`);
    } catch (err) {
      logger.error('juspay', `Payment order creation failed for ${orderId}: ${err.message}`);

      if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_MOCK_PAYMENTS === 'true') {
        const fallbackUrl = `${returnUrl.split('?')[0]}?order_id=${encodeURIComponent(orderId)}&status=CHARGED&mock=true`;
        return {
          success: true,
          orderId,
          gatewayOrderId: `MOCK_${orderId}`,
          paymentUrl: fallbackUrl,
          sdkPayload: null,
          isMock: true,
          error: err.message,
        };
      }

      throw err;
    }
  }

  /**
   * Check order status with Juspay server-to-server
   */
  async getOrderStatus(orderId) {
    try {
      const res = await this._request(`/orders/${encodeURIComponent(orderId)}`, 'GET');

      if (res.status >= 200 && res.status < 300 && res.data) {
        const rawStatus = (res.data.status || '').toUpperCase();
        let status = 'pending';
        if (['CHARGED', 'SUCCESS', 'COMPLETED'].includes(rawStatus)) {
          status = 'completed';
        } else if (['FAILED', 'FAILURE', 'EXPIRED'].includes(rawStatus)) {
          status = 'failed';
        } else if (['CANCELLED', 'USER_DROPPED'].includes(rawStatus)) {
          status = 'cancelled';
        }

        const txnDetail = res.data.txn_detail || res.data.payment || {};
        return {
          success: true,
          orderId,
          status,
          rawStatus,
          amount: parseFloat(res.data.amount || 0),
          gatewayTxnId: res.data.txn_id || txnDetail.txn_id || null,
          utrNumber: txnDetail.bank_ref_no || txnDetail.epg_txn_id || res.data.bank_ref_no || null,
          paymentMethod: txnDetail.payment_method_type || txnDetail.payment_method || res.data.payment_method_type || 'UPI',
          raw: res.data,
        };
      }

      return {
        success: false,
        orderId,
        status: 'pending',
        httpStatus: res.status,
        raw: res.data,
      };
    } catch (err) {
      logger.error('juspay', `Error checking status for order ${orderId}: ${err.message}`);
      return {
        success: false,
        orderId,
        status: 'pending',
        error: err.message,
      };
    }
  }

  /**
   * Parse incoming webhook payload from Juspay
   */
  parseWebhookPayload(body) {
    if (!body) return null;

    // Support nested Juspay event format: { event_name: 'ORDER_SUCCEEDED', content: { order: { ... } } }
    const orderData = body.content?.order || body.order || body;

    const orderId = orderData.order_id || orderData.orderId;
    const rawStatus = String(orderData.status || body.event_name || '').toUpperCase();
    const amount = parseFloat(orderData.amount || 0);

    let status = 'pending';
    if (rawStatus === 'CHARGED' || rawStatus === 'SUCCESS' || rawStatus === 'ORDER_SUCCEEDED') {
      status = 'completed';
    } else if (rawStatus === 'FAILED' || rawStatus === 'FAILURE' || rawStatus === 'ORDER_FAILED') {
      status = 'failed';
    } else if (rawStatus === 'CANCELLED' || rawStatus === 'ORDER_CANCELLED') {
      status = 'cancelled';
    }

    const txnDetail = orderData.txn_detail || orderData.payment || {};
    const gatewayTxnId = orderData.txn_id || txnDetail.txn_id || body.txn_id || null;
    const utrNumber = txnDetail.bank_ref_no || txnDetail.epg_txn_id || orderData.bank_ref_no || null;
    const paymentMethod = txnDetail.payment_method_type || txnDetail.payment_method || orderData.payment_method_type || 'UPI';

    return {
      orderId,
      status,
      rawStatus,
      amount,
      gatewayTxnId,
      utrNumber,
      paymentMethod,
      payerVpa: txnDetail.vpa || txnDetail.payer_vpa || null,
      raw: body,
    };
  }
}

module.exports = new JuspayService();
