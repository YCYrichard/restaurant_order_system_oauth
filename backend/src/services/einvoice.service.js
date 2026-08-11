const { isValidTaxId } = require('../utils/tax-id');

const INVOICE_NUMBER_PATTERN = /^[A-Z]{2}\d{8}$/;

// Mobile barcode carrier (手機條碼): a fixed 8 characters - a leading '/'
// followed by 7 characters from [0-9A-Z+-.] - per the Ministry of Finance's
// own e-invoice platform documentation. This only checks the shape; whether
// the barcode is actually registered requires the government's own
// verification API, which this system doesn't call (same reasoning as not
// allocating real invoice numbers - see normalizeInvoiceNumber below).
const CARRIER_NUMBER_PATTERN = /^\/[0-9A-Z+\-.]{7}$/;

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
function resolveBuyerInput({ storeEinvoiceEnabled, buyerTaxId, donate, carrierNumber }) {
  if (!storeEinvoiceEnabled) {
    return { status: 'not_applicable', buyerTaxId: null, donate: false, carrierNumber: null };
  }

  const trimmedTaxId = typeof buyerTaxId === 'string' ? buyerTaxId.trim() : '';
  const trimmedCarrier =
    typeof carrierNumber === 'string' ? carrierNumber.trim().toUpperCase() : '';
  const donateFlag = donate === true || donate === 'true';

  // Mirrors the real checkout choice: a personal invoice by default
  // (optionally stored to the buyer's own carrier), a company tax ID for a
  // B2B deduction, or donating it away - never more than one of these three
  // paths at once. A company invoice isn't stored to a personal carrier, and
  // a donated one isn't kept at all.
  const chosenPaths = [trimmedTaxId, trimmedCarrier, donateFlag].filter(Boolean).length;

  if (chosenPaths > 1) {
    throw new EinvoiceValidationError(
      'Choose only one of a company tax ID, a carrier number, or donating the invoice'
    );
  }

  if (trimmedTaxId && !isValidTaxId(trimmedTaxId)) {
    throw new EinvoiceValidationError('A buyer tax ID must be exactly 8 digits');
  }

  if (trimmedCarrier && !CARRIER_NUMBER_PATTERN.test(trimmedCarrier)) {
    throw new EinvoiceValidationError(
      "A carrier number must be a mobile barcode: '/' followed by 7 letters, digits, or +-. characters"
    );
  }

  return {
    status: 'pending',
    buyerTaxId: trimmedTaxId || null,
    donate: donateFlag,
    carrierNumber: trimmedCarrier || null,
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
  CARRIER_NUMBER_PATTERN,
  resolveBuyerInput,
  normalizeInvoiceNumber,
};
