const logger = require('../../../../library/logger');

/**
 * Validate promotional images (without S3 upload)
 * @param {Array} images - Array of image files
 * @returns {Object} Validation result
 */
const validatePromotionalImages = (images) => {
    const errors = [];
    const maxFileSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const maxImages = 10;

    if (!images || images.length === 0) {
        return { isValid: true, errors: [] };
    }

    if (images.length > maxImages) {
        errors.push(`Maximum ${maxImages} images allowed per campaign`);
    }

    images.forEach((image, index) => {
        if (!image) return;

        // Check file size
        if (image.size > maxFileSize) {
            errors.push(`Image ${index + 1} (${image.originalname}) exceeds maximum file size of 5MB`);
        }

        // Check file type
        if (!allowedTypes.includes(image.mimetype)) {
            errors.push(`Image ${index + 1} (${image.originalname}) has unsupported file type. Allowed: JPEG, PNG, GIF, WebP`);
        }

        // Check filename
        if (!image.originalname || image.originalname.trim() === '') {
            errors.push(`Image ${index + 1} has no filename`);
        }
    });

    return {
        isValid: errors.length === 0,
        errors: errors
    };
};

/**
 * Process images for direct email embedding
 * @param {Array} images - Array of image files
 * @returns {Array} Processed image objects
 */
const processImagesForEmail = (images) => {
    if (!images || images.length === 0) {
        return [];
    }

    return images.map((image, index) => ({
        filename: image.originalname,
        content: image.buffer,
        contentType: image.mimetype,
        cid: `image_${index}`, // Content ID for embedding
        alt: image.originalname.replace(/\.[^/.]+$/, ""), // Remove extension for alt text
        isPrimary: index === 0
    }));
};

/**
 * Generate image HTML for email templates
 * @param {Array} processedImages - Array of processed image objects
 * @returns {Array} Array of image objects with HTML-ready data
 */
const generateImageHTML = (processedImages) => {
    return processedImages.map((image, index) => ({
        url: `cid:${image.cid}`, // Use Content ID for embedding
        alt: image.alt,
        isPrimary: image.isPrimary,
        filename: image.filename
    }));
};

module.exports = {
    validatePromotionalImages,
    processImagesForEmail,
    generateImageHTML
}; 