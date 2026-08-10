// Payment configuration, deliberately NOT part of config/env.js.
//
// env.js fails fast on missing variables, which is right for a JWT secret
// but wrong here: a store that takes cash at the counter should not need a
// gateway account to boot the server. Missing TapPay keys mean the app runs
// in `manual` mode (pay at pickup), not a server that refuses to start.

const PROVIDERS = ['manual', 'tappay'];

// TapPay requires whole-number amounts for zero-decimal currencies.
const ZERO_DECIMAL_CURRENCIES = ['TWD', 'JPY', 'KRW'];

function tappayConfig() {
  const partnerKey = process.env.TAPPAY_PARTNER_KEY;
  const merchantId = process.env.TAPPAY_MERCHANT_ID;
  const appId = process.env.TAPPAY_APP_ID;
  const appKey = process.env.TAPPAY_APP_KEY;

  // Every one of these is needed for a charge to work. Having some but not
  // all is a half-finished setup, and reporting it as configured would turn
  // a config mistake into a failed customer payment.
  const configured = Boolean(partnerKey && merchantId && appId && appKey);

  return {
    configured,
    partnerKey,
    merchantId,
    // appId/appKey are the CLIENT-side pair; TapPay intends them to be
    // public and they are sent to the browser. partnerKey is the secret and
    // must never leave the server.
    appId,
    appKey,
    env: process.env.TAPPAY_ENV === 'production' ? 'production' : 'sandbox',
    currency: process.env.PAYMENT_CURRENCY || 'TWD',
  };
}

/// Which provider a charge should go through. Falls back to `manual` rather
/// than erroring, so an unconfigured deployment degrades to pay-at-pickup
/// instead of blocking checkout entirely.
function activeProvider() {
  const requested = (process.env.PAYMENT_PROVIDER || '').toLowerCase();

  if (requested === 'tappay') {
    return tappayConfig().configured ? 'tappay' : 'manual';
  }

  return PROVIDERS.includes(requested) ? requested : 'manual';
}

function isZeroDecimal(currency) {
  return ZERO_DECIMAL_CURRENCIES.includes(String(currency).toUpperCase());
}

module.exports = {
  PROVIDERS,
  tappayConfig,
  activeProvider,
  isZeroDecimal,
};
