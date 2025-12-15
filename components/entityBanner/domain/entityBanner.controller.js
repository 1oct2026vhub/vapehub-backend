'use strict';
const { EntityBanner } = require('../../../models');
const { errorResponse, successResponse } = require('../../../utils/responseUtils');
const { Op } = require('sequelize');

/**
 * Enforce maximum 3 banners per type.
 * If excludeId is provided, it will be ignored from the count (useful for updates).
 */
const assertMaxPerType = async (type, excludeId = null) => {
    const where = { type };
    if (excludeId) {
        where.id = { [Op.ne]: excludeId };
    }
    const currentCount = await EntityBanner.count({ where });
    if (currentCount >= 3) {
        const error = new Error(`Maximum 3 banners allowed for type "${type}"`);
        error.statusCode = 422;
        throw error;
    }
};

module.exports.listEntityBanners = async (req, res) => {
    try {
        const { page = 1, limit = 10, type, brand_id, category_id, deals_id } = req.query;
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
        const offset = (pageNum - 1) * limitNum;

        const where = {};
        if (type) where.type = type;
        if (brand_id) where.brand_id = brand_id;
        if (category_id) where.category_id = category_id;
        if (deals_id) where.deals_id = deals_id;

        const { rows, count } = await EntityBanner.findAndCountAll({
            where,
            order: [['order', 'ASC'], ['createdAt', 'DESC']],
            limit: limitNum,
            offset
        });

        return successResponse(res, {
            entityBanners: rows,
            pagination: {
                total: count,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(count / limitNum) || 1
            }
        }, 'Entity banners retrieved successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.getEntityBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const entityBanner = await EntityBanner.findByPk(id);
        if (!entityBanner) {
            return errorResponse(res, { statusCode: 404 }, 'Entity banner not found');
        }
        return successResponse(res, entityBanner, 'Entity banner retrieved successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.createEntityBanner = async (req, res) => {
    try {
        const { type, brand_id, category_id, deals_id, image, alt, url, order = 0 } = req.body;

        await assertMaxPerType(type);

        const entityBanner = await EntityBanner.create({
            type,
            brand_id,
            category_id,
            deals_id,
            image,
            alt,
            url,
            order
        });

        return successResponse(res, entityBanner, 'Entity banner created successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.updateEntityBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const { type, brand_id, category_id, deals_id, image, alt, url, order } = req.body;

        const entityBanner = await EntityBanner.findByPk(id);
        if (!entityBanner) {
            return errorResponse(res, { statusCode: 404 }, 'Entity banner not found');
        }

        const newType = type ?? entityBanner.type;
        await assertMaxPerType(newType, entityBanner.id);

        await entityBanner.update({
            type: newType,
            brand_id: brand_id ?? entityBanner.brand_id,
            category_id: category_id ?? entityBanner.category_id,
            deals_id: deals_id ?? entityBanner.deals_id,
            image: image ?? entityBanner.image,
            alt: alt ?? entityBanner.alt,
            url: url ?? entityBanner.url,
            order: order ?? entityBanner.order
        });

        return successResponse(res, entityBanner, 'Entity banner updated successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.deleteEntityBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const entityBanner = await EntityBanner.findByPk(id);
        if (!entityBanner) {
            return errorResponse(res, { statusCode: 404 }, 'Entity banner not found');
        }
        await entityBanner.destroy();
        return successResponse(res, {}, 'Entity banner deleted successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};
