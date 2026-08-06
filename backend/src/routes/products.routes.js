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