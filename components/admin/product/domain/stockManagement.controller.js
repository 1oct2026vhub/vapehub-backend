const { ProductVariant, StockMovement, Product } = require('../../../../models');
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Sequelize } = require('sequelize');
const logger = require("../../../../library/logger");


module.exports.addStock = async (req, res) => {
    const { variant_id, quantity } = req.body;
    const { id: updated_by } = req.user;

    // Validate input
    if (!variant_id || typeof quantity !== 'number' || quantity <= 0) {
        return errorResponse(res, { message: "Variant ID is required and quantity must be a positive number." }, "Validation Error", 400);
    }

    const transaction = await ProductVariant.sequelize.transaction();
    try {
        // Create stock movement and update product variant stock within the transaction
        const movement = await StockMovement.createMovement({
            variant_id,
            change_type: 'addition',
            quantity,
            updated_by
        }, { transaction });


        await transaction.commit();
        return successResponse(res, movement, "Stock added successfully", 201);
    } catch (error) {
        await transaction.rollback();
        logger.error(`Error adding stock: ${error.message}`);
        return errorResponse(res, error, error.message);
    }
};

module.exports.removeStock = async (req, res) => {
    const { variant_id, quantity } = req.body;
    const { id: updated_by } = req.user;

    // Validate input
    if (!variant_id || !quantity) {
        return errorResponse(res, { message: "Variant ID and quantity are required." }, "Validation Error", 400);
    }

    const transaction = await ProductVariant.sequelize.transaction();
    try {
        // Create stock movement and update product variant stock within the transaction
        const movement = await StockMovement.createMovement({
            variant_id,
            change_type: 'deduction',
            quantity,
            updated_by
        }, { transaction });

        await transaction.commit();
        return successResponse(res, movement, "Stock removed successfully", 200);
    } catch (error) {
        await transaction.rollback();
        logger.error(`Error removing stock: ${error.message}`);
        return errorResponse(res, error, error.message);
    }
};

module.exports.getStockHistories = async (req, res) => {
    try {
        // Destructure and validate query parameters
        const {
            limit = 10,
            page = 1,
            sort_by = 'id', // Default sorting field
            order = 'ASC',  // Default sorting order
            search,
            product_id,
            product_name,
            stock,
            stock_status
        } = req.query;

        // Parse limit and page to integers
        const parsedLimit = Math.max(1, parseInt(limit, 10)); // Ensure limit is at least 1
        const parsedPage = Math.max(1, parseInt(page, 10)); // Ensure page is at least 1

        // Validate order parameter
        const validOrder = ['ASC', 'DESC'].includes(order.toUpperCase()) ? order.toUpperCase() : 'ASC';

        // Build sorting order dynamically
        const sortingOrder = [[sort_by, validOrder]];

        // Build the where clause for StockMovement
        const whereClause = {
            ...(req.params.variant_id && { variant_id: req.params.variant_id }),
        };

        // Search Conditions: Ensure correct aliasing for product inside variant
        const searchConditions = search ? {
            [Sequelize.Op.or]: [
                { '$variant.slug$': { [Sequelize.Op.like]: `%${search}%` } },
                { '$variant.product.slug$': { [Sequelize.Op.like]: `%${search}%` } },
                { '$variant.product.name$': { [Sequelize.Op.like]: `%${search}%` } }
            ]
        } : {};

        // Fetch stock histories with includes
        const stockHistories = await StockMovement.findAll({
            where: {
                ...whereClause,
                ...searchConditions 
            },
            order: sortingOrder, 
            limit: parsedLimit,
            offset: (parsedPage - 1) * parsedLimit,
            include: [
                {
                    model: ProductVariant,
                    as: 'variant',
                    attributes: ['id', 'stock_status', 'slug'], 
                    where: {
                        ...(stock_status && { stock_status }), 
                        ...(stock && { stock_quantity: stock }),
                    },
                    include: [
                        {
                            model: Product,
                            as: 'product', 
                            attributes: ['id', 'name', 'slug'],
                            where: {
                                ...(product_id && { id: product_id }),
                                ...(product_name && { name: { [Sequelize.Op.like]: `%${product_name}%` } }), 
                            }
                        }
                    ]
                }
            ],
        });

        // Check if any stock histories were found
        if (stockHistories.length === 0) {
            return successResponse(res, [], "No stock histories found");
        }

        // Return the retrieved stock histories
        return successResponse(res, stockHistories, "Stock history retrieved successfully");
    } catch (error) {
        logger.error(`Error retrieving stock histories: ${error.message}`);
        return errorResponse(res, error, error.message);
    }
};
