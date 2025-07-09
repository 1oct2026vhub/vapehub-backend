const { errorResponse, successResponse } = require('../../../../utils/responseUtils');
const { MailSubscriptionSettings } = require('../../../../models');
const logger = require('../../../../library/logger');

module.exports = {
    // List all mail subscription settings with pagination
    async listMailSubscriptionSettings(req, res) {
        try {
            const { page = 1, limit = 10 } = req.query;
            const offset = (page - 1) * limit;

            const { count, rows: settings } = await MailSubscriptionSettings.findAndCountAll({
                order: [['createdAt', 'DESC']],
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            const response = {
                settings: settings,
                pagination: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total_pages: Math.ceil(count / limit)
                }
            };

            return successResponse(res, response, 'Mail subscription settings retrieved successfully');
        } catch (error) {
            logger.error('Error listing mail subscription settings:', error);
            return errorResponse(res, error, 'Failed to retrieve mail subscription settings');
        }
    },

    // Get single mail subscription setting by ID
    async getMailSubscriptionSetting(req, res) {
        try {
            const { id } = req.params;

            const setting = await MailSubscriptionSettings.findByPk(id);

            if (!setting) {
                return errorResponse(res, {}, 'Mail subscription setting not found', 404);
            }

            return successResponse(res, setting, 'Mail subscription setting retrieved successfully');
        } catch (error) {
            logger.error('Error getting mail subscription setting:', error);
            return errorResponse(res, error, 'Failed to retrieve mail subscription setting');
        }
    },

    // Create new mail subscription setting
    async createMailSubscriptionSetting(req, res) {
        try {
            const {
                email_frequency,
                product_updates,
                discount_notifications,
                discount_amount,
                discount_type,
                status
            } = req.body;

            const userId = req?.user?.id;

            // Validate email frequency
            if (email_frequency && !['daily', 'weekly', 'monthly', 'never'].includes(email_frequency)) {
                return errorResponse(res, {}, 'Email frequency must be daily, weekly, monthly, or never', 400);
            }

            // Validate discount type
            if (discount_type && !['percentage', 'fixed'].includes(discount_type)) {
                return errorResponse(res, {}, 'Discount type must be percentage or fixed', 400);
            }

            // Validate discount amount
            if (discount_amount !== undefined && discount_amount < 0) {
                return errorResponse(res, {}, 'Discount amount cannot be negative', 400);
            }

            // Create new setting
            const newSetting = await MailSubscriptionSettings.create({
                email_frequency: email_frequency || 'weekly',
                product_updates: product_updates !== undefined ? product_updates : true,
                discount_notifications: discount_notifications !== undefined ? discount_notifications : true,
                discount_amount: discount_amount !== undefined ? discount_amount : 0.00,
                discount_type: discount_type || 'percentage',
                status: status !== undefined ? status : true
            });

            logger.info('Mail subscription setting created', {
                user_id: userId,
                setting_id: newSetting.id
            });

            return successResponse(res, newSetting, 'Mail subscription setting created successfully', 201);
        } catch (error) {
            logger.error('Error creating mail subscription setting:', error);
            return errorResponse(res, error, 'Failed to create mail subscription setting');
        }
    },

    // Update mail subscription setting
    async updateMailSubscriptionSetting(req, res) {
        try {
            const { id } = req.params;
            const {
                email_frequency,
                product_updates,
                discount_notifications,
                discount_amount,
                discount_type,
                status
            } = req.body;

            const userId = req?.user?.id;

            // Check if setting exists
            const existingSetting = await MailSubscriptionSettings.findByPk(id);
            if (!existingSetting) {
                return errorResponse(res, {}, 'Mail subscription setting not found', 404);
            }

            // Validate email frequency
            if (email_frequency !== undefined && !['daily', 'weekly', 'monthly', 'never'].includes(email_frequency)) {
                return errorResponse(res, {}, 'Email frequency must be daily, weekly, monthly, or never', 400);
            }

            // Validate discount type
            if (discount_type !== undefined && !['percentage', 'fixed'].includes(discount_type)) {
                return errorResponse(res, {}, 'Discount type must be percentage or fixed', 400);
            }

            // Validate discount amount
            if (discount_amount !== undefined && discount_amount < 0) {
                return errorResponse(res, {}, 'Discount amount cannot be negative', 400);
            }

            // Update setting
            const updateData = {};
            
            if (email_frequency !== undefined) updateData.email_frequency = email_frequency;
            if (product_updates !== undefined) updateData.product_updates = product_updates;
            if (discount_notifications !== undefined) updateData.discount_notifications = discount_notifications;
            if (discount_amount !== undefined) updateData.discount_amount = discount_amount;
            if (discount_type !== undefined) updateData.discount_type = discount_type;
            if (status !== undefined) updateData.status = status;

            await existingSetting.update(updateData);

            logger.info('Mail subscription setting updated', {
                user_id: userId,
                setting_id: id,
                changes: req.body
            });

            return successResponse(res, existingSetting, 'Mail subscription setting updated successfully');
        } catch (error) {
            logger.error('Error updating mail subscription setting:', error);
            return errorResponse(res, error, 'Failed to update mail subscription setting');
        }
    },

    // Delete mail subscription setting
    async deleteMailSubscriptionSetting(req, res) {
        try {
            const { id } = req.params;
            const userId = req?.user?.id;

            // Check if setting exists
            const existingSetting = await MailSubscriptionSettings.findByPk(id);
            if (!existingSetting) {
                return errorResponse(res, {}, 'Mail subscription setting not found', 404);
            }

            // Soft delete the setting
            await existingSetting.destroy();

            logger.info('Mail subscription setting deleted', {
                user_id: userId,
                setting_id: id
            });

            return successResponse(res, {}, 'Mail subscription setting deleted successfully');
        } catch (error) {
            logger.error('Error deleting mail subscription setting:', error);
            return errorResponse(res, error, 'Failed to delete mail subscription setting');
        }
    }
}; 