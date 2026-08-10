// Ready-alert channel configuration, deliberately NOT part of config/env.js's
// fail-fast validation (same reasoning as config/payments.js): a store
// shouldn't need a LINE Official Account to boot the server. Missing LINE
// credentials mean ready alerts go out in-app only, not a server that won't
// start.

function lineConfig() {
  const channelAccessToken = process.env.LINE_MESSAGING_CHANNEL_TOKEN;

  return {
    // Distinct from LINE_CLIENT_ID/SECRET (oauth.service.js) - those are the
    // LINE Login channel. This is a LINE Messaging API channel, a different
    // product with its own Official Account and its own credentials.
    configured: Boolean(channelAccessToken),
    channelAccessToken,
  };
}

module.exports = {
  lineConfig,
};
