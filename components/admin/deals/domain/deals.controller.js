'use strict';
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Deal, Product, SlugRelation, DealProduct, ProductVariant } = require("../../../../models");
const { DEAL_TYPES } = require('../../../../config/constants');
const { Op } = require('sequelize');
const SlugManager = require('../../../../utils/slugManager');
const slugManager = new SlugManager(SlugRelation);
const { uploadFiletToS3, generateUniqueFileName } = require('../../../../library/s3');

module.exports.createDeal = async (req, res, next) => {
    const transaction = await Deal.sequelize.transaction();
    try {
        const dealData = req.body;
        
        // Handle image upload if file is provided
        if (req.file) {
            try {
                const fileName = generateUniqueFileName(req.file.originalname);
                const key = `deals/${fileName}`;
                
                const uploadParams = {
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: key,
                    Body: req.file.buffer,
                    ContentType: req.file.mimetype
                    // Removed ACL as the bucket doesn't support it
                };
                
                const uploadResult = await uploadFiletToS3(uploadParams);
                if (uploadResult && uploadResult.Location) {
                    dealData.image_url = uploadResult.Location;
                } else {
                    throw new Error('Upload failed - no location returned');
                }
            } catch (uploadError) {
                console.error('Image upload error:', uploadError);
                const error = new Error('Failed to upload image');
                error.statusCode = 500;
                throw error;
            }
        }
        
        // Validate bundle product IDs if deal type is BUNDLE
        if (dealData.deal_type === DEAL_TYPES.BUNDLE) {
            if (!dealData.bundle_product_ids_json || !Array.isArray(dealData.bundle_product_ids_json) || dealData.bundle_product_ids_json.length === 0) {
                const error = new Error('Bundle deals must have at least one product ID');
                error.statusCode = 400;
                throw error;
            }
        }
        
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

        // Handle image upload if file is provided
        if (req.file) {
            try {
                const fileName = generateUniqueFileName(req.file.originalname);
                const key = `deals/${fileName}`;
                
                const uploadParams = {
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: key,
                    Body: req.file.buffer,
                    ContentType: req.file.mimetype
                    // Removed ACL as the bucket doesn't support it
                };
                
                const uploadResult = await uploadFiletToS3(uploadParams);
                if (uploadResult && uploadResult.Location) {
                    dealData.image_url = uploadResult.Location;
                } else {
                    throw new Error('Upload failed - no location returned');
                }
            } catch (uploadError) {
                console.error('Image upload error:', uploadError);
                const error = new Error('Failed to upload image');
                error.statusCode = 500;
                throw error;
            }
        }

        // Validate bundle product IDs if deal type is BUNDLE
        if (dealData.deal_type === DEAL_TYPES.BUNDLE || (deal.deal_type === DEAL_TYPES.BUNDLE && !dealData.deal_type)) {
            if (!dealData.bundle_product_ids_json || !Array.isArray(dealData.bundle_product_ids_json) || dealData.bundle_product_ids_json.length === 0) {
                const error = new Error('Bundle deals must have at least one product ID');
                error.statusCode = 400;
                throw error;
            }
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
            deleted,
            page = 1,
            limit = 10
        } = req.query;

        const offset = (page - 1) * limit;
        let whereCondition = {};
        let queryOptions = {
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
        };

        // Handle deleted filter
        if (deleted === 'true') {
            queryOptions.paranoid = false; // Include soft-deleted records
            whereCondition.deletedAt = { [Op.ne]: null }; // Only deleted records
        } else if (deleted === 'false') {
            whereCondition.deletedAt = null; // Only non-deleted records
        }

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

        // Get total count without includes for accurate pagination
        const countQuery = {
            where: whereCondition,
            paranoid: queryOptions.paranoid
        };
        const totalCount = await Deal.count(countQuery);

        // Calculate pagination values
        const currentPage = parseInt(page);
        const pageLimit = parseInt(limit);
        const totalPages = Math.ceil(totalCount / pageLimit);



        // If page is beyond total pages, return empty result with proper pagination info
        if (currentPage > totalPages) {
            const response = {
                deals: [],
                pagination: {
                    total: totalCount,
                    page: currentPage,
                    limit: pageLimit,
                    total_pages: totalPages,
                    has_next: false,
                    has_prev: currentPage > 1
                }
            };
            return successResponse(res, response, 'Success');
        }

        // Get paginated data with includes
        const deals = await Deal.findAll(queryOptions);

        const response = {
            deals,
            pagination: {
                total: totalCount,
                page: currentPage,
                limit: pageLimit,
                total_pages: totalPages,
                has_next: currentPage < totalPages,
                has_prev: currentPage > 1
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

        // Verify all products exist and check stock levels
        const products = await Product.findAll({
            where: {
                id: {
                    [Op.in]: product_ids
                }
            },
            include: [
                {
                    model: ProductVariant,
                    as: 'variants',
                    attributes: ['id', 'slug', 'stock', 'low_stock_threshold', 'stock_status']
                }
            ],
            transaction
        });

        if (products.length !== product_ids.length) {
            await transaction.rollback();
            const error = new Error('One or more products not found');
            error.statusCode = 400;
            throw error;
        }

        // Check if any products are already in other deals
        const existingDealProducts = await DealProduct.findAll({
            where: {
                product_id: {
                    [Op.in]: product_ids
                }
            },
            include: [{
                model: Deal,
                as: 'deal',
                attributes: ['id', 'name', 'slug']
            }],
            transaction
        });

        if (existingDealProducts.length > 0) {
            await transaction.rollback();
            const error = new Error('One or more products are already in deals');
            error.statusCode = 400;
            error.data = {
                products_already_in_deals: existingDealProducts.map(dp => ({
                    product_id: dp.product_id,
                    existing_deal: {
                        id: dp.deal.id,
                        name: dp.deal.name,
                        slug: dp.deal.slug
                    }
                }))
            };
            throw error;
        }

        // Check stock levels for each product
        const stockIssues = [];
        
        for (const product of products) {
            // Initialize stock issue object for this product
            const stockIssue = {
                product_id: product.id,
                product_name: product.name,
                issue: ''
            };

            // Check product-level stock first (highest priority)
            if (product.stock_quantity !== null && product.stock_quantity <= 0) {
                stockIssue.issue = 'Product is out of stock';
                stockIssue.stock_level = product.stock_quantity;
            }

            // Check variants stock levels only if product is not out of stock
            if (product.variants && product.variants.length > 0 && !stockIssue.issue) {
                const outOfStockVariants = product.variants.filter(v => v.stock <= 0);
                const lowStockVariants = product.variants.filter(v => 
                    v.stock > 0 && v.stock <= v.low_stock_threshold
                );

                if (outOfStockVariants.length > 0) {
                    stockIssue.issue = 'Product has out of stock variants';
                    stockIssue.out_of_stock_variants = outOfStockVariants.length;
                    stockIssue.total_variants = product.variants.length;
                    stockIssue.out_of_stock_variant_details = outOfStockVariants.map(v => ({
                        variant_id: v.id,
                        variant_slug: v.slug,
                        stock: v.stock,
                        low_stock_threshold: v.low_stock_threshold,
                        message: 'Variant is out of stock'
                    }));

                    // If there are also low stock variants, include them
                    if (lowStockVariants.length > 0) {
                        stockIssue.low_stock_variants = lowStockVariants.length;
                        stockIssue.low_stock_variant_details = lowStockVariants.map(v => ({
                            variant_id: v.id,
                            variant_slug: v.slug,
                            stock: v.stock,
                            low_stock_threshold: v.low_stock_threshold,
                            message: 'Variant is low in stock'
                        }));
                    }
                } else if (lowStockVariants.length > 0) {
                    stockIssue.issue = 'Product has low stock variants';
                    stockIssue.low_stock_variants = lowStockVariants.length;
                    stockIssue.total_variants = product.variants.length;
                    stockIssue.low_stock_variant_details = lowStockVariants.map(v => ({
                        variant_id: v.id,
                        variant_slug: v.slug,
                        stock: v.stock,
                        low_stock_threshold: v.low_stock_threshold,
                        message: 'Variant is low in stock'
                    }));
                }
            }

            // Only add to stockIssues if there are actual issues
            if (stockIssue.issue) {
                stockIssues.push(stockIssue);
            }
        }

        // If there are stock issues, return them as warnings but still proceed
        if (stockIssues.length > 0) {
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
            
            return res.status(200).json({
                status: 'success',
                message: 'Products added to deal successfully with stock warnings',
                data: updatedDeal,
                warnings: {
                    stock_issues: stockIssues,
                    message: 'Some products have stock issues. Please review inventory levels.'
                }
            });
        }

        // Create deal products (no stock issues)
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
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        return errorResponse(res, error, error.message);
    }
};

module.exports.addProductToDeals = async (req, res) => {
    const transaction = await Deal.sequelize.transaction();
    try {
        const { productId } = req.params;
        const { deal_ids } = req.body;

        // Verify product exists and check stock levels
        const product = await Product.findByPk(productId, {
            include: [
                {
                    model: ProductVariant,
                    as: 'variants',
                    attributes: ['id', 'slug', 'stock', 'low_stock_threshold', 'stock_status']
                }
            ],
            transaction
        });
        
        if (!product) {
            await transaction.rollback();
            return res.status(404).json({
                status: 'error',
                message: 'Product not found'
            });
        }

        // Check stock levels for the product
        const stockIssues = [];
        
        // Initialize stock issue object for this product
        const stockIssue = {
            product_id: product.id,
            product_name: product.name,
            issue: ''
        };

        // Check product-level stock first (highest priority)
        if (product.stock_quantity !== null && product.stock_quantity <= 0) {
            stockIssue.issue = 'Product is out of stock';
            stockIssue.stock_level = product.stock_quantity;
        }

        // Check variants stock levels only if product is not out of stock
        if (product.variants && product.variants.length > 0 && !stockIssue.issue) {
            const outOfStockVariants = product.variants.filter(v => v.stock <= 0);
            const lowStockVariants = product.variants.filter(v => 
                v.stock > 0 && v.stock <= v.low_stock_threshold
            );

            if (outOfStockVariants.length > 0) {
                stockIssue.issue = 'Product has out of stock variants';
                stockIssue.out_of_stock_variants = outOfStockVariants.length;
                stockIssue.total_variants = product.variants.length;
                stockIssue.out_of_stock_variant_details = outOfStockVariants.map(v => ({
                    variant_id: v.id,
                    variant_slug: v.slug,
                    stock: v.stock,
                    low_stock_threshold: v.low_stock_threshold,
                    message: 'Variant is out of stock'
                }));

                // If there are also low stock variants, include them
                if (lowStockVariants.length > 0) {
                    stockIssue.low_stock_variants = lowStockVariants.length;
                    stockIssue.low_stock_variant_details = lowStockVariants.map(v => ({
                        variant_id: v.id,
                        variant_slug: v.slug,
                        stock: v.stock,
                        low_stock_threshold: v.low_stock_threshold,
                        message: 'Variant is low in stock'
                    }));
                }
            } else if (lowStockVariants.length > 0) {
                stockIssue.issue = 'Product has low stock variants';
                stockIssue.low_stock_variants = lowStockVariants.length;
                stockIssue.total_variants = product.variants.length;
                stockIssue.low_stock_variant_details = lowStockVariants.map(v => ({
                    variant_id: v.id,
                    variant_slug: v.slug,
                    stock: v.stock,
                    low_stock_threshold: v.low_stock_threshold,
                    message: 'Variant is low in stock'
                }));
            }
        }

        // Only add to stockIssues if there are actual issues
        if (stockIssue.issue) {
            stockIssues.push(stockIssue);
        }

        // Verify all deals exist
        const deals = await Deal.findAll({
            where: {
                id: deal_ids
            },
            transaction
        });

        if (deals.length !== deal_ids.length) {
            await transaction.rollback();
            return res.status(400).json({
                status: 'error',
                message: 'One or more deals not found'
            });
        }

        // Check if product is already in any deal
        const existingDealProduct = await DealProduct.findOne({
            where: {
                product_id: productId
            },
            include: [{
                model: Deal,
                as: 'deal',
                attributes: ['id', 'name', 'slug']
            }],
            transaction
        });

        if (existingDealProduct) {
            await transaction.rollback();
            return res.status(400).json({
                status: 'error',
                message: 'Product is already in a deal',
                data: {
                    existing_deal: {
                        id: existingDealProduct.deal.id,
                        name: existingDealProduct.deal.name,
                        slug: existingDealProduct.deal.slug
                    },
                    product_id: productId,
                    product_name: product.name
                }
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

        // Return response with stock warnings if any
        if (stockIssues.length > 0) {
            return res.status(200).json({
                status: 'success',
                message: 'Product added to deals successfully with stock warnings',
                data: updatedProduct,
                warnings: {
                    stock_issues: stockIssues,
                    message: 'Product has stock issues. Please review inventory levels.'
                }
            });
        }

        res.status(200).json({
            status: 'success',
            message: 'Product added to deals successfully',
            data: updatedProduct
        });
    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        console.error('Error adding product to deals:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to add product to deals',
            error: error.message
        });
    }
};

module.exports.removeProductsFromDeal = async (req, res, next) => {
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

        // Remove the specified products from the deal
        await DealProduct.destroy({
            where: {
                deal_id: id,
                product_id: {
                    [Op.in]: product_ids
                }
            },
            transaction
        });

        // Fetch updated deal with remaining products
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
        successResponse(res, updatedDeal, 'Products removed from deal successfully');
    } catch (error) {
        await transaction.rollback();
        return errorResponse(res, error, error.message);
    }
};

