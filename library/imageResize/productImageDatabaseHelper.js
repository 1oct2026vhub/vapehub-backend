/**
 * Product Image Database Helper
 * Easy access to resized images stored in database
 */

/**
 * Get the best available image URL for a specific size
 * @param {Object} productImage - ProductImage model instance
 * @param {string} preferredSize - Preferred size (thumb, low, mid, high, normal, original)
 * @returns {string|null} - Best available image URL
 */
const getProductImageUrl = (productImage, preferredSize = 'high') => {
  if (!productImage) return null;
  
  // Map size names to database fields
  const sizeMap = {
    'low': 'image_url_low',
    'mid': 'image_url_mid',
    'high': 'image_url_high',
    'original': 'image_url'
  };
  
  const fieldName = sizeMap[preferredSize];
  if (fieldName && productImage[fieldName]) {
    return productImage[fieldName];
  }
  
  // Fallback order: high -> mid -> low -> original
  const fallbackOrder = ['high', 'mid', 'low', 'original'];
  
  for (const size of fallbackOrder) {
    const fieldName = sizeMap[size];
    if (productImage[fieldName]) {
      return productImage[fieldName];
    }
  }
  
  return null;
};

/**
 * Get all available image URLs for a product image
 * @param {Object} productImage - ProductImage model instance
 * @returns {Object} - Object containing all available URLs
 */
const getAllProductImageUrls = (productImage) => {
  if (!productImage) return {};
  
  return {
    original: productImage.image_url,
    low: productImage.image_url_low,
    mid: productImage.image_url_mid,
    high: productImage.image_url_high
  };
};

/**
 * Get image URL for specific use case
 * @param {Object} productImage - ProductImage model instance
 * @param {string} useCase - Use case (thumbnail, list, card, detail, original)
 * @returns {string|null} - Best image URL for the use case
 */
const getImageUrlForUseCase = (productImage, useCase = 'detail') => {
  if (!productImage) return null;
  
  const useCaseMap = {
    'list': 'low',          // 256x256 - for product lists
    'card': 'mid',          // 600x600 - for product cards
    'detail': 'high',       // 1200x1200 - for product detail pages
    'original': 'original'  // Original image
  };
  
  const preferredSize = useCaseMap[useCase] || 'high';
  return getProductImageUrl(productImage, preferredSize);
};

/**
 * Get primary image URL for a product with specific size
 * @param {Array} productImages - Array of product images
 * @param {string} size - Size type (thumb, low, mid, high, normal, original)
 * @returns {string|null} - Primary image URL
 */
const getPrimaryImageUrl = (productImages, size = 'normal') => {
  if (!productImages || !Array.isArray(productImages)) return null;
  
  const primaryImage = productImages.find(img => img.is_primary);
  if (!primaryImage) return null;
  
  return getProductImageUrl(primaryImage, size);
};

/**
 * Format product images for API response
 * @param {Array|Object} productImages - ProductImage(s) to format
 * @returns {Array|Object} - Formatted image data
 */
const formatImagesForApi = (productImages) => {
  if (!productImages) return [];
  
  // Handle single image
  if (!Array.isArray(productImages)) {
    return {
      id: productImages.id,
      is_primary: productImages.is_primary,
      urls: getAllProductImageUrls(productImages),
      image_url: productImages.image_url // Legacy support
    };
  }
  
  // Handle array of images
  return productImages.map(image => ({
    id: image.id,
    is_primary: image.is_primary,
    urls: getAllProductImageUrls(image),
    image_url: image.image_url // Legacy support
  }));
};

/**
 * Get image URLs for different use cases
 * @param {Object} productImage - ProductImage model instance
 * @returns {Object} - Object with URLs for different use cases
 */
const getProductImageUrlsByUseCase = (productImage) => {
  if (!productImage) return {};
  
  return {
    list: getImageUrlForUseCase(productImage, 'list'),
    card: getImageUrlForUseCase(productImage, 'card'),
    detail: getImageUrlForUseCase(productImage, 'detail'),
    original: getImageUrlForUseCase(productImage, 'original')
  };
};

/**
 * Get the best available image URL with fallback
 * @param {Object} productImage - ProductImage model instance
 * @param {string} preferredUseCase - Preferred use case
 * @returns {string|null} - Best available image URL
 */
const getBestProductImageUrl = (productImage, preferredUseCase = 'detail') => {
  if (!productImage) return null;
  
  // Try preferred use case first
  let url = getImageUrlForUseCase(productImage, preferredUseCase);
  if (url) return url;
  
  // Fallback order: detail -> card -> list -> original
  const fallbackOrder = ['detail', 'card', 'list', 'original'];
  
  for (const useCase of fallbackOrder) {
    url = getImageUrlForUseCase(productImage, useCase);
    if (url) return url;
  }
  
  // Last resort: return original URL
  return productImage.image_url;
};

/**
 * Check if a specific image size is available
 * @param {Object} productImage - ProductImage model instance
 * @param {string} size - Size to check (thumb, low, mid, high, normal)
 * @returns {boolean} - Whether the image size is available
 */
const hasProductImageSize = (productImage, size) => {
  if (!productImage) return false;
  
  const sizeMap = {
    'thumb': 'image_url_thumb',
    'low': 'image_url_low',
    'mid': 'image_url_mid',
    'high': 'image_url_high',
    'normal': 'image_url_normal'
  };
  
  const fieldName = sizeMap[size];
  return !!(fieldName && productImage[fieldName]);
};

/**
 * Get responsive image URLs for HTML srcset
 * @param {Object} productImage - ProductImage model instance
 * @returns {string} - HTML srcset string
 */
const getProductImageSrcset = (productImage) => {
  if (!productImage) return '';
  
  const urls = getProductImageUrlsByUseCase(productImage);
  const srcset = [];
  
  if (urls.list) srcset.push(`${urls.list} 256w`);
  if (urls.card) srcset.push(`${urls.card} 600w`);
  if (urls.detail) srcset.push(`${urls.detail} 1200w`);
  
  return srcset.join(', ');
};

/**
 * Get lazy loading optimized image URL
 * @param {Object} productImage - ProductImage model instance
 * @param {string} useCase - Use case (list, card, detail)
 * @returns {Object} - Object with src, srcset, and loading attributes
 */
const getLazyLoadingImage = (productImage, useCase = 'list') => {
  if (!productImage) return { src: '', srcset: '', loading: 'lazy' };
  
  const urls = getProductImageUrlsByUseCase(productImage);
  const src = urls[useCase] || urls.list || productImage.image_url;
  const srcset = getProductImageSrcset(productImage);
  
  return {
    src,
    srcset,
    loading: 'lazy',
    decoding: 'async'
  };
};

module.exports = {
  getProductImageUrl,
  getAllProductImageUrls,
  getImageUrlForUseCase,
  getPrimaryImageUrl,
  formatImagesForApi,
  getProductImageUrlsByUseCase,
  getBestProductImageUrl,
  hasProductImageSize,
  getProductImageSrcset,
  getLazyLoadingImage
};
