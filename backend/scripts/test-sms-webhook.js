'use strict';

require('dotenv').config();
const http = require('http');
const pool = require('../src/config/database');
const { app } = require('../src/server');

async function runTest() {
  console.log('--- Starting SMS Webhook Integration Test ---');
  let testServer;
  let connection;

  try {
    connection = await pool.getConnection();

    // 1. Get a test user
    const [users] = await connection.query('SELECT id FROM users LIMIT 1');
    if (users.length === 0) {
      throw new Error('No users found in database to link test deposit order to.');
    }
    const userId = users[0].id;
    console.log(`[Test] Selected test user ID: ${userId}`);

    // 2. Insert a pending order to match
    const orderRef = `RMTST${Math.floor(Math.random() * 90000 + 10000)}`;
    const payAmount = (Math.random() * 1000 + 50).toFixed(2); // Random unique amount (e.g. 234.56)
    const amount = (parseFloat(payAmount) - 5).toFixed(2); // Face amount slightly less than pay amount

    console.log(`[Test] Creating mock pending order: ${orderRef} | Amount: ${amount} | Pay Amount: ${payAmount}`);
    
    await connection.query(
      `INSERT INTO pending_deposit_orders (user_id, amount, order_ref, pay_amount, status, expires_at)
       VALUES (?, ?, ?, ?, 'pending', DATE_ADD(NOW(), INTERVAL 1 HOUR))`,
      [userId, amount, orderRef, payAmount]
    );

    // 3. Set up environment tokens if not configured
    if (!process.env.SMS_WEBHOOK_SECRET) {
      process.env.SMS_WEBHOOK_SECRET = 'test_webhook_secret_key_12345';
    }
    const token = process.env.SMS_WEBHOOK_SECRET;

    // 4. Start the Express server on a dynamically assigned port
    testServer = http.createServer(app);
    await new Promise((resolve) => testServer.listen(0, resolve));
    const port = testServer.address().port;
    console.log(`[Test] Local test server running on port: ${port}`);

    // 5. Send POST request simulating a bank SMS from phone
    const mockPayload = {
      from: 'AD-SBI-BK',
      text: `Dear Customer, Rs. ${payAmount} has been credited to your a/c XX1234 on 18-06-2026 by UPI Ref 999123456789.`,
      id: `test_msg_${Date.now()}`
    };

    console.log(`[Test] Sending mock SMS payload: "${mockPayload.text}"`);

    const response = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port,
        path: `/api/sms/webhook/${token}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(data) }));
      });

      req.on('error', reject);
      req.write(JSON.stringify(mockPayload));
      req.end();
    });

    console.log(`[Test] HTTP Response Status: ${response.statusCode}`);
    console.log('[Test] HTTP Response Body:', JSON.stringify(response.body, null, 2));

    // 6. Assertions
    if (response.statusCode !== 200) {
      throw new Error(`Expected HTTP status 200, got ${response.statusCode}`);
    }

    if (response.body.status !== 'success') {
      throw new Error(`Expected body status 'success', got '${response.body.status}'`);
    }

    if (response.body.matchResult.matched !== true) {
      throw new Error(`Expected matchResult.matched to be true, got ${response.body.matchResult.matched}`);
    }

    console.log('[Test] Assertion Passed: Webhook successfully triggered matcher.');

    // 7. Verify Database state
    const [orders] = await connection.query(
      'SELECT status, matched_webhook_id FROM pending_deposit_orders WHERE order_ref = ?',
      [orderRef]
    );

    if (orders[0].status !== 'matched') {
      throw new Error(`Expected order status 'matched' in database, got '${orders[0].status}'`);
    }
    console.log('[Test] Assertion Passed: Order status marked as matched in DB.');

    // 8. Clean up test records
    console.log('[Test] Cleaning up test records from database...');
    const matchedWebhookId = orders[0].matched_webhook_id;

    if (matchedWebhookId) {
      await connection.query('DELETE FROM deposits WHERE pending_order_id = ?', [orders[0].id]);
      await connection.query('DELETE FROM upi_webhook_transactions WHERE id = ?', [matchedWebhookId]);
    }
    await connection.query('DELETE FROM pending_deposit_orders WHERE order_ref = ?', [orderRef]);

    console.log('[Test] Clean up complete.');
    console.log('--- TEST PASSED SUCCESSFULLY ---');

  } catch (err) {
    console.error('[Test] TEST FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    if (connection) connection.release();
    if (testServer) testServer.close();
    // Allow redis connection to close or just force exit if script completes
    process.exit();
  }
}

runTest();
