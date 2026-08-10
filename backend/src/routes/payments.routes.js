const router = require('express').Router();
const controller = require('../controllers/payments.controller');

// Public: the browser needs to know which provider is live before it can
// render a payment form. Only client-safe keys are returned.
router.get('/config', controller.getConfig);

module.exports = router;
