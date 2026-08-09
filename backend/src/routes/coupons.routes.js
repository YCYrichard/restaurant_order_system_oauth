const router = require('express').Router();

const controller = require('../controllers/coupons.controller');

const {
  requireAuth,
  requireAdmin,
  requireStoreAccess,
} = require('../middleware/auth.middleware');

// Store-scoped listing: staff with access to the store may see its coupons
// (plus the global ones that apply everywhere).
router.get(
  '/store/:storeId',
  requireAuth,
  requireStoreAccess,
  controller.listCouponsForStore
);

// Creating and retiring coupons is admin-only: a coupon can be global
// (store_id NULL), which is beyond a single store owner's remit.
router.post('/', requireAuth, requireAdmin, controller.createCoupon);
router.patch(
  '/:couponId/status',
  requireAuth,
  requireAdmin,
  controller.updateCouponStatus
);
router.delete(
  '/:couponId',
  requireAuth,
  requireAdmin,
  controller.deleteCoupon
);

module.exports = router;
