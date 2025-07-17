const { errorResponse, successResponse } = require('../../../../utils/responseUtils');
const { LoyaltyPointsSettings, User, LoyaltyPointsHistory, Order, sequelize } = require('../../../../models');
const logger = require('../../../../library/logger');

module.exports = {
    // List all loyalty points settings with pagination
    async listLoyaltyPointsSettings(req, res) {
        try {
            const { page = 1, limit = 10, status } = req.query;
            const offset = (page - 1) * limit;
            
            const whereClause = {};
            if (status !== undefined) {
                whereClause.status = status === 'true';
            }

            const { count, rows: settings } = await LoyaltyPointsSettings.findAndCountAll({
                where: whereClause,
                include: [
                    {
                        model: User,
                        as: 'updatedBy',
                        attributes: ['id', 'first_name', 'last_name', 'email']
                    }
                ],
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

            return successResponse(res, response, 'Loyalty points settings retrieved successfully');
        } catch (error) {
            logger.error('Error listing loyalty points settings:', error);
            return errorResponse(res, error, 'Failed to retrieve loyalty points settings');
        }
    },

    // Get single loyalty points setting by ID
    async getLoyaltyPointsSetting(req, res) {
        try {
            const { id } = req.params;

            const setting = await LoyaltyPointsSettings.findByPk(id, {
                include: [
                    {
                        model: User,
                        as: 'updatedBy',
                        attributes: ['id', 'first_name', 'last_name', 'email']
                    }
                ]
            });

            if (!setting) {
                return errorResponse(res, {}, 'Loyalty points setting not found', 404);
            }

            return successResponse(res, setting, 'Loyalty points setting retrieved successfully');
        } catch (error) {
            logger.error('Error getting loyalty points setting:', error);
            return errorResponse(res, error, 'Failed to retrieve loyalty points setting');
        }
    },

    // Create new loyalty points setting
    async createLoyaltyPointsSetting(req, res) {
        try {
            const {
                program_name,
                points_value,
                loyalty_amount,
                loyalty_amount_type,
                minimum_points_redemption,
                minimum_purchase_amount,
                min_amount_for_loyalty_points,
                status
            } = req.body;

            const userId = req?.user?.id;

            // Validate required fields
            if (!program_name || program_name.trim().length === 0) {
                return errorResponse(res, {}, 'Program name is required', 400);
            }

            if (points_value !== undefined && points_value < 0) {
                return errorResponse(res, {}, 'Points value cannot be negative', 400);
            }

            if (loyalty_amount !== undefined && loyalty_amount < 0) {
                return errorResponse(res, {}, 'Loyalty amount cannot be negative', 400);
            }

            if (loyalty_amount_type && !['percentage', 'fixed'].includes(loyalty_amount_type)) {
                return errorResponse(res, {}, 'Loyalty amount type must be either "percentage" or "fixed"', 400);
            }

            if (minimum_points_redemption !== undefined && minimum_points_redemption < 0) {
                return errorResponse(res, {}, 'Minimum points redemption cannot be negative', 400);
            }

            if (minimum_purchase_amount !== undefined && minimum_purchase_amount < 0) {
                return errorResponse(res, {}, 'Minimum purchase amount cannot be negative', 400);
            }

            if (min_amount_for_loyalty_points !== undefined && min_amount_for_loyalty_points < 0) {
                return errorResponse(res, {}, 'Minimum amount for loyalty points cannot be negative', 400);
            }

            // Create new setting
            const newSetting = await LoyaltyPointsSettings.create({
                program_name: program_name.trim(),
                points_value: points_value !== undefined ? points_value : 0.01,
                loyalty_amount: loyalty_amount !== undefined ? loyalty_amount : 0.0,
                loyalty_amount_type: loyalty_amount_type || 'fixed',
                minimum_points_redemption: minimum_points_redemption !== undefined ? minimum_points_redemption : 100,
                minimum_purchase_amount: minimum_purchase_amount !== undefined ? minimum_purchase_amount : 0.0,
                min_amount_for_loyalty_points: min_amount_for_loyalty_points !== undefined ? min_amount_for_loyalty_points : 0.0,
                status: status !== undefined ? status : true,
                updated_by: userId
            });

            // Fetch created setting with user info
            const createdSetting = await LoyaltyPointsSettings.findByPk(newSetting.id, {
                include: [
                    {
                        model: User,
                        as: 'updatedBy',
                        attributes: ['id', 'first_name', 'last_name', 'email']
                    }
                ]
            });

            logger.info('Loyalty points setting created', {
                user_id: userId,
                setting_id: newSetting.id,
                program_name: program_name
            });

            return successResponse(res, createdSetting, 'Loyalty points setting created successfully', 201);
        } catch (error) {
            logger.error('Error creating loyalty points setting:', error);
            return errorResponse(res, error, 'Failed to create loyalty points setting');
        }
    },

    // Update loyalty points setting
    async updateLoyaltyPointsSetting(req, res) {
        try {
            const { id } = req.params;
            const {
                program_name,
                points_value,
                loyalty_amount,
                loyalty_amount_type,
                minimum_points_redemption,
                minimum_purchase_amount,
                min_amount_for_loyalty_points,
                status
            } = req.body;

            const userId = req?.user?.id;

            // Check if setting exists
            const existingSetting = await LoyaltyPointsSettings.findByPk(id);
            if (!existingSetting) {
                return errorResponse(res, {}, 'Loyalty points setting not found', 404);
            }

            // Validate fields if provided
            if (program_name !== undefined && program_name !== null && program_name.trim().length === 0) {
                return errorResponse(res, {}, 'Program name cannot be empty if provided', 400);
            }

            if (points_value !== undefined && points_value !== null && points_value < 0) {
                return errorResponse(res, {}, 'Points value cannot be negative', 400);
            }

            if (loyalty_amount !== undefined && loyalty_amount !== null && loyalty_amount < 0) {
                return errorResponse(res, {}, 'Loyalty amount cannot be negative', 400);
            }

            if (loyalty_amount_type !== undefined && loyalty_amount_type !== null && !['percentage', 'fixed'].includes(loyalty_amount_type)) {
                return errorResponse(res, {}, 'Loyalty amount type must be either "percentage" or "fixed"', 400);
            }

            if (minimum_points_redemption !== undefined && minimum_points_redemption !== null && minimum_points_redemption < 0) {
                return errorResponse(res, {}, 'Minimum points redemption cannot be negative', 400);
            }

            if (minimum_purchase_amount !== undefined && minimum_purchase_amount !== null && minimum_purchase_amount < 0) {
                return errorResponse(res, {}, 'Minimum purchase amount cannot be negative', 400);
            }

            if (min_amount_for_loyalty_points !== undefined && min_amount_for_loyalty_points !== null && min_amount_for_loyalty_points < 0) {
                return errorResponse(res, {}, 'Minimum amount for loyalty points cannot be negative', 400);
            }

            // Update setting
            const updateData = {};
            
            if (program_name !== undefined) updateData.program_name = program_name.trim();
            if (points_value !== undefined) updateData.points_value = points_value;
            if (loyalty_amount !== undefined) updateData.loyalty_amount = loyalty_amount;
            if (loyalty_amount_type !== undefined) updateData.loyalty_amount_type = loyalty_amount_type;
            if (minimum_points_redemption !== undefined) updateData.minimum_points_redemption = minimum_points_redemption;
            if (minimum_purchase_amount !== undefined) updateData.minimum_purchase_amount = minimum_purchase_amount;
            if (min_amount_for_loyalty_points !== undefined) updateData.min_amount_for_loyalty_points = min_amount_for_loyalty_points;
            if (status !== undefined) updateData.status = status;
            
            updateData.updated_by = userId;

            await existingSetting.update(updateData);

            // Fetch updated setting with user info
            const updatedSetting = await LoyaltyPointsSettings.findByPk(id, {
                include: [
                    {
                        model: User,
                        as: 'updatedBy',
                        attributes: ['id', 'first_name', 'last_name', 'email']
                    }
                ]
            });

            logger.info('Loyalty points setting updated', {
                user_id: userId,
                setting_id: id,
                changes: req.body
            });

            return successResponse(res, updatedSetting, 'Loyalty points setting updated successfully');
        } catch (error) {
            logger.error('Error updating loyalty points setting:', error);
            return errorResponse(res, error, 'Failed to update loyalty points setting');
        }
    },

    // Delete loyalty points setting
    async deleteLoyaltyPointsSetting(req, res) {
        try {
            const { id } = req.params;
            const userId = req?.user?.id;

            // Check if setting exists
            const existingSetting = await LoyaltyPointsSettings.findByPk(id);
            if (!existingSetting) {
                return errorResponse(res, {}, 'Loyalty points setting not found', 404);
            }

            // Soft delete the setting
            await existingSetting.destroy();

            logger.info('Loyalty points setting deleted', {
                user_id: userId,
                setting_id: id,
                program_name: existingSetting.program_name
            });

            return successResponse(res, {}, 'Loyalty points setting deleted successfully');
        } catch (error) {
            logger.error('Error deleting loyalty points setting:', error);
            return errorResponse(res, error, 'Failed to delete loyalty points setting');
        }
    },

    // List all loyalty points history with pagination and filters
    async listLoyaltyPointsHistory(req, res) {
        try {
            const { 
                page = 1, 
                limit = 10, 
                user_id, 
                type, 
                order_id,
                start_date,
                end_date,
                sort_by = 'timestamp',
                sort_order = 'DESC'
            } = req.query;
            
            const offset = (page - 1) * limit;
            
            // Build where clause
            const whereClause = {};
            
            if (user_id) {
                whereClause.user_id = user_id;
            }
            
            if (type && ['earned', 'redeemed'].includes(type)) {
                whereClause.type = type;
            }
            
            if (order_id) {
                whereClause.order_id = order_id;
            }
            
            // Date range filter
            if (start_date || end_date) {
                whereClause.timestamp = {};
                if (start_date) {
                    whereClause.timestamp.$gte = new Date(start_date);
                }
                if (end_date) {
                    whereClause.timestamp.$lte = new Date(end_date);
                }
            }

            // Validate sort parameters
            const validSortFields = ['timestamp', 'points', 'type', 'user_id', 'order_id'];
            const validSortOrders = ['ASC', 'DESC'];
            
            const sortField = validSortFields.includes(sort_by) ? sort_by : 'timestamp';
            const sortOrder = validSortOrders.includes(sort_order.toUpperCase()) ? sort_order.toUpperCase() : 'DESC';

            const { count, rows: history } = await LoyaltyPointsHistory.findAndCountAll({
                where: whereClause,
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'first_name', 'last_name', 'email']
                    },
                    {
                        model: Order,
                        as: 'order',
                        attributes: ['id', 'order_unique_id', 'total', 'status'],
                        required: false
                    }
                ],
                order: [[sortField, sortOrder]],
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            // Calculate summary statistics
            const summary = await LoyaltyPointsHistory.findAll({
                where: whereClause,
                attributes: [
                    [sequelize.fn('SUM', sequelize.literal('CASE WHEN type = "earned" THEN points ELSE 0 END')), 'total_earned'],
                    [sequelize.fn('SUM', sequelize.literal('CASE WHEN type = "redeemed" THEN ABS(points) ELSE 0 END')), 'total_redeemed'],
                    [sequelize.fn('COUNT', sequelize.literal('CASE WHEN type = "earned" THEN 1 END')), 'earned_transactions'],
                    [sequelize.fn('COUNT', sequelize.literal('CASE WHEN type = "redeemed" THEN 1 END')), 'redeemed_transactions']
                ],
                raw: true
            });

            const response = {
                history: history,
                summary: {
                    total_earned: parseInt(summary[0]?.total_earned || 0),
                    total_redeemed: parseInt(summary[0]?.total_redeemed || 0),
                    earned_transactions: parseInt(summary[0]?.earned_transactions || 0),
                    redeemed_transactions: parseInt(summary[0]?.redeemed_transactions || 0),
                    net_points: parseInt(summary[0]?.total_earned || 0) - parseInt(summary[0]?.total_redeemed || 0)
                },
                pagination: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total_pages: Math.ceil(count / limit)
                }
            };

            return successResponse(res, response, 'Loyalty points history retrieved successfully');
        } catch (error) {
            logger.error('Error listing loyalty points history:', error);
            return errorResponse(res, error, 'Failed to retrieve loyalty points history');
        }
    },

}; 