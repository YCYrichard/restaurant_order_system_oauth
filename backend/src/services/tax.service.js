function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

/// Splits an amount into subtotal / tax / total for a store's tax settings.
///
/// Two genuinely different models, and confusing them misprices every
/// order:
///
///   INCLUSIVE (Taiwan's 內含 5% business tax, the default): the menu price
///   already contains the tax. A 100 item stays 100 to the customer; the
///   receipt shows that 4.76 of it was tax. total == amount.
///
///   EXCLUSIVE (US-style): tax is added on top. A 100 item costs 105.
///
/// [amount] is the post-discount figure the customer is being charged
/// under the inclusive model, or the pre-tax base under the exclusive one.
function computeTax(amount, { taxRate = 0, taxInclusive = true } = {}) {
  const rate = Number(taxRate) || 0;
  const gross = roundMoney(Number(amount) || 0);

  if (rate <= 0) {
    return {
      subtotal: gross,
      taxAmount: 0,
      total: gross,
      taxRate: 0,
      taxInclusive: Boolean(taxInclusive),
    };
  }

  if (taxInclusive) {
    // Back the tax out of the gross: tax = gross - gross / (1 + rate).
    const subtotal = roundMoney(gross / (1 + rate));

    return {
      subtotal,
      // Derived by subtraction rather than computed separately, so the
      // three figures always reconcile exactly even after rounding.
      taxAmount: roundMoney(gross - subtotal),
      total: gross,
      taxRate: rate,
      taxInclusive: true,
    };
  }

  const taxAmount = roundMoney(gross * rate);

  return {
    subtotal: gross,
    taxAmount,
    total: roundMoney(gross + taxAmount),
    taxRate: rate,
    taxInclusive: false,
  };
}

module.exports = {
  computeTax,
  roundMoney,
};
