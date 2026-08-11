const router = require('express').Router();

const controller = require('../controllers/modifiers.controller');

const {
  requireAuth,
  requireStoreAccess,
  requireOwnerTier,
} = require('../middleware/auth.middleware');

// storeId is in the URL, so requireStoreAccess applies directly.
router.get(
  '/store/:storeId',
  requireAuth,
  requireStoreAccess,
  controller.listGroupsForStore
);

router.post(
  '/store/:storeId',
  requireAuth,
  requireStoreAccess,
  requireOwnerTier,
  controller.createGroup
);

// The rest are addressed by group/option/product id, so access is resolved
// in the controller (resolveGroupAccess) - the same split categories and
// products routes already document.
router.post('/:groupId/options', requireAuth, controller.addOption);
router.delete('/:groupId', requireAuth, controller.deleteGroup);
router.delete('/options/:optionId', requireAuth, controller.deleteOption);

router.post(
  '/:groupId/products/:productId',
  requireAuth,
  controller.attachGroupToProduct
);
router.delete(
  '/:groupId/products/:productId',
  requireAuth,
  controller.detachGroupFromProduct
);

module.exports = router;
