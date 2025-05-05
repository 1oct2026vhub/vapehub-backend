const axios = require('axios');
const logger = require('../../../library/logger');
const { uploadFiletToS3, generateUniqueFileName } = require("../../../library/s3/s3Helper");
const apiKey = process.env.TRUSTPILOT_API_KEY;
const apiSecret = process.env.TRUSTPILOT_API_SECRET;
const businessUnitId = process.env.TRUSTPILOT_BUSINESS_UNIT_ID;
const baseUrl = 'https://invitations-api.trustpilot.com/v1/private/business-units';
const authUrl = 'https://api.trustpilot.com/v1/oauth/oauth-business-users-for-applications/accesstoken';

// Helper function to handle media upload to S3
const handleMediaUpload = async (file) => {
    if (!file) return null;
    try {
        const { originalname, mimetype, buffer } = file;
        const fileName = generateUniqueFileName(originalname);
        const params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: `reviews/${fileName}`,
            Body: buffer,
            ContentType: mimetype
        };
        const uploadedMedia = await uploadFiletToS3(params);
        return uploadedMedia?.Location;
    } catch (error) {
        logger.error('Error uploading media to S3:', error);
        throw new Error("Media upload failed");
    }
};

async function getAccessToken() {
    try {
        const authHeader = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
        
        const response = await axios.post(
            authUrl,
            {
                grant_type: 'client_credentials',
                client_id: apiKey,
                client_secret: apiSecret
            },
            {
                headers: {
                    'Authorization': `Basic ${authHeader}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        return response.data.access_token;
    } catch (error) {
        logger.error('Error getting Trustpilot access token:', error);
        throw error;
    }
}

/**
 * Gets the list of available invitation templates
 * @param {string} accessToken - The OAuth access token
 * @param {Array} types - Optional array of template types to filter by
 * @returns {Promise<Array>} List of templates with their IDs and names
 */
async function getInvitationTemplates(accessToken, types = ['ServiceReview']) {
    try {
        const response = await axios.get(
            `${baseUrl}/${businessUnitId}/templates`,
            {
                params: {
                    types: types.join(',')
                },
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );
        return response.data;
    } catch (error) {
        logger.error('Error getting invitation templates:', error);
        throw error;
    }
}

/**
 * Gets the default template ID for service reviews
 * @param {string} accessToken - The OAuth access token
 * @returns {Promise<string>} The template ID
 */
async function getDefaultTemplateId(accessToken) {
    try {
        const templates = await getInvitationTemplates(accessToken);
        // Find the default service review template
        const defaultTemplate = templates.find(template => 
            template.type === 'ServiceReview' && 
            template.isDefault === true
        );

        if (!defaultTemplate) {
            throw new Error('No default service review template found');
        }

        return defaultTemplate.id;
    } catch (error) {
        logger.error('Error getting default template ID:', error);
        throw error;
    }
}

module.exports = {
    getAccessToken,
    getInvitationTemplates,
    getDefaultTemplateId,
    handleMediaUpload
};
