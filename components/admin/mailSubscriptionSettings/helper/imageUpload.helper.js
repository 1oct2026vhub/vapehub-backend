const { uploadFiletToS3 } = require('../../../../library/s3/s3Helper');
const logger = require('../../../../library/logger');

/**
 * Upload promotional images to S3
 * @param {Array} images - Array of image files from multer
 * @param {string} campaignId - Unique identifier for the campaign
 * @returns {Array} Array of uploaded image objects
 */
const uploadPromotionalImages = async (images, campaignId) => {
    try {
        if (!images || images.length === 0) {
            return [];
        }

        const uploadedImages = [];
        const timestamp = Date.now();

        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            
            if (!image) continue;

            try {
                // Generate unique filename
                const fileExtension = image.originalname.split('.').pop();
                const fileName = `promotional-emails/${campaignId}/${timestamp}_${i}.${fileExtension}`;
                
                // Upload to S3
                const uploadResult = await uploadFiletToS3({
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: fileName,
                    Body: image.buffer,
                    ContentType: image.mimetype,
                    ACL: 'public-read'
                });

                if (uploadResult.success) {
                    uploadedImages.push({
                        url: uploadResult.url,
                        alt: image.originalname.replace(/\.[^/.]+$/, ""), // Remove file extension for alt text
                        isPrimary: i === 0, // First image is primary by default
                        originalName: image.originalname,
                        size: image.size,
                        mimeType: image.mimetype
                    });

                    logger.info(`Promotional image uploaded successfully: ${fileName}`);
                } else {
                    logger.error(`Failed to upload promotional image: ${image.originalname}`, uploadResult.error);
                }
            } catch (error) {
                logger.error(`Error uploading promotional image ${image.originalname}:`, error);
            }
        }

        return uploadedImages;
    } catch (error) {
        logger.error('Error in uploadPromotionalImages:', error);
        throw error;
    }
};

/**
 * Validate promotional images
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
 * Generate campaign ID for organizing uploaded images
 * @returns {string} Unique campaign ID
 */
const generateCampaignId = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `campaign_${timestamp}_${random}`;
};

/**
 * Clean up old promotional images (optional - for maintenance)
 * @param {string} campaignId - Campaign ID to clean up
 */
const cleanupPromotionalImages = async (campaignId) => {
    try {
        // This would typically involve deleting files from S3
        // Implementation depends on your S3 setup and retention policy
        logger.info(`Cleanup requested for campaign: ${campaignId}`);
    } catch (error) {
        logger.error(`Error cleaning up promotional images for campaign ${campaignId}:`, error);
    }
};

module.exports = {
    uploadPromotionalImages,
    validatePromotionalImages,
    generateCampaignId,
    cleanupPromotionalImages
}; 