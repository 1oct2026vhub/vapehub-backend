// s3Helper.js
const s3 = require('../../config/awsConfig');
const crypto = require('crypto');

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
      Bucket: process.env.AWS_BUCKET,
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
    Bucket: process.env.AWS_BUCKET,
    Key: key
  };

  try {
    // Delete the file from S3
    await s3.deleteObject(params).promise();
  } catch (error) {
    console.error('Error deleting file:', error);
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

module.exports = {
  generateSignedUrl, deleteFile, uploadFiletToS3, generateUniqueFileName
};
