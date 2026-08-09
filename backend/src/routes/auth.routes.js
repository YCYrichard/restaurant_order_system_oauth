const router = require('express').Router();
const rateLimit = require('express-rate-limit');

const controller = require('../controllers/auth.controller');

const RATE_LIMIT_MESSAGE = {
  code: 'RATE_LIMITED',
  message: 'Too many requests, please try again later.',
  details: null,
};

// Generous - covers legitimate repeated clicks on a login button.
const oauthStartLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
});

// Tighter - these are the endpoints a credential-stuffing/brute-force
// attempt would actually hit.
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
});

router.get('/google', oauthStartLimiter, controller.googleLogin);
router.get('/google/callback', controller.googleCallback);

router.get('/facebook', oauthStartLimiter, controller.facebookLogin);
router.get('/facebook/callback', controller.facebookCallback);

router.get('/line', oauthStartLimiter, controller.lineLogin);
router.get('/line/callback', controller.lineCallback);

router.get('/me', controller.me);

// Local admin login
router.post('/admin-login', credentialLimiter, controller.adminLogin);

router.post('/refresh', credentialLimiter, controller.refresh);
router.post('/logout', controller.logout);

module.exports = router;
