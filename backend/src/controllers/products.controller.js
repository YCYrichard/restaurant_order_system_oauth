const db = require('../config/db');
const modifiersRepository = require('../repositories/modifiers.repository');
const { isOwnerTier } = require('../utils/access-tier');

// Update/status are addressed by productId alone (no storeId in the URL),
// so resolve the owning store here and verify access explicitly - the
// requireStoreAccess middleware only works when storeId is already in
// req.params. Mirrors categories.controller.js:resolveCategoryAccess.
// Returns the caller's access tier alongside storeId so callers that need
// owner-tier (price/status changes) can require it, while the "86" toggle
// stays open to any tier.
async function resolveProductAccess(productId, user) {
  const [rows] = await db.execute(
    `
      SELECT store_id
      FROM products
      WHERE id = ?
      LIMIT 1
    `,
    [productId]
  );

  if (rows.length === 0) {
    return { error: { status: 404, message: 'Product not found' } };
  }

  const storeId = rows[0].store_id;

  if (user.role === 'admin') {
    return { storeId, accessRole: 'admin' };
  }

  const [accessRows] = await db.execute(
    `
      SELECT access_role
      FROM owner_store_access
      WHERE user_id = ?
        AND store_id = ?
      LIMIT 1
    `,
    [user.id, storeId]
  );

  if (accessRows.length === 0) {
    return {
      error: { status: 403, message: 'You do not have access to this store' },
    };
  }

  return { storeId, accessRole: accessRows[0].access_role };
}

function ownerTierErrorOrNull(access) {
  if (!isOwnerTier(access.accessRole)) {
    return {
      status: 403,
      message: 'This action requires owner or manager access to the store',
    };
  }

  return null;
}

exports.listProductsByStore = async (req, res) => {
  try {
    const storeId = Number(req.params.storeId);

    const [rows] = await db.execute(
      `
        SELECT
          p.id,
          p.store_id,
          p.category_id,
          p.name,
          p.description,
          p.price,
          p.is_active,
          p.created_at,
          p.updated_at,
          c.name AS category_name
        FROM products p
        LEFT JOIN categories c
          ON c.id = p.category_id
        WHERE p.store_id = ?
        ORDER BY p.created_at DESC
      `,
      [storeId]
    );

    return res.status(200).json({
      products: rows,
    });
  } catch (error) {
    console.error('List products error:', error);

    return res.status(500).json({
      message: 'Failed to list products',
    });
  }
};

// Public listing used by the customer-facing menu. Deliberately
// unauthenticated and limited to active products only.
exports.listPublicProductsByStore = async (req, res) => {
  try {
    const storeId = Number(req.params.storeId);

    const [rows] = await db.execute(
      `
        SELECT
          p.id,
          p.store_id,
          p.category_id,
          p.name,
          p.description,
          p.price,
          c.name AS category_name
        FROM products p
        LEFT JOIN categories c
          ON c.id = p.category_id
        WHERE p.store_id = ?
          AND p.is_active = TRUE
          AND (p.unavailable_until IS NULL OR p.unavailable_until <= NOW())
        ORDER BY c.sort_order ASC, p.name ASC
      `,
      [storeId]
    );

    // Attach each product's modifier groups so the customer can choose
    // options without a second round trip per item.
    const modifierRows = await modifiersRepository.findGroupsForProducts(
      rows.map((row) => row.id)
    );
    const groupsByProduct = modifiersRepository.groupRowsByProduct(modifierRows);

    const products = rows.map((row) => ({
      ...row,
      modifier_groups: [...(groupsByProduct.get(row.id)?.values() ?? [])].map(
        (group) => ({
          ...group,
          // Hide options the store has switched off, but keep the group so
          // its min/max rules still make sense to the picker.
          options: group.options.filter((option) => option.is_active),
        })
      ),
    }));

    return res.status(200).json({ products });
  } catch (error) {
    console.error('List public products error:', error);

    return res.status(500).json({
      message: 'Failed to list products',
    });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const storeId = Number(req.params.storeId);

    const name =
      typeof req.body.name === 'string'
        ? req.body.name.trim()
        : '';

    const description =
      typeof req.body.description === 'string'
        ? req.body.description.trim()
        : null;

    const price = Number(req.body.price);

    const categoryId = req.body.categoryId
      ? Number(req.body.categoryId)
      : null;

    if (!name) {
      return res.status(400).json({
        message: 'Product name is required',
      });
    }

    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({
        message: 'Product price must be a valid positive number',
      });
    }

    if (categoryId !== null) {
      const [categoryRows] = await db.execute(
        `
          SELECT id
          FROM categories
          WHERE id = ?
            AND store_id = ?
          LIMIT 1
        `,
        [categoryId, storeId]
      );

      if (categoryRows.length === 0) {
        return res.status(400).json({
          message: 'Category does not belong to this store',
        });
      }
    }

    const [result] = await db.execute(
      `
        INSERT INTO products (
          store_id,
          category_id,
          name,
          description,
          price,
          is_active
        )
        VALUES (?, ?, ?, ?, ?, TRUE)
      `,
      [
        storeId,
        categoryId,
        name,
        description || null,
        price,
      ]
    );

    const [rows] = await db.execute(
      `
        SELECT *
        FROM products
        WHERE id = ?
        LIMIT 1
      `,
      [result.insertId]
    );

    return res.status(201).json({
      product: rows[0],
    });
  } catch (error) {
    console.error('Create product error:', error);

    return res.status(500).json({
      message: 'Failed to create product',
    });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const productId = Number(req.params.productId);

    const access = await resolveProductAccess(productId, req.user);
    if (access.error) {
      return res.status(access.error.status).json({
        message: access.error.message,
      });
    }

    const tierError = ownerTierErrorOrNull(access);
    if (tierError) {
      return res.status(tierError.status).json({ message: tierError.message });
    }

    const storeId = access.storeId;

    const name =
      typeof req.body.name === 'string'
        ? req.body.name.trim()
        : '';

    const description =
      typeof req.body.description === 'string'
        ? req.body.description.trim()
        : null;

    const price = Number(req.body.price);

    const categoryId = req.body.categoryId
      ? Number(req.body.categoryId)
      : null;

    if (!name) {
      return res.status(400).json({
        message: 'Product name is required',
      });
    }

    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({
        message: 'Product price must be a valid positive number',
      });
    }

    if (categoryId !== null) {
      const [categoryRows] = await db.execute(
        `
          SELECT id
          FROM categories
          WHERE id = ?
            AND store_id = ?
          LIMIT 1
        `,
        [categoryId, storeId]
      );

      if (categoryRows.length === 0) {
        return res.status(400).json({
          message: 'Category does not belong to this store',
        });
      }
    }

    const [result] = await db.execute(
      `
        UPDATE products
        SET
          category_id = ?,
          name = ?,
          description = ?,
          price = ?
        WHERE id = ?
      `,
      [
        categoryId,
        name,
        description || null,
        price,
        productId,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Product not found',
      });
    }

    const [rows] = await db.execute(
      `
        SELECT *
        FROM products
        WHERE id = ?
        LIMIT 1
      `,
      [productId]
    );

    return res.status(200).json({
      product: rows[0],
    });
  } catch (error) {
    console.error('Update product error:', error);

    return res.status(500).json({
      message: 'Failed to update product',
    });
  }
};

// "86" an item: temporarily out, expiring on its own. Distinct from
// is_active, which is a deliberate delisting someone has to undo by hand.
exports.updateProductAvailability = async (req, res) => {
  try {
    const productId = Number(req.params.productId);

    const access = await resolveProductAccess(productId, req.user);
    if (access.error) {
      return res.status(access.error.status).json({
        message: access.error.message,
      });
    }

    const available = req.body.available === true;
    let unavailableUntil = null;

    if (!available) {
      const minutes = Number(req.body.minutes);

      if (Number.isFinite(minutes) && minutes > 0) {
        unavailableUntil = new Date(Date.now() + minutes * 60 * 1000);
      } else {
        // Default: back on the menu tomorrow, so nobody has to remember to
        // restore it after service.
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 0);
        unavailableUntil = endOfDay;
      }
    }

    await db.execute(
      `
        UPDATE products
        SET unavailable_until = ?
        WHERE id = ?
      `,
      [unavailableUntil, productId]
    );

    const [rows] = await db.execute(
      `
        SELECT *
        FROM products
        WHERE id = ?
        LIMIT 1
      `,
      [productId]
    );

    return res.status(200).json({
      product: rows[0],
    });
  } catch (error) {
    console.error('Update product availability error:', error);

    return res.status(500).json({
      message: 'Failed to update product availability',
    });
  }
};

exports.updateProductStatus = async (req, res) => {
  try {
    const productId = Number(req.params.productId);

    const access = await resolveProductAccess(productId, req.user);
    if (access.error) {
      return res.status(access.error.status).json({
        message: access.error.message,
      });
    }

    const tierError = ownerTierErrorOrNull(access);
    if (tierError) {
      return res.status(tierError.status).json({ message: tierError.message });
    }

    const isActive = Boolean(req.body.isActive);

    const [result] = await db.execute(
      `
        UPDATE products
        SET is_active = ?
        WHERE id = ?
      `,
      [isActive, productId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        message: 'Product not found',
      });
    }

    const [rows] = await db.execute(
      `
        SELECT *
        FROM products
        WHERE id = ?
        LIMIT 1
      `,
      [productId]
    );

    return res.status(200).json({
      product: rows[0],
    });
  } catch (error) {
    console.error('Update product status error:', error);

    return res.status(500).json({
      message: 'Failed to update product status',
    });
  }
};