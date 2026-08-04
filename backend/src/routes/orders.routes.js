const router = require('express').Router();
const controller = require('../controllers/orders.controller');

router.post('/', controller.createOrder);
router.get('/user/:userId', controller.getUserOrders);
router.get('/:orderId', controller.getOrderById);

module.exports = router;