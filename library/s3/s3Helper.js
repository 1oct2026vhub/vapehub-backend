// s3Helper.js
const s3 = require('../../config/awsConfig');
const crypto = require('crypto');
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

module.exports = {
  generateSignedUrl, 
  deleteFile, 
  uploadFiletToS3, 
  generateUniqueFileName, 
  generateCloudFrontUrlForS3,
  checkImageExists,
  getImageMetadata
};
