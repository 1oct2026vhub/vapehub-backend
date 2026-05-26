const { errorResponse, successResponse } = require('../../../utils/responseUtils');
const { LoyaltyPointsSettings, User, LoyaltyPointsHistory, MailSubscription, MailSubscriptionSettings } = require('../../../models');
const logger = require('../../../library/logger');
const loyaltyShippingPricing = require('../../order/helper/loyaltyShippingPricing.helper');

module.exports = {
    // Get user's redemption eligibility and amount
    async getUserRedemptionInfo(req, res) {
        try {
            const userId = req?.user?.id;

            if (!userId) {
                return errorResponse(res, {}, 'User authentication required', 401);
            }

            // Get user information
            const user = await User.findByPk(userId, {
                attributes: ['id', 'loyalty_points']
            });

            if (!user) {
                return errorResponse(res, {}, 'User not found', 404);
            }

            // Get active loyalty program settings
            const settings = await LoyaltyPointsSettings.findOne({
                where: { status: true }
            });

            if (!settings) {
                return errorResponse(res, {}, 'Loyalty program is not available', 404);
            }
            const redemptionInfo = loyaltyShippingPricing.buildLoyaltyRedemptionInfo(
                settings,
                user.loyalty_points || 0
            );

            // Get mail subscription data
            let mailSubscriptionData = null;
            const userWithEmail = await User.findOne({
                where: { id: userId },
                attributes: ['id', 'email']
            });
            if (userWithEmail && userWithEmail.email) {
                const mailSubscription = await MailSubscription.findOne({
                    where: {
                        email: userWithEmail.email
                    }
                });
                if (mailSubscription) {
                    const mailSettings = await MailSubscriptionSettings.findOne({
                        where: {
                            status: true
                        }
                    });
                    if (mailSettings) {
                        mailSubscriptionData = {
                            isDiscountUsed: mailSubscription.isDiscountUsed,
                            discount_amount: parseFloat(mailSettings.discount_amount),
                            discount_type: mailSettings.discount_type
                        };
                    }
                }
            }

            const response = {
                ...redemptionInfo,
                mail_subscription_data: mailSubscriptionData,
            };

            return successResponse(res, response, 'Redemption information retrieved successfully');
        } catch (error) {
            logger.error('Error getting user redemption info:', error);
            return errorResponse(res, error, 'Failed to retrieve redemption information');
        }
    },

}; 