const router = require('express').Router();
const controller = require('../controllers/auth.controller');

router.get('/google', controller.googleLogin);
router.get('/google/callback', controller.googleCallback);

router.get('/facebook', controller.facebookLogin);
router.get('/facebook/callback', controller.facebookCallback);

router.get('/line', controller.lineLogin);
router.get('/line/callback', controller.lineCallback);

router.get('/me', controller.me);

// Local admin login
router.post('/admin-login', controller.adminLogin);

module.exports = router;