const AWS = require('aws-sdk');

// Initialize CloudFront client
const cloudfront = new AWS.CloudFront({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1' // CloudFront API is only available in us-east-1
});

/**
 * Create a CloudFront distribution for an S3 bucket
 * @param {string} bucketName - S3 bucket name
 * @param {string} distributionName - Name for the distribution
 * @returns {Promise<Object>} - Distribution details
 */
const createCloudFrontDistribution = async (bucketName, distributionName = 'S3-Image-Delivery') => {
  try {
    const params = {
      DistributionConfig: {
        CallerReference: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        Comment: `CloudFront distribution for ${bucketName} - ${distributionName}`,
        DefaultCacheBehavior: {
          TargetOriginId: `S3-${bucketName}`,
          ViewerProtocolPolicy: 'redirect-to-https',
          AllowedMethods: {
            Quantity: 2,
            Items: ['GET', 'HEAD'],
            CachedMethods: {
              Quantity: 2,
              Items: ['GET', 'HEAD']
            }
          },
          ForwardedValues: {
            QueryString: false,
            Cookies: {
              Forward: 'none'
            }
          },
          MinTTL: 0,
          DefaultTTL: 86400, // 24 hours
          MaxTTL: 31536000, // 1 year
          Compress: true
        },
        Enabled: true,
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: `S3-${bucketName}`,
              DomainName: `${bucketName}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com`,
              S3OriginConfig: {
                OriginAccessIdentity: '' // Empty for S3 bucket access
              }
            }
          ]
        },
        PriceClass: 'PriceClass_100', // Use only North America and Europe
        HttpVersion: 'http2'
      }
    };

    const result = await cloudfront.createDistribution(params).promise();
    console.log('✅ CloudFront distribution created successfully');
    console.log(`   Distribution ID: ${result.Distribution.Id}`);
    console.log(`   Domain Name: ${result.Distribution.DomainName}`);
    
    return result.Distribution;
  } catch (error) {
    console.error('❌ Error creating CloudFront distribution:', error);
    throw error;
  }
};

/**
 * Get CloudFront distribution details
 * @param {string} distributionId - CloudFront distribution ID
 * @returns {Promise<Object>} - Distribution details
 */
const getCloudFrontDistribution = async (distributionId) => {
  try {
    const result = await cloudfront.getDistribution({ Id: distributionId }).promise();
    return result.Distribution;
  } catch (error) {
    console.error('❌ Error listing CloudFront distributions:', error);
    throw error;
  }
};

/**
 * List all CloudFront distributions
 * @returns {Promise<Array>} - List of distributions
 */
const listCloudFrontDistributions = async () => {
  try {
    const result = await cloudfront.listDistributions().promise();
    return result.DistributionList.Items || [];
  } catch (error) {
    console.error('❌ Error listing CloudFront distributions:', error);
    throw error;
  }
};

/**
 * Generate CloudFront URL for an S3 object
 * @param {string} cloudFrontDomain - CloudFront domain name
 * @param {string} s3Key - S3 object key
 * @returns {string} - CloudFront URL
 */
const generateCloudFrontUrl = (cloudFrontDomain, s3Key) => {
  // Remove protocol if present
  const domain = cloudFrontDomain.replace(/^https?:\/\//, '');
  return `https://${domain}/${s3Key}`;
};

/**
 * Check if CloudFront distribution is deployed
 * @param {string} distributionId - CloudFront distribution ID
 * @returns {Promise<boolean>} - True if deployed
 */
const isCloudFrontDeployed = async (distributionId) => {
  try {
    const distribution = await getCloudFrontDistribution(distributionId);
    return distribution.Status === 'Deployed';
  } catch (error) {
    return false;
  }
};

module.exports = {
  createCloudFrontDistribution,
  getCloudFrontDistribution,
  listCloudFrontDistributions,
  generateCloudFrontUrl,
  isCloudFrontDeployed
};
