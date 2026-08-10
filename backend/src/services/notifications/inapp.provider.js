// In-app / live channel. There is no separate transport to call here: the
// customer's My Orders page is already subscribed to /events/my-orders
// (event_stream_client.dart), and events.service.js already publishes
// order.status_changed on every status change including 'ready' - that SSE
// event IS the delivery. This provider's only job is to record that the
// moment was announced through this channel, the same reason payments logs
// a 'manual' provider's attempt even though no gateway call happened.

const name = 'inapp';

async function send() {
  return { status: 'sent' };
}

module.exports = { name, send };
