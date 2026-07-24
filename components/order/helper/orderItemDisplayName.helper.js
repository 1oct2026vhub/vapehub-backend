const { ProductAttributeTerm } = require('../../../models');

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
 * Build email/display name: product name, plus only page-visible variant terms.
 * Hidden attributes (is_visible_page: false) are omitted.
 */
function buildOrderItemDisplayName(item, visibilityByProductAttrTerm = new Map()) {
  const productName = item.product?.name || 'Product';
  const productId = item.product_id || item.product?.id;
  const variantAttrs = item.variant?.variantAttributes || [];

  if (!productId || variantAttrs.length === 0) {
    return productName;
  }

  const visibleTerms = variantAttrs
    .filter((va) => va.term)
    .filter((va) => {
      const attrId = va.attribute_id ?? va.attribute?.id;
      const termId = va.term_id ?? va.term?.id;
      if (attrId == null || termId == null) return false;
      return visibilityByProductAttrTerm.get(`${productId}-${attrId}-${termId}`) === true;
    })
    .map((va) => va.term.name)
    .filter(Boolean);

  return visibleTerms.length > 0
    ? `${productName} - ${visibleTerms.join(', ')}`
    : productName;
}

/**
 * Map order items to email line items, filtering hidden variant attribute terms.
 */
async function mapOrderItemsForEmail(orderItems = []) {
  const items = orderItems || [];
  const productIds = items.map((item) => item.product_id || item.product?.id);
  const visibilityMap = await loadVisibleAttributeTermMap(productIds);

  return items.map((item) => ({
    name: buildOrderItemDisplayName(item, visibilityMap),
    quantity: item.quantity || 0,
    price: item.unit_price || 0,
    total: item.total || 0
  }));
}

module.exports = {
  loadVisibleAttributeTermMap,
  buildOrderItemDisplayName,
  mapOrderItemsForEmail
};
