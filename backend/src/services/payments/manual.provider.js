// Pay at the counter / on pickup. The default provider.
//
// This is not a placeholder for "payments aren't done yet" - it's how most
// small restaurants actually operate, and it stays a legitimate choice after
// TapPay is configured. Recording it as a payment (rather than leaving the
// order unpaid forever) is what lets reporting treat cash and card the same.

const name = 'manual';

async function charge({ amount, currency }) {
  return {
    status: 'pending',
    providerTransactionId: null,
    method: 'manual',
    // No gateway call happens, so there is no response to keep. Saying so
    // explicitly beats an empty object that reads like a lost reply.
    raw: { note: 'Collected in person; no gateway involved', amount, currency },
  };
}

async function refund({ amount }) {
  return {
    status: 'refunded',
    providerTransactionId: null,
    raw: { note: 'Refunded in person; no gateway involved', amount },
  };
}

module.exports = { name, charge, refund };
