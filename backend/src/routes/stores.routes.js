const router = require('express').Router();

const controller = require('../controllers/stores.controller');

const {
  requireAuth,
  requireAdmin,
  requireStoreAccess,
} = require('../middleware/auth.middleware');

router.get(
  '/',
  requireAuth,
  controller.listStores
);

router.post(
  '/',
  requireAuth,
  requireAdmin,
  controller.createStore
);

// Public, unauthenticated listing for the customer-facing store picker.
// Must be registered before '/:storeId' or Express will treat "public"
// as a storeId value.
router.get(
  '/public',
  controller.listPublicStores
);

router.get(
  '/:storeId',
  requireAuth,
  requireStoreAccess,
  controller.getStore
);

router.put(
  '/:storeId',
  requireAuth,
  requireStoreAccess,
  controller.updateStore
);

router.patch(
  '/:storeId/status',
  requireAuth,
  requireStoreAccess,
  controller.updateStoreStatus
);

router.get(
  '/:storeId/hours',
  requireAuth,
  requireStoreAccess,
  controller.getStoreHours
);

router.put(
  '/:storeId/hours',
  requireAuth,
  requireStoreAccess,
  controller.replaceStoreHours
);

router.post(
  '/:storeId/closures',
  requireAuth,
  requireStoreAccess,
  controller.addStoreClosure
);

router.delete(
  '/:storeId/closures/:date',
  requireAuth,
  requireStoreAccess,
  controller.removeStoreClosure
);

module.exports = router;