'use strict';
/**
 * One-time script to generate a Telegram userbot session string.
 *
 * Run this ONCE on any machine (local or server):
 *   node src/scripts/gen-telegram-session.js
 *
 * It will prompt for your phone number and the OTP Telegram sends you.
 * When done it prints a SESSION string — paste that into .env as TELEGRAM_SESSION.
 *
 * Requirements before running:
 *   1. Go to https://my.telegram.org
 *   2. Log in with your phone number
 *   3. Click "API development tools"
 *   4. Create an app (any name/platform) — copy api_id and api_hash
 *   5. Put them in .env as TELEGRAM_API_ID and TELEGRAM_API_HASH
 */
require('dotenv').config();

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const readline = require('readline');

const apiId   = parseInt(process.env.TELEGRAM_API_ID  || '', 10);
const apiHash = process.env.TELEGRAM_API_HASH || '';

if (!apiId || !apiHash) {
  console.error('ERROR: Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env first.');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

(async () => {
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 3,
  });

  await client.start({
    phoneNumber:  async () => ask('Enter your phone number (with country code, e.g. +919876543210): '),
    password:     async () => {
      const pw = await ask('Enter 2FA password (required if enabled): ');
      if (!pw || !pw.trim()) throw new Error('2FA password is required for this account. Set it in Telegram → Settings → Privacy → Two-Step Verification, or enter it here.');
      return pw;
    },
    phoneCode:    async () => ask('Enter the OTP Telegram sent you: '),
    onError: (err) => console.error('Login error:', err),
  });

  const session = client.session.save();
  console.log('\n✅ Session generated successfully!\n');
  console.log('Add this line to your .env file:');
  console.log(`TELEGRAM_SESSION=${session}\n`);

  await client.disconnect();
  rl.close();
  process.exit(0);
})();
