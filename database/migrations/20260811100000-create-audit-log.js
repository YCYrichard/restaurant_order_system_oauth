'use strict';

// Append-only trail of who did what to which store/resource, and when. No
// audit trail existed before this - a real gap once more than one staff
// member has admin/owner access (refunds, price/tax changes, store-access
// grants all left no record of who acted). actor_user_id is ON DELETE SET
// NULL rather than CASCADE - a deleted actor's own past actions should
// still be visible in the log, just no longer joinable to a live user row.

exports.up = function (db) {
  return db.runSql(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      actor_user_id INT NULL,
      actor_role VARCHAR(20) NOT NULL,
      action VARCHAR(64) NOT NULL,
      resource_type VARCHAR(32) NOT NULL,
      resource_id INT NULL,
      store_id INT NULL,
      details JSON NULL,
      ip_address VARCHAR(64) NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_audit_log_store (store_id),
      KEY idx_audit_log_actor (actor_user_id),
      CONSTRAINT fk_audit_log_actor FOREIGN KEY (actor_user_id)
        REFERENCES users(id) ON DELETE SET NULL
    )
  `);
};

exports.down = function (db) {
  return db.runSql('DROP TABLE IF EXISTS audit_log');
};

exports._meta = {
  version: 1,
};
