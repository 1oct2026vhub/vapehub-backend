/**
 * Product Variant Image Resizer Utility
 * Handles resizing and uploading product variant images to multiple sizes
 * Resized URLs are stored in database fields
 */

const sharp = require('sharp');
const s3 = require('../../config/awsConfig');
const path = require('path');
const { generateUniqueFileName } = require('../s3/s3Helper');

/**
 * Generate S3 key for resized variant image
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

// Product variant image configurations - NO RESIZING, PRESERVE ORIGINAL FORMAT
const PRODUCT_VARIANT_RESIZE_CONFIGS = {
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
    console.error('❌ Error checking variant image:', error);
    return imageBuffer;
  }
};

/**
 * Upload resized image to S3
 * @param {Buffer} imageBuffer - Resized image buffer
 * @param {string} s3Key - S3 key for the resized image
 * @param {string} contentType - Content type of the image
 * @returns {Promise<Object>} - S3 upload result
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
    console.error('Error uploading resized image to S3:', error);
    throw error;
  }
};

/**
 * Process product variant image in multiple sizes
 * @param {Buffer} originalBuffer - Original image buffer
 * @param {string} originalName - Original filename
 * @param {number} variantId - Product variant ID
 * @param {string} mimetype - Original image mimetype
 * @param {string} originalS3Key - Original S3 key
 * @returns {Promise<Object>} - Object containing all resized image results
 */
const processProductVariantImageInMultipleSizes = async (originalBuffer, originalName, variantId, mimetype, originalS3Key) => {
  try {
    console.log(`🖼️ Processing variant image: ${originalName} for variant ${variantId}`);
    
    // Check if it's SVG - skip resizing for SVG files
    if (mimetype === 'image/svg+xml') {
      console.log(`ℹ️ SVG file detected (${originalName}), skipping resize - SVG will be uploaded as-is`);
      return {
        low: null,
        mid: null,
        high: null
      };
    }
    
    const results = {};
    const availableSizes = Object.keys(PRODUCT_VARIANT_RESIZE_CONFIGS);
    
    // Process all sizes in parallel for better performance
    const resizePromises = availableSizes.map(async (size) => {
      try {
        console.log(`🔄 Processing ${size} size...`);
        
        const config = PRODUCT_VARIANT_RESIZE_CONFIGS[size];
        
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
    console.error('❌ Error processing product variant image in multiple sizes:', error);
    throw error;
  }
};

/**
 * Delete product variant image in all sizes from S3
 * @param {string} originalS3Key - Original S3 key
 * @returns {Promise<void>}
 */
const deleteProductVariantImageInAllSizes = async (originalS3Key) => {
  try {
    const availableSizes = Object.keys(PRODUCT_VARIANT_RESIZE_CONFIGS);
    const keysToDelete = [];
    
    // Generate all possible S3 keys
    for (const size of availableSizes) {
      const resizedS3Key = generateResizedS3Key(originalS3Key, size);
      if (resizedS3Key) {
        keysToDelete.push({ Key: resizedS3Key });
      }
    }
    
    // Add original key
    keysToDelete.push({ Key: originalS3Key });
    
    if (keysToDelete.length > 0) {
      const deleteParams = {
        Bucket: process.env.AWS_S3_BUCKET,
        Delete: {
          Objects: keysToDelete
        }
      };
      
      await s3.deleteObjects(deleteParams).promise();
      console.log(`✅ Deleted ${keysToDelete.length} variant images from S3`);
    }
  } catch (error) {
    console.error('❌ Error deleting variant images from S3:', error);
    throw error;
  }
};

module.exports = {
  processProductVariantImageInMultipleSizes,
  deleteProductVariantImageInAllSizes,
  PRODUCT_VARIANT_RESIZE_CONFIGS
};
