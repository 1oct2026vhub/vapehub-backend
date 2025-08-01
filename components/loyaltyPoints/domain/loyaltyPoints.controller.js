const { errorResponse, successResponse } = require('../../../utils/responseUtils');
const { LoyaltyPointsSettings, User, LoyaltyPointsHistory, MailSubscription, MailSubscriptionSettings } = require('../../../models');
const logger = require('../../../library/logger');

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
            const canRedeem = user.loyalty_points >= settings.minimum_points_redemption;
            const pointsNeeded = Math.max(0, settings.minimum_points_redemption - user.loyalty_points);

            let redemptionAmount = 0;
            let redemptionType = 'none';

            // if (canRedeem) {
                if (settings.loyalty_amount_type === 'percentage') {
                    redemptionAmount = settings.loyalty_amount;
                    redemptionType = 'percentage';
                } else {
                    redemptionAmount = settings.loyalty_amount;
                    redemptionType = 'fixed';
                }
            // }

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
                user_points: user.loyalty_points || 0,
                minimum_points_required: settings.minimum_points_redemption,
                can_redeem: canRedeem,
                points_needed: pointsNeeded,
                redemption_amount: redemptionAmount,
                redemption_type: redemptionType,
                points_value: settings.points_value,
                min_amount_for_loyalty_points: settings.min_amount_for_loyalty_points,
                mail_subscription_data: mailSubscriptionData,
                // total_points_value: (user.loyalty_points || 0) * settings.points_value
            };

            return successResponse(res, response, 'Redemption information retrieved successfully');
        } catch (error) {
            logger.error('Error getting user redemption info:', error);
            return errorResponse(res, error, 'Failed to retrieve redemption information');
        }
    },

}; 