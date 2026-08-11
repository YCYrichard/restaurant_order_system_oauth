const router = require('express').Router();

const controller = require('../controllers/loyalty.controller');
const {
  requireAuth,
  requireStoreAccess,
  requireOwnerTier,
} = require('../middleware/auth.middleware');

// A customer's own balance at one store - checkout and My Orders read
// this. No store-access check beyond being signed in: this is the
// customer's own account, not a store-management action.
router.get('/balance/:storeId', requireAuth, controller.getBalance);

// Every store the signed-in customer has ever earned/redeemed points at -
// the My Orders summary header.
router.get('/accounts', requireAuth, controller.listAccounts);

// Business intelligence, same tier as reports - owner/manager, not staff.
router.get(
  '/store/:storeId/top-holders',
  requireAuth,
  requireStoreAccess,
  requireOwnerTier,
  controller.listTopHolders
);

module.exports = router;
