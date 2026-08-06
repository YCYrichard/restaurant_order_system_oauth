const router = require('express').Router();
const controller = require('../controllers/stores.controller');

// Create a new store
router.post('/', controller.createStore);

// List all stores
router.get('/', controller.listStores);

module.exports = router;