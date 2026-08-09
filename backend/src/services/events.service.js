const { EventEmitter } = require('events');

// Transport-agnostic pub/sub for order events. SSE is the first subscriber
// (see events.controller.js), but nothing here knows that - if a WebSocket
// or webhook transport is ever added it subscribes the same way, and
// publishers don't change.
//
// LIMITATION: this is an in-process EventEmitter, so it only fans out within
// a single Node process. Running more than one instance behind a load
// balancer would mean a kitchen connected to instance A never sees an order
// created on instance B. Fixing that is a Redis (or similar) pub/sub swap
// behind this same publish/subscribe interface - deliberately not built now,
// but the shape here is what keeps that a contained change.

const emitter = new EventEmitter();

// Kitchen screens can idle on a stream for a whole service, and several
// stations may watch the same store, so the default limit of 10 is low.
emitter.setMaxListeners(100);

const STORE_CHANNEL = (storeId) => `store:${storeId}`;
const USER_CHANNEL = (userId) => `user:${userId}`;

/// Fan an order event out to the store's staff (kitchen displays) and, when
/// the order belongs to a signed-in customer, to that customer as well.
function publishOrderEvent(event) {
  if (event.storeId != null) {
    emitter.emit(STORE_CHANNEL(event.storeId), event);
  }

  if (event.userId != null) {
    emitter.emit(USER_CHANNEL(event.userId), event);
  }
}

/// Returns an unsubscribe function - callers must invoke it when their
/// connection closes or listeners accumulate for the life of the process.
function subscribeToStore(storeId, listener) {
  const channel = STORE_CHANNEL(storeId);
  emitter.on(channel, listener);

  return () => emitter.off(channel, listener);
}

function subscribeToUser(userId, listener) {
  const channel = USER_CHANNEL(userId);
  emitter.on(channel, listener);

  return () => emitter.off(channel, listener);
}

// Exposed for tests and for a future /health style check - a steadily
// climbing count across reconnects means teardown is leaking.
function listenerCount() {
  return emitter
    .eventNames()
    .reduce((total, name) => total + emitter.listenerCount(name), 0);
}

module.exports = {
  publishOrderEvent,
  subscribeToStore,
  subscribeToUser,
  listenerCount,
};
