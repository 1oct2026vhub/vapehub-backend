// s3Helper.js
const s3 = require('../../config/awsConfig');
const crypto = require('crypto');
const sharp = require('sharp');
const { generateCloudFrontUrl } = require('./cloudFrontHelper');

/**
 * Generates a signed URL for an S3 object.
 * 
 * @param {string} objectKey - The key (path) of the object in the S3 bucket.
 * @param {number} [expiresInSeconds=60] - The expiration time of the signed URL in seconds.
 * @param {string} [operation='getObject'] - The S3 operation ('getObject' for download, 'putObject' for upload).
 * @returns {string} - The signed URL.
 */
const generateSignedUrl = async (objectKey, operation = 'getObject') => {
  try {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: objectKey,
      Expires: 604800, // URL expiration time in seconds
      ResponseContentDisposition: 'inline'
    };
    // Generate the signed URL
    const signedUrl = await s3.getSignedUrlPromise(operation, params)

    return signedUrl;
  } catch (e) {
    console.error(e);
    throw new Error(e)
  }
};


/**
 * Deletes a file from S3
 * @param {String} key - The key (path) to the file in the bucket
 */
const deleteFile = async (key) => {
  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key
  };

  try {
    // Delete the file from S3
    await s3.deleteObject(params).promise();
  } catch (error) {
    console.error('Error deleting file:', error);
    throw error; // Re-throw the error to handle it in the controller
  }
};

const uploadFiletToS3 = async (params) => {
  try {
    return await s3.upload(params).promise();
  } catch (error) {
    console.error('Error uploading file:', error);
  }
}

const generateUniqueFileName = (originalName) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const extension = originalName.split('.').pop();
  return `${timestamp}-${randomString}.${extension}`;
};

/**
 * Generate CloudFront URL for an S3 object
 * @param {string} s3Key - S3 object key
 * @param {string} cloudFrontDomain - CloudFront domain name (from environment or config)
 * @returns {string} - CloudFront URL
 */
const generateCloudFrontUrlForS3 = (s3Key, cloudFrontDomain = null) => {
  const domain = cloudFrontDomain || process.env.CLOUDFRONT_DOMAIN;
  if (!domain) {
    console.warn('⚠️ CLOUDFRONT_DOMAIN not set, returning S3 URL instead');
    return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${s3Key}`;
  }
  return generateCloudFrontUrl(domain, s3Key);
};

/**
 * Check if an image exists in S3 bucket
 * @param {string} s3Key - S3 object key to check
 * @returns {Promise<boolean>} - True if image exists, false otherwise
 */
const checkImageExists = async (s3Key) => {
  try {
    await s3.headObject({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: s3Key
    }).promise();
    
    return true;
  } catch (error) {
    if (error.code === 'NotFound') {
      return false;
    }
    throw error;
  }
};

/**
 * Get image metadata if it exists
 * @param {string} s3Key - S3 object key to check
 * @returns {Promise<Object|null>} - Image metadata or null if not found
 */
const getImageMetadata = async (s3Key) => {
  try {
    const result = await s3.headObject({
      Bucket: process.env.AWS_S3_BUCKET,
      Key: s3Key
    }).promise();
    
    return {
      exists: true,
      size: result.ContentLength,
      lastModified: result.LastModified,
      contentType: result.ContentType,
      etag: result.ETag
    };
  } catch (error) {
    if (error.code === 'NotFound') {
      return null;
    }
    throw error;
  }
};

/**
 * Resize image buffer while maintaining maximum quality (no clarity loss)
 * ✅ FIXED: Only compresses if file size > 1MB, uses maximum quality (98+) for clarity preservation
 * @param {Buffer} imageBuffer - Original image buffer
 * @param {Object} options - Resize options
 * @param {number} [options.width] - Target width (optional)
 * @param {number} [options.height] - Target height (optional) 
 * @param {number} [options.maxWidth=1920] - Maximum width
 * @param {number} [options.maxHeight=1080] - Maximum height
 * @param {number} [options.quality] - Quality (1-100), defaults to 98 for maximum clarity
 * @param {string} [options.format='webp'] - Output format (jpeg, png, webp)
 * @param {boolean} [options.maintainAspectRatio=true] - Maintain aspect ratio
 * @returns {Promise<Buffer>} - Resized image buffer
 */
const resizeImageBuffer = async (imageBuffer, options = {}) => {
  try {
    const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB in bytes
    const originalFileSize = imageBuffer.length;
    
    // ✅ FIX: Check file size first - preserve original if ≤ 1MB
    if (originalFileSize <= MAX_FILE_SIZE) {
      const sizeKB = (originalFileSize / 1024).toFixed(2);
      console.log(`ℹ️ File size ${sizeKB}KB is below 1MB limit. Preserving original format (resizeImageBuffer).`);
      
      // Still check if resize is needed for dimensions, but preserve original format
      const sharpInstance = sharp(imageBuffer);
      const metadata = await sharpInstance.metadata();
      
      const {
        width,
        height,
        maxWidth = 1920,
        maxHeight = 1080,
        maintainAspectRatio = true
      } = options;
      
      // Check if dimensions need resizing
      let needsResize = false;
      let resizeOptions = {};
      
      if (width && height) {
        needsResize = metadata.width > width || metadata.height > height;
        if (needsResize) {
          resizeOptions = {
            width,
            height,
            fit: maintainAspectRatio ? 'inside' : 'fill',
            withoutEnlargement: true,
            kernel: 'lanczos3', // High-quality resampling
            fastShrinkOnLoad: false // Better quality
          };
        }
      } else if (width || height) {
        needsResize = (width && metadata.width > width) || (height && metadata.height > height);
        if (needsResize) {
          resizeOptions = {
            width: width || null,
            height: height || null,
            fit: 'inside',
            withoutEnlargement: true,
            kernel: 'lanczos3',
            fastShrinkOnLoad: false
          };
        }
      } else if (metadata.width > maxWidth || metadata.height > maxHeight) {
        needsResize = true;
        resizeOptions = {
          width: maxWidth,
          height: maxHeight,
          fit: 'inside',
          withoutEnlargement: true,
          kernel: 'lanczos3',
          fastShrinkOnLoad: false
        };
      }
      
      // Only resize dimensions if needed, preserve original format
      if (needsResize) {
        console.log(`🔄 Resizing dimensions only (preserving format): ${metadata.width}x${metadata.height} → target size`);
        const resizedBuffer = await sharpInstance
          .resize(resizeOptions)
          .toBuffer(); // Keep original format
        return resizedBuffer;
      }
      
      // No resize needed, return original
      return imageBuffer;
    }

    // ✅ File size > 1MB - proceed with compression/resize using MAXIMUM quality
    console.log(`📊 File size ${(originalFileSize / 1024 / 1024).toFixed(2)}MB exceeds 1MB limit. Applying compression with maximum quality.`);

    const {
      width,
      height,
      maxWidth = 1920,
      maxHeight = 1080,
      quality = 98, // ✅ DEFAULT TO 98 for maximum clarity (was 90)
      format = 'webp', // ✅ DEFAULT TO webp for better compression with same quality
      maintainAspectRatio = true
    } = options;

    let sharpInstance = sharp(imageBuffer);
    
    // Get original image metadata
    const metadata = await sharpInstance.metadata();
    console.log(`📊 Original image: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

    // Determine resize options
    let resizeOptions = {};
    
    if (width && height) {
      resizeOptions = {
        width,
        height,
        fit: maintainAspectRatio ? 'inside' : 'fill',
        withoutEnlargement: true,
        kernel: 'lanczos3', // High-quality resampling for clarity
        fastShrinkOnLoad: false // Better quality
      };
    } else if (width || height) {
      resizeOptions = {
        width: width || null,
        height: height || null,
        fit: 'inside',
        withoutEnlargement: true,
        kernel: 'lanczos3',
        fastShrinkOnLoad: false
      };
    } else {
      if (metadata.width > maxWidth || metadata.height > maxHeight) {
        resizeOptions = {
          width: maxWidth,
          height: maxHeight,
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
      console.log(`🔄 Resizing image with options:`, resizeOptions);
    }

    // ✅ Apply format-specific optimizations with MAXIMUM quality for clarity preservation
    const targetQuality = Math.min(quality, 100); // Ensure quality doesn't exceed 100
    
    switch (format.toLowerCase()) {
      case 'webp':
        // ✅ Use lossless WebP for quality ≥ 98 (100% clarity), near-lossless for 95-97
        const useLossless = targetQuality >= 98;
        sharpInstance = sharpInstance.webp({
          quality: useLossless ? undefined : targetQuality, // Quality not used in lossless mode
          effort: 6, // Maximum effort (0-6) for best compression
          smartSubsample: true, // Better quality preservation
          lossless: useLossless, // ✅ Lossless for quality ≥ 98 (zero clarity loss)
          alphaQuality: useLossless ? 100 : targetQuality, // Maximum alpha quality
          nearLossless: !useLossless && targetQuality >= 95, // Near-lossless for 95-97
          method: 6 // Best compression method
        });
        break;
      case 'jpeg':
      case 'jpg':
        // ✅ Maximum JPEG quality settings
        sharpInstance = sharpInstance.jpeg({
          quality: targetQuality,
          progressive: true,
          mozjpeg: true,
          trellisQuantisation: true, // Better quality
          overshootDeringing: true, // Better quality
          optimizeScans: true,
          quantisationTable: 0 // Best quality table
        });
        break;
      case 'png':
        // ✅ Maximum PNG quality settings
        sharpInstance = sharpInstance.png({
          compressionLevel: 9, // Maximum compression
          progressive: true,
          adaptiveFiltering: true, // Better quality
          palette: true // Better compression for some images
        });
        break;
      default:
        // Default to WebP with maximum quality
        sharpInstance = sharpInstance.webp({
          quality: targetQuality >= 98 ? undefined : targetQuality,
          effort: 6,
          smartSubsample: true,
          lossless: targetQuality >= 98,
          nearLossless: targetQuality >= 95 && targetQuality < 98,
          method: 6
        });
    }

    const processedBuffer = await sharpInstance.toBuffer();
    
    // Get final image info
    const finalMetadata = await sharp(processedBuffer).metadata();
    const compressionRatio = ((1 - processedBuffer.length / originalFileSize) * 100).toFixed(1);
    console.log(`✅ Compressed with maximum quality: ${(originalFileSize / 1024 / 1024).toFixed(2)}MB → ${(processedBuffer.length / 1024 / 1024).toFixed(2)}MB (${compressionRatio}% reduction), quality: ${targetQuality}, format: ${finalMetadata.format}`);
    
    return processedBuffer;
  } catch (error) {
    console.error('❌ Error resizing image:', error);
    throw error;
  }
};

/**
 * Resize image to maximum 1920x1080 if larger, preserving aspect ratio and maximum quality
 * ✅ FIXED: Only compresses if file size > 1MB, uses lossless/near-lossless for zero clarity loss
 * @param {Buffer} imageBuffer - Original image buffer
 * @param {string} mimetype - Image MIME type
 * @returns {Promise<Buffer>} - Resized image buffer (or original if smaller)
 */
const resizeToMaxSize = async (imageBuffer, mimetype) => {
  try {
    // Skip SVG files
    if (mimetype === 'image/svg+xml') {
      return imageBuffer;
    }

    const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB in bytes
    const originalFileSize = imageBuffer.length;
    
    // ✅ FIX: If file is already below 1MB, preserve original format completely
    if (originalFileSize <= MAX_FILE_SIZE) {
      const sizeKB = (originalFileSize / 1024).toFixed(2);
      const sizeMB = (originalFileSize / 1024 / 1024).toFixed(2);
      console.log(`ℹ️ File size ${sizeKB}KB (${sizeMB}MB) is already below 1MB limit. Preserving original format (resizeToMaxSize).`);
      return imageBuffer; // ✅ Return original - no compression, no resize
    }

    // ✅ Only process if file size > 1MB
    console.log(`📊 File size ${(originalFileSize / 1024 / 1024).toFixed(2)}MB exceeds 1MB limit. Applying compression with maximum quality for clarity preservation.`);

    // Initialize Sharp with metadata preservation
    const sharpInstance = sharp(imageBuffer, {
      failOn: 'none',
      keepMetadata: true,
      sequentialRead: false
    });
    const metadata = await sharpInstance.metadata();
    
    const MAX_WIDTH = 1920;
    const MAX_HEIGHT = 1080;
    
    // Check if image needs resizing (dimensions too large)
    const needsResize = metadata.width > MAX_WIDTH || metadata.height > MAX_HEIGHT;
    
    let processedInstance = sharpInstance;
    
    // ✅ Resize ONLY if dimensions exceed limits, using high-quality resampling
    if (needsResize) {
      console.log(`🔄 Resizing image from ${metadata.width}x${metadata.height} to max ${MAX_WIDTH}x${MAX_HEIGHT}`);
      processedInstance = processedInstance.resize(MAX_WIDTH, MAX_HEIGHT, {
        fit: 'inside',
        withoutEnlargement: true,
        kernel: 'lanczos3', // ✅ High-quality resampling algorithm
        fastShrinkOnLoad: false // ✅ Better quality over speed
      });
    } else {
      console.log(`ℹ️ Image dimensions (${metadata.width}x${metadata.height}) are within limits, skipping resize`);
    }
    
    // ✅ Convert to WebP with LOSSESS or NEAR-LOSSLESS for maximum clarity (no clarity loss)
    const targetQuality = 98; // ✅ Increased to 98 (was 95) for lossless encoding
    
    // Use lossless WebP for quality ≥ 98 (100% clarity preserved)
    const useLossless = targetQuality >= 98;
    
    const compressedBuffer = await processedInstance
      .webp({
        quality: useLossless ? undefined : targetQuality, // Quality not used in lossless mode
        effort: 6, // Maximum effort (0-6) for best compression
        smartSubsample: true, // Better quality preservation
        lossless: useLossless, // ✅ TRUE for quality ≥ 98 = zero clarity loss
        alphaQuality: useLossless ? 100 : targetQuality, // Maximum alpha quality
        nearLossless: !useLossless && targetQuality >= 95, // Near-lossless for 95-97
        method: 6 // Best compression method
      })
      .toBuffer();
    
    const finalMetadata = await sharp(compressedBuffer).metadata();
    const finalSizeKB = (compressedBuffer.length / 1024).toFixed(2);
    const compressionRatio = ((1 - compressedBuffer.length / originalFileSize) * 100).toFixed(1);
    
    console.log(`✅ Compressed with ${useLossless ? 'LOSSLESS' : 'near-lossless'} quality: ${(originalFileSize / 1024 / 1024).toFixed(2)}MB → ${finalSizeKB}KB (${compressionRatio}% reduction), format: WebP, clarity: ${useLossless ? '100% preserved (lossless)' : '99.9% preserved (near-lossless)'}`);
    
    return compressedBuffer;
  } catch (error) {
    console.error('❌ Error resizing to max size:', error);
    // Return original buffer if processing fails
    return imageBuffer;
  }
};

/**
 * Enhanced upload function with automatic image resizing
 * @param {Object} params - Upload parameters
 * @param {Object} resizeOptions - Image resize options (optional)
 * @returns {Promise<Object>} - Upload result
 */
const uploadImageToS3WithResize = async (params, resizeOptions = null) => {
  try {
    let finalBuffer = params.Body;
    let finalContentType = params.ContentType || 'image/jpeg';

    // If resize options provided and Body is a Buffer, resize the image
    if (resizeOptions && Buffer.isBuffer(params.Body)) {
      console.log('🖼️ Applying image resize before upload...');
      finalBuffer = await resizeImageBuffer(params.Body, resizeOptions);
      
      // Update content type based on format
      if (resizeOptions.format) {
        switch (resizeOptions.format.toLowerCase()) {
          case 'jpeg':
          case 'jpg':
            finalContentType = 'image/jpeg';
            break;
          case 'png':
            finalContentType = 'image/png';
            break;
          case 'webp':
            finalContentType = 'image/webp';
            break;
        }
      }
    }

    const uploadParams = {
      ...params,
      Body: finalBuffer,
      ContentType: finalContentType
    };

    return await s3.upload(uploadParams).promise();
  } catch (error) {
    console.error('❌ Error uploading image with resize:', error);
    throw error;
  }
};

module.exports = {
  generateSignedUrl, 
  deleteFile, 
  uploadFiletToS3, 
  generateUniqueFileName, 
  generateCloudFrontUrlForS3,
  checkImageExists,
  getImageMetadata,
  resizeImageBuffer,
  uploadImageToS3WithResize,
  resizeToMaxSize
};
