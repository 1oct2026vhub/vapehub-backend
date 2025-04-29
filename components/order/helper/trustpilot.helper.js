const axios = require('axios');
const logger = require('../../../library/logger');

const apiKey = process.env.TRUSTPILOT_API_KEY;
const businessUnitId = process.env.TRUSTPILOT_BUSINESS_UNIT_ID;
const baseUrl = 'https://invitations-api.trustpilot.com/v1/private/business-units';

async function sendInvitation(order, user) {
    try {
        const invitationData = {
            recipientEmail: user.email,
            recipientName: `${user.first_name} ${user.last_name}`,
            referenceId: order.order_unique_id,
            locale: 'en-US',
            tags: ['order', order.status],
            preferredSendTime: new Date().toISOString(),
            templateId: process.env.TRUSTPILOT_TEMPLATE_ID,
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

        const response = await axios.post(
            `${baseUrl}/${businessUnitId}/invitations`,
            invitationData,
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        logger.info(`Trustpilot invitation sent for order ${order.order_unique_id} with status ${order.status}`);
        return response.data;
    } catch (error) {
        logger.error('Error sending Trustpilot invitation:', error);
        throw error;
    }
}

async function getInvitationStatus(invitationId) {
    try {
        const response = await axios.get(
            `${baseUrl}/${businessUnitId}/invitations/${invitationId}`,
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            }
        );
        return response.data;
    } catch (error) {
        logger.error('Error getting Trustpilot invitation status:', error);
        throw error;
    }
}

module.exports = {
    sendInvitation,
    getInvitationStatus
}; 