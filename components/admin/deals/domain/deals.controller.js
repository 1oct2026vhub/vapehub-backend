'use strict';
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Deal, Product, SlugRelation, DealProduct } = require("../../../../models");
const { DEAL_TYPES } = require('../../../../config/constants');
const { Op } = require('sequelize');
const SlugManager = require('../../../../utils/slugManager');
const slugManager = new SlugManager(SlugRelation);

module.exports.createDeal = async (req, res, next) => {
    const transaction = await Deal.sequelize.transaction();
    try {
        const dealData = req.body;
        
        // Create the deal first
        const deal = await Deal.create(dealData, { transaction });
        
        // Create slug relation
        await slugManager.createOrUpdateSlug(deal.name, 'deal', deal.id, transaction);
        
        // Fetch the complete deal with associations
        const createdDeal = await Deal.findByPk(deal.id, {
            include: [
                {
                    model: Product,
                    as: 'products',
                    attributes: ['id', 'name', 'slug'],
                    required: false
                }
            ],
            transaction
        });

        await transaction.commit();
        successResponse(res, createdDeal, 'Deal created successfully', 201);
    } catch (error) {
        await transaction.rollback();
        console.log(error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.updateDeal = async (req, res, next) => {
    const transaction = await Deal.sequelize.transaction();
    try {
        const { id } = req.params;
        const dealData = req.body;

        const deal = await Deal.findByPk(id, { transaction });
        if (!deal) {
            await transaction.rollback();
            const error = new Error('Deal not found');
            error.statusCode = 404;
            throw error;
        }

        // Update the deal
        await deal.update(dealData, { transaction });

        // Update slug if name has changed
        if (dealData.name && dealData.name !== deal.name || dealData.slug && dealData.slug !== deal.slug) {
            await slugManager.createOrUpdateSlug(dealData.name, 'deal', id, transaction);
        }

        // Fetch the updated deal with associations
        const updatedDeal = await Deal.findByPk(id, {
            include: [
                {
                    model: Product,
                    as: 'products',
                    attributes: ['id', 'name', 'slug'],
                    required: false
                }
            ],
            transaction
        });

        await transaction.commit();
        successResponse(res, updatedDeal, 'Deal updated successfully');
    } catch (error) {
        await transaction.rollback();
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
                    attributes: ['id', 'name', 'slug'],
                    required: false
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

module.exports.addProductsToDeal = async (req, res, next) => {
    const transaction = await Deal.sequelize.transaction();
    try {
        const { id } = req.params;
        const { product_ids } = req.body;

        // Find the deal
        const deal = await Deal.findByPk(id, { transaction });
        if (!deal) {
            await transaction.rollback();
            const error = new Error('Deal not found');
            error.statusCode = 404;
            throw error;
        }

        // Verify all products exist
        const products = await Product.findAll({
            where: {
                id: {
                    [Op.in]: product_ids
                }
            },
            transaction
        });

        if (products.length !== product_ids.length) {
            await transaction.rollback();
            const error = new Error('One or more products not found');
            error.statusCode = 400;
            throw error;
        }

        // Create deal products
        const dealProducts = product_ids.map(product_id => ({
            deal_id: id,
            product_id
        }));

        await DealProduct.bulkCreate(dealProducts, {
            transaction,
            ignoreDuplicates: true
        });

        // Fetch updated deal with products
        const updatedDeal = await Deal.findByPk(id, {
            include: [
                {
                    model: Product,
                    as: 'products',
                    attributes: ['id', 'name', 'slug'],
                    required: false
                }
            ],
            transaction
        });

        await transaction.commit();
        successResponse(res, updatedDeal, 'Products added to deal successfully');
    } catch (error) {
        await transaction.rollback();
        return errorResponse(res, error, error.message);
    }
};

module.exports.addProductToDeals = async (req, res) => {
    const transaction = await Deal.sequelize.transaction();
    try {
        const { productId } = req.params;
        const { deal_ids } = req.body;

        // Verify product exists
        const product = await Product.findByPk(productId);
        if (!product) {
            await transaction.rollback();
            return res.status(404).json({
                status: 'error',
                message: 'Product not found'
            });
        }

        // Verify all deals exist
        const deals = await Deal.findAll({
            where: {
                id: deal_ids
            }
        });

        if (deals.length !== deal_ids.length) {
            await transaction.rollback();
            return res.status(400).json({
                status: 'error',
                message: 'One or more deals not found'
            });
        }

        // Create deal products
        const dealProducts = deal_ids.map(deal_id => ({
            deal_id,
            product_id: productId
        }));

        await DealProduct.bulkCreate(dealProducts, {
            transaction,
            ignoreDuplicates: true
        });

        // Fetch the product with its updated deals
        const updatedProduct = await Product.findByPk(productId, {
            include: [{
                model: Deal,
                as: 'deals'
            }],
            transaction
        });

        await transaction.commit();

        res.status(200).json({
            status: 'success',
            message: 'Product added to deals successfully',
            data: updatedProduct
        });
    } catch (error) {
        await transaction.rollback();
        console.error('Error adding product to deals:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to add product to deals',
            error: error.message
        });
    }
};

