const { LoyaltyPointsSettings } = require('../../../../models');
const logger = require('../../../../library/logger');

/**
 * Get active loyalty points settings
 * @returns {Promise<Object>} Loyalty points settings
 */
async function getActiveSettings() {
    try {
        const settings = await LoyaltyPointsSettings.findOne({
            where: { status: true }
        });

        if (!settings) {
            throw new Error('No active loyalty points settings found');
        }

        return settings;
    } catch (error) {
        logger.error('Error getting active loyalty points settings:', error);
        throw error;
    }
}

/**
 * Calculate points earned for an order
 * @param {number} orderAmount - Order amount
 * @param {Object} settings - Loyalty points settings (optional, will fetch if not provided)
 * @returns {Object} Points calculation result
 */
async function calculatePointsForOrder(orderAmount, settings = null) {
    try {
        if (!settings) {
            settings = await getActiveSettings();
        }

        let pointsEarned = 0;
        let message = '';
        let isEligible = false;

        if (orderAmount >= settings.minimum_purchase_amount) {
            // Calculate points based on order amount (1 point per £1 spent)
            pointsEarned = Math.floor(orderAmount);
            message = `You will earn ${pointsEarned} points for this order`;
            isEligible = true;
        } else {
            const remaining = settings.minimum_purchase_amount - orderAmount;
            message = `Add £${remaining.toFixed(2)} more to your order to start earning points`;
            isEligible = false;
        }

        return {
            order_amount: parseFloat(orderAmount),
            points_earned: pointsEarned,
            points_value: settings.points_value,
            minimum_purchase_amount: settings.minimum_purchase_amount,
            message: message,
            is_eligible: isEligible
        };
    } catch (error) {
        logger.error('Error calculating points for order:', error);
        throw error;
    }
}

/**
 * Calculate discount amount for points redemption
 * @param {number} pointsToRedeem - Points to redeem
 * @param {Object} settings - Loyalty points settings (optional, will fetch if not provided)
 * @returns {Object} Redemption calculation result
 */
async function calculatePointsRedemption(pointsToRedeem, settings = null) {
    try {
        if (!settings) {
            settings = await getActiveSettings();
        }

        // Validate minimum redemption
        if (pointsToRedeem < settings.minimum_points_redemption) {
            throw new Error(`Minimum ${settings.minimum_points_redemption} points required for redemption`);
        }

        // Calculate discount amount based on loyalty amount type
        let discountAmount = 0;
        
        if (settings.loyalty_amount_type === 'percentage') {
            // For percentage, calculate based on points value
            discountAmount = pointsToRedeem * settings.points_value;
        } else {
            // For fixed amount, use the loyalty amount directly
            discountAmount = settings.loyalty_amount;
        }

        return {
            points_redeemed: pointsToRedeem,
            discount_amount: parseFloat(discountAmount.toFixed(2)),
            points_value: settings.points_value,
            loyalty_amount: settings.loyalty_amount,
            loyalty_amount_type: settings.loyalty_amount_type,
            minimum_points_redemption: settings.minimum_points_redemption
        };
    } catch (error) {
        logger.error('Error calculating points redemption:', error);
        throw error;
    }
}

/**
 * Validate points redemption for an order
 * @param {number} pointsToRedeem - Points to redeem
 * @param {number} orderAmount - Order amount
 * @param {Object} settings - Loyalty points settings (optional, will fetch if not provided)
 * @returns {Object} Validation result
 */
async function validatePointsRedemption(pointsToRedeem, orderAmount, settings = null) {
    try {
        if (!settings) {
            settings = await getActiveSettings();
        }

        const validation = {
            is_valid: true,
            errors: [],
            warnings: []
        };

        // Check minimum redemption
        if (pointsToRedeem < settings.minimum_points_redemption) {
            validation.is_valid = false;
            validation.errors.push(`Minimum ${settings.minimum_points_redemption} points required for redemption`);
        }

        // Calculate discount amount based on loyalty amount type
        let discountAmount = 0;
        
        if (settings.loyalty_amount_type === 'percentage') {
            // For percentage, calculate based on points value
            discountAmount = pointsToRedeem * settings.points_value;
        } else {
            // For fixed amount, use the loyalty amount directly
            discountAmount = settings.loyalty_amount;
        }

        // Check if discount exceeds order amount
        if (discountAmount > orderAmount) {
            validation.is_valid = false;
            validation.errors.push('Points redemption amount cannot exceed order total');
        }

        // Warning if discount is more than 50% of order
        if (discountAmount > orderAmount * 0.5) {
            validation.warnings.push('Points redemption is more than 50% of order total');
        }

        return {
            ...validation,
            points_redeemed: pointsToRedeem,
            discount_amount: parseFloat(discountAmount.toFixed(2)),
            order_amount: orderAmount
        };
    } catch (error) {
        logger.error('Error validating points redemption:', error);
        throw error;
    }
}

/**
 * Get loyalty program summary
 * @param {Object} settings - Loyalty points settings (optional, will fetch if not provided)
 * @returns {Object} Program summary
 */
async function getProgramSummary(settings = null) {
    try {
        if (!settings) {
            settings = await getActiveSettings();
        }

        return {
            program_name: settings.program_name,
            points_value: settings.points_value,
            loyalty_amount: settings.loyalty_amount,
            loyalty_amount_type: settings.loyalty_amount_type,
            minimum_points_redemption: settings.minimum_points_redemption,
            minimum_purchase_amount: settings.minimum_purchase_amount,
            status: settings.status
        };
    } catch (error) {
        logger.error('Error getting program summary:', error);
        throw error;
    }
}

/**
 * Check if loyalty program is active
 * @returns {Promise<boolean>} Whether the program is active
 */
async function isProgramActive() {
    try {
        const settings = await LoyaltyPointsSettings.findOne({
            where: { status: true }
        });
        return !!settings;
    } catch (error) {
        logger.error('Error checking if loyalty program is active:', error);
        return false;
    }
}

module.exports = {
    getActiveSettings,
    calculatePointsForOrder,
    calculatePointsRedemption,
    validatePointsRedemption,
    getProgramSummary,
    isProgramActive
}; 