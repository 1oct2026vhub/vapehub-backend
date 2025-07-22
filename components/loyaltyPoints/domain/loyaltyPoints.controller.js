const { errorResponse, successResponse } = require('../../../utils/responseUtils');
const { LoyaltyPointsSettings, User, LoyaltyPointsHistory } = require('../../../models');
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
            console.log("settings>>>>",settings.minimum_points_redemption);
            console.log("user.loyalty_points>>>>",user.loyalty_points);
            const canRedeem = user.loyalty_points >= settings.minimum_points_redemption;
            console.log("canRedeem>>>>",canRedeem);
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

            const response = {
                user_points: user.loyalty_points || 0,
                minimum_points_required: settings.minimum_points_redemption,
                can_redeem: canRedeem,
                points_needed: pointsNeeded,
                redemption_amount: redemptionAmount,
                redemption_type: redemptionType,
                points_value: settings.points_value,
                min_amount_for_loyalty_points: settings.min_amount_for_loyalty_points,
                // total_points_value: (user.loyalty_points || 0) * settings.points_value
            };

            return successResponse(res, response, 'Redemption information retrieved successfully');
        } catch (error) {
            logger.error('Error getting user redemption info:', error);
            return errorResponse(res, error, 'Failed to retrieve redemption information');
        }
    },

}; 