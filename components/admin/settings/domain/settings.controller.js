const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Settings } = require("../../../../models");
const { Op } = require("sequelize");
const logger = require("../../../../library/logger");
const constants = require("../../../../config/constants");

/**
 * Get all settings with optional filtering
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const getAllSettings = async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 10,
            sort_by = 'created_at',
            order = 'DESC',
            search,
            content_key,
            is_active,
            deleted = false
        } = req.query;

        // Build where clause
        const whereClause = {};

        // Handle search
        if (search) {
            whereClause[Op.or] = [
                { content_key: { [Op.like]: `%${search}%` } },
                { content: { [Op.like]: `%${search}%` } }
            ];
        }

        // Handle content_key filter
        if (content_key) {
            whereClause.content_key = content_key;
        }

        // Handle is_active filter
        if (is_active !== undefined) {
            whereClause.is_active = is_active === 'true';
        }

        // Handle deleted filter - let Sequelize handle paranoid mode automatically
        // We don't need to manually set deletedAt in whereClause when using paranoid: true

        // Validate sort_by field to prevent SQL injection and use correct column names
        const allowedSortFields = ['id', 'content_key', 'content', 'is_active', 'created_at', 'updated_at'];
        const validatedSortBy = allowedSortFields.includes(sort_by) ? sort_by : 'created_at';

        // Calculate offset for pagination
        const offset = (page - 1) * limit;

        // Get total count for pagination
        const total = await Settings.count({
            where: whereClause,
            paranoid: deleted !== 'true'
        });

        // Get settings with pagination
        const settings = await Settings.findAll({
            where: whereClause,
            order: [[validatedSortBy, order.toUpperCase()]],
            limit: parseInt(limit),
            offset: parseInt(offset),
            paranoid: deleted !== 'true'
        });

        return successResponse(res, {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            results: settings
        }, 'Settings retrieved successfully');
    } catch (error) {
        logger.error('Get Settings Error:', error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Get setting by content_key
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const getSettingByKey = async (req, res, next) => {
    try {
        const { content_key } = req.params;
        const setting = await Settings.findOne({
            where: { content_key }
        });

        if (!setting) {
            return errorResponse(res, { message: 'Setting not found' }, 'Setting not found', 404);
        }

        return successResponse(res, setting, 'Setting retrieved successfully');
    } catch (error) {
        logger.error('Get Setting by Key Error:', error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Get setting by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const getSettingById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const setting = await Settings.findByPk(id);

        if (!setting) {
            return errorResponse(res, { message: 'Setting not found' }, 'Setting not found', 404);
        }

        return successResponse(res, setting, 'Setting retrieved successfully');
    } catch (error) {
        logger.error('Get Setting by ID Error:', error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Create new setting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const createSetting = async (req, res, next) => {
    const transaction = await Settings.sequelize.transaction();
    try {
        // Handle JSON parsing errors
        if (!req.body || typeof req.body !== 'object') {
            await transaction.rollback();
            return errorResponse(res, { message: 'Invalid request body format' }, 'Invalid JSON', 400);
        }

        const { content_key, content, is_active = true } = req.body;

        // Validate required fields
        if (!content_key || !content) {
            await transaction.rollback();
            return errorResponse(res, { message: 'content_key and content are required' }, 'Missing required fields', 400);
        }

        // Validate content_key is one of the allowed legal content keys
        if (!constants.LEGAL_CONTENT_KEY_ENUMS.includes(content_key)) {
            await transaction.rollback();
            return errorResponse(res, { 
                message: `Invalid content_key. Must be one of: ${constants.LEGAL_CONTENT_KEY_ENUMS.join(', ')}` 
            }, 'Invalid content key', 400);
        }

        // Sanitize content to handle HTML and special characters
        const sanitizedContent = typeof content === 'string' ? content.trim() : String(content).trim();
        
        if (sanitizedContent.length === 0) {
            await transaction.rollback();
            return errorResponse(res, { message: 'Content cannot be empty' }, 'Empty content', 400);
        }

        // Check if setting with same content_key already exists
        const existingSetting = await Settings.findOne({
            where: { content_key }
        });

        let setting;
        let message;
        let statusCode;

        if (existingSetting) {
            // Update existing setting
            await existingSetting.update({
                content: sanitizedContent,
                is_active
            }, { transaction });
            
            setting = existingSetting;
            message = 'Setting updated successfully';
            statusCode = 200;
        } else {
            // Create new setting
            setting = await Settings.create({
                content_key,
                content: sanitizedContent,
                is_active
            }, { transaction });
            
            message = 'Setting created successfully';
            statusCode = 201;
        }

        await transaction.commit();
        return successResponse(res, setting, message, statusCode);
    } catch (error) {
        await transaction.rollback();
        logger.error('Create Setting Error:', error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Update setting
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const updateSetting = async (req, res, next) => {
    const transaction = await Settings.sequelize.transaction();
    try {
        const { id } = req.params;
        const { content, is_active } = req.body;

        const setting = await Settings.findByPk(id);
        if (!setting) {
            await transaction.rollback();
            return errorResponse(res, { message: 'Setting not found' }, 'Setting not found', 404);
        }

        // Only allow updating content and is_active, not content_key
        const updateData = {};

        // Sanitize content if provided
        if (content !== undefined) {
            const sanitizedContent = typeof content === 'string' ? content.trim() : String(content).trim();
            
            if (sanitizedContent.length === 0) {
                await transaction.rollback();
                return errorResponse(res, { message: 'Content cannot be empty' }, 'Empty content', 400);
            }
            updateData.content = sanitizedContent;
        }

        // Update is_active if provided
        if (is_active !== undefined) {
            updateData.is_active = is_active;
        }

        // Check if there are any fields to update
        if (Object.keys(updateData).length === 0) {
            await transaction.rollback();
            return errorResponse(res, { message: 'No valid fields to update. Only content and is_active can be updated.' }, 'No updates provided', 400);
        }

        await setting.update(updateData, { transaction });

        await transaction.commit();
        return successResponse(res, setting, 'Setting updated successfully');
    } catch (error) {
        await transaction.rollback();
        logger.error('Update Setting Error:', error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Delete setting (soft delete)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const deleteSetting = async (req, res, next) => {
    const transaction = await Settings.sequelize.transaction();
    try {
        const { id } = req.params;
        const setting = await Settings.findByPk(id);

        if (!setting) {
            await transaction.rollback();
            return errorResponse(res, { message: 'Setting not found' }, 'Setting not found', 404);
        }

        await setting.destroy({ transaction });

        await transaction.commit();
        return successResponse(res, null, 'Setting deleted successfully');
    } catch (error) {
        await transaction.rollback();
        logger.error('Delete Setting Error:', error);
        return errorResponse(res, error, error.message);
    }
};


/**
 * Toggle setting active status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const toggleSettingStatus = async (req, res, next) => {
    const transaction = await Settings.sequelize.transaction();
    try {
        const { id } = req.params;
        const setting = await Settings.findByPk(id);

        if (!setting) {
            await transaction.rollback();
            return errorResponse(res, { message: 'Setting not found' }, 'Setting not found', 404);
        }

        await setting.update({
            is_active: !setting.is_active
        }, { transaction });

        await transaction.commit();
        return successResponse(res, setting, 'Setting status toggled successfully');
    } catch (error) {
        await transaction.rollback();
        logger.error('Toggle Setting Status Error:', error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Get legal content keys from constants
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const getLegalContentKeys = async (req, res, next) => {
    try {
        const legalKeysObject = constants.LEGAL_CONTENT_KEYS;
        const legalKeysArray = constants.LEGAL_CONTENT_KEY_ENUMS;
        
        return successResponse(res, {
            legal_content_keys: legalKeysObject,
            legal_content_keys_array: legalKeysArray,
            count: legalKeysArray.length,
            description: 'Available legal content keys for settings (key-value pairs)'
        }, 'Legal content keys retrieved successfully');
    } catch (error) {
        logger.error('Get Legal Content Keys Error:', error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Get legal content settings (predefined content keys)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const getLegalContent = async (req, res, next) => {
    try {
        const legalKeys = constants.LEGAL_CONTENT_KEY_ENUMS;

        const legalSettings = await Settings.findAll({
            where: {
                content_key: {
                    [Op.in]: legalKeys
                }
            },
            order: [['content_key', 'ASC']]
        });

        // Create a map for easy access
        const legalContent = {};
        legalSettings.forEach(setting => {
            legalContent[setting.content_key] = {
                id: setting.id,
                content: setting.content,
                is_active: setting.is_active,
                created_at: setting.created_at,
                updated_at: setting.updated_at
            };
        });

        return successResponse(res, legalContent, 'Legal content retrieved successfully');
    } catch (error) {
        logger.error('Get Legal Content Error:', error);
        return errorResponse(res, error, error.message);
    }
};

module.exports = {
    getAllSettings,
    getSettingByKey,
    getSettingById,
    createSetting,
    updateSetting,
    deleteSetting,
    toggleSettingStatus,
    getLegalContentKeys,
    getLegalContent
};
