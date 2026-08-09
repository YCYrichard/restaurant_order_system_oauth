const router = require('express').Router();

const controller = require('../controllers/products.controller');

const {
  requireAuth,
  requireStoreAccess,
} = require('../middleware/auth.middleware');

router.get(
  '/store/:storeId',
  requireAuth,
  requireStoreAccess,
  controller.listProductsByStore
);

router.post(
  '/store/:storeId',
  requireAuth,
  requireStoreAccess,
  controller.createProduct
);

// Public, unauthenticated listing for the customer-facing menu.
router.get(
  '/store/:storeId/public',
  controller.listPublicProductsByStore
);

// Access for these two is verified inside the controller (resolveProductAccess)
// since there's no storeId in the URL for requireStoreAccess to check.
router.put(
  '/:productId',
  requireAuth,
  controller.updateProduct
);

router.patch(
  '/:productId/status',
  requireAuth,
  controller.updateProductStatus
);

module.exports = router;