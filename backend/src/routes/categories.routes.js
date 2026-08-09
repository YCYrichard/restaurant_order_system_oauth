const router = require('express').Router();

const controller = require('../controllers/categories.controller');

const {
  requireAuth,
  requireStoreAccess,
} = require('../middleware/auth.middleware');

router.get(
  '/store/:storeId',
  requireAuth,
  requireStoreAccess,
  controller.listCategoriesByStore
);

router.post(
  '/store/:storeId',
  requireAuth,
  requireStoreAccess,
  controller.createCategory
);

// Access for these two is verified inside the controller (resolveCategoryAccess)
// since there's no storeId in the URL for requireStoreAccess to check.
router.put(
  '/:categoryId',
  requireAuth,
  controller.updateCategory
);

router.delete(
  '/:categoryId',
  requireAuth,
  controller.deleteCategory
);

module.exports = router;
