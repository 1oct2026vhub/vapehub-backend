/**
 * Product Image Resizer Utility
 * Handles resizing and uploading product images to multiple sizes
 * Resized URLs are stored in database fields
 */

const sharp = require('sharp');
const s3 = require('../../config/awsConfig');
const path = require('path');
const { generateUniqueFileName } = require('../s3/s3Helper');

/**
 * Generate S3 key for resized image
 * @param {string} originalS3Key - Original S3 key
 * @param {string} size - Size type
 * @returns {string} - Resized S3 key
 */
const generateResizedS3Key = (originalS3Key, size) => {
  if (!originalS3Key) return null;
  
  const sizeMap = {
    'low': '-low',
    'mid': '-mid',
    'high': '-high'
  };
  
  const suffix = sizeMap[size];
  if (!suffix) return originalS3Key;
  
  // Support SVG and other formats
  return originalS3Key.replace(/\.(jpg|jpeg|png|webp|svg)$/i, `${suffix}.$1`);
};

// Product image configurations - NO RESIZING, PRESERVE ORIGINAL FORMAT
const PRODUCT_RESIZE_CONFIGS = {
  // Low resolution: Original image (no resizing)
  low: {},
  // Mid resolution: Original image (no resizing)
  mid: {},
  // High resolution: Original image (no resizing)
  high: {}
};

/**
 * Check image buffer size (1MB limit check only)
 * No resizing or format conversion - images are saved as-is
 * @param {Buffer} imageBuffer - Original image buffer
 * @param {Object} config - Config (kept for backward compatibility, not used)
 * @returns {Promise<Buffer>} - Original image buffer (unchanged)
 */
const resizeImageToConfig = async (imageBuffer, config) => {
  try {
    const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB in bytes
    const originalFileSize = imageBuffer.length;
    
    // ✅ Only check file size - no resizing, no format conversion
    if (originalFileSize > MAX_FILE_SIZE) {
      const sizeMB = (originalFileSize / 1024 / 1024).toFixed(2);
      console.log(`⚠️ File size ${sizeMB}MB exceeds 1MB limit. Returning original as-is.`);
    } else {
      const sizeKB = (originalFileSize / 1024).toFixed(2);
      console.log(`ℹ️ File size ${sizeKB}KB is within 1MB limit.`);
    }
    
    // ✅ Return original image as-is - no processing
    return imageBuffer;
  } catch (error) {
    console.error('❌ Error checking product image:', error);
    return imageBuffer;
  }
};

/**
 * Upload resized image to S3
 * @param {Buffer} imageBuffer - Resized image buffer
 * @param {string} s3Key - S3 key for the image
 * @param {string} contentType - Content type
 * @returns {Promise<Object>} - Upload result
 */
const uploadResizedImageToS3 = async (imageBuffer, s3Key, contentType) => {
  try {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: s3Key,
      Body: imageBuffer,
      ContentType: contentType
    };
    
    return await s3.upload(params).promise();
  } catch (error) {
    console.error('❌ Error uploading resized product image to S3:', error);
    throw error;
  }
};

/**
 * Process and upload product image in multiple sizes using URL pattern
 * @param {Buffer} originalBuffer - Original image buffer
 * @param {string} originalName - Original filename
 * @param {number} productId - Product ID
 * @param {string} mimetype - Original MIME type
 * @param {string} originalS3Key - Original S3 key (for generating resized keys)
 * @returns {Promise<Object>} - Object containing upload results for all sizes
 */
const processProductImageInMultipleSizes = async (originalBuffer, originalName, productId, mimetype, originalS3Key) => {
  try {
    const results = {};
    const availableSizes = Object.keys(PRODUCT_RESIZE_CONFIGS);
    
    console.log(`🖼️ Processing product image for product ${productId} in ${availableSizes.length} sizes`);
    
    // Check if it's SVG - skip resizing for SVG files
    if (mimetype === 'image/svg+xml') {
      console.log(`ℹ️ SVG file detected (${originalName}), skipping resize - SVG will be uploaded as-is`);
      return {
        low: null,
        mid: null,
        high: null
      };
    }
    
    // Process all sizes in parallel for better performance
    const resizePromises = availableSizes.map(async (size) => {
      try {
        console.log(`🔄 Processing ${size} size...`);
        
        // Get resize configuration for this size
        const config = PRODUCT_RESIZE_CONFIGS[size];
        
        // Resize the image
        const resizedBuffer = await resizeImageToConfig(originalBuffer, config);
        
        // If resize returned original buffer (e.g., SVG), skip this size
        if (resizedBuffer === originalBuffer && mimetype === 'image/svg+xml') {
          return { size, result: null };
        }
        
        // Generate S3 key for resized image (preserve original extension)
        const resizedS3Key = generateResizedS3Key(originalS3Key, size);
        
        // Determine content type from original file extension
        const originalExt = path.extname(originalS3Key).toLowerCase();
        let contentType = 'image/jpeg'; // default
        if (originalExt === '.png') contentType = 'image/png';
        else if (originalExt === '.webp') contentType = 'image/webp';
        else if (originalExt === '.gif') contentType = 'image/gif';
        else if (originalExt === '.svg') contentType = 'image/svg+xml';
        
        // Upload to S3
        const uploadResult = await uploadResizedImageToS3(resizedBuffer, resizedS3Key, contentType);
        
        return {
          size,
          result: {
            url: uploadResult.Location,
            key: uploadResult.Key,
            size: size,
            config: config
          }
        };
        
      } catch (error) {
        console.error(`❌ Error processing ${size} size:`, error);
        // Continue with other sizes even if one fails
        return { size, result: null };
      }
    });
    
    // Wait for all resizes to complete in parallel
    const resizeResults = await Promise.all(resizePromises);
    
    // Organize results
    resizeResults.forEach(({ size, result }) => {
      results[size] = result;
      if (result) {
        console.log(`✅ ${size} size uploaded successfully: ${result.url}`);
      }
    });
    
    return results;
  } catch (error) {
    console.error('❌ Error processing product image in multiple sizes:', error);
    throw error;
  }
};

/**
 * Delete product image in all sizes from S3 using URL pattern
 * @param {string} originalS3Key - Original S3 key
 * @returns {Promise<Object>} - Deletion results
 */
const deleteProductImageInAllSizes = async (originalS3Key) => {
  try {
    const results = {};
    const availableSizes = Object.keys(PRODUCT_RESIZE_CONFIGS);
    
    console.log(`🗑️ Deleting product image in all sizes: ${originalS3Key}`);
    
    // Delete each size
    for (const size of availableSizes) {
      try {
        const resizedS3Key = generateResizedS3Key(originalS3Key, size);
        
        await s3.deleteObject({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: resizedS3Key
        }).promise();
        
        results[size] = { success: true, key: resizedS3Key };
        console.log(`✅ ${size} size deleted successfully: ${resizedS3Key}`);
        
      } catch (error) {
        console.error(`❌ Error deleting ${size} size:`, error);
        results[size] = { success: false, error: error.message };
      }
    }
    
    return results;
  } catch (error) {
    console.error('❌ Error deleting product image in all sizes:', error);
    throw error;
  }
};

module.exports = {
  resizeImageToConfig,
  uploadResizedImageToS3,
  processProductImageInMultipleSizes,
  deleteProductImageInAllSizes,
  PRODUCT_RESIZE_CONFIGS
};
