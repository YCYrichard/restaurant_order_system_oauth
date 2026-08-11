const router = require('express').Router();

const controller = require('../controllers/reports.controller');
const {
  requireAuth,
  requireStoreAccess,
  requireOwnerTier,
} = require('../middleware/auth.middleware');

// storeId is in the URL, so requireStoreAccess applies directly - same
// pattern as modifiers.routes.js and orders.routes.js's store-scoped list.
// Sales/items data is owner-tier business intelligence, not something
// kitchen staff need - requireOwnerTier keeps it out of the staff tier.
router.get(
  '/sales/store/:storeId',
  requireAuth,
  requireStoreAccess,
  requireOwnerTier,
  controller.getSalesReport
);

router.get(
  '/items/store/:storeId',
  requireAuth,
  requireStoreAccess,
  requireOwnerTier,
  controller.getItemsReport
);

module.exports = router;
