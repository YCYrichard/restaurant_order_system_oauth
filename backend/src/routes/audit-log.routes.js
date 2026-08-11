const router = require('express').Router();

const controller = require('../controllers/audit-log.controller');
const { requireAuth, requireAdmin } = require('../middleware/auth.middleware');

// Platform-wide visibility only, not scoped to owners - matches why
// UsersPanel is already admin-only (an owner reaching this would only see
// other stores' actions they have no business viewing).
router.get('/', requireAuth, requireAdmin, controller.listEntries);

module.exports = router;
