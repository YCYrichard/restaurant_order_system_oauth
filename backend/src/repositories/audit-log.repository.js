const db = require('../config/db');

async function insertEntry({
  actorUserId,
  actorRole,
  action,
  resourceType,
  resourceId,
  storeId,
  details,
  ipAddress,
}) {
  await db.execute(
    `
      INSERT INTO audit_log (
        actor_user_id, actor_role, action, resource_type, resource_id,
        store_id, details, ip_address
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      actorUserId ?? null,
      actorRole,
      action,
      resourceType,
      resourceId ?? null,
      storeId ?? null,
      details ? JSON.stringify(details) : null,
      ipAddress ?? null,
    ]
  );
}

function buildFilter({ storeId, action, from, to }) {
  const conditions = [];
  const params = [];

  if (storeId !== undefined) {
    conditions.push('store_id = ?');
    params.push(storeId);
  }

  if (action !== undefined) {
    conditions.push('action = ?');
    params.push(action);
  }

  if (from !== undefined) {
    conditions.push('created_at >= ?');
    params.push(from);
  }

  if (to !== undefined) {
    conditions.push('created_at <= ?');
    params.push(to);
  }

  return {
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

async function findEntries({ storeId, action, from, to, limit, offset }) {
  const { whereClause, params } = buildFilter({ storeId, action, from, to });

  // mysql2 doesn't reliably accept LIMIT/OFFSET as bound `?` placeholders -
  // safe to inline here since the sole caller (audit-log.service's
  // parsePagination) already clamps both to validated integers.
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 50;
  const safeOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;

  const [rows] = await db.execute(
    `
      SELECT al.id, al.actor_user_id, u.name AS actor_name, al.actor_role,
             al.action, al.resource_type, al.resource_id, al.store_id,
             s.name AS store_name, al.details, al.ip_address, al.created_at
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.actor_user_id
      LEFT JOIN stores s ON s.id = al.store_id
      ${whereClause}
      ORDER BY al.created_at DESC, al.id DESC
      LIMIT ${safeLimit} OFFSET ${safeOffset}
    `,
    params
  );

  return rows;
}

async function countEntries({ storeId, action, from, to }) {
  const { whereClause, params } = buildFilter({ storeId, action, from, to });

  const [rows] = await db.execute(
    `SELECT COUNT(*) AS count FROM audit_log al ${whereClause}`,
    params
  );

  return rows[0].count;
}

module.exports = { insertEntry, findEntries, countEntries };
