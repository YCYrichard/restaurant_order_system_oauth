'use strict';

// Refresh tokens are opaque random strings, not JWTs - only their SHA-256
// hash is stored, so a leaked database dump can't be used to mint sessions.
// replaced_by_id records the rotation chain: if a revoked token is ever
// presented again (token reuse after theft), the whole chain gets revoked.

exports.up = function (db) {
  return db.runSql(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash CHAR(64) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      revoked_at TIMESTAMP NULL,
      replaced_by_id INT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      user_agent VARCHAR(255) NULL,
      ip VARCHAR(64) NULL,
      UNIQUE KEY unique_token_hash (token_hash),
      KEY idx_refresh_tokens_user_id (user_id),
      CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_refresh_tokens_replaced_by FOREIGN KEY (replaced_by_id)
        REFERENCES refresh_tokens(id) ON DELETE SET NULL
    )
  `);
};

exports.down = function (db) {
  return db.runSql('DROP TABLE IF EXISTS refresh_tokens');
};

exports._meta = {
  version: 1,
};
