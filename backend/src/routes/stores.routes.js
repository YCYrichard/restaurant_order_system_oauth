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

// Public, unauthenticated listing (no longer used to pick a store - there's
// no in-app picker - but RootRedirectPage still uses it for the
// exactly-one-active-store convenience redirect).
// Must be registered before '/:storeId' or Express will treat "public"
// as a storeId value.
router.get(
  '/public',
  controller.listPublicStores
);

// The actual customer entry point: /store/:code resolves through here.
// Public and unauthenticated, same trust level as the list above.
router.get(
  '/public/:code',
  controller.getStoreByCode
);

// Public: checkout needs this before there's any reason to be signed in.
router.get(
  '/:storeId/pickup-slots',
  controller.getPickupSlots
);

router.patch(
  '/:storeId/regenerate-code',
  requireAuth,
  requireStoreAccess,
  controller.regenerateStoreCode
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