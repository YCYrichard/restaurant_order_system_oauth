const db = require('../config/db');
const ordersRepository = require('../repositories/orders.repository');

const TOTAL_TOLERANCE = 0.01;

class OrderValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = 'ORDER_VALIDATION_ERROR';
  }
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

module.exports = {
  OrderValidationError,
  createOrder,
  getOrdersForUser,
  getOrderById,
};
