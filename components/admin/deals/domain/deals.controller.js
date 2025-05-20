'use strict';
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Deal, Product } = require("../../../../models");
const { DEAL_TYPES } = require('../../../../config/constants');
const { Op } = require('sequelize');

module.exports.createDeal = async (req, res, next) => {
    try {
        const dealData = req.body;
        const deal = await Deal.create(dealData);

        if (dealData.productIds && dealData.productIds.length > 0) {
            await deal.setProducts(dealData.productIds);
        }

        successResponse(res, deal, 'Deal created successfully', 201);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.updateDeal = async (req, res, next) => {
    try {
        const { id } = req.params;
        const dealData = req.body;

        const deal = await Deal.findByPk(id);
        if (!deal) {
            const error = new Error('Deal not found');
            error.statusCode = 404;
            throw error;
        }

        await deal.update(dealData);

        if (dealData.productIds) {
            await deal.setProducts(dealData.productIds);
        }

        successResponse(res, deal, 'Deal updated successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.listDeals = async (req, res, next) => {
    try {
        const { 
            status, 
            type, 
            validNow,
            page = 1,
            limit = 10
        } = req.query;

        const offset = (page - 1) * limit;
        let whereCondition = {};

        if (status !== undefined) {
            whereCondition.is_active = status === 'true';
        }

        if (type) {
            whereCondition.deal_type = type;
        }

        if (validNow === 'true') {
            const now = new Date();
            whereCondition.valid_from = { [Op.lte]: now };
            whereCondition.valid_to = { [Op.gte]: now };
        }

        const { count, rows: deals } = await Deal.findAndCountAll({
            where: whereCondition,
            include: [
                {
                    model: Product,
                    as: 'products',
                    attributes: ['id', 'name', 'slug']
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        const response = {
            deals,
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit),
                total_pages: Math.ceil(count / limit)
            }
        };

        successResponse(res, response, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.getDeal = async (req, res, next) => {
    try {
        const { id } = req.params;

        const deal = await Deal.findByPk(id, {
            include: [
                {
                    model: Product,
                    as: 'products',
                    attributes: ['id', 'name', 'slug']
                }
            ]
        });

        if (!deal) {
            const error = new Error('Deal not found');
            error.statusCode = 404;
            throw error;
        }

        successResponse(res, deal, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.getDealsByProduct = async (req, res, next) => {
    try {
        const { productId } = req.params;

        const deals = await Deal.findAll({
            include: [
                {
                    model: Product,
                    as: 'products',
                    where: { id: productId },
                    attributes: ['id', 'name', 'slug']
                }
            ],
            where: {
                is_active: true,
                valid_from: { [Op.lte]: new Date() },
                valid_to: { [Op.gte]: new Date() }
            }
        });

        successResponse(res, deals, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.deleteDeal = async (req, res, next) => {
    try {
        const { id } = req.params;

        const deal = await Deal.findByPk(id);
        if (!deal) {
            const error = new Error('Deal not found');
            error.statusCode = 404;
            throw error;
        }

        await deal.destroy();
        successResponse(res, null, 'Deal deleted successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.restoreDeal = async (req, res, next) => {
    try {
        const { id } = req.params;

        const deal = await Deal.findByPk(id, { paranoid: false });
        if (!deal) {
            const error = new Error('Deal not found');
            error.statusCode = 404;
            throw error;
        }

        if (!deal.deletedAt) {
            const error = new Error('Deal is not deleted');
            error.statusCode = 400;
            throw error;
        }

        await deal.restore();
        successResponse(res, deal, 'Deal restored successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.getDealTypes = async (req, res, next) => {
    try {
        successResponse(res, DEAL_TYPES, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};
