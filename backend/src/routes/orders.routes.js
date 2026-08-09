const router = require('express').Router();
const controller = require('../controllers/orders.controller');
const {
  requireAuth,
  requireStoreAccess,
} = require('../middleware/auth.middleware');

// Guest checkout is intentional: no auth required to place an order.
router.post('/', controller.createOrder);
router.get('/user/:userId', requireAuth, controller.getUserOrders);

// Store-scoped listing for admin/staff order management. storeId is in the
// URL, so requireStoreAccess can be used directly here (unlike status
// below, which is addressed by orderId alone).
router.get(
  '/store/:storeId',
  requireAuth,
  requireStoreAccess,
  controller.getOrdersByStore
);

router.get('/:orderId', requireAuth, controller.getOrderById);

// Access for this one is verified inside the controller/service
// (resolveOrderAccess) since there's no storeId in the URL for
// requireStoreAccess to check.
router.patch('/:orderId/status', requireAuth, controller.updateOrderStatus);

module.exports = router;