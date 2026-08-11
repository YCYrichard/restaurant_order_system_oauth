// Taiwan unified business number (統一編號): exactly 8 digits. Shared by a
// store's own registration number and a buyer's optional company number at
// checkout - lives here rather than in einvoice.service.js so stores.service
// can validate the store's own number without importing order-domain logic.
const TAX_ID_PATTERN = /^\d{8}$/;

function isValidTaxId(value) {
  return typeof value === 'string' && TAX_ID_PATTERN.test(value.trim());
}

module.exports = { TAX_ID_PATTERN, isValidTaxId };
