const axios = require('axios');
const logger = require('../../../library/logger');
const { uploadFiletToS3, generateUniqueFileName } = require("../../../library/s3/s3Helper");
const apiKey = process.env.TRUSTPILOT_API_KEY;
const apiSecret = process.env.TRUSTPILOT_API_SECRET;
const domainName = process.env.DOMAIN_NAME;
const baseUrl = 'https://invitations-api.trustpilot.com/v1/private/business-units';
const authUrl = 'https://api.trustpilot.com/v1/oauth/oauth-business-users-for-applications/accesstoken';

// Helper function to find business unit ID
async function findBusinessUnitId(accessToken) {
    try {
        const response = await axios.get(
            'https://api.trustpilot.com/v1/business-units/find',
            {
                params: {
                    name: "vapehub.co.uk"   //"vapehub.devateam.com" //"vapehub.co.uk"  //domainName
                },
                headers: {
                    'apikey': apiKey,
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );
        if (response.data) {
            return response.data.id;
        }
        throw new Error('No business unit found for the specified domain');
    } catch (error) {
        logger.error('Error finding business unit:', error);
        throw error;
    }
}

async function getTrustpilotReviewData(accessToken) {
    try {
        const response = await axios.get(
            'https://api.trustpilot.com/v1/business-units/find',
            {
                params: {
                    name: "vapehub.co.uk"   //"vapehub.devateam.com" //"vapehub.co.uk"  //domainName
                },
                headers: {
                    'apikey': apiKey,
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );
        if (response.data) {
            return response.data;
        }
        throw new Error('No business unit found for the specified domain');
    } catch (error) {
        logger.error('Error finding business unit:', error);
        throw error;
    }
}

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
            // {
            //     grant_type: 'client_credentials',
            //     client_id: apiKey,
            //     client_secret: apiSecret
            // },
            'grant_type=client_credentials',
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

// call from order model when order status is delivere.d or completed
async function sendInvitation(order, user) {
    try {
        
        // Get access token first
        const accessToken = await getAccessToken();
        
        // Get business unit ID
        const businessUnitId = await findBusinessUnitId(accessToken);
        // Get the default template ID
        const templateId = await getDefaultTemplateId(accessToken);
        const invitationData = {
            replyTo: process.env.TRUSTPILOT_REPLYTO_EMAIL, // "mahesh@ateamsoftsolutions.com",//process.env.REPLY_TO_EMAIL || "support@vapehub.co.uk",
            locale: 'en-US',
            senderName: "vapehub.co.uk",// process.env.BRAND_NAME,
            senderEmail: process.env.TRUSTPILOT_SENDER_EMAIL, // "noreply.invitations@trustpilotmail.com",   //process.env.SENDER_EMAIL || "support@vapehub.co.uk",
            source: "InvitationApi",
            locationId: order.order_unique_id,
            referenceNumber: order.order_unique_id,
            consumerName: `${user.first_name} ${user.last_name}`,
            consumerEmail: user.email,
            phoneNumber: user.phone || "",
            type: "email",
            serviceReviewInvitation: {
                templateId: templateId,
                preferredSendTime: new Date().toISOString(),
                redirectUri: `${process.env.FRONTEND_URL}/order-details/${order.id}`,
                tags: ['order', order.status]
            },
            productReviewInvitation: {
                templateId: templateId,
                preferredSendTime: new Date().toISOString(),
                redirectUri: `${process.env.FRONTEND_URL}/order-details/${order.id}`,
                products: order.orderItems ? order.orderItems.map(item => {
                
                    // Find primary product image
                    const primaryProductImage = item.product?.ProductImages?.find(img => img.is_primary)?.image_url;
                    // Find primary variant image
                    const primaryVariantImage = item.variant?.variantImages?.find(img => img.is_primary)?.image_url;
                   
                    return {
                        sku: item.product.slug || item.product_id,
                        name: item.product.name,
                        brand: process.env.BRAND_NAME,
                        imageUrl: primaryVariantImage || primaryProductImage || "",
                        productUrl: `${process.env.FRONTEND_URL}/${item.product.slug}`,
                        price: item.price
                    };
                }) : [],
                // productSkus: order.productDetails ? order.productDetails.map(item => item.sku || item.product_id) : []
            }
        };
        
        const response = await axios.post(
            `${baseUrl}/${businessUnitId}/email-invitations`,
            invitationData,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'x-business-user-id': "6825c01dd14b519ec782a3f3"
                }
            }
        );
        
        logger.info(`Review invitation sent for order ${order.order_unique_id} with status ${order.status}`);
        return response.data;
    } catch (error) {
        logger.error('Error sending review invitation:', error);
        throw error;
    }
}

async function getInvitationStatus(invitationId) {
    try {
        const accessToken = await getAccessToken();
        const businessUnitId = await findBusinessUnitId(accessToken);

        const response = await axios.get(
            `${baseUrl}/${businessUnitId}/invitations/${invitationId}`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );
        return response.data;
    } catch (error) {
        logger.error('Error getting review invitation status:', error);
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
        const businessUnitId = await findBusinessUnitId(accessToken);
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
        const defaultTemplate = templates.templates.find(template => 
            template.type === 'ServiceReview' && 
            template.isDefaultTemplate === true
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
    handleMediaUpload,
    sendInvitation,
    getInvitationStatus,
    findBusinessUnitId,
    getTrustpilotReviewData
};
