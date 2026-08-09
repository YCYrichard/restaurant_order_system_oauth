const router = require('express').Router();

const controller = require('../controllers/events.controller');

const {
  requireAuth,
  requireStoreAccess,
} = require('../middleware/auth.middleware');

// Kitchen displays subscribe to their store's order events. storeId is in
// the URL, so requireStoreAccess applies directly.
router.get(
  '/store/:storeId',
  requireAuth,
  requireStoreAccess,
  controller.streamStoreEvents
);

// Customers subscribe to status changes on their own orders. Scoped to
// req.user.id in the controller, so there's nothing to authorize beyond
// being signed in.
router.get('/my-orders', requireAuth, controller.streamMyOrderEvents);

module.exports = router;
