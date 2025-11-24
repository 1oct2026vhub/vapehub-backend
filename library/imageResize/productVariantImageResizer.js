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
  
  // Support SVG and other formats
  return originalS3Key.replace(/\.(jpg|jpeg|png|webp|svg)$/i, `${suffix}.$1`);
};

// Product variant image resize configurations - MAXIMUM QUALITY
const PRODUCT_VARIANT_RESIZE_CONFIGS = {
  // Low resolution: 256 x 256 px (for mobile, quick loading)
  low: {
    width: 256,
    height: 256,
    quality: 92, // Maximum quality for thumbnails - WebP 92 ≈ JPEG 98 visually
    format: 'webp', // Convert to WebP
    fit: 'inside' // Maintain aspect ratio, fit within bounds
  },
  // Mid resolution: 600 x 600 px (for product cards, medium displays)
  mid: {
    width: 600,
    height: 600,
    quality: 95, // Near-lossless quality - WebP 95 ≈ JPEG 99 visually
    format: 'webp',
    fit: 'inside'
  },
  // High resolution: 1200 x 1200 px (for product detail pages)
  high: {
    width: 1200,
    height: 1200,
    quality: 98, // Near-lossless quality - visually identical to original
    format: 'webp',
    fit: 'inside',
    maxWidth: 1920, // Ensure never exceeds max size
    maxHeight: 1080
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
    // Initialize Sharp with metadata preservation
    let sharpInstance = sharp(imageBuffer, {
      failOn: 'none',
      keepMetadata: true,
      sequentialRead: false
    });
    
    // Get original image metadata
    const metadata = await sharpInstance.metadata();
    
    // Check if it's SVG - Sharp cannot process SVG
    if (metadata.format === 'svg' || !metadata.width) {
      throw new Error('SVG files cannot be resized with Sharp');
    }
    
    // Apply resize if dimensions are specified
    if (config.width && config.height) {
      sharpInstance = sharpInstance.resize(config.width, config.height, {
        fit: config.fit || 'inside',
        withoutEnlargement: true,
        kernel: 'lanczos3', // High-quality resampling algorithm
        fastShrinkOnLoad: false
      });
    } else if (config.maxWidth || config.maxHeight) {
      sharpInstance = sharpInstance.resize(config.maxWidth, config.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
        kernel: 'lanczos3',
        fastShrinkOnLoad: false
      });
    }
    
    const targetQuality = Math.min(config.quality ?? 85, 100);
    const targetFormat = config.format || 'webp';
    const format = targetFormat.toLowerCase();
    
    // Apply format-specific settings optimized for maximum quality
    switch (format) {
      case 'webp':
        // WebP: Maximum quality with lossless for highest quality tier
        const useLossless = targetQuality >= 98; // Use lossless for 98+ quality
        sharpInstance = sharpInstance.webp({
          quality: useLossless ? undefined : targetQuality,  // Quality not used in lossless mode
          effort: 6,
          smartSubsample: true,
          lossless: useLossless,      // Lossless for maximum quality (98+)
          alphaQuality: useLossless ? 100 : targetQuality, // Maximum alpha quality
          nearLossless: !useLossless && targetQuality >= 95,  // Near-lossless for 95-97
          method: 6
        });
        break;
      case 'jpeg':
      case 'jpg':
        sharpInstance = sharpInstance.jpeg({
          quality: targetQuality,
          progressive: true,
          mozjpeg: true,
          trellisQuantisation: true,
          overshootDeringing: true,
          optimizeScans: true,
          quantisationTable: 0
        });
        break;
      case 'png':
        // Convert PNG to WebP
        sharpInstance = sharpInstance.webp({
          quality: targetQuality,
          effort: 6,
          smartSubsample: true,
          lossless: false,
          alphaQuality: 100
        });
        break;
      default:
        sharpInstance = sharpInstance.webp({
          quality: targetQuality,
          effort: 6,
          smartSubsample: true,
          lossless: false
        });
    }
    
    return await sharpInstance.toBuffer();
  } catch (error) {
    // Handle SVG gracefully - return original buffer
    if (error.message.includes('SVG') || error.message.includes('Input file is missing')) {
      console.log(`ℹ️ SVG file detected, skipping resize`);
      return imageBuffer;
    }
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
        
        // Generate S3 key for resized image (change extension to .webp)
        const resizedS3Key = generateResizedS3Key(originalS3Key, size).replace(/\.(jpg|jpeg|png)$/i, '.webp');
        
        // Set content type to WebP
        const contentType = 'image/webp';
        
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
