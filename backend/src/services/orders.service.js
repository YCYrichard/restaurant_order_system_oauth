const db = require('../config/db');
const ordersRepository = require('../repositories/orders.repository');

const TOTAL_TOLERANCE = 0.01;

const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'completed',
  'cancelled',
];
const TERMINAL_STATUSES = ['completed', 'cancelled'];
const FORWARD_TRANSITIONS = {
  pending: 'confirmed',
  confirmed: 'preparing',
  preparing: 'ready',
  ready: 'completed',
};

class OrderValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = 'ORDER_VALIDATION_ERROR';
  }
}

class OrderNotFoundError extends Error {
  constructor(message = 'Order not found') {
    super(message);
    this.status = 404;
    this.code = 'NOT_FOUND';
  }
}

class OrderAccessDeniedError extends Error {
  constructor(message = 'You do not have access to this order') {
    super(message);
    this.status = 403;
    this.code = 'FORBIDDEN';
  }
}

// Cancel is allowed from any non-terminal state; otherwise status can only
// advance one step at a time through the fixed pending -> ... -> completed
// sequence. Nothing is valid once an order is completed or cancelled.
function isValidTransition(currentStatus, nextStatus) {
  if (TERMINAL_STATUSES.includes(currentStatus)) {
    return false;
  }

  if (nextStatus === 'cancelled') {
    return true;
  }

  return FORWARD_TRANSITIONS[currentStatus] === nextStatus;
}

function computeItemsTotal(items) {
  return items.reduce(
    (sum, item) => sum + Number(item.price) * Number(item.quantity),
    0
  );
}

function validateCreateOrderInput(input) {
  const { storeId, items, total, customerName, customerPhone } = input;

  if (
    !storeId ||
    !Array.isArray(items) ||
    items.length === 0 ||
    !total ||
    !customerName ||
    !customerPhone
  ) {
    throw new OrderValidationError('Missing required fields');
  }

  for (const item of items) {
    if (
      !item.productId ||
      !Number.isFinite(Number(item.quantity)) ||
      Number(item.quantity) <= 0
    ) {
      throw new OrderValidationError(
        'Each item requires a valid productId and quantity'
      );
    }

    if (!Number.isFinite(Number(item.price)) || Number(item.price) < 0) {
      throw new OrderValidationError('Each item requires a valid price');
    }
  }

  const computedTotal = computeItemsTotal(items);

  if (Math.abs(computedTotal - Number(total)) > TOTAL_TOLERANCE) {
    throw new OrderValidationError(
      'Order total does not match item prices and quantities'
    );
  }
}

async function createOrder(input) {
  validateCreateOrderInput(input);

  const {
    userId,
    storeId,
    items,
    total,
    customerName,
    customerPhone,
    customerEmail,
    notes,
  } = input;

  const connection = await db.getConnection();
  let orderId;

  try {
    await connection.beginTransaction();

    orderId = await ordersRepository.insertOrder(
      { userId, storeId, total, customerName, customerPhone, customerEmail, notes },
      connection
    );

    await ordersRepository.insertOrderItems(orderId, items, connection);

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return ordersRepository.findOrderWithItems(orderId);
}

async function getOrdersForUser(userId) {
  return ordersRepository.findOrdersByUser(userId);
}

async function getOrderById(orderId) {
  return ordersRepository.findOrderWithItems(orderId);
}

// Update/status-change and store-scoped listing are addressed by orderId or
// storeId without necessarily being the caller's own order, so access is
// resolved explicitly here - mirrors
// categories.service.js:resolveCategoryAccess.
async function resolveOrderAccess(orderId, user) {
  const order = await ordersRepository.findOrderById(orderId);

  if (!order) {
    throw new OrderNotFoundError();
  }

  if (user.role !== 'admin') {
    const hasAccess = await ordersRepository.hasStoreAccess(
      user.id,
      order.store_id
    );

    if (!hasAccess) {
      throw new OrderAccessDeniedError();
    }
  }

  return order;
}

async function updateOrderStatus(orderId, user, status) {
  if (!ORDER_STATUSES.includes(status)) {
    throw new OrderValidationError(
      `status must be one of: ${ORDER_STATUSES.join(', ')}`
    );
  }

  const order = await resolveOrderAccess(orderId, user);

  if (!isValidTransition(order.status, status)) {
    throw new OrderValidationError(
      `Cannot transition order from '${order.status}' to '${status}'`
    );
  }

  await ordersRepository.updateOrderStatus(orderId, status);

  return ordersRepository.findOrderWithItems(orderId);
}

async function listOrdersForStore(storeId, user) {
  if (user.role !== 'admin') {
    const hasAccess = await ordersRepository.hasStoreAccess(
      user.id,
      storeId
    );

    if (!hasAccess) {
      throw new OrderAccessDeniedError();
    }
  }

  return ordersRepository.findOrdersByStore(storeId);
}

module.exports = {
  OrderValidationError,
  OrderNotFoundError,
  OrderAccessDeniedError,
  createOrder,
  getOrdersForUser,
  getOrderById,
  updateOrderStatus,
  listOrdersForStore,
};
