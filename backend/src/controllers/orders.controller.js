const ordersService = require('../services/orders.service');

exports.createOrder = async (req, res, next) => {
  try {
    const order = await ordersService.createOrder(req.body);

    res.status(201).json({
      message: 'Order created',
      order,
    });
  } catch (error) {
    next(error);
  }
};

exports.getUserOrders = async (req, res, next) => {
  try {
    const userId = Number(req.params.userId);

    if (req.user.role !== 'admin' && req.user.id !== userId) {
      return res.status(403).json({
        message: 'You do not have access to these orders',
      });
    }

    const orders = await ordersService.getOrdersForUser(userId);

    res.json({ orders });
  } catch (error) {
    next(error);
  }
};

exports.getOrderById = async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);

    const order = await ordersService.getOrderById(orderId);

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
      return res.status(403).json({
        message: 'You do not have access to this order',
      });
    }

    res.json({ order });
  } catch (error) {
    next(error);
  }
};
