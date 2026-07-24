const { ProductAttributeTerm, ProductVariant, sequelize } = require('../../../models');
const { shouldHideVariantSelector } = require('../../product/helper/product.helper');

/**
 * Load is_visible_page flags for product attribute terms.
 * Key: `${product_id}-${attribute_id}-${term_id}` → boolean
 */
async function loadVisibleAttributeTermMap(productIds = []) {
  const ids = [...new Set(productIds.filter(Boolean))];
  const visibilityByProductAttrTerm = new Map();

  if (ids.length === 0) return visibilityByProductAttrTerm;

  const pats = await ProductAttributeTerm.findAll({
    where: { product_id: ids },
    attributes: ['product_id', 'attribute_id', 'term_id', 'is_visible_page']
  });

  for (const pat of pats) {
    visibilityByProductAttrTerm.set(
      `${pat.product_id}-${pat.attribute_id}-${pat.term_id}`,
      pat.is_visible_page === true || pat.is_visible_page === 1
    );
  }

  return visibilityByProductAttrTerm;
}

/**
 * Active variant counts per product_id (status = active).
 */
async function loadActiveVariantCountByProduct(productIds = []) {
  const ids = [...new Set(productIds.filter(Boolean))];
  const counts = new Map();
  if (ids.length === 0) return counts;

  const rows = await ProductVariant.findAll({
    attributes: [
      'product_id',
      [sequelize.fn('COUNT', sequelize.col('id')), 'cnt']
    ],
    where: {
      product_id: ids,
      status: 'active'
    },
    group: ['product_id'],
    raw: true
  });

  for (const row of rows) {
    counts.set(Number(row.product_id), parseInt(row.cnt, 10) || 0);
  }
  return counts;
}

/**
 * Full display context for order items (visibility + variant counts + PAT rows by product).
 */
async function loadOrderItemDisplayContext(productIds = []) {
  const ids = [...new Set(productIds.filter(Boolean))];
  const [visibilityMap, activeVariantCounts, pats] = await Promise.all([
    loadVisibleAttributeTermMap(ids),
    loadActiveVariantCountByProduct(ids),
    ids.length
      ? ProductAttributeTerm.findAll({
          where: { product_id: ids },
          attributes: ['product_id', 'attribute_id', 'term_id', 'is_visible_page']
        })
      : Promise.resolve([])
  ]);

  const patsByProduct = new Map();
  for (const pat of pats) {
    const pid = Number(pat.product_id);
    if (!patsByProduct.has(pid)) patsByProduct.set(pid, []);
    patsByProduct.get(pid).push(pat);
  }

  return { visibilityMap, activeVariantCounts, patsByProduct };
}

function getProductId(item) {
  return item.product_id || item.product?.id || null;
}

/**
 * Whether this order line should hide variant attribute names
 * (same rule as PDP hide_variant_selector).
 */
function shouldHideVariantNameForOrderItem(item, context) {
  const productId = getProductId(item);
  if (!productId) return false;

  const activeCount = context.activeVariantCounts.get(Number(productId));
  if (activeCount !== 1) return false;

  const variant = item.variant;
  if (!variant) return true;

  const pats = context.patsByProduct.get(Number(productId)) || [];
  return shouldHideVariantSelector([variant], pats);
}

function getVisibleVariantAttrs(item, visibilityMap) {
  const productId = getProductId(item);
  const variantAttrs = item.variant?.variantAttributes || [];
  if (!productId || variantAttrs.length === 0) return [];

  return variantAttrs.filter((va) => {
    if (!va.term) return false;
    const attrId = va.attribute_id ?? va.attribute?.id;
    const termId = va.term_id ?? va.term?.id;
    if (attrId == null || termId == null) return false;
    return visibilityMap.get(`${productId}-${attrId}-${termId}`) === true;
  });
}

/**
 * Build display name for an order line.
 * @param {'email'|'labeled'} format - email: "Name - a, b"; labeled: "Name, Attr: Term"
 */
function buildOrderItemDisplayName(item, contextOrVisibilityMap = new Map(), options = {}) {
  const format = options.format || 'email';
  const productName = item.product?.name || 'Product';

  // Backward compatible: second arg can be visibility Map only
  const context =
    contextOrVisibilityMap instanceof Map
      ? {
          visibilityMap: contextOrVisibilityMap,
          activeVariantCounts: new Map(),
          patsByProduct: new Map()
        }
      : contextOrVisibilityMap;

  if (context.activeVariantCounts?.size && shouldHideVariantNameForOrderItem(item, context)) {
    return productName;
  }

  const visibleAttrs = getVisibleVariantAttrs(item, context.visibilityMap || contextOrVisibilityMap);
  if (visibleAttrs.length === 0) return productName;

  if (format === 'labeled') {
    const parts = visibleAttrs
      .filter((va) => va.attribute && va.term)
      .map((va) => `${va.attribute.name}: ${va.term.name}`)
      .filter(Boolean);
    return parts.length > 0 ? `${productName}, ${parts.join(', ')}` : productName;
  }

  const terms = visibleAttrs.map((va) => va.term.name).filter(Boolean);
  return terms.length > 0 ? `${productName} - ${terms.join(', ')}` : productName;
}

/**
 * Map order items to email line items, filtering hidden variant attribute terms.
 */
async function mapOrderItemsForEmail(orderItems = []) {
  const items = orderItems || [];
  const productIds = items.map(getProductId);
  const context = await loadOrderItemDisplayContext(productIds);

  return items.map((item) => ({
    name: buildOrderItemDisplayName(item, context, { format: 'email' }),
    quantity: item.quantity || 0,
    price: item.unit_price || 0,
    total: item.total || 0
  }));
}

/**
 * Map order items for ShipStation payload (labeled attrs; hide when hide_variant_selector).
 */
async function mapOrderItemsForShipStation(orderItems = []) {
  const items = orderItems || [];
  const productIds = items.map(getProductId);
  const context = await loadOrderItemDisplayContext(productIds);

  return items.map((item) => {
    const variantSku =
      item.variant?.sku ||
      item.variant?.slug ||
      (item.variant?.id ? String(item.variant.id) : null);
    const productSku =
      item.product?.sku ||
      item.product?.slug ||
      (item.product?.id ? String(item.product.id) : null);

    const productName = item.product?.name;
    if (!productName) {
      throw new Error(`Order item ${item.id} is missing product name`);
    }

    return {
      sku: variantSku || productSku,
      name: buildOrderItemDisplayName(item, context, { format: 'labeled' }),
      quantity: item.quantity,
      unitPrice: item.unit_price
    };
  });
}

/**
 * Enrich order items (Sequelize or plain) with hide_variant_selector.
 * When true, clears variantAttributes so admin UI does not show attr lines.
 */
async function enrichOrderItemsWithHideVariantSelector(orderItems = []) {
  const items = orderItems || [];
  if (items.length === 0) return items;

  const productIds = items.map(getProductId);
  const context = await loadOrderItemDisplayContext(productIds);

  for (const item of items) {
    const hide = shouldHideVariantNameForOrderItem(item, context);
    const plain = typeof item.toJSON === 'function' ? null : item;

    if (item.product) {
      if (typeof item.setDataValue === 'function') {
        item.setDataValue('hide_variant_selector', hide);
        // Also set on nested product for FE that reads product.hide_variant_selector
        if (item.product.setDataValue) {
          item.product.setDataValue('hide_variant_selector', hide);
        } else {
          item.product.hide_variant_selector = hide;
        }
      } else {
        item.hide_variant_selector = hide;
        if (item.product) item.product.hide_variant_selector = hide;
      }
    } else if (plain) {
      item.hide_variant_selector = hide;
    } else if (typeof item.setDataValue === 'function') {
      item.setDataValue('hide_variant_selector', hide);
    }

    if (hide && item.variant) {
      if (typeof item.variant.setDataValue === 'function') {
        item.variant.setDataValue('variantAttributes', []);
      } else if (item.variant.variantAttributes) {
        item.variant.variantAttributes = [];
      }
    } else if (item.variant?.variantAttributes?.length && context.visibilityMap) {
      // Attach is_visible_page for FE; keep only visible if we want — keep all with flag
      const productId = getProductId(item);
      for (const va of item.variant.variantAttributes) {
        const attrId = va.attribute_id ?? va.attribute?.id;
        const termId = va.term_id ?? va.term?.id;
        const visible =
          productId != null && attrId != null && termId != null
            ? context.visibilityMap.get(`${productId}-${attrId}-${termId}`) === true
            : false;
        if (typeof va.setDataValue === 'function') {
          va.setDataValue('is_visible_page', visible);
        } else {
          va.is_visible_page = visible;
        }
      }
    }
  }

  return items;
}

module.exports = {
  loadVisibleAttributeTermMap,
  loadActiveVariantCountByProduct,
  loadOrderItemDisplayContext,
  shouldHideVariantNameForOrderItem,
  buildOrderItemDisplayName,
  mapOrderItemsForEmail,
  mapOrderItemsForShipStation,
  enrichOrderItemsWithHideVariantSelector
};
