const notificationsRepository = require('../repositories/notifications.repository');
const usersRepository = require('../repositories/users.repository');
const inappProvider = require('./notifications/inapp.provider');
const lineProvider = require('./notifications/line.provider');

// Provider-agnostic seam, shaped like payments.service.js for the same
// reason: a channel that needs external credentials (LINE) must not block
// the one that already works today (in-app, via the existing SSE stream).

/// Notifies a customer their order is ready. Best-effort across every
/// available channel - a failure or not-configured result on one must not
/// stop the others, and every attempt is logged (attempt()) so a channel
/// added later is debuggable from day one instead of starting blind.
async function notifyOrderReady(order) {
  // Guest orders no longer exist (an account is required to order), but an
  // order placed before that change could still lack a user - nobody to
  // notify, and nothing to log against a channel that never fired.
  if (!order.user_id) {
    return;
  }

  await attempt(inappProvider, order.id, () => inappProvider.send());

  // LINE push only makes sense for a customer who actually signed in via
  // LINE - the push recipient is that provider's own user id, not
  // something any other login provider has.
  const user = await usersRepository.findNotificationTarget(order.user_id);

  if (user?.provider === 'line') {
    await attempt(lineProvider, order.id, () =>
      lineProvider.send({
        lineUserId: user.provider_id,
        message: `Your order #${order.id} is ready for pickup!`,
      })
    );
  }
}

async function attempt(provider, orderId, run) {
  try {
    await run();
    await notificationsRepository.logAttempt({
      orderId,
      channel: provider.name,
      status: 'sent',
      error: null,
    });
  } catch (error) {
    await notificationsRepository.logAttempt({
      orderId,
      channel: provider.name,
      status:
        error.code === 'NOTIFICATION_NOT_CONFIGURED'
          ? 'not_configured'
          : 'failed',
      error: error.message,
    });
  }
}

async function getNotificationLog(orderId) {
  return notificationsRepository.findLogForOrder(orderId);
}

module.exports = {
  notifyOrderReady,
  getNotificationLog,
};
