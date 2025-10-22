const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Settings } = require("../../../models");
const { Op } = require("sequelize");
const logger = require("../../../library/logger");
const constants = require("../../../config/constants");

/**
 * Get all legal content settings for user-side display
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const getLegalContent = async (req, res, next) => {
    try {
        const legalKeys = constants.LEGAL_CONTENT_KEY_ENUMS;

        // Fetch all legal content settings that are active
        const legalSettings = await Settings.findAll({
            where: {
                content_key: {
                    [Op.in]: legalKeys
                },
                is_active: true // Only fetch active settings
            },
            order: [['content_key', 'ASC']],
            attributes: ['id', 'content_key', 'content', 'is_active', 'created_at', 'updated_at']
        });

        // Create a structured response object
        const legalContent = {};
        legalSettings.forEach(setting => {
            legalContent[setting.content_key] = {
                id: setting.id,
                content: setting.content,
                is_active: setting.is_active,
                last_updated: setting.updated_at
            };
        });

        // Add metadata about available content types
        const availableContentTypes = legalSettings.map(setting => setting.content_key);
        const missingContentTypes = legalKeys.filter(key => !availableContentTypes.includes(key));

        return successResponse(res, {
            legal_content: legalContent,
            metadata: {
                available_content_types: availableContentTypes,
                missing_content_types: missingContentTypes,
                total_content_types: legalKeys.length,
                active_content_types: availableContentTypes.length
            }
        }, 'Legal content retrieved successfully');
    } catch (error) {
        logger.error('Get Legal Content Error:', error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Get specific legal content by content key
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const getLegalContentByKey = async (req, res, next) => {
    try {
        const { content_key } = req.params;

        // Validate that the content_key is a legal content key
        if (!constants.LEGAL_CONTENT_KEY_ENUMS.includes(content_key)) {
            return errorResponse(res, { 
                message: `Invalid content key. Must be one of: ${constants.LEGAL_CONTENT_KEY_ENUMS.join(', ')}` 
            }, 'Invalid content key', 400);
        }

        // Fetch the specific legal content setting
        const setting = await Settings.findOne({
            where: {
                content_key,
                is_active: true
            },
            attributes: ['id', 'content_key', 'content', 'is_active', 'created_at', 'updated_at']
        });

        if (!setting) {
            return errorResponse(res, { 
                message: `Legal content for '${content_key}' not found or is inactive` 
            }, 'Content not found', 404);
        }

        return successResponse(res, {
            content_key: setting.content_key,
            content: setting.content,
            is_active: setting.is_active,
            last_updated: setting.updated_at,
            created_at: setting.created_at
        }, 'Legal content retrieved successfully');
    } catch (error) {
        logger.error('Get Legal Content by Key Error:', error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Get available legal content types
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const getAvailableContentTypes = async (req, res, next) => {
    try {
        const legalKeysObject = constants.LEGAL_CONTENT_KEYS;
        const legalKeysArray = constants.LEGAL_CONTENT_KEY_ENUMS;
        
        // Check which content types are available and active
        const activeSettings = await Settings.findAll({
            where: {
                content_key: {
                    [Op.in]: legalKeysArray
                },
                is_active: true
            },
            attributes: ['content_key', 'is_active']
        });

        const activeContentTypes = activeSettings.map(setting => setting.content_key);
        const inactiveContentTypes = legalKeysArray.filter(key => !activeContentTypes.includes(key));

        return successResponse(res, {
            available_content_types: {
                all_types: legalKeysObject,
                active_types: activeContentTypes,
                inactive_types: inactiveContentTypes
            },
            metadata: {
                total_types: legalKeysArray.length,
                active_count: activeContentTypes.length,
                inactive_count: inactiveContentTypes.length
            }
        }, 'Available content types retrieved successfully');
    } catch (error) {
        logger.error('Get Available Content Types Error:', error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Get legal content summary (for quick reference)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const getLegalContentSummary = async (req, res, next) => {
    try {
        const legalKeys = constants.LEGAL_CONTENT_KEY_ENUMS;

        // Fetch summary of all legal content settings
        const legalSettings = await Settings.findAll({
            where: {
                content_key: {
                    [Op.in]: legalKeys
                }
            },
            attributes: ['content_key', 'is_active', 'updated_at'],
            order: [['content_key', 'ASC']]
        });

        // Create summary object
        const summary = {};
        legalSettings.forEach(setting => {
            summary[setting.content_key] = {
                is_available: setting.is_active,
                last_updated: setting.updated_at,
                status: setting.is_active ? 'active' : 'inactive'
            };
        });

        // Add missing content types
        const availableKeys = legalSettings.map(s => s.content_key);
        const missingKeys = legalKeys.filter(key => !availableKeys.includes(key));
        
        missingKeys.forEach(key => {
            summary[key] = {
                is_available: false,
                last_updated: null,
                status: 'not_configured'
            };
        });

        return successResponse(res, {
            content_summary: summary,
            metadata: {
                total_configured: legalSettings.length,
                total_available: legalKeys.length,
                active_count: legalSettings.filter(s => s.is_active).length
            }
        }, 'Legal content summary retrieved successfully');
    } catch (error) {
        logger.error('Get Legal Content Summary Error:', error);
        return errorResponse(res, error, error.message);
    }
};

module.exports = {
    getLegalContent,
    getLegalContentByKey,
    getAvailableContentTypes,
    getLegalContentSummary
};
