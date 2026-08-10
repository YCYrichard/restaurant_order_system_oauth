'use strict';

// A record of every ready-alert attempt, across every channel - including
// failed and not-configured ones. The same "a failed attempt is part of the
// history" principle payments applies to a declined card: "did the customer
// get notified their order was ready" needs to be answerable later, and a
// silent failure would make that undebuggable from day one of a future LINE
// integration.

exports.up = function (db) {
  return db.runSql(`
    CREATE TABLE IF NOT EXISTS notification_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id INT NOT NULL,
      channel VARCHAR(30) NOT NULL,
      status ENUM('sent', 'failed', 'not_configured') NOT NULL,
      error VARCHAR(500) NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_notification_log_order (order_id),
      CONSTRAINT fk_notification_log_order FOREIGN KEY (order_id)
        REFERENCES orders(id) ON DELETE CASCADE
    )
  `);
};

exports.down = function (db) {
  return db.runSql('DROP TABLE IF EXISTS notification_log');
};

exports._meta = {
  version: 1,
};
