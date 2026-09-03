const SUCCESSFUL_ORDER_STATUSES = [
  'processing',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'completed',
];

const ORDER_STATUS_SQL = SUCCESSFUL_ORDER_STATUSES.map((s) => `'${s}'`).join(',');

const DASHBOARD_SORT_COLUMNS = new Set([
  'created_at',
  'updated_at',
  'stock',
  'barcode',
  'slug',
  'name',
]);

const parseIncludeDiscontinued = (req) => {
  const value = req?.query?.include_discontinued;
  return value === 'true' || value === true || value === '1';
};

function variantDiscontinuedClause(req, { alias = 'pv', stock_status } = {}) {
  if (stock_status === 'discontinued') {
    return ` AND ${alias}.is_discontinued = 1`;
  }
  if (parseIncludeDiscontinued(req)) {
    return '';
  }
  return ` AND ${alias}.is_discontinued = 0`;
}

function productDiscontinuedClause(req, { alias = 'p', stock_status } = {}) {
  if (stock_status === 'discontinued') {
    return ` AND ${alias}.is_discontinued = 1`;
  }
  if (parseIncludeDiscontinued(req)) {
    return '';
  }
  return ` AND ${alias}.is_discontinued = 0`;
}

function discontinuedClause(req, { alias = 'pv', productAlias = 'p', stock_status } = {}) {
  if (stock_status === 'discontinued') {
    return ` AND ${alias}.is_discontinued = 1 AND ${productAlias}.is_discontinued = 1`;
  }
  if (parseIncludeDiscontinued(req)) {
    return '';
  }
  return ` AND ${alias}.is_discontinued = 0 AND ${productAlias}.is_discontinued = 0`;
}

function buildGetProductsQuery(req, { q, sort_by, order, last28Days, now }) {
  const sortColumnMap = {
    salesLast28Days: 'COALESCE(sales.salesLast28Days, 0)',
    name: 'p.name',
    currentStock: 'COALESCE(agg.currentStock, 0)',
  };
  const sortCol = sortColumnMap[sort_by] || sortColumnMap.salesLast28Days;
  const sortDir = order === 'ASC' ? 'ASC' : 'DESC';
  const variantDisc = variantDiscontinuedClause(req, { alias: 'pv' });
  const searchClause = q?.length ? ' AND p.name LIKE :search' : '';

  const baseFrom = `
    FROM products p
    LEFT JOIN product_images pi ON p.id = pi.product_id AND pi.is_primary = 1
    LEFT JOIN (
      SELECT
        pv.product_id,
        SUM(pv.stock) AS currentStock,
        MIN(COALESCE(pv.low_stock_threshold, 5)) AS low_stock_threshold
      FROM product_variants pv
      WHERE pv.deleted_at IS NULL${variantDisc}
      GROUP BY pv.product_id
    ) agg ON agg.product_id = p.id
    LEFT JOIN (
      SELECT pv.product_id, SUM(sr.quantity) AS stockOnHold
      FROM stock_reservations sr
      INNER JOIN product_variants pv ON sr.variant_id = pv.id
      WHERE sr.expires_at > :now
        AND pv.deleted_at IS NULL${variantDisc}
      GROUP BY pv.product_id
    ) hold ON hold.product_id = p.id
    LEFT JOIN (
      SELECT pv.product_id, SUM(oi.quantity) AS salesLast28Days
      FROM order_items oi
      INNER JOIN orders o ON oi.order_id = o.id
      INNER JOIN product_variants pv ON oi.variant_id = pv.id
      WHERE o.status IN (${ORDER_STATUS_SQL})
        AND o.createdAt >= :last28Days
        AND o.deletedAt IS NULL
        AND oi.deletedAt IS NULL
        AND pv.deleted_at IS NULL${variantDisc}
      GROUP BY pv.product_id
    ) sales ON sales.product_id = p.id
    WHERE p.deletedAt IS NULL
      AND p.status = 'published'${searchClause}
  `;

  const replacements = {
    now,
    last28Days,
    ...(q?.length && { search: `%${q}%` }),
  };

  return {
    dataSql: `
      SELECT
        p.id,
        p.name,
        p.slug,
        pi.image_url AS image,
        COALESCE(agg.currentStock, 0) AS currentStock,
        COALESCE(hold.stockOnHold, 0) AS stockOnHold,
        COALESCE(sales.salesLast28Days, 0) AS salesLast28Days,
        COALESCE(agg.low_stock_threshold, 5) AS low_stock_threshold,
        CASE
          WHEN COALESCE(sales.salesLast28Days, 0) > 0
          THEN ROUND(COALESCE(agg.currentStock, 0) / (sales.salesLast28Days / 28))
          ELSE NULL
        END AS stockWillLastDays
      ${baseFrom}
      ORDER BY ${sortCol} ${sortDir}, p.id ASC
      LIMIT :limit OFFSET :offset
    `,
    countSql: `SELECT COUNT(*) AS total ${baseFrom}`,
    replacements,
  };
}

function mapDashboardVariantRow(row) {
  return {
    id: row.id,
    name: row.name,
    image: row.image,
    currentStock: Number(row.currentStock),
    lowStockThreshold: row.lowStockThreshold,
    isInStock: Boolean(Number(row.isInStock)),
    isOutOfStock: Boolean(Number(row.isOutOfStock)),
    isLowStock: Boolean(Number(row.isLowStock)),
    salesLast28Days: Number(row.salesLast28Days) || 0,
    salesLastMonth: Number(row.salesLastMonth) || 0,
    totalSales: Number(row.totalSales) || 0,
  };
}

function buildDashboardVariantWhere(req, { search, stock_status }) {
  let where = `
    pv.deleted_at IS NULL
    AND p.deletedAt IS NULL
    AND p.status = 'published'
    ${discontinuedClause(req, { stock_status })}
  `;

  if (search) {
    where += ' AND (pv.barcode LIKE :search OR pv.slug LIKE :search OR p.name LIKE :search)';
  }
  if (stock_status === 'in_stock') {
    where += ' AND pv.stock > 0';
  } else if (stock_status === 'out_of_stock') {
    where += ' AND pv.stock = 0';
  } else if (stock_status === 'low_stock') {
    where += ' AND pv.stock > 0 AND pv.stock <= pv.low_stock_threshold';
  }

  return where;
}

function buildDashboardVariantListQuery(req, {
  search,
  stock_status,
  sort_by = 'created_at',
  sort_order = 'DESC',
  top_selling = false,
  last28Days,
  now,
  startOfLastMonth,
  endOfLastMonth,
}) {
  const where = buildDashboardVariantWhere(req, { search, stock_status });
  const replacements = {
    startDate28Days: last28Days,
    endDate28Days: now,
    startDateLastMonth: startOfLastMonth,
    endDateLastMonth: endOfLastMonth,
    ...(search && { search: `%${search}%` }),
  };

  let orderBy;
  if (top_selling === true || top_selling === 'true') {
    orderBy = 'salesLast28Days DESC, pv.id DESC';
  } else if (sort_by === 'name') {
    orderBy = `p.name ${sort_order === 'ASC' ? 'ASC' : 'DESC'}, pv.id DESC`;
  } else {
    const col = DASHBOARD_SORT_COLUMNS.has(sort_by) ? sort_by : 'created_at';
    orderBy = `pv.${col} ${sort_order === 'ASC' ? 'ASC' : 'DESC'}, pv.id DESC`;
  }

  const selectSql = `
    SELECT
      pv.id,
      CONCAT(p.name, ' - ', COALESCE(pv.slug, pv.id)) AS name,
      pvi.image_url AS image,
      pv.stock AS currentStock,
      pv.low_stock_threshold AS lowStockThreshold,
      CASE WHEN pv.stock > 0 THEN 1 ELSE 0 END AS isInStock,
      CASE WHEN pv.stock = 0 THEN 1 ELSE 0 END AS isOutOfStock,
      CASE WHEN pv.stock > 0 AND pv.stock <= pv.low_stock_threshold THEN 1 ELSE 0 END AS isLowStock,
      COALESCE(s28.qty, 0) AS salesLast28Days,
      COALESCE(slm.qty, 0) AS salesLastMonth,
      COALESCE(stotal.qty, 0) AS totalSales
    FROM product_variants pv
    INNER JOIN products p ON pv.product_id = p.id
    LEFT JOIN product_variant_images pvi
      ON pv.id = pvi.variant_id AND pvi.is_primary = 1 AND pvi.deleted_at IS NULL
    LEFT JOIN (
      SELECT oi.variant_id, SUM(oi.quantity) AS qty
      FROM order_items oi
      INNER JOIN orders o ON oi.order_id = o.id
      WHERE o.status IN (${ORDER_STATUS_SQL})
        AND o.updatedAt >= :startDate28Days AND o.updatedAt <= :endDate28Days
        AND oi.deletedAt IS NULL
      GROUP BY oi.variant_id
    ) s28 ON s28.variant_id = pv.id
    LEFT JOIN (
      SELECT oi.variant_id, SUM(oi.quantity) AS qty
      FROM order_items oi
      INNER JOIN orders o ON oi.order_id = o.id
      WHERE o.status IN (${ORDER_STATUS_SQL})
        AND o.updatedAt >= :startDateLastMonth AND o.updatedAt <= :endDateLastMonth
        AND oi.deletedAt IS NULL
      GROUP BY oi.variant_id
    ) slm ON slm.variant_id = pv.id
    LEFT JOIN (
      SELECT oi.variant_id, SUM(oi.quantity) AS qty
      FROM order_items oi
      INNER JOIN orders o ON oi.order_id = o.id
      WHERE o.status IN (${ORDER_STATUS_SQL})
        AND oi.deletedAt IS NULL
      GROUP BY oi.variant_id
    ) stotal ON stotal.variant_id = pv.id
    WHERE ${where}
    ORDER BY ${orderBy}
  `;

  return {
    dataSql: `${selectSql} LIMIT :limit OFFSET :offset`,
    countSql: `
      SELECT COUNT(*) AS total
      FROM product_variants pv
      INNER JOIN products p ON pv.product_id = p.id
      WHERE ${where}
    `,
    replacements,
  };
}

function buildStockCentralQuery(req, {
  search,
  stock_status,
  last28Days,
  now,
  sort_order = 'DESC',
}) {
  const disc = discontinuedClause(req, { stock_status });
  let where = `
    pv.deleted_at IS NULL
    AND p.deletedAt IS NULL
    AND p.status = 'published'
    ${disc}
  `;

  if (search) {
    where += ' AND (pv.barcode LIKE :search OR pv.slug LIKE :search)';
  }
  if (stock_status === 'in_stock') {
    where += ' AND pv.stock > 0';
  } else if (stock_status === 'out_of_stock') {
    where += ' AND pv.stock = 0';
  }

  const replacements = {
    now,
    last28Days,
    ...(search && { search: `%${search}%` }),
  };

  const baseFrom = `
    FROM product_variants pv
    INNER JOIN products p ON pv.product_id = p.id
    LEFT JOIN product_variant_images pvi
      ON pv.id = pvi.variant_id AND pvi.is_primary = 1 AND pvi.deleted_at IS NULL
    LEFT JOIN (
      SELECT variant_id, SUM(quantity) AS qty
      FROM stock_reservations
      WHERE expires_at > :now
      GROUP BY variant_id
    ) soh ON soh.variant_id = pv.id
    LEFT JOIN (
      SELECT oi.variant_id, SUM(oi.quantity) AS qty
      FROM order_items oi
      INNER JOIN orders o ON oi.order_id = o.id
      WHERE o.status IN (${ORDER_STATUS_SQL})
        AND o.updatedAt >= :last28Days
        AND oi.deletedAt IS NULL
      GROUP BY oi.variant_id
    ) s28 ON s28.variant_id = pv.id
    WHERE ${where}
  `;

  return {
    dataSql: `
      SELECT
        pv.id,
        p.name AS productName,
        pvi.image_url AS productImage,
        pv.stock AS currentStock,
        COALESCE(soh.qty, 0) AS stockOnHold,
        COALESCE(s28.qty, 0) AS salesLast28Days
      ${baseFrom}
      ORDER BY pv.created_at ${sort_order === 'ASC' ? 'ASC' : 'DESC'}
      LIMIT :limit OFFSET :offset
    `,
    countSql: `SELECT COUNT(*) AS total ${baseFrom}`,
    replacements,
  };
}

function buildDashboardSummaryQueries(req, { startOfLastMonth, endOfLastMonth }) {
  const disc = discontinuedClause(req, {});
  const baseJoin = `
    FROM product_variants pv
    INNER JOIN products p ON pv.product_id = p.id
    WHERE pv.deleted_at IS NULL
      AND p.deletedAt IS NULL
      AND p.status = 'published'
      ${disc}
  `;

  return {
    totalVariantsSql: `SELECT COUNT(*) AS total ${baseJoin}`,
    inStockSql: `SELECT COUNT(*) AS total ${baseJoin} AND pv.stock > 0`,
    outOfStockSql: `SELECT COUNT(*) AS total ${baseJoin} AND pv.stock = 0`,
    lowStockSql: `
      SELECT COUNT(*) AS total ${baseJoin}
      AND pv.stock > 0
      AND pv.stock <= pv.low_stock_threshold
    `,
    totalSalesLastMonthSql: `
      SELECT COALESCE(SUM(oi.quantity), 0) AS total
      FROM order_items oi
      INNER JOIN orders o ON oi.order_id = o.id
      WHERE o.status IN (${ORDER_STATUS_SQL})
        AND o.updatedAt >= :startOfLastMonth
        AND o.updatedAt <= :endOfLastMonth
        AND oi.deletedAt IS NULL
    `,
    totalRevenueLastMonthSql: `
      SELECT COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS total
      FROM order_items oi
      INNER JOIN orders o ON oi.order_id = o.id
      WHERE o.status IN (${ORDER_STATUS_SQL})
        AND o.updatedAt >= :startOfLastMonth
        AND o.updatedAt <= :endOfLastMonth
        AND oi.deletedAt IS NULL
    `,
    summaryReplacements: { startOfLastMonth, endOfLastMonth },
  };
}

module.exports = {
  SUCCESSFUL_ORDER_STATUSES,
  ORDER_STATUS_SQL,
  parseIncludeDiscontinued,
  variantDiscontinuedClause,
  productDiscontinuedClause,
  discontinuedClause,
  buildGetProductsQuery,
  mapDashboardVariantRow,
  buildDashboardVariantListQuery,
  buildStockCentralQuery,
  buildDashboardSummaryQueries,
};
