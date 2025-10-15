/**
 * Product Variant Image Database Helper
 * Easy access to resized variant images stored in database
 */

/**
 * Get the best available variant image URL for a specific size
 * @param {Object} variantImage - ProductVariantImage model instance
 * @param {string} preferredSize - Preferred size (low, mid, high, original)
 * @returns {string|null} - Best available image URL
 */
const getProductVariantImageUrl = (variantImage, preferredSize = 'high') => {
  if (!variantImage) return null;
  
  // Map size names to database fields
  const sizeMap = {
    'low': 'image_url_low',
    'mid': 'image_url_mid',
    'high': 'image_url_high',
    'original': 'image_url'
  };
  
  const fieldName = sizeMap[preferredSize];
  if (fieldName && variantImage[fieldName]) {
    return variantImage[fieldName];
  }
  
  // Fallback order: high -> mid -> low -> original
  const fallbackOrder = ['high', 'mid', 'low', 'original'];
  
  for (const size of fallbackOrder) {
    const fieldName = sizeMap[size];
    if (variantImage[fieldName]) {
      return variantImage[fieldName];
    }
  }
  
  return null;
};

/**
 * Get all available variant image URLs for a variant image
 * @param {Object} variantImage - ProductVariantImage model instance
 * @returns {Object} - Object containing all available URLs
 */
const getAllProductVariantImageUrls = (variantImage) => {
  if (!variantImage) return {};
  
  return {
    original: variantImage.image_url,
    low: variantImage.image_url_low,
    mid: variantImage.image_url_mid,
    high: variantImage.image_url_high
  };
};

/**
 * Get variant image URL for specific use case
 * @param {Object} variantImage - ProductVariantImage model instance
 * @param {string} useCase - Use case (list, card, detail, original)
 * @returns {string|null} - Best image URL for the use case
 */
const getVariantImageUrlForUseCase = (variantImage, useCase = 'detail') => {
  if (!variantImage) return null;
  
  const useCaseMap = {
    'list': 'low',          // 256x256 - for product lists
    'card': 'mid',          // 600x600 - for product cards
    'detail': 'high',       // 1200x1200 - for product detail pages
    'original': 'original'  // Original image
  };
  
  const preferredSize = useCaseMap[useCase] || 'high';
  return getProductVariantImageUrl(variantImage, preferredSize);
};

/**
 * Get primary variant image URL for a product variant with specific size
 * @param {Array} variantImages - Array of variant images
 * @param {string} size - Size type (low, mid, high, original)
 * @returns {string|null} - Primary image URL
 */
const getPrimaryVariantImageUrl = (variantImages, size = 'high') => {
  if (!variantImages || !Array.isArray(variantImages)) return null;
  
  const primaryImage = variantImages.find(img => img.is_primary);
  if (!primaryImage) return null;
  
  return getProductVariantImageUrl(primaryImage, size);
};

/**
 * Get variant image URLs for different use cases
 * @param {Object} variantImage - ProductVariantImage model instance
 * @returns {Object} - Object with URLs for different use cases
 */
const getVariantImageUrlsByUseCase = (variantImage) => {
  if (!variantImage) return {};
  
  return {
    list: getVariantImageUrlForUseCase(variantImage, 'list'),
    card: getVariantImageUrlForUseCase(variantImage, 'card'),
    detail: getVariantImageUrlForUseCase(variantImage, 'detail'),
    original: getVariantImageUrlForUseCase(variantImage, 'original')
  };
};

/**
 * Get the best available variant image URL with fallback
 * @param {Object} variantImage - ProductVariantImage model instance
 * @param {string} preferredUseCase - Preferred use case
 * @returns {string|null} - Best available image URL
 */
const getBestVariantImageUrl = (variantImage, preferredUseCase = 'detail') => {
  if (!variantImage) return null;
  
  // Try preferred use case first
  let url = getVariantImageUrlForUseCase(variantImage, preferredUseCase);
  if (url) return url;
  
  // Fallback order: detail -> card -> list -> original
  const fallbackOrder = ['detail', 'card', 'list', 'original'];
  
  for (const useCase of fallbackOrder) {
    url = getVariantImageUrlForUseCase(variantImage, useCase);
    if (url) return url;
  }
  
  return null;
};

/**
 * Format variant images for API response
 * @param {Array|Object} variantImages - Variant images or single variant image
 * @returns {Array|Object} - Formatted image data
 */
const formatVariantImagesForApi = (variantImages) => {
  if (!variantImages) return [];
  
  // Handle single image
  if (!Array.isArray(variantImages)) {
    return {
      id: variantImages.id,
      variant_id: variantImages.variant_id,
      is_primary: variantImages.is_primary,
      sort_order: variantImages.sort_order,
      alt_text: variantImages.alt_text,
      urls: getAllProductVariantImageUrls(variantImages),
      image_url: variantImages.image_url // Legacy support
    };
  }
  
  // Handle array of images
  return variantImages.map(image => ({
    id: image.id,
    variant_id: image.variant_id,
    is_primary: image.is_primary,
    sort_order: image.sort_order,
    alt_text: image.alt_text,
    urls: getAllProductVariantImageUrls(image),
    image_url: image.image_url // Legacy support
  }));
};

/**
 * Check if variant image has specific size available
 * @param {Object} variantImage - ProductVariantImage model instance
 * @param {string} size - Size type (low, mid, high, original)
 * @returns {boolean} - Whether the size is available
 */
const hasVariantImageSize = (variantImage, size) => {
  if (!variantImage) return false;
  
  const sizeMap = {
    'low': 'image_url_low',
    'mid': 'image_url_mid',
    'high': 'image_url_high',
    'original': 'image_url'
  };
  
  const fieldName = sizeMap[size];
  return !!(fieldName && variantImage[fieldName]);
};

/**
 * Get responsive variant image URLs for HTML srcset
 * @param {Object} variantImage - ProductVariantImage model instance
 * @returns {string} - HTML srcset string
 */
const getVariantImageSrcset = (variantImage) => {
  if (!variantImage) return '';
  
  const urls = getVariantImageUrlsByUseCase(variantImage);
  const srcset = [];
  
  if (urls.list) srcset.push(`${urls.list} 256w`);
  if (urls.card) srcset.push(`${urls.card} 600w`);
  if (urls.detail) srcset.push(`${urls.detail} 1200w`);
  
  return srcset.join(', ');
};

/**
 * Get lazy loading optimized variant image URL
 * @param {Object} variantImage - ProductVariantImage model instance
 * @param {string} useCase - Use case (list, card, detail)
 * @returns {Object} - Object with src, srcset, and loading attributes
 */
const getLazyLoadingVariantImage = (variantImage, useCase = 'list') => {
  if (!variantImage) return { src: '', srcset: '', loading: 'lazy' };
  
  const urls = getVariantImageUrlsByUseCase(variantImage);
  const src = urls[useCase] || urls.list || variantImage.image_url;
  const srcset = getVariantImageSrcset(variantImage);
  
  return {
    src,
    srcset,
    loading: 'lazy',
    decoding: 'async'
  };
};

module.exports = {
  getProductVariantImageUrl,
  getAllProductVariantImageUrls,
  getVariantImageUrlForUseCase,
  getPrimaryVariantImageUrl,
  getVariantImageUrlsByUseCase,
  getBestVariantImageUrl,
  formatVariantImagesForApi,
  hasVariantImageSize,
  getVariantImageSrcset,
  getLazyLoadingVariantImage
};
