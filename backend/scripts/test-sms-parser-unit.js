'use strict';

const { parseUpiMessage } = require('../src/services/upi-message-parser');

console.log('--- Starting SMS Webhook Unit Tests ---');

// Define test cases for parseUpiMessage
const testCases = [
  {
    name: 'Standard Bank Credit SMS',
    text: 'Rs.500 credited to A/c XX1234 by UPI Ref 412345678901',
    expected: {
      success: true,
      amount: 500,
      referenceNumber: '412345678901',
    }
  },
  {
    name: 'PhonePe Notification',
    text: 'Received Rs.1000 from JOHN DOE via UPI. UPI Ref: 498765432109',
    expected: {
      success: true,
      amount: 1000,
      referenceNumber: '498765432109',
      payerName: 'JOHN DOE',
    }
  },
  {
    name: 'GPay Notification',
    text: 'You received ₹250.00 from ALICE. UPI transaction ID: 498112233445',
    expected: {
      success: true,
      amount: 250,
      referenceNumber: '498112233445',
      payerName: 'ALICE',
    }
  },
  {
    name: 'Kotak Bank SMS',
    text: 'A/c XX9999 Credited; INR 1500.00 Ref-UPI/499911223344',
    expected: {
      success: true,
      amount: 1500,
      referenceNumber: '499911223344',
    }
  },
  {
    name: 'Slice Bank Credit SMS',
    text: 'You’ve got ₹1,500.31 from Mrs PRVESH in your slice bank a/c xx5450. Avl. Bal. ₹11,046.90.',
    expected: {
      success: true,
      amount: 1500.31,
      referenceNumber: null,
      payerName: 'Mrs PRVESH',
    }
  },
  {
    name: 'Reject Debit Transaction',
    text: 'Your a/c XX1234 has been debited by Rs.100 for payment to XYZ.',
    expected: {
      success: false,
      error: 'Message appears to be a debit/outgoing transaction',
    }
  }
];

let failures = 0;

for (const tc of testCases) {
  const result = parseUpiMessage(tc.text);
  console.log(`\nRunning Test: "${tc.name}"`);
  
  if (result.success !== tc.expected.success) {
    console.error(`  FAIL: Expected success to be ${tc.expected.success}, got ${result.success}`);
    failures++;
    continue;
  }

  if (tc.expected.success) {
    if (result.data.amount !== tc.expected.amount) {
      console.error(`  FAIL: Expected amount ${tc.expected.amount}, got ${result.data.amount}`);
      failures++;
    } else if (result.data.referenceNumber !== tc.expected.referenceNumber) {
      console.error(`  FAIL: Expected referenceNumber ${tc.expected.referenceNumber}, got ${result.data.referenceNumber}`);
      failures++;
    } else {
      console.log(`  PASS: Amount: ${result.data.amount}, Ref: ${result.data.referenceNumber}`);
    }
  } else {
    if (!result.error.includes(tc.expected.error)) {
      console.error(`  FAIL: Expected error to contain "${tc.expected.error}", got "${result.error}"`);
      failures++;
    } else {
      console.log(`  PASS: Properly rejected. Reason: ${result.error}`);
    }
  }
}

// Mock test of controller endpoint handling
console.log('\n--- Mock Testing Webhook Controller Logic ---');
const mockController = require('../src/controllers/sms-webhook.controller');

// Stub express response object
const createMockResponse = () => {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status: function(code) {
      this.statusCode = code;
      return this;
    },
    json: function(payload) {
      this.body = payload;
      return this;
    }
  };
};

async function testMockWebhook() {
  process.env.SMS_WEBHOOK_SECRET = 'super_secret_token_123';

  // Test 1: Forbidden access with invalid token
  const req1 = {
    params: { token: 'wrong_token' },
    body: { text: 'Rs.500 credited by UPI Ref 412345678901' },
    ip: '127.0.0.1'
  };
  const res1 = createMockResponse();
  await mockController.handleWebhook(req1, res1);
  if (res1.statusCode === 403) {
    console.log('PASS: Webhook rejects invalid token with 403 Forbidden.');
  } else {
    console.error('FAIL: Webhook accepted request with invalid token.');
    failures++;
  }

  // Test 2: Bad Request with empty body
  const req2 = {
    params: { token: 'super_secret_token_123' },
    body: {},
    ip: '127.0.0.1'
  };
  const res2 = createMockResponse();
  await mockController.handleWebhook(req2, res2);
  if (res2.statusCode === 400) {
    console.log('PASS: Webhook rejects empty request payload with 400 Bad Request.');
  } else {
    console.error('FAIL: Webhook accepted empty request payload.');
    failures++;
  }
}

testMockWebhook().then(() => {
  console.log(`\n--- Unit Test Run Complete. Failures: ${failures} ---`);
  if (failures > 0) {
    process.exit(1);
  } else {
    console.log('ALL UNIT TESTS PASSED');
    process.exit(0);
  }
});
