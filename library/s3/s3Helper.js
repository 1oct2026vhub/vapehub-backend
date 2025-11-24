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
 * Resize image buffer while maintaining high quality
 * @param {Buffer} imageBuffer - Original image buffer
 * @param {Object} options - Resize options
 * @param {number} [options.width] - Target width (optional)
 * @param {number} [options.height] - Target height (optional) 
 * @param {number} [options.maxWidth=1920] - Maximum width
 * @param {number} [options.maxHeight=1080] - Maximum height
 * @param {number} [options.quality=90] - JPEG quality (1-100)
 * @param {string} [options.format='jpeg'] - Output format (jpeg, png, webp)
 * @param {boolean} [options.maintainAspectRatio=true] - Maintain aspect ratio
 * @returns {Promise<Buffer>} - Resized image buffer
 */
const resizeImageBuffer = async (imageBuffer, options = {}) => {
  try {
    const {
      width,
      height,
      maxWidth = 1920,
      maxHeight = 1080,
      quality = 90,
      format = 'jpeg',
      maintainAspectRatio = true
    } = options;

    let sharpInstance = sharp(imageBuffer);
    
    // Get original image metadata
    const metadata = await sharpInstance.metadata();
    console.log(`📊 Original image: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

    // Determine resize options
    let resizeOptions = {};
    
    if (width && height) {
      // Specific dimensions provided
      resizeOptions = {
        width,
        height,
        fit: maintainAspectRatio ? 'inside' : 'fill',
        withoutEnlargement: true
      };
    } else if (width || height) {
      // Only one dimension provided
      resizeOptions = {
        width: width || null,
        height: height || null,
        fit: 'inside',
        withoutEnlargement: true
      };
    } else {
      // Use max dimensions as constraints
      if (metadata.width > maxWidth || metadata.height > maxHeight) {
        resizeOptions = {
          width: maxWidth,
          height: maxHeight,
          fit: 'inside',
          withoutEnlargement: true
        };
      }
    }

    // Apply resize if needed
    if (Object.keys(resizeOptions).length > 0) {
      sharpInstance = sharpInstance.resize(resizeOptions);
      console.log(`🔄 Resizing image with options:`, resizeOptions);
    }

    // Apply format-specific optimizations
    switch (format.toLowerCase()) {
      case 'jpeg':
      case 'jpg':
        sharpInstance = sharpInstance
          .jpeg({ 
            quality, 
            progressive: true,
            optimiseScans: true,
            mozjpeg: true
          });
        break;
      case 'png':
        sharpInstance = sharpInstance
          .png({ 
            quality,
            progressive: true,
            compressionLevel: 9,
            adaptiveFiltering: true
          });
        break;
      case 'webp':
        sharpInstance = sharpInstance
          .webp({ 
            quality,
            effort: 6,
            smartSubsample: true
          });
        break;
      default:
        // Default to JPEG for unknown formats
        sharpInstance = sharpInstance.jpeg({ quality, progressive: true });
    }

    const processedBuffer = await sharpInstance.toBuffer();
    
    // Get final image info
    const finalMetadata = await sharp(processedBuffer).metadata();
    console.log(`✅ Processed image: ${finalMetadata.width}x${finalMetadata.height}, size: ${(processedBuffer.length / 1024 / 1024).toFixed(2)}MB`);
    
    return processedBuffer;
  } catch (error) {
    console.error('❌ Error resizing image:', error);
    throw error;
  }
};

/**
 * Resize image to maximum 1920x1080 if larger, preserving aspect ratio and quality
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

    // Initialize Sharp with metadata preservation
    const sharpInstance = sharp(imageBuffer, {
      failOn: 'none',
      keepMetadata: true,
      sequentialRead: false
    });
    const metadata = await sharpInstance.metadata();
    
    const MAX_WIDTH = 1920;
    const MAX_HEIGHT = 1080;
    
    // Check if image needs resizing
    if (metadata.width <= MAX_WIDTH && metadata.height <= MAX_HEIGHT) {
      console.log(`ℹ️ Image already within max size (${metadata.width}x${metadata.height}), no resize needed`);
      // Still convert to WebP with maximum quality even if no resize needed
      const webpBuffer = await sharpInstance
        .webp({
          quality: 95,  // Maximum quality - WebP 95 ≈ JPEG 99 visually
          effort: 6,
          smartSubsample: true,
          lossless: false,
          nearLossless: true,  // Near-lossless for maximum quality
          method: 6
        })
        .toBuffer();
      return webpBuffer;
    }
    
    console.log(`🔄 Resizing image from ${metadata.width}x${metadata.height} to max ${MAX_WIDTH}x${MAX_HEIGHT}`);
    
    // Convert to WebP with maximum quality
    const targetQuality = 95; // Maximum quality - WebP 95 ≈ JPEG 99 visually
    
    let resizedInstance = sharpInstance
      .resize(MAX_WIDTH, MAX_HEIGHT, {
        fit: 'inside',
        withoutEnlargement: true,
        kernel: 'lanczos3',
        fastShrinkOnLoad: false
      })
      .webp({
        quality: targetQuality,
        effort: 6,
        smartSubsample: true,
        lossless: false,
        nearLossless: true,  // Near-lossless for maximum quality
        method: 6
      });
    
    const resizedBuffer = await resizedInstance.toBuffer();
    
    const finalMetadata = await sharp(resizedBuffer).metadata();
    const sizeKB = (resizedBuffer.length / 1024).toFixed(2);
    console.log(`✅ Resized to ${finalMetadata.width}x${finalMetadata.height}, ${sizeKB}KB (WebP)`);
    
    return resizedBuffer;
  } catch (error) {
    console.error('❌ Error resizing to max size:', error);
    // Return original buffer if resize fails
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
