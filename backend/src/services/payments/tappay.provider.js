const axios = require('axios');
const paymentsConfig = require('../../config/payments');

// TapPay Pay-by-Prime.
//
// The browser tokenises a card / LINE Pay / JKOPay selection into a one-shot
// "Prime" using the CLIENT keys, and posts only that Prime here. The charge
// itself is made server-side with the partner key and the SERVER's order
// total - the client never states an amount, which is the whole point of the
// server-authoritative pricing work that preceded this.

const name = 'tappay';

const HOSTS = {
  sandbox: 'https://sandbox.tappaysdk.com',
  production: 'https://prod.tappaysdk.com',
};

class PaymentProviderError extends Error {
  constructor(message, { code, raw } = {}) {
    super(message);
    this.status = 402;
    this.code = code || 'PAYMENT_FAILED';
    this.raw = raw;
  }
}

class PaymentNotConfiguredError extends Error {
  constructor(message = 'Card payment is not available for this store yet') {
    super(message);
    // 400, not 503: this app's error middleware masks every 5xx message as
    // "Internal server error" to avoid leaking internals on genuine faults.
    // An unconfigured gateway is a client-actionable state (pay another
    // way), not a server fault, so its message needs to reach the caller.
    this.status = 400;
    this.code = 'PAYMENT_NOT_CONFIGURED';
  }
}

function requireConfig() {
  const config = paymentsConfig.tappayConfig();

  if (!config.configured) {
    throw new PaymentNotConfiguredError();
  }

  return config;
}

/// TapPay wants an integer for zero-decimal currencies like TWD.
///
/// A TWD menu should be priced in whole dollars; if it isn't, rounding here
/// means the customer is charged a few cents away from the order total. The
/// charged figure is what gets written to `payments.amount` (not the order
/// total) so reconciliation surfaces the gap instead of hiding it.
function toProviderAmount(amount, currency) {
  return paymentsConfig.isZeroDecimal(currency)
    ? Math.round(Number(amount))
    : Number(Number(amount).toFixed(2));
}

async function post(path, body, config) {
  const response = await axios.post(`${HOSTS[config.env]}${path}`, body, {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.partnerKey,
    },
    // A hung gateway must not hold a checkout request open indefinitely.
    timeout: 20000,
  });

  return response.data;
}

async function charge({ prime, amount, currency, orderId, cardholder, details }) {
  const config = requireConfig();

  if (!prime) {
    throw new PaymentProviderError('A payment token (prime) is required', {
      code: 'PAYMENT_TOKEN_MISSING',
    });
  }

  const chargedAmount = toProviderAmount(amount, currency);

  const data = await post(
    '/tpc/payment/pay-by-prime',
    {
      prime,
      partner_key: config.partnerKey,
      merchant_id: config.merchantId,
      amount: chargedAmount,
      currency: String(currency).toUpperCase(),
      details: (details || `Order #${orderId}`).slice(0, 100),
      // TapPay requires all three cardholder fields to be present, even
      // when empty - omitting them is rejected outright.
      cardholder: {
        phone_number: cardholder?.phone || '',
        name: cardholder?.name || '',
        email: cardholder?.email || '',
      },
      order_number: String(orderId),
      remember: false,
    },
    config
  );

  // TapPay signals failure with HTTP 200 and a non-zero status field, so a
  // successful HTTP call proves nothing on its own.
  if (Number(data?.status) !== 0) {
    throw new PaymentProviderError(
      data?.msg || 'The payment was declined',
      { code: `TAPPAY_${data?.status ?? 'UNKNOWN'}`, raw: data }
    );
  }

  return {
    status: 'paid',
    providerTransactionId: data.rec_trade_id,
    method: data.payment_method_used || data.card_info?.issuer || 'card',
    amount: chargedAmount,
    raw: data,
  };
}

async function refund({ providerTransactionId, amount, currency }) {
  const config = requireConfig();

  if (!providerTransactionId) {
    throw new PaymentProviderError(
      'This order has no gateway transaction to refund',
      { code: 'PAYMENT_TRANSACTION_MISSING' }
    );
  }

  const data = await post(
    '/tpc/transaction/refund',
    {
      partner_key: config.partnerKey,
      rec_trade_id: providerTransactionId,
      amount: toProviderAmount(amount, currency),
    },
    config
  );

  if (Number(data?.status) !== 0) {
    throw new PaymentProviderError(data?.msg || 'The refund was rejected', {
      code: `TAPPAY_${data?.status ?? 'UNKNOWN'}`,
      raw: data,
    });
  }

  return {
    status: 'refunded',
    providerTransactionId,
    raw: data,
  };
}

module.exports = {
  name,
  charge,
  refund,
  toProviderAmount,
  PaymentProviderError,
  PaymentNotConfiguredError,
};
