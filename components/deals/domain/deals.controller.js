const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Deal, Product, DealProduct, Category, Brand, ProductCategory, ProductBrand } = require("../../../models");
const { fetchProductsListing } = require("../../product/helper/product.helper");
const { Op } = require("sequelize");

module.exports.getDealBySlug = async (req, res, next) => {
    try {
        const { productId } = req.query;

        if (productId) {
            // Get category ID for this product
            const productCategory = await ProductCategory.findOne({
                where: { product_id: productId },
                include: [{
                    model: Category,
                    as: 'Category',
                    attributes: ['id']
                }]
            });

            // Get brand ID for this product
            const productBrand = await ProductBrand.findOne({
                where: { product_id: productId },
                include: [{
                    model: Brand,
                    as: 'Brand',
                    attributes: ['id']
                }]
            });

            // Set category and brand IDs from the product for fetchProducts
            if (productCategory?.Category?.id) {
                req.query.categories = `${productCategory.Category.id}`;
            }
            if (productBrand?.Brand?.id) {
                req.query.brand = `${productBrand.Brand.id}`;
            }
            req.query.source = 'product';
        } else {
            // Original logic when no productId is provided
            const deal = await Deal.findOne({ 
                where: { 
                    slug: req.params.slug,
                    is_active: true,
                    is_deleted: false,
                    valid_from: { [Op.lte]: new Date() },
                    valid_to: { [Op.gte]: new Date() }
                } 
            });
            
            if (!deal) {
                throw {
                    message: "Deal not found or not active",
                    statusCode: 400,
                };
            }
            req.query.deal_id = `${deal.id}`;
            req.query.source = 'deal';
        }
        
        const {additionalData, products, brand_items, category_items, attributes, price_ranges, pagination } = await fetchProductsListing(req.query);

        return successResponse(res, { 
            ...additionalData,
            products,
            brand: brand_items, 
            category: category_items,
            attributes,
            price_ranges,
            pagination
        }, "Success");
    } catch (error) {
        console.log("🚀 ~ module.exports.getDealBySlug= ~ error:", error)
        return errorResponse(res, error, error.message);
    }
}

module.exports.listAllDeals = async (req, res, next) => {
    try {
        const { show_home_page } = req.query;
        
        // Build where clause
        const whereClause = {
            is_active: true,
            is_deleted: false,
            valid_from: { [Op.lte]: new Date() },
            valid_to: { [Op.gte]: new Date() }
        };
        
        // Add show_home_page filter if provided
        if (show_home_page !== undefined) {
            whereClause.show_home_page = show_home_page === 'true' || show_home_page === true;
        }
        
        const deals = await Deal.findAll({
            where: whereClause,
            attributes: [
                'id', 
                'name', 
                'slug',
                'description',
                'deal_type', 
                'required_qty', 
                'get_qty', 
                'fixed_price', 
                'discount_percent', 
                'tiered_qty_json',
                'bundle_product_ids_json',
                'valid_from',
                'valid_to',
                'image_url',
                'alt_text',
                'createdAt',
                'updatedAt'
            ],
            order: [['createdAt', 'DESC']]
        });
        successResponse(res, deals, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

module.exports.getDealById = async (req, res, next) => {
    try {
        const deal = await Deal.findOne({
            where: { 
                id: req.params.id,
                is_active: true,
                is_deleted: false,
                valid_from: { [Op.lte]: new Date() },
                valid_to: { [Op.gte]: new Date() }
            },
            attributes: [
                'id', 
                'name', 
                'slug',
                'description',
                'deal_type', 
                'required_qty', 
                'get_qty', 
                'fixed_price', 
                'discount_percent', 
                'tiered_qty_json',
                'bundle_product_ids_json',
                'valid_from',
                'valid_to',
                'image_url',
                'createdAt',
                'updatedAt'
            ]
        });
        
        if (!deal) {
            throw {
                message: "Deal not found or not active",
                statusCode: 400,
            }
        }
        successResponse(res, deal, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
} 