/**
 * Telegram Bot Setup Script
 * Run this once to register the webhook URL with Telegram.
 *
 * Usage: node src/scripts/setup-telegram-webhook.js
 *
 * Required env variables:
 *   TELEGRAM_BOT_TOKEN - Bot token from @BotFather
 *   TELEGRAM_WEBHOOK_SECRET - Your chosen secret token for webhook URL
 *   BACKEND_PUBLIC_URL - Public URL of your backend (e.g., https://yourdomain.com)
 */

require('dotenv').config();
const https = require('https');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const BACKEND_URL = process.env.BACKEND_PUBLIC_URL;

if (!BOT_TOKEN || !WEBHOOK_SECRET || !BACKEND_URL) {
  console.error('Missing required environment variables:');
  console.error('  TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, BACKEND_PUBLIC_URL');
  process.exit(1);
}

const webhookUrl = `${BACKEND_URL}/api/telegram/webhook/${WEBHOOK_SECRET}`;
const apiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;

console.log(`Setting Telegram webhook to: ${webhookUrl}`);

https.get(apiUrl, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const result = JSON.parse(data);
      if (result.ok) {
        console.log('Webhook set successfully!');
        console.log('Description:', result.description);
      } else {
        console.error('Failed to set webhook:', result.description);
      }
    } catch (e) {
      console.error('Unexpected response:', data);
    }
  });
}).on('error', (err) => {
  console.error('Request failed:', err.message);
});
