/**
 * Product Variant Image Resizer Utility
 * Handles resizing and uploading product variant images to multiple sizes
 * Resized URLs are stored in database fields
 */

const sharp = require('sharp');
const s3 = require('../../config/awsConfig');
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
  
  return originalS3Key.replace(/\.(jpg|jpeg|png|webp)$/i, `${suffix}.$1`);
};

// Product variant image resize configurations
const PRODUCT_VARIANT_RESIZE_CONFIGS = {
  // Low resolution: 256 x 256 px (for mobile, quick loading)
  low: {
    width: 256,
    height: 256,
    quality: 80,
    format: 'jpeg',
    fit: 'inside' // Maintain aspect ratio, fit within bounds
  },
  // Mid resolution: 600 x 600 px (for product cards, medium displays)
  mid: {
    width: 600,
    height: 600,
    quality: 85,
    format: 'jpeg',
    fit: 'inside'
  },
  // High resolution: 1200 x 1200 px (for product detail pages)
  high: {
    width: 1200,
    height: 1200,
    quality: 90,
    format: 'jpeg',
    fit: 'inside'
  }
};

/**
 * Resize image buffer to specific size configuration
 * @param {Buffer} imageBuffer - Original image buffer
 * @param {Object} config - Resize configuration
 * @returns {Promise<Buffer>} - Resized image buffer
 */
const resizeImageToConfig = async (imageBuffer, config) => {
  try {
    let sharpInstance = sharp(imageBuffer);
    
    // Apply resize if dimensions are specified
    if (config.width && config.height) {
      sharpInstance = sharpInstance.resize(config.width, config.height, {
        fit: config.fit || 'inside',
        withoutEnlargement: true
      });
    } else if (config.maxWidth || config.maxHeight) {
      sharpInstance = sharpInstance.resize(config.maxWidth, config.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }
    
    // Apply format and quality
    if (config.format) {
      switch (config.format.toLowerCase()) {
        case 'jpeg':
        case 'jpg':
          sharpInstance = sharpInstance.jpeg({ quality: config.quality || 80 });
          break;
        case 'png':
          sharpInstance = sharpInstance.png({ quality: config.quality || 80 });
          break;
        case 'webp':
          sharpInstance = sharpInstance.webp({ quality: config.quality || 80 });
          break;
      }
    }
    
    return await sharpInstance.toBuffer();
  } catch (error) {
    console.error('Error resizing image:', error);
    throw error;
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
    
    const results = {};
    const availableSizes = Object.keys(PRODUCT_VARIANT_RESIZE_CONFIGS);
    
    // Process each size
    for (const size of availableSizes) {
      try {
        const config = PRODUCT_VARIANT_RESIZE_CONFIGS[size];
        
        // Resize the image
        const resizedBuffer = await resizeImageToConfig(originalBuffer, config);
        
        // Generate S3 key for resized image
        const resizedS3Key = generateResizedS3Key(originalS3Key, size);
        
        // Determine content type
        let contentType = mimetype;
        if (config.format) {
          switch (config.format.toLowerCase()) {
            case 'jpeg':
            case 'jpg':
              contentType = 'image/jpeg';
              break;
            case 'png':
              contentType = 'image/png';
              break;
            case 'webp':
              contentType = 'image/webp';
              break;
          }
        }
        
        // Upload to S3
        const uploadResult = await uploadResizedImageToS3(resizedBuffer, resizedS3Key, contentType);
        
        // Store result
        results[size] = {
          url: uploadResult.Location,
          key: uploadResult.Key,
          size: size,
          config: config
        };
        
        console.log(`✅ ${size} size uploaded successfully: ${uploadResult.Location}`);
        
      } catch (error) {
        console.error(`❌ Error processing ${size} size:`, error);
        // Continue with other sizes even if one fails
        results[size] = null;
      }
    }
    
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
