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

// Product image resize configurations
const PRODUCT_RESIZE_CONFIGS = {
  // Low resolution: 256 x 256 px (for mobile, quick loading)
  low: {
    width: 256,
    height: 256,
    quality: 85, // Increased from 80 for better quality
    format: null, // null = preserve original format
    fit: 'inside' // Maintain aspect ratio, fit within bounds
  },
  // Mid resolution: 600 x 600 px (for product cards, medium displays)
  mid: {
    width: 600,
    height: 600,
    quality: 90, // Increased from 85 for better quality
    format: null, // null = preserve original format
    fit: 'inside'
  },
  // High resolution: 1200 x 1200 px (for product detail pages)
  high: {
    width: 1200,
    height: 1200,
    quality: 95, // Increased from 90 for better quality
    format: null, // null = preserve original format
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
    let sharpInstance = sharp(imageBuffer);
    
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
        kernel: 'lanczos3' // High-quality resampling algorithm
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
          withoutEnlargement: true
        };
      }
    }
    
    // Apply resize if needed
    if (Object.keys(resizeOptions).length > 0) {
      sharpInstance = sharpInstance.resize(resizeOptions);
      console.log(`🔄 Resizing product image with options:`, resizeOptions);
    }
    
    // Preserve original format if config.format is null, otherwise use config format
    const targetQuality = Math.min(config.quality ?? 98, 100);
    const format = (config.format || metadata.format || 'jpeg').toLowerCase();

    // Apply format-specific settings that preserve clarity
    switch (format) {
      case 'jpeg':
      case 'jpg':
        sharpInstance = sharpInstance.jpeg({
          quality: targetQuality,
          progressive: true,
          mozjpeg: true,              // Better compression algorithm
          trellisQuantisation: true, // Better quality at same file size
          overshootDeringing: true,   // Reduce artifacts
          optimizeScans: true        // Optimize for progressive loading
        });
        break;
      case 'png':
        sharpInstance = sharpInstance.png({
          compressionLevel: 9,        // Maximum compression (0-9)
          adaptiveFiltering: true,    // Better compression
          palette: false,             // Keep full color depth
          effort: 10                  // Maximum compression effort
        });
        break;
      case 'webp':
        sharpInstance = sharpInstance.webp({
          quality: targetQuality,
          effort: 6,                  // Maximum effort (0-6)
          smartSubsample: true,       // Better quality
          lossless: false,            // Use lossy for better file size
          alphaQuality: 100          // Preserve transparency quality
        });
        break;
      default:
        // Default to JPEG for unknown formats
        sharpInstance = sharpInstance.jpeg({ quality: targetQuality, progressive: true });
    }
    
    const processedBuffer = await sharpInstance.toBuffer();
    
    // Get final image info
    const finalMetadata = await sharp(processedBuffer).metadata();
    console.log(`✅ Processed product image: ${finalMetadata.width}x${finalMetadata.height}, size: ${(processedBuffer.length / 1024 / 1024).toFixed(2)}MB`);
    
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
        
        // Generate S3 key for resized image
        const resizedS3Key = generateResizedS3Key(originalS3Key, size);
        
        // Determine content type - preserve original format if config.format is null
        let contentType = mimetype;
        if (config.format) {
          // Only override if format is explicitly set
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
        // If config.format is null, contentType remains as original mimetype
        
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
