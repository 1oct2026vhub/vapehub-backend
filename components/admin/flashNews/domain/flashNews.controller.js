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
        const { deleted, page = 1, limit = 10, search } = req.query;
        const offset = (page - 1) * limit;
        
        const where = {};
        if (deleted === 'true') {
            where.deleted_at = { [Op.ne]: null };
        } else {
            where.deleted_at = null;
        }

        if (search) {
            where.label = { [Op.like]: `%${search}%` };
        }
        
        const totalCount = await FlashNews.count({ where });
        
        const flashNews = await FlashNews.findAll({
            where,
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset),
            paranoid: deleted !== 'true',
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

/**
 * Bulk soft delete flash news by IDs
 */
module.exports.bulkDeleteFlashNews = async (req, res, next) => {
    try {
        const { ids } = req.body;
        const updated_by = req.user.id;

        const deleted = [];
        const notDeleted = [];

        const items = await FlashNews.findAll({ where: { id: { [Op.in]: ids } } });
        for (const item of items) {
            try {
                await item.update({ updated_by });
                await item.destroy();
                deleted.push({ id: item.id, label: item.label });
            } catch (err) {
                notDeleted.push({ id: item.id, label: item.label, reason: err.message || 'Failed to delete' });
            }
        }

        const foundIds = items.map(i => i.id);
        const notFoundIds = ids.filter(id => !foundIds.includes(Number(id)));
        notFoundIds.forEach(id => notDeleted.push({ id: Number(id), reason: 'Flash news not found' }));

        const summary = {
            total_requested: ids.length,
            deleted_count: deleted.length,
            not_deleted_count: notDeleted.length
        };

        if (deleted.length === 0) {
            return errorResponse(res, { deleted, not_deleted: notDeleted, summary }, 'No flash news were deleted', 400);
        }

        return successResponse(res, { deleted, not_deleted: notDeleted, summary }, `Successfully deleted ${deleted.length} item(s)`);
    } catch (error) {
        console.error('bulkDeleteFlashNews error:', error);
        return errorResponse(res, { message: error.message }, 'Internal server error', 500);
    }
};

/**
 * Bulk restore soft-deleted flash news by IDs
 */
module.exports.bulkRestoreFlashNews = async (req, res, next) => {
    try {
        const { ids } = req.body;
        const updated_by = req.user.id;

        const restored = [];
        const notRestored = [];

        for (const rawId of ids) {
            const id = Number(rawId);
            try {
                const item = await FlashNews.findOne({
                    where: { id, deleted_at: { [Op.ne]: null } },
                    paranoid: false
                });
                if (!item) {
                    notRestored.push({ id, reason: 'Deleted flash news not found' });
                    continue;
                }
                await item.update({ updated_by });
                await item.restore();
                restored.push({ id: item.id, label: item.label });
            } catch (err) {
                notRestored.push({ id, reason: err.message || 'Failed to restore' });
            }
        }

        const summary = {
            total_requested: ids.length,
            restored_count: restored.length,
            not_restored_count: notRestored.length
        };

        if (restored.length === 0) {
            return errorResponse(res, { restored, not_restored: notRestored, summary }, 'No flash news were restored', 400);
        }

        return successResponse(res, { restored, not_restored: notRestored, summary }, `Successfully restored ${restored.length} item(s)`);
    } catch (error) {
        console.error('bulkRestoreFlashNews error:', error);
        return errorResponse(res, { message: error.message }, 'Internal server error', 500);
    }
};