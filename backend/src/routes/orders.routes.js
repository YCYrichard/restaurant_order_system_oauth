const router = require('express').Router();
const controller = require('../controllers/orders.controller');
const { requireAuth } = require('../middleware/auth.middleware');

// Guest checkout is intentional: no auth required to place an order.
router.post('/', controller.createOrder);
router.get('/user/:userId', requireAuth, controller.getUserOrders);
router.get('/:orderId', requireAuth, controller.getOrderById);

module.exports = router;