const db = require('../config/db');

async function findGroupsForStore(storeId) {
  const [groups] = await db.execute(
    `
      SELECT id, store_id, name, min_select, max_select, is_required, sort_order
      FROM modifier_groups
      WHERE store_id = ?
      ORDER BY sort_order ASC, name ASC
    `,
    [storeId]
  );

  if (groups.length === 0) {
    return [];
  }

  const placeholders = groups.map(() => '?').join(', ');

  const [options] = await db.execute(
    `
      SELECT id, group_id, name, price_delta, is_active, sort_order
      FROM modifier_options
      WHERE group_id IN (${placeholders})
      ORDER BY sort_order ASC, name ASC
    `,
    groups.map((group) => group.id)
  );

  return groups.map((group) => ({
    ...group,
    options: options.filter((option) => option.group_id === group.id),
  }));
}

async function findGroupById(groupId) {
  const [rows] = await db.execute(
    `
      SELECT id, store_id, name, min_select, max_select, is_required, sort_order
      FROM modifier_groups
      WHERE id = ?
      LIMIT 1
    `,
    [groupId]
  );

  return rows[0] || null;
}

/// Groups attached to a set of products, with their options. Used both by
/// the public menu and by order validation, so one query shape serves both.
async function findGroupsForProducts(productIds, connection = db) {
  if (productIds.length === 0) {
    return [];
  }

  const placeholders = productIds.map(() => '?').join(', ');

  const [rows] = await connection.execute(
    `
      SELECT
        pmg.product_id,
        g.id AS group_id,
        g.name AS group_name,
        g.min_select,
        g.max_select,
        g.is_required,
        g.sort_order AS group_sort,
        o.id AS option_id,
        o.name AS option_name,
        o.price_delta,
        o.is_active AS option_active,
        o.sort_order AS option_sort
      FROM product_modifier_groups pmg
      JOIN modifier_groups g ON g.id = pmg.group_id
      LEFT JOIN modifier_options o ON o.group_id = g.id
      WHERE pmg.product_id IN (${placeholders})
      ORDER BY pmg.sort_order ASC, g.sort_order ASC, o.sort_order ASC
    `,
    productIds
  );

  return rows;
}

/// Collapses the flat join rows into groups-with-options, keyed by product.
function groupRowsByProduct(rows) {
  const byProduct = new Map();

  for (const row of rows) {
    if (!byProduct.has(row.product_id)) {
      byProduct.set(row.product_id, new Map());
    }

    const groups = byProduct.get(row.product_id);

    if (!groups.has(row.group_id)) {
      groups.set(row.group_id, {
        id: row.group_id,
        name: row.group_name,
        min_select: row.min_select,
        max_select: row.max_select,
        is_required: row.is_required,
        options: [],
      });
    }

    // LEFT JOIN yields a null option row for a group with no options yet.
    if (row.option_id !== null) {
      groups.get(row.group_id).options.push({
        id: row.option_id,
        name: row.option_name,
        price_delta: Number(row.price_delta),
        is_active: row.option_active,
      });
    }
  }

  return byProduct;
}

async function insertGroup(storeId, group) {
  const [result] = await db.execute(
    `
      INSERT INTO modifier_groups (
        store_id, name, min_select, max_select, is_required, sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      storeId,
      group.name,
      group.minSelect,
      group.maxSelect,
      group.isRequired ? 1 : 0,
      group.sortOrder ?? 0,
    ]
  );

  return result.insertId;
}

async function deleteGroup(groupId) {
  const [result] = await db.execute(
    'DELETE FROM modifier_groups WHERE id = ?',
    [groupId]
  );

  return result.affectedRows > 0;
}

async function insertOption(groupId, option) {
  const [result] = await db.execute(
    `
      INSERT INTO modifier_options (group_id, name, price_delta, sort_order)
      VALUES (?, ?, ?, ?)
    `,
    [groupId, option.name, option.priceDelta, option.sortOrder ?? 0]
  );

  return result.insertId;
}

async function deleteOption(optionId) {
  const [result] = await db.execute(
    'DELETE FROM modifier_options WHERE id = ?',
    [optionId]
  );

  return result.affectedRows > 0;
}

async function findOptionById(optionId) {
  const [rows] = await db.execute(
    `
      SELECT o.id, o.group_id, o.name, o.price_delta, o.is_active,
             g.store_id
      FROM modifier_options o
      JOIN modifier_groups g ON g.id = o.group_id
      WHERE o.id = ?
      LIMIT 1
    `,
    [optionId]
  );

  return rows[0] || null;
}

async function attachGroupToProduct(productId, groupId) {
  await db.execute(
    `
      INSERT INTO product_modifier_groups (product_id, group_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE sort_order = sort_order
    `,
    [productId, groupId]
  );
}

async function detachGroupFromProduct(productId, groupId) {
  const [result] = await db.execute(
    `
      DELETE FROM product_modifier_groups
      WHERE product_id = ?
        AND group_id = ?
    `,
    [productId, groupId]
  );

  return result.affectedRows > 0;
}

async function insertOrderItemModifiers(orderItemId, modifiers, connection = db) {
  if (modifiers.length === 0) {
    return;
  }

  const values = modifiers.map((modifier) => [
    orderItemId,
    modifier.optionId,
    modifier.groupName,
    modifier.optionName,
    modifier.priceDelta,
  ]);

  const placeholders = values.map(() => '(?, ?, ?, ?, ?)').join(', ');

  await connection.execute(
    `
      INSERT INTO order_item_modifiers (
        order_item_id, modifier_option_id, group_name, option_name, price_delta
      )
      VALUES ${placeholders}
    `,
    values.flat()
  );
}

async function findModifiersForOrderItems(orderItemIds, connection = db) {
  if (orderItemIds.length === 0) {
    return [];
  }

  const placeholders = orderItemIds.map(() => '?').join(', ');

  const [rows] = await connection.execute(
    `
      SELECT order_item_id, group_name, option_name, price_delta
      FROM order_item_modifiers
      WHERE order_item_id IN (${placeholders})
      ORDER BY id ASC
    `,
    orderItemIds
  );

  return rows;
}

module.exports = {
  findGroupsForStore,
  findGroupById,
  findGroupsForProducts,
  groupRowsByProduct,
  insertGroup,
  deleteGroup,
  insertOption,
  deleteOption,
  findOptionById,
  attachGroupToProduct,
  detachGroupFromProduct,
  insertOrderItemModifiers,
  findModifiersForOrderItems,
};
