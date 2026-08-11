const ordersService = require('../services/orders.service');
const auditLogService = require('../services/audit-log.service');

exports.createOrder = async (req, res, next) => {
  try {
    // userId always comes from the authenticated caller, never the body -
    // otherwise any client could attribute an order to an arbitrary user id.
    const order = await ordersService.createOrder({
      ...req.body,
      userId: req.user.id,
    });

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

exports.updateOrderStatus = async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);
    const order = await ordersService.updateOrderStatus(
      orderId,
      req.user,
      req.body.status
    );

    res.status(200).json({ order });
  } catch (error) {
    next(error);
  }
};

exports.getOrdersByStore = async (req, res, next) => {
  try {
    const storeId = Number(req.params.storeId);
    const orders = await ordersService.listOrdersForStore(storeId, req.user, {
      activeOnly: req.query.status === 'active',
    });

    res.status(200).json({ orders });
  } catch (error) {
    next(error);
  }
};

exports.getReceipt = async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);
    const receipt = await ordersService.getReceipt(orderId, req.user);

    res.status(200).json(receipt);
  } catch (error) {
    next(error);
  }
};

exports.refundOrder = async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);
    const receipt = await ordersService.refundOrder(orderId, req.user, req.body);

    auditLogService.record({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'order.refunded',
      resourceType: 'order',
      resourceId: orderId,
      storeId: receipt.order.store_id,
      details: { amount: req.body.amount, reason: req.body.reason },
      ipAddress: req.ip,
    });

    res.status(201).json(receipt);
  } catch (error) {
    next(error);
  }
};

exports.issueEinvoice = async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);
    const receipt = await ordersService.issueEinvoice(orderId, req.user, req.body);

    auditLogService.record({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'order.einvoice_issued',
      resourceType: 'order',
      resourceId: orderId,
      storeId: receipt.order.store_id,
      details: { einvoiceNumber: receipt.order.einvoice_number },
      ipAddress: req.ip,
    });

    res.status(200).json(receipt);
  } catch (error) {
    next(error);
  }
};

exports.voidEinvoice = async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);
    const receipt = await ordersService.voidEinvoice(orderId, req.user);

    auditLogService.record({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'order.einvoice_voided',
      resourceType: 'order',
      resourceId: orderId,
      storeId: receipt.order.store_id,
      ipAddress: req.ip,
    });

    res.status(200).json(receipt);
  } catch (error) {
    next(error);
  }
};
