const eventsService = require('../services/events.service');

// Proxies and load balancers happily hold an idle response open until they
// decide it's dead. A comment frame every 25s keeps the stream warm without
// the client having to treat it as data.
const HEARTBEAT_MS = 25000;

function openStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // nginx buffers responses by default, which would hold events back
    // until the buffer fills - exactly wrong for a live stream.
    'X-Accel-Buffering': 'no',
  });

  // Flush headers immediately so the client's stream opens now rather than
  // when the first event happens to arrive.
  res.flushHeaders?.();
  res.write(': connected\n\n');
}

function writeEvent(res, event) {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/// Attaches heartbeat + teardown to a stream. Returns nothing; the caller
/// has already registered its subscription and hands the unsubscribe in.
function manageStream(req, res, unsubscribe) {
  const heartbeat = setInterval(() => {
    res.write(': ping\n\n');
  }, HEARTBEAT_MS);

  // Both are needed: 'close' covers the client going away, and cleaning up
  // on either path is what stops subscriptions accumulating for the life of
  // the process across reconnects.
  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };

  req.on('close', cleanup);
  res.on('close', cleanup);
}

exports.streamStoreEvents = async (req, res, next) => {
  try {
    const storeId = Number(req.params.storeId);

    openStream(req, res);

    const unsubscribe = eventsService.subscribeToStore(storeId, (event) => {
      writeEvent(res, event);
    });

    manageStream(req, res, unsubscribe);
  } catch (error) {
    next(error);
  }
};

exports.streamMyOrderEvents = async (req, res, next) => {
  try {
    const userId = req.user.id;

    openStream(req, res);

    const unsubscribe = eventsService.subscribeToUser(userId, (event) => {
      writeEvent(res, event);
    });

    manageStream(req, res, unsubscribe);
  } catch (error) {
    next(error);
  }
};
