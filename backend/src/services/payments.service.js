const db = require('../config/db');
const paymentsConfig = require('../config/payments');
const paymentsRepository = require('../repositories/payments.repository');
const ordersRepository = require('../repositories/orders.repository');
const manualProvider = require('./payments/manual.provider');
const tappayProvider = require('./payments/tappay.provider');

// Provider-agnostic seam. Everything above this line talks about "charging
// an order"; only the provider modules know what a Prime or a rec_trade_id
// is. Adding ECPay (for the convenience-store and ATM methods TapPay does
// not cover) means adding a module here, not touching orders.

const PROVIDERS = {
  manual: manualProvider,
  tappay: tappayProvider,
};

class PaymentValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = 'PAYMENT_VALIDATION_ERROR';
  }
}

class PaymentAccessDeniedError extends Error {
  constructor(message = 'You do not have access to this order') {
    super(message);
    this.status = 403;
    this.code = 'FORBIDDEN';
  }
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function resolveProvider(requested) {
  const chosen = requested || paymentsConfig.activeProvider();
  const provider = PROVIDERS[chosen];

  if (!provider) {
    throw new PaymentValidationError(`Unknown payment provider '${chosen}'`);
  }

  // Asking for a gateway that has no credentials is a configuration error,
  // not something to quietly downgrade to cash - the customer chose to pay
  // by card and would otherwise be told their order was paid when it wasn't.
  if (chosen === 'tappay' && !paymentsConfig.tappayConfig().configured) {
    throw new tappayProvider.PaymentNotConfiguredError();
  }

  return provider;
}

/// What the browser needs in order to render a payment form: which provider
/// is live and, for TapPay, the CLIENT key pair its SDK requires. The
/// partner key is deliberately absent - it never leaves the server.
function getClientConfig() {
  const provider = paymentsConfig.activeProvider();

  if (provider !== 'tappay') {
    return { provider: 'manual', currency: paymentsConfig.tappayConfig().currency };
  }

  const config = paymentsConfig.tappayConfig();

  return {
    provider: 'tappay',
    appId: Number(config.appId),
    appKey: config.appKey,
    env: config.env,
    currency: config.currency,
  };
}

async function getPaymentsForOrder(orderId) {
  return paymentsRepository.findPaymentsForOrder(orderId);
}

// Not imported from orders.service - that module already requires this one
// (for refunds), so importing back would be circular. Mirrors the ownership
// check orders.service.resolveOrderAccess does for the same reason: an
// order belongs to the customer who placed it, or to staff at that store.
async function assertOrderAccess(order, user) {
  if (order.user_id === user.id || user.role === 'admin') {
    return;
  }

  const hasAccess = await ordersRepository.hasStoreAccess(
    user.id,
    order.store_id
  );

  if (!hasAccess) {
    throw new PaymentAccessDeniedError();
  }
}

/// Charges an order. The amount is read from the stored order, never from
/// the request - the client supplies only a payment token.
///
/// The balance check, the gateway call, and the payment record all happen
/// under one row lock on the order, so two concurrent charge attempts on
/// the same order (a double-click, or a client retry after a slow SDK
/// response) can't both read "nothing paid yet" before either commits and
/// both charge the card. A failed/declined attempt is recorded afterward,
/// outside the lock - no money moved, so there's nothing to race.
async function payOrder(
  orderId,
  user,
  { provider: requestedProvider, prime, cardholder }
) {
  const order = await ordersRepository.findOrderById(orderId);

  if (!order) {
    throw new PaymentValidationError('That order does not exist');
  }

  await assertOrderAccess(order, user);

  const provider = resolveProvider(requestedProvider);
  const currency = paymentsConfig.tappayConfig().currency;
  const connection = await db.getConnection();
  let outstanding = 0;

  try {
    await connection.beginTransaction();
    await ordersRepository.lockOrderRow(orderId, connection);

    const alreadyPaid = await paymentsRepository.sumPaidForOrder(
      orderId,
      connection
    );
    outstanding = roundMoney(Number(order.total) - alreadyPaid);

    if (outstanding <= 0) {
      throw new PaymentValidationError('This order has nothing left to pay');
    }

    const result = await provider.charge({
      prime,
      amount: outstanding,
      currency,
      orderId,
      cardholder: cardholder || {
        name: order.customer_name,
        phone: order.customer_phone,
        email: order.customer_email,
      },
    });

    // The provider's own figure wins when it reports one: for TWD it may
    // have rounded to a whole dollar, and the record must show what was
    // charged.
    const chargedAmount = roundMoney(
      result.amount !== undefined ? Number(result.amount) : outstanding
    );

    const paymentId = await paymentsRepository.insertPayment(
      {
        orderId,
        provider: provider.name,
        providerTransactionId: result.providerTransactionId,
        amount: chargedAmount,
        currency,
        status: result.status,
        method: result.method,
        rawResponse: result.raw,
      },
      connection
    );

    await paymentsRepository.updateOrderPaymentStatus(
      orderId,
      result.status === 'paid' ? 'paid' : 'unpaid',
      connection
    );

    await connection.commit();

    return {
      id: paymentId,
      provider: provider.name,
      status: result.status,
      amount: chargedAmount,
      currency,
      method: result.method ?? null,
    };
  } catch (error) {
    await connection.rollback();

    // A declined card is part of the order's history. Recording the failure
    // is what makes "it says it charged me" answerable later - done after
    // releasing the lock, since a failed attempt moved no money and doesn't
    // need the race protection above. Skipped for our own validation error
    // (nothing was ever attempted with the gateway in that case).
    if (outstanding > 0 && !(error instanceof PaymentValidationError)) {
      await paymentsRepository.insertPayment({
        orderId,
        provider: provider.name,
        providerTransactionId: null,
        amount: outstanding,
        currency,
        status: 'failed',
        method: null,
        rawResponse: error.raw || { message: error.message },
      });

      await paymentsRepository.updateOrderPaymentStatus(orderId, 'failed');
    }

    throw error;
  } finally {
    connection.release();
  }
}

/// Sends a refund to the gateway that took the money, when there was one.
///
/// Returns null for orders with no gateway charge (cash, or an order paid
/// before payments existed) so the caller can still record the refund - the
/// money moved at the counter, and refusing to record it would leave the
/// books wrong.
async function refundPayment(orderId, amount) {
  const payment = await paymentsRepository.findLatestPaidPayment(orderId);

  if (!payment || payment.provider === 'manual') {
    return null;
  }

  const provider = resolveProvider(payment.provider);

  const result = await provider.refund({
    providerTransactionId: payment.provider_transaction_id,
    amount,
    currency: payment.currency,
  });

  // A partial refund leaves the charge partly live, so only a full refund
  // marks the payment itself refunded.
  if (roundMoney(Number(amount)) >= roundMoney(Number(payment.amount))) {
    await paymentsRepository.updatePaymentStatus(payment.id, 'refunded');
    await paymentsRepository.updateOrderPaymentStatus(orderId, 'refunded');
  }

  return result;
}

module.exports = {
  PaymentValidationError,
  PaymentAccessDeniedError,
  getClientConfig,
  getPaymentsForOrder,
  payOrder,
  refundPayment,
};
