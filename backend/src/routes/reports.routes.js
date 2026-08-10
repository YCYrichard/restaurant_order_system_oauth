const router = require('express').Router();

const controller = require('../controllers/reports.controller');
const {
  requireAuth,
  requireStoreAccess,
} = require('../middleware/auth.middleware');

// storeId is in the URL, so requireStoreAccess applies directly - same
// pattern as modifiers.routes.js and orders.routes.js's store-scoped list.
router.get(
  '/sales/store/:storeId',
  requireAuth,
  requireStoreAccess,
  controller.getSalesReport
);

router.get(
  '/items/store/:storeId',
  requireAuth,
  requireStoreAccess,
  controller.getItemsReport
);

module.exports = router;
