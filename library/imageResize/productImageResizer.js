/**
 * Product Image Resizer Utility
 * Handles resizing and uploading product images to multiple sizes
 * Resized URLs are stored in database fields
 */

const sharp = require('sharp');
const s3 = require('../../config/awsConfig');
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

// Product image resize configurations - MAXIMUM QUALITY
const PRODUCT_RESIZE_CONFIGS = {
  // Low resolution: 256 x 256 px (for mobile, quick loading)
  low: {
    width: 256,
    height: 256,
    quality: 92, // Maximum quality for thumbnails - WebP 92 ≈ JPEG 98 visually
    format: 'webp', // Convert to WebP for better compression
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
    console.log(`📊 Original product image: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);
    
    // Check if it's SVG - Sharp cannot process SVG
    if (metadata.format === 'svg' || !metadata.width) {
      throw new Error('SVG files cannot be resized with Sharp');
    }
    
    // Determine resize options
    let resizeOptions = {};
    
    if (config.width && config.height) {
      // Specific dimensions provided
      resizeOptions = {
        width: config.width,
        height: config.height,
        fit: 'inside',
        withoutEnlargement: true,
        kernel: 'lanczos3', // High-quality resampling algorithm
        fastShrinkOnLoad: false // Don't use fast shrink, better quality
      };
    } else if (config.maxWidth || config.maxHeight) {
      // Use max dimensions as constraints
      if (
        (config.maxWidth && metadata.width > config.maxWidth) ||
        (config.maxHeight && metadata.height > config.maxHeight)
      ) {
        resizeOptions = {
          width: config.maxWidth,
          height: config.maxHeight,
          fit: 'inside',
          withoutEnlargement: true,
          kernel: 'lanczos3',
          fastShrinkOnLoad: false
        };
      }
    }
    
    // Apply resize if needed
    if (Object.keys(resizeOptions).length > 0) {
      sharpInstance = sharpInstance.resize(resizeOptions);
      console.log(`🔄 Resizing product image with options:`, resizeOptions);
    }
    
    const targetQuality = Math.min(config.quality ?? 85, 100);
    
    // Use WebP format for better compression (as configured)
    const targetFormat = config.format || 'webp';
    const format = targetFormat.toLowerCase();

    // Apply format-specific settings optimized for maximum quality
    switch (format) {
      case 'webp':
        // WebP: Maximum quality with lossless for highest quality tier
        const useLossless = targetQuality >= 98; // Use lossless for 98+ quality
        sharpInstance = sharpInstance.webp({
          quality: useLossless ? undefined : targetQuality,  // Quality not used in lossless mode
          effort: 6,                  // Maximum effort (0-6) for best compression
          smartSubsample: true,       // Better quality
          lossless: useLossless,      // Lossless for maximum quality (98+)
          alphaQuality: useLossless ? 100 : targetQuality, // Maximum alpha quality
          nearLossless: !useLossless && targetQuality >= 95,  // Near-lossless for 95-97
          method: 6                   // Compression method (0-6, higher = better compression)
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
        // Convert PNG to WebP for better compression
        sharpInstance = sharpInstance.webp({
          quality: targetQuality,
          effort: 6,
          smartSubsample: true,
          lossless: false,
          alphaQuality: 100  // Preserve transparency quality
        });
        break;
      default:
        // Default: Use WebP for best compression
        sharpInstance = sharpInstance.webp({
          quality: targetQuality,
          effort: 6,
          smartSubsample: true,
          lossless: false
        });
    }
    
    const processedBuffer = await sharpInstance.toBuffer();
    
    // Get final image info
    const finalMetadata = await sharp(processedBuffer).metadata();
    const sizeKB = (processedBuffer.length / 1024).toFixed(2);
    console.log(`✅ Processed product image: ${finalMetadata.width}x${finalMetadata.height}, ${sizeKB}KB, format: ${finalMetadata.format}`);
    
    return processedBuffer;
  } catch (error) {
    // Handle SVG gracefully - return original buffer
    if (error.message.includes('SVG') || error.message.includes('Input file is missing')) {
      console.log(`ℹ️ SVG file detected, skipping resize`);
      return imageBuffer; // Return original for SVG
    }
    console.error('❌ Error resizing product image:', error);
    throw error;
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
        
        // Generate S3 key for resized image (change extension to .webp)
        const resizedS3Key = generateResizedS3Key(originalS3Key, size).replace(/\.(jpg|jpeg|png)$/i, '.webp');
        
        // Set content type to WebP since we're converting
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
