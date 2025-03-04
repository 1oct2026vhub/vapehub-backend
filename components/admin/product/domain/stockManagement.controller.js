const { ProductVariant, StockMovement } = require('../../../../models');
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Sequelize } = require('sequelize');
const logger = require("../../../../library/logger");

module.exports.addStock = async (req, res) => {
    const transaction = await ProductVariant.sequelize.transaction();
    try {
        const { product_id, quantity } = req.body;
        const { id: updated_by } = req.user; // Authenticated user ID

        // Create stock movement within the transaction
        const movement = await StockMovement.createMovement({
            variant_id: product_id,
            change_type: 'addition',
            quantity,
            updated_by
        }, { transaction });

        // Update product variant stock within the transaction
        await ProductVariant.increment('stock', { by: quantity, where: { id: product_id }, transaction });

        await transaction.commit();
        return successResponse(res, movement, "Stock added successfully", 201);
    } catch (error) {
        await transaction.rollback();
        logger.error(`Error adding stock: ${error.message}`);
        return errorResponse(res, error, error.message);
    }
};

module.exports.removeStock = async (req, res) => {
    const transaction = await ProductVariant.sequelize.transaction();
    try {
        const { product_id, quantity } = req.body;
        const { id: created_by } = req.user; // Authenticated user ID

        // Create stock movement within the transaction
        const movement = await StockMovement.createMovement({
            variant_id: product_id,
            change_type: 'deduction',
            quantity,
            created_by
        }, { transaction });

        // Update product variant stock within the transaction
        await ProductVariant.decrement('stock', { by: quantity, where: { id: product_id }, transaction });

        await transaction.commit();
        return successResponse(res, movement, "Stock removed successfully", 201);
    } catch (error) {
        await transaction.rollback();
        logger.error(`Error removing stock: ${error.message}`);
        return errorResponse(res, error, error.message);
    }
};

module.exports.getStockHistories = async (req, res) => {
    try {
        const { limit = 10, page = 1, order = [['created_at', 'DESC']], search } = req.query;

        // Extract filter parameters
        const { product_id, product_name, variant_name, stock, stock_status } = req.query;

        const stockHistories = await StockMovement.findAll({
            where: {
                ...(req.params.variant_id && { variant_id: req.params.variant_id }), // Assuming variant_id is passed in the request
                ...(search && { '$variant.name$': { [Sequelize.Op.like]: `%${search}%` } })
            },
            order,
            limit: parseInt(limit, 10),
            offset: (page - 1) * limit,
            include: [
                {
                    model: ProductVariant,
                    as: 'variant',
                    attributes: ['id', 'name', 'stock_status'],
                    where: {
                        ...(product_id && { id: product_id }),
                        ...(variant_name && { name: variant_name }),
                        ...(stock_status && { stock_status }),
                        ...(stock && { stock_quantity: stock })
                    }
                },
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'stock_quantity'],
                    where: {
                        ...(product_name && { name: product_name }),
                    }
                }
            ]
        });

        if (stockHistories.length === 0) {
            return successResponse(res, [], "No stock histories found");
        }

        return successResponse(res, stockHistories, "Stock history retrieved successfully");
    } catch (error) {
        logger.error(`Error retrieving stock histories: ${error.message}`);
        return errorResponse(res, error, error.message);
    }
};

