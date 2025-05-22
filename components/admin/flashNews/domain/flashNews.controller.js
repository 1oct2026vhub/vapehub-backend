const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { FlashNews, User } = require("../../../../models");
const { Op } = require("sequelize");

/**
 * Create or update flash news
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
module.exports.createOrUpdateFlashNews = async (req, res, next) => {
    try {
        const { id, label, url, status } = req.body;
        const updated_by = req.user.id;
        
        let flashNews;
        if (id) {
            flashNews = await FlashNews.findByPk(id);
            if (!flashNews) {
                return errorResponse(res, { message: 'Flash news not found' }, 'Flash news not found', 404);
            }
            const updateData = {
                label,
                url,
                status,
                updated_by
            };
            await flashNews.update(updateData);
        } else {
            flashNews = await FlashNews.create({ 
                label, 
                url, 
                status,
                updated_by 
            });
        }
        
        return successResponse(res, flashNews, 'Flash news saved successfully');
    } catch (error) {
        console.error("createOrUpdateFlashNews error:", error);
        if (error.name === 'SequelizeValidationError') {
            return errorResponse(res, { errors: error.errors }, 'Validation error', 400);
        }
        if (error.name === 'SequelizeUniqueConstraintError') {
            return errorResponse(res, { errors: error.errors }, 'Duplicate entry', 400);
        }
        return errorResponse(res, { message: error.message }, 'Internal server error', 500);
    }
};

/**
 * Update existing flash news
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
module.exports.updateFlashNews = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { label, url, status } = req.body;
        const updated_by = req.user.id;
        
        const flashNews = await FlashNews.findByPk(id);
        if (!flashNews) {
            return errorResponse(res, { message: 'Flash news not found' }, 'Flash news not found', 404);
        }

        const updateData = {
            label,
            url,
            status,
            updated_by
        };

        await flashNews.update(updateData);
        
        // Fetch the updated record with user information
        const updatedFlashNews = await FlashNews.findByPk(id, {
            include: [{
                model: User,
                as: 'updatedBy',
                attributes: ['id', 'first_name', 'last_name', 'email']
            }]
        });
        
        return successResponse(res, updatedFlashNews, 'Flash news updated successfully');
    } catch (error) {
        console.error("updateFlashNews error:", error);
        if (error.name === 'SequelizeValidationError') {
            return errorResponse(res, { errors: error.errors }, 'Validation error', 400);
        }
        if (error.name === 'SequelizeUniqueConstraintError') {
            return errorResponse(res, { errors: error.errors }, 'Duplicate entry', 400);
        }
        return errorResponse(res, { message: error.message }, 'Internal server error', 500);
    }
};

/**
 * List all flash news
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
module.exports.listAllFlashNews = async (req, res, next) => {
    try {
        const { include_deleted, page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;
        
        const where = {};
        if (!include_deleted) {
            where.deleted_at = null;
        }
        
        const totalCount = await FlashNews.count({ where });
        
        const flashNews = await FlashNews.findAll({
            where,
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset),
            include: [{
                model: User,
                as: 'updatedBy',
                attributes: ['id', 'first_name', 'last_name', 'email']
            }]
        });
        
        const response = {
            flashNews: flashNews,
            pagination: {
                total: totalCount,
                page: parseInt(page),
                limit: parseInt(limit),
                total_pages: Math.ceil(totalCount / limit)
            }
        };
        
        return successResponse(res, response, 'Success');
    } catch (error) {
        console.error("listAllFlashNews error:", error);
        return errorResponse(res, { message: error.message }, 'Internal server error', 500);
    }
};

/**
 * Soft delete flash news
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
module.exports.deleteFlashNews = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updated_by = req.user.id;
        
        const flashNews = await FlashNews.findByPk(id);
        if (!flashNews) {
            return errorResponse(res, { message: 'Flash news not found' }, 'Flash news not found', 404);
        }
        
        await flashNews.update({ updated_by });
        await flashNews.destroy();
        return successResponse(res, null, 'Flash news deleted successfully');
    } catch (error) {
        console.error("deleteFlashNews error:", error);
        return errorResponse(res, { message: error.message }, 'Internal server error', 500);
    }
};

/**
 * Restore soft-deleted flash news
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
module.exports.restoreFlashNews = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updated_by = req.user.id;
        
        const flashNews = await FlashNews.findOne({
            where: {
                id,
                deleted_at: { [Op.ne]: null }
            },
            paranoid: false
        });
        
        if (!flashNews) {
            return errorResponse(res, { message: 'Deleted flash news not found' }, 'Deleted flash news not found', 404);
        }
        
        await flashNews.update({ updated_by });
        await flashNews.restore();
        return successResponse(res, null, 'Flash news restored successfully');
    } catch (error) {
        console.error("restoreFlashNews error:", error);
        return errorResponse(res, { message: error.message }, 'Internal server error', 500);
    }
}; 