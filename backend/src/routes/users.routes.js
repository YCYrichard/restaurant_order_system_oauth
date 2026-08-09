const router = require('express').Router();

const controller = require('../controllers/users.controller');

const { requireAuth, requireAdmin } = require('../middleware/auth.middleware');

// Every users endpoint is admin-only: this resource manages who can access
// which store, which only an admin should be able to grant/revoke.
router.use(requireAuth, requireAdmin);

router.get('/', controller.listUsers);
router.get('/:userId/store-access', controller.getStoreAccessForUser);
router.post('/:userId/store-access', controller.grantStoreAccess);
router.delete('/:userId/store-access/:storeId', controller.revokeStoreAccess);

module.exports = router;
