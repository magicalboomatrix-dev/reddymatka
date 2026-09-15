const https = require('https');
const http = require('http');
const logger = require('../utils/logger');

class SparkPayService {
  constructor() {
    this.baseUrl = process.env.SPARKPAY_BASE_URL || 'https://txnapi.sparkpay.in';
    this.clientId = process.env.SPARKPAY_CLIENT_ID || '53f5bc22-c1e8-4c3e-b59c-7e4cd480f14f';
    this.partnerCode = process.env.SPARKPAY_PARTNER_CODE || 'RDM';
    this.merchantCode = process.env.SPARKPAY_MERCHANT_CODE || 'MTK';
  }

  isMockEnabled() {
    const val = String(process.env.ENABLE_MOCK_PAYMENTS || '').trim().toLowerCase();
    return val === 'true' || val === '1' || val === 'yes';
  }

  getBaseUrl() {
    return process.env.SPARKPAY_BASE_URL || this.baseUrl || 'https://txnapi.sparkpay.in';
  }

  getClientId() {
    return process.env.SPARKPAY_CLIENT_ID || this.clientId || '53f5bc22-c1e8-4c3e-b59c-7e4cd480f14f';
  }

  getPartnerCode() {
    return process.env.SPARKPAY_PARTNER_CODE || this.partnerCode || 'RDM';
  }

  getMerchantCode() {
    return process.env.SPARKPAY_MERCHANT_CODE || this.merchantCode || 'MTK';
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-client-id': this.getClientId(),
    };
  }

  async _request(urlPath, method = 'POST', data = null) {
    const fullUrl = new URL(urlPath, this.getBaseUrl());
    const postData = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : null;

    const headers = this.getHeaders();
    if (postData) {
      headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const options = {
      method,
      headers,
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
        reject(new Error('Spark Pay API request timed out'));
      });

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  /**
   * Create a UPI Payin Intent order with Spark Pay
   */
  async createPaymentOrder({ orderId, amount, customerId, customerPhone, customerName, remarks, returnUrl }) {
    if (this.isMockEnabled()) {
      logger.info('sparkpay', `Mock payment mode active. Generating mock checkout session for order ${orderId} (amount: ${amount})`);
      const fallbackUrl = `${returnUrl ? returnUrl.split('?')[0] : '/deposit/status'}?order_id=${encodeURIComponent(orderId)}&status=CHARGED&mock=true`;
      return {
        success: true,
        orderId,
        gatewayOrderId: `MOCK_${orderId}`,
        intentUrl: `upi://pay?pa=mockmerchant@upi&pn=ReddyMatka&am=${parseFloat(amount).toFixed(2)}&tn=${encodeURIComponent(remarks || orderId)}`,
        paymentUrl: fallbackUrl,
        sdkPayload: null,
        isMock: true,
      };
    }

    const clientId = this.getClientId();
    const partnerCode = this.getPartnerCode();
    const merchantCode = this.getMerchantCode();

    if (!clientId || !partnerCode || !merchantCode) {
      throw new Error('Spark Pay credentials missing. Please set SPARKPAY_CLIENT_ID, SPARKPAY_PARTNER_CODE, and SPARKPAY_MERCHANT_CODE in .env');
    }

    // Clean phone number: 10 digits
    const cleanPhone = String(customerPhone || '7737791163').replace(/\D/g, '').slice(-10) || '7737791163';
    const cleanName = (customerName || 'Customer').replace(/[^a-zA-Z0-9\s]/g, '').trim() || 'Customer';
    const cleanRemarks = (remarks || orderId || 'Deposit').replace(/[^a-zA-Z0-9]/g, '').slice(0, 30) || 'Deposit';
    const formattedAmount = parseFloat(amount).toFixed(2);

    const payload = {
      PARTNERCODE: partnerCode,
      MERCHANTCODE: merchantCode,
      CUSTOMERNAME: cleanName,
      CUSTOMERMOBILENUMBER: cleanPhone,
      TXNAMT: formattedAmount,
      REMARKS: cleanRemarks,
      TXNID: String(orderId),
    };

    logger.info('sparkpay', `Creating Spark Pay intent for order ${orderId} amount ${formattedAmount}`, {
      partnerCode,
      merchantCode,
      phone: cleanPhone,
    });

    try {
      const res = await this._request('/api/v1/payin/intent', 'POST', payload);

      logger.info('sparkpay', `Spark Pay intent response for ${orderId}: HTTP ${res.status}`, { data: res.data });

      if (res.status >= 200 && res.status < 300 && res.data) {
        const d = res.data;
        // Check for success condition
        if (d.STATUS === 'SUCCESS' || d.INTENTURL || d.status === 'SUCCESS' || d.intentUrl) {
          const intentUrl = d.INTENTURL || d.intentUrl;
          return {
            success: true,
            orderId: d.TXNID || orderId,
            gatewayOrderId: d.MERCHANTREQUESTID || d.merchantRequestId || null,
            intentUrl,
            paymentUrl: intentUrl,
            merchantVpa: d.MERCHANTVPA || d.merchantVpa || null,
            raw: d,
          };
        }

        const errMsg = d.MESSAGE || d.message || d.ERROR || d.error || `Spark Pay responded with status: ${d.STATUS || res.status}`;
        throw new Error(errMsg);
      }

      throw new Error(`Spark Pay HTTP error ${res.status}: ${JSON.stringify(res.data)}`);
    } catch (err) {
      logger.error('sparkpay', `Failed to create Spark Pay order for ${orderId}: ${err.message}`, err);

      if (this.isMockEnabled()) {
        const fallbackUrl = `${returnUrl ? returnUrl.split('?')[0] : '/deposit/status'}?order_id=${encodeURIComponent(orderId)}&status=CHARGED&mock=true`;
        return {
          success: true,
          orderId,
          gatewayOrderId: `MOCK_${orderId}`,
          intentUrl: `upi://pay?pa=mockmerchant@upi&pn=ReddyMatka&am=${formattedAmount}&tn=${orderId}`,
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
   * Check order status with Spark Pay server-to-server
   */
  async getOrderStatus(orderId) {
    if (this.isMockEnabled() && String(orderId).startsWith('MOCK_')) {
      return {
        success: true,
        orderId,
        status: 'completed',
        rawStatus: 'SUCCESS',
        amount: 0,
        gatewayTxnId: `MOCK_TXN_${Date.now()}`,
        utrNumber: `UTR${Date.now()}`,
        paymentMethod: 'UPI',
        raw: { simulated: true, mock: true, status: 'SUCCESS' },
      };
    }

    const payload = {
      TXNID: String(orderId),
      PARTNERCODE: this.getPartnerCode(),
      MERCHANTCODE: this.getMerchantCode(),
    };

    try {
      const res = await this._request('/api/payin/transaction-status', 'POST', payload);

      logger.info('sparkpay', `Spark Pay status check for ${orderId}: HTTP ${res.status}`, { data: res.data });

      if (res.status >= 200 && res.status < 300 && res.data) {
        const d = res.data;
        const rawTxnStatus = String(d.TXNSTATUS || d.status || '').toUpperCase();
        const rawBankStatus = String(d.BANKSTATUS || d.bankStatus || '').toUpperCase();

        let status = 'pending';
        if (
          ['SUCCESS', 'COMPLETED', 'PAID', 'CHARGED'].includes(rawTxnStatus) ||
          ['SUCCESS', 'COMPLETED'].includes(rawBankStatus)
        ) {
          status = 'completed';
        } else if (
          ['FAILED', 'FAILURE', 'REJECTED', 'DECLINED', 'EXPIRED'].includes(rawTxnStatus) ||
          ['FAILED', 'FAILURE'].includes(rawBankStatus)
        ) {
          status = 'failed';
        } else if (['CANCELLED', 'CANCELED', 'USER_DROPPED'].includes(rawTxnStatus)) {
          status = 'cancelled';
        }

        const approvedAmt = parseFloat(d.APRROVEDAMOUNT || d.approvedAmount || d.TXNAMT || d.amount || 0);

        return {
          success: true,
          orderId,
          status,
          rawStatus: rawTxnStatus || rawBankStatus,
          amount: approvedAmt,
          gatewayTxnId: d.BANKTXNID || d.bankTxnId || d.MERCHANTREQUESTID || d.merchantRequestId || null,
          utrNumber: d.RRN || d.rrn || d.BANKTXNID || null,
          payerVpa: d.PAYERVPA || d.payerVpa || null,
          payerName: d.PAYERNAME || d.payerName || null,
          paymentMethod: 'UPI',
          raw: d,
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
      logger.error('sparkpay', `Error checking status for order ${orderId}: ${err.message}`, err);
      return {
        success: false,
        orderId,
        status: 'pending',
        error: err.message,
      };
    }
  }

  /**
   * Parse incoming webhook payload from Spark Pay
   */
  parseWebhookPayload(body) {
    if (!body) return null;

    const d = body.content || body.data || body;
    const orderId = d.TXNID || d.txnid || d.order_id || d.orderId;
    if (!orderId) return null;

    const rawTxnStatus = String(d.TXNSTATUS || d.txnstatus || d.status || '').toUpperCase();
    const rawBankStatus = String(d.BANKSTATUS || d.bankstatus || '').toUpperCase();

    let status = 'pending';
    if (
      ['SUCCESS', 'COMPLETED', 'PAID', 'CHARGED'].includes(rawTxnStatus) ||
      ['SUCCESS', 'COMPLETED'].includes(rawBankStatus)
    ) {
      status = 'completed';
    } else if (
      ['FAILED', 'FAILURE', 'REJECTED', 'DECLINED', 'EXPIRED'].includes(rawTxnStatus) ||
      ['FAILED', 'FAILURE'].includes(rawBankStatus)
    ) {
      status = 'failed';
    } else if (['CANCELLED', 'CANCELED', 'USER_DROPPED'].includes(rawTxnStatus)) {
      status = 'cancelled';
    }

    const amount = parseFloat(d.APRROVEDAMOUNT || d.approvedAmount || d.TXNAMT || d.amount || 0);
    const gatewayTxnId = d.BANKTXNID || d.bankTxnId || d.MERCHANTREQUESTID || d.merchantRequestId || null;
    const utrNumber = d.RRN || d.rrn || d.BANKTXNID || null;
    const payerVpa = d.PAYERVPA || d.payerVpa || null;
    const payerName = d.PAYERNAME || d.payerName || null;

    return {
      orderId,
      status,
      rawStatus: rawTxnStatus || rawBankStatus,
      amount,
      gatewayTxnId,
      utrNumber,
      paymentMethod: 'UPI',
      payerVpa,
      payerName,
      raw: body,
    };
  }
}

module.exports = new SparkPayService();

