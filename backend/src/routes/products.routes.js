const router = require('express').Router();
const controller = require('../controllers/products.controller');

// Create a new product
router.post('/', controller.createProduct);

// List products for a store
router.get('/store/:storeId', controller.listProductsByStore);

module.exports = router;