/**
 * Feature Content Helper Functions
 * Contains utility functions for feature content operations
 */

/**
 * Validate icon file type and size
 * @param {Object} file - Multer file object
 * @returns {Object} - Validation result with success and message
 */
const validateIconFile = (file) => {
  if (!file) {
    return { success: false, message: 'Icon file is required' };
  }

  // Check file type
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.mimetype)) {
    return { success: false, message: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed' };
  }

  // Check file size (5MB limit)
  const maxSize = 5 * 1024 * 1024; // 5MB in bytes
  if (file.size > maxSize) {
    return { success: false, message: 'File size too large. Maximum size is 5MB' };
  }

  return { success: true, message: 'File validation passed' };
};

/**
 * Generate SEO-friendly slug from title
 * @param {string} title - The title to convert to slug
 * @returns {string} - SEO-friendly slug
 */
const generateSlug = (title) => {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

/**
 * Sanitize feature content data
 * @param {Object} data - Raw feature content data
 * @returns {Object} - Sanitized data
 */
const sanitizeFeatureContentData = (data) => {
  const sanitized = {};

  if (data.title) {
    sanitized.title = data.title.trim();
  }

  if (data.subtitle) {
    sanitized.subtitle = data.subtitle.trim();
  }

  if (data.status) {
    sanitized.status = data.status.toLowerCase();
  }

  return sanitized;
};

/**
 * Format feature content for API response
 * @param {Object} featureContent - Raw feature content object
 * @returns {Object} - Formatted feature content
 */
const formatFeatureContentResponse = (featureContent) => {
  if (!featureContent) return null;

  const formatted = {
    id: featureContent.id,
    title: featureContent.title,
    subtitle: featureContent.subtitle,
    icon_id: featureContent.icon_id,
    status: featureContent.status,
    updated_by: featureContent.updated_by,
    createdAt: featureContent.createdAt,
    updatedAt: featureContent.updatedAt,
    deletedAt: featureContent.deletedAt
  };

  // Include updater information if available
  if (featureContent.updater) {
    formatted.updater = {
      id: featureContent.updater.id,
      first_name: featureContent.updater.first_name,
      last_name: featureContent.updater.last_name,
      email: featureContent.updater.email
    };
  }

  // Include icon information if available
  if (featureContent.icon) {
    formatted.icon = {
      id: featureContent.icon.id,
      file_name: featureContent.icon.file_name,
      icon_url: featureContent.icon.icon_url,
      createdAt: featureContent.icon.createdAt
    };
  }

  // Include icons array if available
  if (featureContent.icons && Array.isArray(featureContent.icons)) {
    formatted.icons = featureContent.icons.map(icon => ({
      id: icon.id,
      file_name: icon.file_name,
      icon_url: icon.icon_url,
      createdAt: icon.createdAt
    }));
  }

  return formatted;
};

module.exports = {
  validateIconFile,
  generateSlug,
  sanitizeFeatureContentData,
  formatFeatureContentResponse
};
