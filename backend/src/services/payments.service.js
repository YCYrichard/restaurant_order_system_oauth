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

/// Charges an order. The amount is read from the stored order, never from
/// the request - the client supplies only a payment token.
async function payOrder(orderId, { provider: requestedProvider, prime, cardholder }) {
  const order = await ordersRepository.findOrderById(orderId);

  if (!order) {
    throw new PaymentValidationError('That order does not exist');
  }

  if (order.payment_status === 'paid') {
    throw new PaymentValidationError('This order has already been paid');
  }

  const provider = resolveProvider(requestedProvider);
  const currency = paymentsConfig.tappayConfig().currency;
  const alreadyPaid = await paymentsRepository.sumPaidForOrder(orderId);
  const outstanding = roundMoney(Number(order.total) - alreadyPaid);

  if (outstanding <= 0) {
    throw new PaymentValidationError('This order has nothing left to pay');
  }

  let result;

  try {
    result = await provider.charge({
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
  } catch (error) {
    // A declined card is part of the order's history. Recording the failure
    // is what makes "it says it charged me" answerable later.
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

    throw error;
  }

  // The provider's own figure wins when it reports one: for TWD it may have
  // rounded to a whole dollar, and the record must show what was charged.
  const chargedAmount = roundMoney(
    result.amount !== undefined ? Number(result.amount) : outstanding
  );

  const paymentId = await paymentsRepository.insertPayment({
    orderId,
    provider: provider.name,
    providerTransactionId: result.providerTransactionId,
    amount: chargedAmount,
    currency,
    status: result.status,
    method: result.method,
    rawResponse: result.raw,
  });

  await paymentsRepository.updateOrderPaymentStatus(
    orderId,
    result.status === 'paid' ? 'paid' : 'unpaid'
  );

  return {
    id: paymentId,
    provider: provider.name,
    status: result.status,
    amount: chargedAmount,
    currency,
    method: result.method ?? null,
  };
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
  getClientConfig,
  getPaymentsForOrder,
  payOrder,
  refundPayment,
};
