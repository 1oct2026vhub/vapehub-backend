const { FAQ } = require('../../../../models');
const { Op } = require('sequelize');
const { errorResponse, successResponse } = require('../../../../utils/responseUtils');
const logger = require('../../../../library/logger');

/**
 * Get FAQs with optional filtering
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const getFaqs = async (req, res, next) => {
    try {
        const {
            page = 1,
            limit = 10,
            sort_by = 'createdAt',
            order = 'DESC',
            search,
            entity_type,
            entity_id,
            deleted = false
        } = req.query;

        // Build where clause
        const whereClause = {};

        // Handle search
        if (search) {
            whereClause[Op.or] = [
                { question: { [Op.like]: `%${search}%` } },
                { answer: { [Op.like]: `%${search}%` } }
            ];
        }

        // Handle entity filters
        if (entity_type) {
            whereClause.entity_type = entity_type;
        }
        if (entity_id) {
            whereClause.entity_id = entity_id;
        }

        // Calculate offset for pagination
        const offset = (page - 1) * limit;

        // Get total count for pagination
        const total = await FAQ.count({
            where: whereClause,
            paranoid: !deleted // If deleted is true, include soft-deleted items
        });

        // Get FAQs with pagination
        const faqs = await FAQ.findAll({
            where: whereClause,
            order: [[sort_by, order.toUpperCase()]],
            limit: parseInt(limit),
            offset: parseInt(offset),
            paranoid: !deleted // If deleted is true, include soft-deleted items
        });

        return successResponse(res, {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            results: faqs
        }, 'FAQs retrieved successfully');
    } catch (error) {
        logger.error('Get FAQs Error:', error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Get FAQ by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const getFaqById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const faq = await FAQ.findByPk(id);

        if (!faq) {
            return errorResponse(res, { message: 'FAQ not found' }, 'FAQ not found', 404);
        }

        return successResponse(res, faq, 'FAQ retrieved successfully');
    } catch (error) {
        logger.error('Get FAQ by ID Error:', error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Create new FAQ
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const createFaq = async (req, res, next) => {
    const transaction = await FAQ.sequelize.transaction();
    try {
        const { entity_type, entity_id, question, answer } = req.body;
        const { id: updated_by } = req.user;

        const faq = await FAQ.create({
            entity_type,
            entity_id,
            question,
            answer,
            updated_by
        }, { transaction });

        await transaction.commit();
        return successResponse(res, faq, 'FAQ created successfully', 201);
    } catch (error) {
        await transaction.rollback();
        logger.error('Create FAQ Error:', error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Update FAQ
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const updateFaq = async (req, res, next) => {
    const transaction = await FAQ.sequelize.transaction();
    try {
        const { id } = req.params;
        const { entity_type, entity_id, question, answer } = req.body;
        const { id: updated_by } = req.user;

        const faq = await FAQ.findByPk(id);
        if (!faq) {
            await transaction.rollback();
            return errorResponse(res, { message: 'FAQ not found' }, 'FAQ not found', 404);
        }

        await faq.update({
            entity_type,
            entity_id,
            question,
            answer,
            updated_by
        }, { transaction });

        await transaction.commit();
        return successResponse(res, faq, 'FAQ updated successfully');
    } catch (error) {
        await transaction.rollback();
        logger.error('Update FAQ Error:', error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Delete FAQ
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const deleteFaq = async (req, res, next) => {
    const transaction = await FAQ.sequelize.transaction();
    try {
        const { id } = req.params;
        const faq = await FAQ.findByPk(id);

        if (!faq) {
            await transaction.rollback();
            return errorResponse(res, { message: 'FAQ not found' }, 'FAQ not found', 404);
        }

        await faq.destroy({ transaction });

        await transaction.commit();
        return successResponse(res, null, 'FAQ deleted successfully');
    } catch (error) {
        await transaction.rollback();
        logger.error('Delete FAQ Error:', error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Restore a soft-deleted FAQ
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const restoreFaq = async (req, res, next) => {
    const transaction = await FAQ.sequelize.transaction();
    try {
        const { id } = req.params;
        const { id: updated_by } = req.user;

        const faq = await FAQ.findOne({
            where: { id },
            paranoid: false // Include soft-deleted records
        });

        if (!faq) {
            await transaction.rollback();
            return errorResponse(res, { message: 'FAQ not found' }, 'FAQ not found', 404);
        }

        if (!faq.deletedAt) {
            await transaction.rollback();
            return errorResponse(res, { message: 'FAQ is not deleted' }, 'FAQ is not deleted', 400);
        }

        await faq.restore({ transaction });
        await faq.update({ updated_by }, { transaction });

        await transaction.commit();
        return successResponse(res, faq, 'FAQ restored successfully');
    } catch (error) {
        await transaction.rollback();
        logger.error('Restore FAQ Error:', error);
        return errorResponse(res, error, error.message);
    }
};

module.exports = {
    getFaqs,
    getFaqById,
    createFaq,
    updateFaq,
    deleteFaq,
    restoreFaq
}; 