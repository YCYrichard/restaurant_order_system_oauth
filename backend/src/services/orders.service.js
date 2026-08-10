const db = require('../config/db');
const ordersRepository = require('../repositories/orders.repository');
const productsRepository = require('../repositories/products.repository');
const storesRepository = require('../repositories/stores.repository');
const storeHoursService = require('./store-hours.service');
const taxService = require('./tax.service');
const modifiersRepository = require('../repositories/modifiers.repository');
const modifiersService = require('./modifiers.service');
const couponsRepository = require('../repositories/coupons.repository');
const couponsService = require('./coupons.service');
const paymentsService = require('./payments.service');
const eventsService = require('./events.service');
const notificationsService = require('./notifications.service');

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
// 'delivery' stays a legal value in the orders.fulfillment_type ENUM so
// historical orders placed before it was removed still read correctly - it
// just isn't offered here as a choice for new ones.
const FULFILLMENT_TYPES = ['pickup', 'dine_in'];
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

class StoreClosedError extends Error {
  constructor(message) {
    super(message);
    this.status = 409;
    this.code = 'STORE_CLOSED';
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

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function validateCreateOrderInput(input) {
  const {
    storeId,
    items,
    total,
    customerName,
    customerPhone,
    fulfillmentType,
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
  }
}

/// Replaces every client-submitted price with the store's own price.
///
/// The client used to be trusted here: validation only checked that the
/// submitted `total` matched the sum of the submitted prices, which a
/// caller controls on both sides - so an 8.90 item could be ordered for
/// 0.01 and every check passed. Prices now come from the database, and the
/// client's figures are only used to detect a stale cart.
async function resolvePricedItems(storeId, items) {
  const productIds = [...new Set(items.map((item) => Number(item.productId)))];
  const products = await productsRepository.findProductsByIds(
    storeId,
    productIds
  );

  const productsById = new Map(
    products.map((product) => [Number(product.id), product])
  );

  // Modifier definitions for every product in the cart, fetched once.
  const modifierRows = await modifiersRepository.findGroupsForProducts(
    productIds
  );
  const groupsByProduct = modifiersRepository.groupRowsByProduct(modifierRows);

  return items.map((item) => {
    const product = productsById.get(Number(item.productId));

    // Covers both "no such product" and "belongs to another store", since
    // the lookup is already scoped to storeId - a cross-store id simply
    // isn't in the result set.
    if (!product) {
      throw new OrderValidationError(
        `Product ${item.productId} is not available at this store`
      );
    }

    if (!product.is_active) {
      throw new OrderValidationError(`${product.name} is no longer available`);
    }

    // A cart opened before the kitchen 86'd something must not slip through.
    if (product.is_eighty_sixed) {
      throw new OrderValidationError(
        `${product.name} has just sold out. Please remove it from your order.`
      );
    }

    // Option ids only from the client; every price delta is looked up.
    const { modifiers, priceDelta } = modifiersService.resolveLineModifiers(
      product,
      item.modifierOptionIds,
      groupsByProduct.get(Number(product.id))
    );

    return {
      productId: Number(product.id),
      quantity: Number(item.quantity),
      price: roundMoney(Number(product.price) + priceDelta),
      notes: item.notes,
      modifiers,
    };
  });
}

/// Resolves the customer's requested ready time into either null (ASAP, the
/// common case) or a validated Date. Enforced here, not just in the picker
/// UI, for the same reason store-hours enforcement isn't decorative: a
/// direct POST could otherwise promise a time the kitchen never agreed to.
function resolveDesiredReadyAt(store, openState, rawValue, at = new Date()) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return null;
  }

  const desired = new Date(rawValue);

  if (Number.isNaN(desired.getTime())) {
    throw new OrderValidationError('desiredReadyAt must be a valid date/time');
  }

  const minPrepMinutes = Number(store.min_prep_minutes) || 0;
  const earliest = new Date(at.getTime() + minPrepMinutes * 60000);

  if (desired.getTime() < earliest.getTime()) {
    throw new OrderValidationError(
      `${store.name} needs at least ${minPrepMinutes} minutes to prepare an order - the earliest ready time is ${earliest.toISOString()}.`
    );
  }

  const timezone = store.timezone || 'Asia/Taipei';
  const nowLocal = storeHoursService.localTimeIn(timezone, at);
  const desiredLocal = storeHoursService.localTimeIn(timezone, desired);

  // Scheduling for another day needs capacity rules to mean anything -
  // deliberately out of scope for now, so only later today is accepted.
  if (desiredLocal.isoDate !== nowLocal.isoDate) {
    throw new OrderValidationError(
      'desiredReadyAt must be later today - scheduling for another day is not supported yet.'
    );
  }

  if (openState.todayHours) {
    const [closeHour, closeMinute] = openState.todayHours.close
      .split(':')
      .map(Number);
    const configuredClose = closeHour * 60 + closeMinute;

    // A window crossing midnight closes tomorrow, not today - the same
    // end-of-day simplification store-hours.service.getPickupSlots uses.
    if (
      configuredClose > nowLocal.minutes &&
      desiredLocal.minutes > configuredClose
    ) {
      throw new OrderValidationError(
        `${store.name} closes at ${openState.todayHours.close} today - please choose an earlier time.`
      );
    }
  }

  return desired;
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
    tableNumber,
    couponCode,
  } = input;

  // Enforced here rather than only in the UI - otherwise the rule is
  // decorative and a direct POST still drops a ticket into a dark kitchen.
  const store = await storesRepository.findStoreById(storeId);

  if (!store) {
    throw new OrderValidationError('That store does not exist');
  }

  const openState = await storeHoursService.getStoreOpenState(store);

  if (!openState.isOpen) {
    throw new StoreClosedError(
      `${store.name} is not accepting orders right now. ${openState.reason ?? ''}`.trim()
    );
  }

  const desiredReadyAt = resolveDesiredReadyAt(
    store,
    openState,
    input.desiredReadyAt
  );

  // Priced from the database before the transaction opens - a stale cart
  // should fail fast without holding a connection.
  const pricedItems = await resolvePricedItems(storeId, items);
  const subtotal = roundMoney(computeItemsTotal(pricedItems));

  // The client's total is no longer an input to the charge, only a
  // staleness check: a mismatch means its cached prices have moved, and
  // silently charging the new figure would surprise the customer.
  if (Math.abs(subtotal - Number(total)) > TOTAL_TOLERANCE) {
    throw new OrderValidationError(
      'Prices have changed since this cart was created. Please refresh and try again.'
    );
  }

  const connection = await db.getConnection();
  let orderId;

  try {
    await connection.beginTransaction();

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

    // Tax is computed on the post-discount figure - a discount reduces the
    // taxable amount, it isn't applied after tax.
    const taxed = taxService.computeTax(roundMoney(subtotal - discountAmount), {
      taxRate: store.tax_rate,
      taxInclusive: store.tax_inclusive,
    });

    orderId = await ordersRepository.insertOrder(
      {
        userId,
        storeId,
        total: taxed.total,
        subtotal: taxed.subtotal,
        taxAmount: taxed.taxAmount,
        taxRate: taxed.taxRate,
        taxInclusive: taxed.taxInclusive,
        discountAmount,
        couponCode: appliedCoupon ? appliedCoupon.code : null,
        customerName,
        customerPhone,
        customerEmail,
        notes,
        fulfillmentType: fulfillmentType || 'pickup',
        // Delivery is no longer offered as a fulfillment choice - new
        // orders never carry an address. The column stays on the table for
        // historical orders placed while it was.
        deliveryAddress: null,
        tableNumber:
          fulfillmentType === 'dine_in' ? Number(tableNumber) : null,
        desiredReadyAt,
      },
      connection
    );

    // pricedItems, not items - what's persisted must be the store's prices.
    const orderItemIds = await ordersRepository.insertOrderItems(
      orderId,
      pricedItems,
      connection
    );

    // Snapshot each line's chosen options, so a later edit to a modifier
    // can't rewrite what this customer ordered or was charged.
    for (let index = 0; index < pricedItems.length; index += 1) {
      const lineModifiers = pricedItems[index].modifiers ?? [];

      if (lineModifiers.length > 0) {
        await modifiersRepository.insertOrderItemModifiers(
          orderItemIds[index],
          lineModifiers,
          connection
        );
      }
    }

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

  const order = await ordersRepository.findOrderWithItems(orderId);

  // Published after commit, never inside the transaction - a kitchen must
  // not be told about an order that then rolls back.
  eventsService.publishOrderEvent({
    type: 'order.created',
    storeId: Number(storeId),
    userId: userId ?? null,
    order,
  });

  return order;
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

  const updated = await ordersRepository.findOrderWithItems(orderId);

  // Reaches the store's other kitchen screens (so two stations don't fight
  // over the same ticket) and the customer, who sees "ready" without
  // refreshing.
  eventsService.publishOrderEvent({
    type: 'order.status_changed',
    storeId: Number(order.store_id),
    userId: order.user_id ?? null,
    order: updated,
  });

  // After the write and the live event, not instead of it - the in-app
  // channel IS that same SSE event; this only reaches channels beyond it
  // (today, LINE, when configured).
  if (status === 'ready') {
    await notificationsService.notifyOrderReady(updated);
  }

  return updated;
}

/// Structured receipt for one order. Everything comes from the order's own
/// snapshotted columns rather than live store/menu data, so a receipt
/// reprinted months later shows what was actually charged.
async function getReceipt(orderId, user) {
  const order = await ordersRepository.findOrderWithItems(orderId);

  if (!order) {
    throw new OrderNotFoundError();
  }

  // A customer may read their own receipt; staff need store access.
  const isOwnOrder = order.user_id != null && order.user_id === user?.id;

  if (!isOwnOrder && user?.role !== 'admin') {
    const hasAccess = user
      ? await ordersRepository.hasStoreAccess(user.id, order.store_id)
      : false;

    if (!hasAccess) {
      throw new OrderAccessDeniedError();
    }
  }

  const [refunds, payments] = await Promise.all([
    ordersRepository.findRefundsForOrder(orderId),
    paymentsService.getPaymentsForOrder(orderId),
  ]);

  const refundedTotal = refunds.reduce(
    (sum, refund) => sum + Number(refund.amount),
    0
  );

  return {
    order,
    refunds,
    payments,
    totals: {
      subtotal: Number(order.subtotal),
      discount: Number(order.discount_amount),
      tax: Number(order.tax_amount),
      taxRate: Number(order.tax_rate),
      taxInclusive: Boolean(order.tax_inclusive),
      total: Number(order.total),
      refunded: roundMoney(refundedTotal),
      net: roundMoney(Number(order.total) - refundedTotal),
    },
  };
}

/// Records a refund against an order, and sends it to the gateway when the
/// order was actually charged through one.
///
/// Orders paid in cash (or placed before payments existed) have no gateway
/// transaction; those are still recorded, because the money moved at the
/// counter and refusing to write it down would leave the books wrong.
async function refundOrder(orderId, user, { amount, reason }) {
  const order = await resolveOrderAccess(orderId, user);

  const parsedAmount = Number(amount);

  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    throw new OrderValidationError('A positive refund amount is required');
  }

  const alreadyRefunded = await ordersRepository.sumRefundsForOrder(orderId);
  const remaining = roundMoney(Number(order.total) - alreadyRefunded);

  if (parsedAmount > remaining + TOTAL_TOLERANCE) {
    throw new OrderValidationError(
      `Refund exceeds the remaining balance of ${remaining.toFixed(2)}`
    );
  }

  // Gateway first: if the refund is rejected there, recording it locally
  // would tell the store money went back that never did. A null result means
  // there was no gateway charge to reverse, which is not a failure.
  const gatewayResult = await paymentsService.refundPayment(
    orderId,
    roundMoney(parsedAmount)
  );

  await ordersRepository.insertRefund({
    orderId,
    amount: roundMoney(parsedAmount),
    reason,
    createdBy: user?.id ?? null,
    providerTransactionId: gatewayResult?.providerTransactionId ?? null,
  });

  return getReceipt(orderId, user);
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
  StoreClosedError,
  createOrder,
  getOrdersForUser,
  getOrderById,
  updateOrderStatus,
  listOrdersForStore,
  getReceipt,
  refundOrder,
};
