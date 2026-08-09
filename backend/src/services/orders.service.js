const db = require('../config/db');
const ordersRepository = require('../repositories/orders.repository');
const couponsRepository = require('../repositories/coupons.repository');
const couponsService = require('./coupons.service');

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
const FULFILLMENT_TYPES = ['pickup', 'delivery', 'dine_in'];
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

// Reverse of FORWARD_TRANSITIONS, so a mis-bump on the kitchen display can
// be recalled one step (e.g. preparing -> confirmed). Mis-bumps are routine
// on a busy pass, and without this the only escape from a wrong tap is
// cancelling a live order.
const BACKWARD_TRANSITIONS = Object.fromEntries(
  Object.entries(FORWARD_TRANSITIONS).map(([from, to]) => [to, from])
);

// Cancel is allowed from any non-terminal state; otherwise status moves one
// step at a time along the pending -> ... -> completed sequence, forward or
// back. Nothing is valid once an order is completed or cancelled - a
// finished order stays finished.
function isValidTransition(currentStatus, nextStatus) {
  if (TERMINAL_STATUSES.includes(currentStatus)) {
    return false;
  }

  if (nextStatus === 'cancelled') {
    return true;
  }

  return (
    FORWARD_TRANSITIONS[currentStatus] === nextStatus ||
    BACKWARD_TRANSITIONS[currentStatus] === nextStatus
  );
}

function computeItemsTotal(items) {
  return items.reduce(
    (sum, item) => sum + Number(item.price) * Number(item.quantity),
    0
  );
}

function validateCreateOrderInput(input) {
  const {
    storeId,
    items,
    total,
    customerName,
    customerPhone,
    fulfillmentType,
    deliveryAddress,
  } = input;

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

  if (
    fulfillmentType !== undefined &&
    !FULFILLMENT_TYPES.includes(fulfillmentType)
  ) {
    throw new OrderValidationError(
      `fulfillmentType must be one of: ${FULFILLMENT_TYPES.join(', ')}`
    );
  }

  if (
    fulfillmentType === 'delivery' &&
    (typeof deliveryAddress !== 'string' || !deliveryAddress.trim())
  ) {
    throw new OrderValidationError(
      'A delivery address is required for delivery orders'
    );
  }

  if (fulfillmentType === 'dine_in') {
    const parsedTableNumber = Number(input.tableNumber);

    if (!Number.isInteger(parsedTableNumber) || parsedTableNumber <= 0) {
      throw new OrderValidationError(
        'A valid table number is required for dine-in orders'
      );
    }
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
    fulfillmentType,
    deliveryAddress,
    tableNumber,
    couponCode,
  } = input;

  const connection = await db.getConnection();
  let orderId;

  try {
    await connection.beginTransaction();

    // `total` has already been reconciled against the line items, so it's
    // the trustworthy pre-discount subtotal. Any discount is derived here
    // from the coupon code alone - the client never supplies an amount, or
    // it could simply claim its own discount.
    const subtotal = Number(total);
    let discountAmount = 0;
    let appliedCoupon = null;

    if (couponCode) {
      const resolved = await couponsService.resolveDiscount(
        { code: couponCode, storeId, subtotal, userId },
        connection
      );

      appliedCoupon = resolved.coupon;
      discountAmount = resolved.discountAmount;

      // Conditional increment - if this returns false the coupon hit its
      // cap between resolution and here (concurrent checkout), so the whole
      // order rolls back rather than over-redeeming.
      const reserved = await couponsRepository.incrementRedemptionCount(
        appliedCoupon.id,
        connection
      );

      if (!reserved) {
        throw new couponsService.CouponValidationError(
          'That coupon has reached its redemption limit'
        );
      }
    }

    orderId = await ordersRepository.insertOrder(
      {
        userId,
        storeId,
        total: Math.round((subtotal - discountAmount) * 100) / 100,
        discountAmount,
        couponCode: appliedCoupon ? appliedCoupon.code : null,
        customerName,
        customerPhone,
        customerEmail,
        notes,
        fulfillmentType: fulfillmentType || 'pickup',
        deliveryAddress:
          fulfillmentType === 'delivery' ? deliveryAddress.trim() : null,
        tableNumber:
          fulfillmentType === 'dine_in' ? Number(tableNumber) : null,
      },
      connection
    );

    await ordersRepository.insertOrderItems(orderId, items, connection);

    if (appliedCoupon) {
      await couponsRepository.insertRedemption(
        {
          couponId: appliedCoupon.id,
          orderId,
          userId,
          discountAmount,
        },
        connection
      );
    }

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

async function listOrdersForStore(storeId, user, { activeOnly = false } = {}) {
  if (user.role !== 'admin') {
    const hasAccess = await ordersRepository.hasStoreAccess(
      user.id,
      storeId
    );

    if (!hasAccess) {
      throw new OrderAccessDeniedError();
    }
  }

  return ordersRepository.findOrdersByStore(storeId, { activeOnly });
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
