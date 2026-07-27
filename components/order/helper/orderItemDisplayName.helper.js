const { ProductAttributeTerm, ProductVariant, sequelize } = require('../../../models');
const { shouldHideVariantSelector } = require('../../product/helper/product.helper');

function isTruthyFlag(value) {
  return value === true || value === 1;
}

/**
 * Load PAT flags for product attribute terms.
 * Key: `${product_id}-${attribute_id}-${term_id}` → { is_visible_page, used_in_variation }
 */
async function loadAttributeTermFlagsMap(productIds = []) {
  const ids = [...new Set(productIds.filter(Boolean))];
  const flagsByProductAttrTerm = new Map();

  if (ids.length === 0) return flagsByProductAttrTerm;

  const pats = await ProductAttributeTerm.findAll({
    where: { product_id: ids },
    attributes: ['product_id', 'attribute_id', 'term_id', 'is_visible_page', 'used_in_variation']
  });

  for (const pat of pats) {
    flagsByProductAttrTerm.set(`${pat.product_id}-${pat.attribute_id}-${pat.term_id}`, {
      is_visible_page: isTruthyFlag(pat.is_visible_page),
      used_in_variation: isTruthyFlag(pat.used_in_variation)
    });
  }

  return flagsByProductAttrTerm;
}

/** @deprecated prefer loadAttributeTermFlagsMap */
async function loadVisibleAttributeTermMap(productIds = []) {
  const flagsMap = await loadAttributeTermFlagsMap(productIds);
  const visibilityByProductAttrTerm = new Map();
  for (const [key, flags] of flagsMap.entries()) {
    visibilityByProductAttrTerm.set(key, flags.is_visible_page);
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
 * Full display context for order items.
 */
async function loadOrderItemDisplayContext(productIds = []) {
  const ids = [...new Set(productIds.filter(Boolean))];
  const [flagsMap, activeVariantCounts, pats] = await Promise.all([
    loadAttributeTermFlagsMap(ids),
    loadActiveVariantCountByProduct(ids),
    ids.length
      ? ProductAttributeTerm.findAll({
          where: { product_id: ids },
          attributes: ['product_id', 'attribute_id', 'term_id', 'is_visible_page', 'used_in_variation']
        })
      : Promise.resolve([])
  ]);

  const patsByProduct = new Map();
  for (const pat of pats) {
    const pid = Number(pat.product_id);
    if (!patsByProduct.has(pid)) patsByProduct.set(pid, []);
    patsByProduct.get(pid).push(pat);
  }

  const visibilityMap = new Map();
  for (const [key, flags] of flagsMap.entries()) {
    visibilityMap.set(key, flags.is_visible_page);
  }

  return { flagsMap, visibilityMap, activeVariantCounts, patsByProduct };
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

/**
 * Attrs to append on email/ShipStation names.
 * Only picker-relevant attrs: used_in_variation AND is_visible_page.
 * Hidden variation attrs (visible=false, used_in_variation=true) are omitted.
 */
function getNameVariantAttrs(item, flagsMap) {
  const productId = getProductId(item);
  const variantAttrs = item.variant?.variantAttributes || [];
  if (!productId || variantAttrs.length === 0) return [];

  return variantAttrs.filter((va) => {
    if (!va.term) return false;
    const attrId = va.attribute_id ?? va.attribute?.id;
    const termId = va.term_id ?? va.term?.id;
    if (attrId == null || termId == null) return false;
    const flags = flagsMap.get(`${productId}-${attrId}-${termId}`);
    return flags?.used_in_variation === true && flags?.is_visible_page === true;
  });
}

/**
 * Build display name for an order line.
 * @param {'email'|'labeled'} format
 */
function buildOrderItemDisplayName(item, contextOrVisibilityMap = new Map(), options = {}) {
  const format = options.format || 'email';
  const productName = item.product?.name || 'Product';

  const context =
    contextOrVisibilityMap instanceof Map
      ? {
          flagsMap: null,
          visibilityMap: contextOrVisibilityMap,
          activeVariantCounts: new Map(),
          patsByProduct: new Map()
        }
      : contextOrVisibilityMap;

  if (context.activeVariantCounts?.size && shouldHideVariantNameForOrderItem(item, context)) {
    return productName;
  }

  let nameAttrs = [];
  if (context.flagsMap instanceof Map) {
    nameAttrs = getNameVariantAttrs(item, context.flagsMap);
  } else if (context.visibilityMap instanceof Map || contextOrVisibilityMap instanceof Map) {
    // Legacy visibility-only map
    const visibilityMap = context.visibilityMap || contextOrVisibilityMap;
    const productId = getProductId(item);
    const variantAttrs = item.variant?.variantAttributes || [];
    nameAttrs = variantAttrs.filter((va) => {
      if (!va.term) return false;
      const attrId = va.attribute_id ?? va.attribute?.id;
      const termId = va.term_id ?? va.term?.id;
      if (attrId == null || termId == null || !productId) return false;
      return visibilityMap.get(`${productId}-${attrId}-${termId}`) === true;
    });
  }

  if (nameAttrs.length === 0) return productName;

  if (format === 'labeled') {
    const parts = nameAttrs
      .filter((va) => va.attribute && va.term)
      .map((va) => `${va.attribute.name}: ${va.term.name}`)
      .filter(Boolean);
    return parts.length > 0 ? `${productName}, ${parts.join(', ')}` : productName;
  }

  const terms = nameAttrs.map((va) => va.term.name).filter(Boolean);
  return terms.length > 0 ? `${productName} - ${terms.join(', ')}` : productName;
}

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
    } else if (item.variant?.variantAttributes?.length && context.flagsMap) {
      const productId = getProductId(item);
      for (const va of item.variant.variantAttributes) {
        const attrId = va.attribute_id ?? va.attribute?.id;
        const termId = va.term_id ?? va.term?.id;
        const flags =
          productId != null && attrId != null && termId != null
            ? context.flagsMap.get(`${productId}-${attrId}-${termId}`)
            : null;
        const isVisible = flags?.is_visible_page === true;
        const usedInVariation = flags?.used_in_variation === true;
        if (typeof va.setDataValue === 'function') {
          va.setDataValue('is_visible_page', isVisible);
          va.setDataValue('used_in_variation', usedInVariation);
        } else {
          va.is_visible_page = isVisible;
          va.used_in_variation = usedInVariation;
        }
      }
    }
  }

  return items;
}

module.exports = {
  loadVisibleAttributeTermMap,
  loadAttributeTermFlagsMap,
  loadActiveVariantCountByProduct,
  loadOrderItemDisplayContext,
  shouldHideVariantNameForOrderItem,
  getNameVariantAttrs,
  buildOrderItemDisplayName,
  mapOrderItemsForEmail,
  mapOrderItemsForShipStation,
  enrichOrderItemsWithHideVariantSelector
};
