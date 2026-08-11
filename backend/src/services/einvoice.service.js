const { isValidTaxId } = require('../utils/tax-id');

const INVOICE_NUMBER_PATTERN = /^[A-Z]{2}\d{8}$/;

class EinvoiceValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.code = 'EINVOICE_VALIDATION_ERROR';
  }
}

/// Resolves what an order's e-invoice fields should be at checkout, from the
/// store's own setting and the buyer's optional choice. A store that hasn't
/// enabled invoicing (the default - most restaurants this size fall under
/// the NT$200,000/month exemption) never sets these, regardless of what a
/// client sends. 'pending' means an invoice is owed and needs to be issued
/// through the store's own real MOF-registered system - nothing here
/// generates a real government invoice number.
function resolveBuyerInput({ storeEinvoiceEnabled, buyerTaxId, donate }) {
  if (!storeEinvoiceEnabled) {
    return { status: 'not_applicable', buyerTaxId: null, donate: false };
  }

  const trimmedTaxId = typeof buyerTaxId === 'string' ? buyerTaxId.trim() : '';
  const donateFlag = donate === true || donate === 'true';

  // Mirrors the real checkout choice: a personal invoice by default, a
  // company tax ID for a B2B deduction, or donating it away - never more
  // than one of the two non-default paths at once.
  if (trimmedTaxId && donateFlag) {
    throw new EinvoiceValidationError(
      'Choose either a company tax ID or donating the invoice, not both'
    );
  }

  if (trimmedTaxId && !isValidTaxId(trimmedTaxId)) {
    throw new EinvoiceValidationError('A buyer tax ID must be exactly 8 digits');
  }

  return {
    status: 'pending',
    buyerTaxId: trimmedTaxId || null,
    donate: donateFlag,
  };
}

/// Real Taiwan uniform invoice numbers are a 2-letter track (字軌) issued by
/// the tax authority followed by an 8-digit number - this only validates the
/// shape of a number staff already obtained elsewhere, it doesn't allocate
/// one.
function normalizeInvoiceNumber(value) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';

  if (!INVOICE_NUMBER_PATTERN.test(normalized)) {
    throw new EinvoiceValidationError(
      'Invoice number must be two letters followed by 8 digits, e.g. AB12345678'
    );
  }

  return normalized;
}

module.exports = {
  EinvoiceValidationError,
  INVOICE_NUMBER_PATTERN,
  resolveBuyerInput,
  normalizeInvoiceNumber,
};
