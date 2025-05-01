const axios = require('axios');
const logger = require('../../../library/logger');
const reviewHelper = require('../helper/review.helper');

const apiKey = process.env.TRUSTPILOT_API_KEY;
const apiSecret = process.env.TRUSTPILOT_API_SECRET;
const businessUnitId = process.env.TRUSTPILOT_BUSINESS_UNIT_ID;
const baseUrl = 'https://invitations-api.trustpilot.com/v1/private/business-units';
const authUrl = 'https://api.trustpilot.com/v1/oauth/oauth-business-users-for-applications/accesstoken';


// call from order model when order status is delivered or completed
async function sendInvitation(order, user) {
    try {
        // Get access token first
        const accessToken = await reviewHelper.getAccessToken();
        // Get the default template ID
        const templateId = await reviewHelper.getDefaultTemplateId(accessToken);

        const invitationData = {
            recipientEmail: user.email,
            recipientName: `${user.first_name} ${user.last_name}`,
            referenceId: order.order_unique_id,
            locale: 'en-US',
            tags: ['order', order.status],
            preferredSendTime: new Date().toISOString(),
            templateId: templateId,
            redirectUri: `${process.env.FRONTEND_URL}/order/${order.order_unique_id}`,
            consumer: {
                email: user.email,
                name: `${user.first_name} ${user.last_name}`
            },
            productData: {
                sku: order.order_unique_id,
                name: `Order #${order.order_unique_id} (${order.status})`,
                brand: process.env.BRAND_NAME,
                category: 'E-commerce',
                price: order.total,
                ...(order.productDetails && {
                    items: order.productDetails.map(item => ({
                        name: item.name,
                        price: item.price,
                        quantity: item.quantity
                    }))
                })
            }
        };
        console.log("invitationData>>>>", invitationData);
        const response = await axios.post(
            `${baseUrl}/${businessUnitId}/email-invitations`,
            invitationData,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
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
        const accessToken = await reviewHelper.getAccessToken();

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

module.exports = {
    sendInvitation,
    getInvitationStatus
}; 