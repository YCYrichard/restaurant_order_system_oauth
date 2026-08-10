const axios = require('axios');
const notificationsConfig = require('../../config/notifications');

// LINE Messaging API push - a DIFFERENT product from the LINE Login already
// used for sign-in (see oauth.service.js). Pushing a message needs its own
// Official Account and its own channel access token, and the recipient must
// have added that OA as a friend before their LINE Login userId
// (users.provider_id, captured at sign-in) becomes a usable push target.
//
// This stays an explicit stub - throwing NotConfiguredError - until that
// Official Account exists. It's written against the real push request shape
// so wiring it in later is "add credentials and verify", not a redesign.

const name = 'line';

class NotConfiguredError extends Error {
  constructor(
    message = 'LINE messaging is not configured for this deployment'
  ) {
    super(message);
    this.code = 'NOTIFICATION_NOT_CONFIGURED';
  }
}

async function send({ lineUserId, message }) {
  const config = notificationsConfig.lineConfig();

  if (!config.configured) {
    throw new NotConfiguredError();
  }

  if (!lineUserId) {
    throw new Error('No LINE user id to push to');
  }

  await axios.post(
    'https://api.line.me/v2/bot/message/push',
    {
      to: lineUserId,
      messages: [{ type: 'text', text: message }],
    },
    {
      headers: {
        Authorization: `Bearer ${config.channelAccessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    }
  );

  return { status: 'sent' };
}

module.exports = { name, send, NotConfiguredError };
