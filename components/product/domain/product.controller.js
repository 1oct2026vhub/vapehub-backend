const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Product, Category, Brand, Flavor, ProductImage, ProductFlavor } = require("../../../models");
const { Sequelize, Op } = require("sequelize");
const logger = require("../../../library/logger")

module.exports.listAllproducts = async (req, res, next) => {
    try {
        const { sort_by = 'id', order = 'ASC', limit = 10, offset = 0, keyword, price_range, categories, brands, flavours,
            // bottle_size, nicotine_strength, nicotine_type, vg_ratio, vaping_style, coil_style, puff_count, battery_capacity, device_style, eliquid_capacity, pod_coil_style
        } = req.query;

        // Parse limit and offset as integers
        const parsedLimit = parseInt(limit);
        const parsedOffset = parseInt(offset);


        // Build the where clause for filtering
        let whereClause = {};

        if (keyword) {
            whereClause.name = { [Op.like]: `%${keyword}%` };
        }

        if (price_range) {
            const [minPrice, maxPrice] = price_range.split('-').map(Number);
            whereClause = {
                ...whereClause,
                [Op.or]: [
                    { price: { [Op.between]: [minPrice, maxPrice] } },
                    Sequelize.literal(`EXISTS (
                        SELECT 1 FROM ProductFlavors 
                        WHERE ProductFlavors.product_id = Product.id 
                        AND ProductFlavors.price BETWEEN ${minPrice ?? 0} ${maxPrice ? `AND ${maxPrice}` : ''}
                    )`)
                ]
            };
        }

        if (brands) {
            const brand_ids = brands.split(',').map(Number);
            whereClause.brand_id = { [Op.in]: brand_ids };
        }

        if (categories) {
            const categoryIds = categories.split(',').map(Number);
            whereClause.category_id = { [Op.in]: categoryIds };
        }

        if (flavours) {
            const flavorIds = flavours.split(',').map(Number);
            whereClause = {
                ...whereClause,
                [Op.and]: [
                    Sequelize.literal(`EXISTS (
                        SELECT 1 FROM ProductFlavors 
                        WHERE ProductFlavors.product_id = Product.id 
                        AND ProductFlavors.flavor_id IN (${flavorIds})
                    )`)
                ]
            };
        }

        const filterableFields = [
            'bottle_size', 'nicotine_strength', 'nicotine_type', 'vg_ratio',
            'vaping_style', 'coil_style', 'puff_count', 'battery_capacity',
            'device_style', 'eliquid_capacity', 'pod_coil_style', 'pod_fill_style',
            "is_new"
        ];

        filterableFields.forEach(field => {
            if (req.query[field]) {
                whereClause[field] = req.query[field];
            }
        });


        // Build the include clause for related models
        const includeClause = [
            { model: Category, as: 'Category' },
            { model: Brand, as: 'Brand' },
            { model: ProductImage, as: 'ProductImages' },
            {
                model: Flavor, as: 'Flavors', through: {
                    model: ProductFlavor,
                }
            }
        ];

        // If flavours are specified, filter by them
        if (flavours) {
            const flavorIds = flavours.split(',').map(Number);
            includeClause.push({
                model: Flavor,
                as: 'Flavors',
                where: { id: { [Op.in]: flavorIds } },
                through: { attributes: [] }
            });
        }

        // Fetch the total count of products matching the filters
        const totalCount = await Product.count({
            where: whereClause,
            include: includeClause,
            distinct: true // Ensure distinct counting for associations
        });

        // Calculate total pages
        const totalPages = Math.ceil(totalCount / parsedLimit);

        // Calculate current page
        const currentPage = Math.floor(parsedOffset / parsedLimit) + 1;

        const pagination = {
            total_count: totalCount,
            total_pages: totalPages,
            current_page: currentPage,
            limit: parsedLimit,
            offset: parsedOffset
        }

        // Fetch the products with the applied filters
        const products = await Product.findAll({
            where: whereClause,
            include: includeClause,
            order: [[sort_by, order]],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        return successResponse(res, { products, pagination }, 'Success');
    } catch (error) {
        logger.error(error)
        return errorResponse(res, error, error.message);
    }
}

module.exports.getProductByid = async (req, res, next) => {
    try {
        const product = await Product.findOne({
            where: { id: req.params.id }, include: [
                { model: Category, as: 'Category' },
                { model: Brand, as: 'Brand' },
                { model: ProductImage, as: 'ProductImages' },
                {
                    model: Flavor, as: 'Flavors', through: {
                        model: ProductFlavor,
                    }
                }
            ]
        });
        successResponse(res, product, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.createProduct = async (req, res, next) => {
    try {
        const { name, logo_url } = req.body;
        const { id: updated_by } = req.user
        const product = await Product.create({ name, logo_url, updated_by });
        successResponse(res, product, 'Product created successfully', 201);
    } catch (error) {
        logger.error(error)
        return errorResponse(res, error, error.message);
    }
}
module.exports.updateProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, logo_url } = req.body;
        const { id: updated_by } = req.user

        const product = await Product.findByPk(id);
        if (!product) {
            throw {
                statusCode: 404,
                message: 'Product not found'
            }
        }

        await product.update({
            ...(name && { name }),
            ...(logo_url && { logo_url }),
            ...(updated_by && { updated_by }),
        });
        successResponse(res, product, 'Product updated successfully',);
    } catch (error) {
        logger.error(error)
        return errorResponse(res, error, error.message);
    }

}
module.exports.deleteProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const product = await Product.findByPk(id);
        if (!product) {
            throw {
                statusCode: 404,
                message: 'Product not found'
            }
        }
        await product.destroy();
        successResponse(res, { message: 'Product deleted successfully' }, null, 204);
    } catch (error) {
        logger.error(error)
        return errorResponse(res, error, error.message);
    }
}