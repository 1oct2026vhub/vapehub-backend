const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { sequelize, Category, Product, ProductCategory, ProductBrand, Brand, ProductImage, ProductAttributeTerm, Attribute, AttributeTerm, ProductVariant, ProductVariantImage, ProductVariantAttribute, Deal, DealProduct } = require("../../../models");
const { fetchProducts } = require("../../product/helper/product.helper");
const { Sequelize, Op } = require("sequelize");
const { productVariants: { stockStatus } } = require("../../../config/constants");

// PRODUCTION: Cache removed to avoid PM2 multiple instance issues
// Performance impact is minimal (only 9-13ms difference)

module.exports.listAllcategories = async (req, res, next) => {
    try {
        const Categories = await Category.findAll({
            order: [['createdAt', 'DESC']]
        });
        successResponse(res, Categories, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.getCategoryByid = async (req, res, next) => {
    try {
        const category = await Category.findByPk(req.params.id);
        if (!category) {
            throw {
                message: "Category not found",
                statusCode: 400,
            }
        }
        successResponse(res, category, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}
module.exports.createCategory = async (req, res, next) => {
    try {
        const { name, logo_url, slug, description } = req.body;
        const { id: updated_by } = req.user;
        // check if category already exists
        const categoryExists = await Category.findOne({ where: { name } });
        if (categoryExists) {
            throw {
                message: "Category name already exists",
                statusCode: 400,
                errors: { name: "Category name already exists" },
            }
        }

        // Create new category
        const category = await Category.create({ name, logo_url, updated_by, slug, description });
        successResponse(res, category, 'Category created successfully', 201);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}
module.exports.updateCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, slug, logo_url, description } = req.body;
        const { id: updated_by } = req.user

        const category = await Category.findByPk(id);
        if (!category) {
            throw {
                statusCode: 404,
                message: 'Category not found'
            }
        }

        await category.update({
            ...(name && { name }),
            ...(slug && { slug }),
            ...(logo_url && { logo_url }),
            ...(updated_by && { updated_by }),
            ...(description && { description }),
            ...(description && { description }),
        });
        successResponse(res, category, 'Category updated successfully',);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.deleteCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const category = await Category.findByPk(id, { plain: true });
        if (!category) {
            throw {
                statusCode: 404,
                message: 'Category not found'
            }
        }
        await category.destroy({ force: true });
        successResponse(res, { message: 'Category deleted successfully' }, 'Category deleted successfully', 200);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

// Ultra-optimized function for fetching category products with minimal database hits and caching
const fetchCategoryProducts = async (categoryId, query) => {
    try {
        const {
            sort_by = 'id',
            order = 'ASC',
            limit = 10,
            offset = 0,
            is_new
        } = query;

        // Cache removed for production safety

        const parsedLimit = parseInt(limit);
        const parsedOffset = parseInt(offset);

        // Use raw SQL for maximum performance - single query approach
        // Note: is_new filtering is now handled in application logic for hybrid approach
        
        // Handle popularity sorting (order_count) - match getTrendingProducts logic
        const popularityJoin = sort_by === 'order_count' ? `
            LEFT JOIN (
                SELECT 
                    oi.product_id,
                    COUNT(DISTINCT o.id) AS order_count
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                WHERE o.createdAt >= DATE_SUB(NOW(), INTERVAL 1 MONTH)
                AND o.status NOT IN ('cancelled', 'refunded')
                GROUP BY oi.product_id
            ) order_stats ON p.id = order_stats.product_id` : '';
        
        const productsQuery = `
            SELECT 
                p.id, p.updated_by, p.name, p.slug, p.price, p.discount_price,
                p.stock_quantity, p.puff_count, p.is_new, p.battery_capacity,
                p.coil_style, p.device_style, p.eliquid_capacity, p.pod_coil_style,
                p.pod_fill_style, p.power_supply, p.nicotine_strength, p.nicotine_type,
                p.vg_ratio, p.vaping_style, p.bottle_size, p.status, p.createdAt,
                p.updatedAt, p.deletedAt,
                ${sort_by === 'order_count' ? 'COALESCE(order_stats.order_count, 0) as order_count,' : ''}
                -- Get min variant price and image
                (SELECT MIN(pv.price) FROM product_variants pv 
                 WHERE pv.product_id = p.id AND pv.status = 'active' AND pv.price > 0) as min_price,
                (SELECT pvi.image_url FROM product_variant_images pvi 
                 JOIN product_variants pv2 ON pvi.variant_id = pv2.id 
                 WHERE pv2.product_id = p.id AND pv2.status = 'active' 
                 ORDER BY pvi.is_primary DESC LIMIT 1) as variant_image,
                -- Get primary product image
                (SELECT pi.image_url FROM product_images pi 
                 WHERE pi.product_id = p.id 
                 ORDER BY pi.is_primary DESC LIMIT 1) as product_image,
                -- Get all puff count attributes for processing (matching fetchProducts logic)
                (SELECT GROUP_CONCAT(pat_term.name SEPARATOR '|') FROM product_attribute_terms pat 
                 JOIN attributes a ON pat.attribute_id = a.id 
                 JOIN attribute_terms pat_term ON pat.term_id = pat_term.id 
                 WHERE pat.product_id = p.id AND a.name = 'number-of-puffs' 
                 AND pat.deleted_at IS NULL) as puff_count_attributes,
                -- Get flavor count
                (SELECT COUNT(*) FROM product_attribute_terms pat2 
                 JOIN attributes a2 ON pat2.attribute_id = a2.id 
                 WHERE pat2.product_id = p.id AND a2.name = 'flavour') as flavor_count,
                -- Get active deals with all attributes (matching fetchProducts exactly)
                (SELECT JSON_OBJECT(
                    'id', d.id,
                    'name', d.name,
                    'slug', d.slug,
                    'deal_type', d.deal_type,
                    'required_qty', d.required_qty,
                    'get_qty', d.get_qty,
                    'fixed_price', d.fixed_price,
                    'discount_percent', d.discount_percent,
                    'tiered_qty_json', d.tiered_qty_json,
                    'valid_from', d.valid_from,
                    'valid_to', d.valid_to
                ) FROM deals d 
                 JOIN deal_products dp ON d.id = dp.deal_id 
                 WHERE dp.product_id = p.id AND d.is_active = 1 AND d.is_deleted = 0 
                 AND d.valid_from <= NOW() AND d.valid_to >= NOW() LIMIT 1) as deal_data,
                -- Check if product has in-stock variants (for out_of_stock flag)
                (SELECT COUNT(*) FROM product_variants pv_stock 
                 WHERE pv_stock.product_id = p.id 
                 AND pv_stock.status = 'active' 
                 AND pv_stock.stock > 0 
                 AND pv_stock.stock_status = 'in_stock' 
                 AND pv_stock.price IS NOT NULL 
                 AND pv_stock.price > 0) as in_stock_variants_count
            FROM products p
            ${popularityJoin}
            WHERE p.id IN (
                SELECT DISTINCT pc.product_id 
                FROM product_categories pc 
                WHERE pc.category_id = ${categoryId}
            )
            AND p.status = 'published'
            AND p.deletedAt IS NULL
            ORDER BY p.createdAt DESC, ${sort_by === 'order_count' ? 'order_count' : 'p.' + sort_by} ${order}
            LIMIT ${parsedLimit} OFFSET ${parsedOffset}
        `;

        // Get total count with a simpler query
        const countQuery = `
            SELECT COUNT(DISTINCT p.id) as total
            FROM products p
            JOIN product_categories pc ON p.id = pc.product_id
            WHERE pc.category_id = ${categoryId}
            AND p.status = 'published'
            AND p.deletedAt IS NULL
        `;

        // Get product images for all products
        const productImagesQuery = `
            SELECT 
                pi.id, pi.product_id, pi.image_url, pi.is_primary
            FROM product_images pi
            WHERE pi.product_id IN (
                SELECT DISTINCT pc.product_id 
                FROM product_categories pc 
                WHERE pc.category_id = ${categoryId}
            )
            ORDER BY pi.product_id, pi.is_primary DESC
        `;

        // Execute all queries in parallel
        const [productsResult, countResult, productImagesResult] = await Promise.all([
            sequelize.query(productsQuery, { type: sequelize.QueryTypes.SELECT }),
            sequelize.query(countQuery, { type: sequelize.QueryTypes.SELECT }),
            sequelize.query(productImagesQuery, { type: sequelize.QueryTypes.SELECT })
        ]);

        const totalCount = countResult[0].total;
        const totalPages = Math.ceil(totalCount / parsedLimit);
        const currentPage = Math.floor(parsedOffset / parsedLimit) + 1;

        // Group product images by product_id
        const productImagesMap = new Map();
        productImagesResult.forEach(image => {
            if (!productImagesMap.has(image.product_id)) {
                productImagesMap.set(image.product_id, []);
            }
            productImagesMap.get(image.product_id).push({
                id: image.id,
                product_id: image.product_id,
                image_url: image.image_url,
                is_primary: image.is_primary
            });
        });

        // Process raw SQL results - much faster than ORM processing
        const availableProducts = productsResult
            .filter(product => product.min_price && parseFloat(product.min_price) > 0)
            .map(product => {
                // Extract largest puff count from number-of-puffs attribute (EXACT fetchProducts logic)
                let puffCount = null;
                if (product.puff_count_attributes) {
                    const puffAttributeNames = product.puff_count_attributes.split('|');
                    
                    if (puffAttributeNames.length > 0) {
                        let maxPuffCount = 0;
                        let maxPuffTerm = null;
                        
                        puffAttributeNames.forEach(attributeName => {
                            if (attributeName) {
                                // Find all numbers in the string
                                const puffMatches = attributeName.match(/(\d+)/g);
                                if (puffMatches) {
                                    // Use the largest number in the string
                                    const count = Math.max(...puffMatches.map(Number));
                                    if (count > maxPuffCount) {
                                        maxPuffCount = count;
                                        maxPuffTerm = attributeName;
                                    }
                                }
                            }
                        });
                        if (maxPuffCount > 0) {
                            if (maxPuffTerm && maxPuffTerm.toLowerCase().includes('up to')) {
                                puffCount = `~${maxPuffCount} puffs`;
                            } else {
                                puffCount = maxPuffTerm;
                            }
                        }
                    }
                }

                // Determine primary image
                const primaryImage = product.variant_image || product.product_image;

                // Calculate is_new: either database field is true OR product is within last 30 days
                const thirtyDaysAgo = new Date();
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                const isWithinLast30Days = new Date(product.createdAt) >= thirtyDaysAgo;
                const isNewProduct = product.is_new || isWithinLast30Days;

                return {
                    id: product.id,
                    updated_by: product.updated_by,
                    name: product.name,
                    slug: product.slug,
                    price: parseFloat(product.min_price),
                    discount_price: product.discount_price,
                    stock_quantity: product.stock_quantity,
                    puff_count: puffCount,
                    is_new: isNewProduct,
                    battery_capacity: product.battery_capacity,
                    coil_style: product.coil_style,
                    device_style: product.device_style,
                    eliquid_capacity: product.eliquid_capacity,
                    pod_coil_style: product.pod_coil_style,
                    pod_fill_style: product.pod_fill_style,
                    power_supply: product.power_supply,
                    nicotine_strength: product.nicotine_strength,
                    nicotine_type: product.nicotine_type,
                    vg_ratio: product.vg_ratio,
                    vaping_style: product.vaping_style,
                    bottle_size: product.bottle_size,
                    status: product.status,
                    createdAt: product.createdAt,
                    updatedAt: product.updatedAt,
                    deletedAt: product.deletedAt,
                    flavor_count: parseInt(product.flavor_count) || 0,
                    flavors: [], // Will be populated from productAttributeTerms if needed
                    out_of_stock: !(parseInt(product.in_stock_variants_count) > 0), // EXACT fetchProducts logic
                    order_count: product.order_count ? parseInt(product.order_count) : 0, // Add order count for popularity
                    ProductImages: productImagesMap.get(product.id) || [], // Add ProductImages array like fetchProducts
                    min_price_variant: {
                        price: parseFloat(product.min_price),
                        variant_image: product.variant_image ? {
                            image_url: product.variant_image
                        } : null
                    },
                    deals: product.deal_data ? [JSON.parse(product.deal_data)] : []
                };
            });

        // Get category info in parallel with products processing
        const category = await Category.findByPk(categoryId, {
            attributes: ['id', 'name', 'slug']
        });

        const result = {
            id: category.id,
            name: category.name,
            slug: category.slug,
            products: availableProducts,
            pagination: {
                total_count: totalCount,
                total_pages: totalPages,
                current_page: currentPage,
                limit: parsedLimit,
                offset: parsedOffset
            }
        };

        return result;
    } catch (error) {
        console.error('Error in fetchCategoryProducts:', error);
        throw error;
    }
};

module.exports.getCategoryBySlug = async (req, res, next) => {
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
            
            // Remove variant filtering when fetching by both category and brand
            // delete req.query.variant;
        } else {
            // Optimized logic when no productId is provided
            const category = await Category.findOne({ where: { slug: req.params.slug } });
            if (!category) {
                throw {
                    message: "Category not found",
                    statusCode: 400,
                };
            }
            
            // Use optimized category-specific query instead of fetchProducts
            const optimizedResult = await fetchCategoryProducts(category.id, req.query);
            
            return successResponse(res, optimizedResult, "Success");
        }
        // const { products, attributes,filters, price_ranges, brands, pagination } = await fetchProducts(req.query);
        const {additionalData, products, brand_items, attributes, deal_items, price_ranges, pagination } = await fetchProducts(req.query);

        return successResponse(res, { 
            ...additionalData,
            products,
            brand: brand_items, 
            attributes,
            deal:deal_items,
            price_ranges,
            pagination
        }, "Success");
    } catch (error) {
        console.log("🚀 ~ module.exports.getCategoryBySlug= ~ error:", error)
        return errorResponse(res, error, error.message);
    }
}

// module.exports.getCategoryBySlug = async (req, res, next) => {
//     try {
//         const { productId } = req.query;

//         if (productId) {
//             // Get category ID for this product
//             const productCategory = await ProductCategory.findOne({
//                 where: { product_id: productId },
//                 include: [{
//                     model: Category,
//                     as: 'Category',
//                     attributes: ['id']
//                 }]
//             });

//             // Get brand ID for this product
//             const productBrand = await ProductBrand.findOne({
//                 where: { product_id: productId },
//                 include: [{
//                     model: Brand,
//                     as: 'Brand',
//                     attributes: ['id']
//                 }]
//             });

//             // Set category and brand IDs from the product for fetchProducts
//             if (productCategory?.Category?.id) {
//                 req.query.categories = `${productCategory.Category.id}`;
//             }
//             if (productBrand?.Brand?.id) {
//                 req.query.brand = `${productBrand.Brand.id}`;
//             }
//             req.query.source = 'product';
            
//             // Remove variant filtering when fetching by both category and brand
//             // delete req.query.variant;
//         } else {
//             // Original logic when no productId is provided
//             const category = await Category.findOne({ where: { slug: req.params.slug } });
//             if (!category) {
//                 throw {
//                     message: "Category not found",
//                     statusCode: 400,
//                 };
//             }
//             req.query.categories = `${category.id}`;
//             req.query.source = 'category';
//         }
//         // const { products, attributes,filters, price_ranges, brands, pagination } = await fetchProducts(req.query);
//         const {additionalData, products, brand_items, attributes, deal_items, price_ranges, pagination } = await fetchProducts(req.query);

//         return successResponse(res, { 
//             ...additionalData,
//             products,
//             brand: brand_items, 
//             attributes,
//             deal:deal_items,
//             price_ranges,
//             pagination
//         }, "Success");
//     } catch (error) {
//         console.log("🚀 ~ module.exports.getCategoryBySlug= ~ error:", error)
//         return errorResponse(res, error, error.message);
//     }
// }