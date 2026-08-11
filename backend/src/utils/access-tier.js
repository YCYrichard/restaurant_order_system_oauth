// owner_store_access.access_role has three tiers ('owner'/'manager'/'staff'),
// plus the global 'admin' role which bypasses per-store checks entirely.
// Kitchen/order-status actions stay open to every tier; store-config,
// refund, and deletion actions require owner-tier (owner/manager/admin).
const OWNER_TIER_ROLES = ['admin', 'owner', 'manager'];

function isOwnerTier(accessRole) {
  return OWNER_TIER_ROLES.includes(accessRole);
}

module.exports = { isOwnerTier, OWNER_TIER_ROLES };
