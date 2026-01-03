// s3Helper.js
const s3 = require('../../config/awsConfig');
const crypto = require('crypto');
const sharp = require('sharp');
const path = require('path');
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
 * Sanitize filename to prevent security issues while preserving original name
 * Only removes truly dangerous characters, preserves spaces, parentheses, etc.
 * @param {string} originalName - Original filename from frontend
 * @returns {string} - Sanitized filename
 */
const sanitizeFileName = (originalName) => {
  // Remove path components to prevent directory traversal
  const basename = path.basename(originalName);
  
  // Only replace truly dangerous characters for security
  // Preserve: spaces, parentheses, most special characters
  let sanitized = basename
    .replace(/[<>:"|?*\x00-\x1f]/g, '_') // Only dangerous chars: < > : " | ? * and control chars
    .replace(/\.\./g, '_') // Prevent path traversal (..)
    .replace(/^\.+|\.+$/g, '') // Remove leading/trailing dots only
    .trim(); // Remove leading/trailing whitespace
  
  // Ensure it's not empty
  if (!sanitized || sanitized.length === 0) {
    sanitized = `image_${Date.now()}`;
  }
  
  // Ensure it has an extension
  if (!path.extname(sanitized)) {
    const originalExt = path.extname(originalName) || '.jpg';
    sanitized += originalExt;
  }
  
  return sanitized;
};

/**
 * Get unique filename preserving original name, adding suffix prefix if file exists
 * @param {string} originalName - Original filename from frontend
 * @param {string} folder - S3 folder path (e.g., 'products', 'categories')
 * @param {string} subFolder - Optional subfolder (e.g., product_id)
 * @returns {Promise<string>} - Unique filename that doesn't exist in S3
 */
const getUniqueFileNameWithPrefix = async (originalName, folder, subFolder = null) => {
  // Sanitize the original filename
  const sanitized = sanitizeFileName(originalName);
  
  // Build base S3 key
  const basePath = subFolder ? `${folder}/${subFolder}` : folder;
  let s3Key = `${basePath}/${sanitized}`;
  
  // Check if file exists
  let exists = await checkImageExists(s3Key);
  
  // If file doesn't exist, return the original sanitized filename
  if (!exists) {
    return sanitized;
  }
  
  // If file exists, add suffix prefix after filename (before extension)
  const ext = path.extname(sanitized);
  const nameWithoutExt = path.basename(sanitized, ext);
  let counter = 1;
  let finalFileName;
  
  // Keep trying until we find a unique filename
  do {
    // Add prefix AFTER the filename: my-product_1.jpg, my-product_2.jpg
    finalFileName = `${nameWithoutExt}_${counter}${ext}`;
    s3Key = `${basePath}/${finalFileName}`;
    exists = await checkImageExists(s3Key);
    counter++;
    
    // Safety limit to prevent infinite loop
    if (counter > 1000) {
      // Fallback to timestamp if too many collisions
      const timestamp = Date.now();
      finalFileName = `${nameWithoutExt}_${timestamp}${ext}`;
      break;
    }
  } while (exists);
  
  return finalFileName;
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
 * Check image buffer size (1MB limit check only)
 * No resizing or format conversion - images are saved as-is
 * @param {Buffer} imageBuffer - Original image buffer
 * @param {Object} options - Options (kept for backward compatibility)
 * @returns {Promise<Buffer>} - Original image buffer (unchanged)
 */
const resizeImageBuffer = async (imageBuffer, options = {}) => {
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
    console.error('❌ Error checking image:', error);
    throw error;
  }
};

/**
 * Check image size (1MB limit check only)
 * No resizing or format conversion - images are saved as-is
 * @param {Buffer} imageBuffer - Original image buffer
 * @param {string} mimetype - Image MIME type
 * @returns {Promise<Buffer>} - Original image buffer (unchanged)
 */
const resizeToMaxSize = async (imageBuffer, mimetype) => {
  try {
    // Skip SVG files
    if (mimetype === 'image/svg+xml') {
      return imageBuffer;
    }

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
    console.error('❌ Error checking image size:', error);
    return imageBuffer;
  }
};

/**
 * Upload function with 1MB size check only (no resizing or format conversion)
 * @param {Object} params - Upload parameters
 * @param {Object} resizeOptions - Options (kept for backward compatibility, not used)
 * @returns {Promise<Object>} - Upload result
 */
const uploadImageToS3WithResize = async (params, resizeOptions = null) => {
  try {
    // ✅ Only check size if resizeOptions provided and Body is a Buffer
    if (resizeOptions && Buffer.isBuffer(params.Body)) {
      const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
      const fileSize = params.Body.length;
      
      if (fileSize > MAX_FILE_SIZE) {
        const sizeMB = (fileSize / 1024 / 1024).toFixed(2);
        console.log(`⚠️ File size ${sizeMB}MB exceeds 1MB limit. Uploading as-is.`);
      }
    }

    // ✅ Upload original image as-is - preserve original ContentType
    return await s3.upload(params).promise();
  } catch (error) {
    console.error('❌ Error uploading image:', error);
    throw error;
  }
};

module.exports = {
  generateSignedUrl, 
  deleteFile, 
  uploadFiletToS3, 
  generateUniqueFileName, 
  sanitizeFileName,
  getUniqueFileNameWithPrefix,
  generateCloudFrontUrlForS3,
  checkImageExists,
  getImageMetadata,
  resizeImageBuffer,
  uploadImageToS3WithResize,
  resizeToMaxSize
};
