const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Product, Category, Brand, ProductImage, ProductAttributeTerm, Attribute, AttributeTerm, ProductVariant, ProductVariantImage, ProductVariantAttribute, Deal, DealProduct, ProductCategory, ProductBrand, ProductLinkedProduct, LoyaltyPointsSettings, Review, User, Order, Settings } = require("../../../models");
const { Sequelize, Op } = require("sequelize");
const logger = require("../../../library/logger");
const { getTrendingProducts, generateUniqueFileName, fetchProducts, getMinPriceVariant, shouldHideVariantSelector } = require("../helper/product.helper");
const { fetchProductsOptimized } = require("../helper/product.helper.optimized");
const { uploadFiletToS3 } = require("../../../library/s3/s3Helper");
const { readUploadFile, cleanupMulterFiles } = require("../../../library/multer/tempDiskStorage");
const { productStatus } = require("../../../config/constants");
const { cacheOrFetch, invalidateCache } = require('../../../library/cache');

module.exports.listAllproducts = async (req, res, next) => {
    try {
        req.query.source = 'product';
        if(req.query.test == 1) {
            const {additionalData, products, category_items, brand_items, deal_items, attributes,allAttributes, price_ranges, pagination } = await fetchProductsOptimized({
                ...req.query,
                status: productStatus.PUBLISHED
            });
            return successResponse(res, { 
                ...additionalData,
                products, 
                attributes,  
                // allAttributes,
                category:category_items,
                brand:brand_items,
                deal:deal_items,
                // deals_text:deals_text,
                price_ranges, 
                pagination
            }, 'Success');
        } else {
            const {additionalData, products, category_items, brand_items, deal_items, attributes,allAttributes, price_ranges, pagination } = await fetchProducts({
                ...req.query,
                status: productStatus.PUBLISHED
            });
            return successResponse(res, { 
                ...additionalData,
                products, 
                attributes,  
                // allAttributes,
                category:category_items,
                brand:brand_items,
                deal:deal_items,
                // deals_text:deals_text,
                price_ranges, 
                pagination
            }, 'Success');
        }
        
        
    } catch (error) {
        logger.error(error)
        return errorResponse(res, error, error.message);
    }
}

// OPTIMIZED NEW PRODUCTS API - Uses raw SQL for maximum performance
module.exports.listNewProducts = async (req, res, next) => {
    try {
        const {
            sort_by = 'createdAt',
            order = 'DESC',
            limit = 10,
            offset = 0,
            keyword,
            price_range,
            categories,
            brand,
            variant,
            deal_id
        } = req.query;

        // Parse limit and offset as integers
        const parsedLimit = parseInt(limit);
        const parsedOffset = parseInt(offset);

        // Validate price range format
        let priceRange = null;
        if (price_range) {
            if (price_range === "200+") {
                priceRange = { min: 200, max: 999999 };
            } else {
                const [minPrice, maxPrice] = price_range.split('-').map(Number);
                if (isNaN(minPrice) || isNaN(maxPrice)) {
                    throw new Error('Invalid price range format. Use format: min-max or "200+"');
                }
                priceRange = { min: minPrice, max: maxPrice };
            }
        }

        // Parse variant filter
        let variantFilters = {};
        let selectedAttributes = {};
        if (variant) {
            try {
                variantFilters = typeof variant === 'string' ? JSON.parse(variant) : variant;
                if (typeof variantFilters !== 'object') {
                    throw new Error('Variant filter must be an object');
                }
            } catch (error) {
                throw new Error('Invalid variant filter format: must be valid JSON');
            }
        }

        // Check if variantFilters is directly an attributes object
        if (variantFilters && !variantFilters.attributes && !variantFilters.id) {
            const isAttributeFormat = Object.entries(variantFilters).every(([key, value]) => {
                return !isNaN(key) && Array.isArray(value);
            });
            if (isAttributeFormat) {
                variantFilters = { attributes: variantFilters };
                selectedAttributes = variantFilters.attributes;
            }
        }
        else if (variantFilters && variantFilters.attributes && !variantFilters.id) {
            selectedAttributes = variantFilters.attributes;
        }

        // Ensure all term IDs are arrays and convert to numbers
        selectedAttributes = Object.entries(selectedAttributes).reduce((acc, [key, value]) => {
            const attributeId = parseInt(key);
            if (!isNaN(attributeId)) {
                acc[attributeId] = Array.isArray(value) ? value.map(v => parseInt(v)).filter(v => !isNaN(v)) : [parseInt(value)].filter(v => !isNaN(v));
            }
            return acc;
        }, {});

        const cacheKey = `product:new:${JSON.stringify({
            sort_by,
            order,
            limit: parsedLimit,
            offset: parsedOffset,
            keyword: keyword || '',
            price_range: price_range || '',
            categories: categories || '',
            brand: brand || '',
            variant: variant || '',
            deal_id: deal_id || ''
        })}`;

        const data = await cacheOrFetch(cacheKey, async () => {
        // Build base where conditions for new products (all products, descending order)
        let productFilterConditions = [
            "p.deletedAt IS NULL",
            "p.status = 'published'",
            "EXISTS (SELECT 1 FROM product_variants pv_active WHERE pv_active.product_id = p.id AND pv_active.status = 'active' AND pv_active.deleted_at IS NULL AND pv_active.price > 0)"
        ];
        let productFilterParams = {};

        if (keyword) {
            productFilterConditions.push("p.name LIKE :keyword");
            productFilterParams.keyword = `%${keyword}%`;
        }

        if (categories) {
            const categoryIds = categories.split(',').map(Number);
            productFilterConditions.push(`EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id IN (${categoryIds.join(',')}))`);
        }

        if (brand) {
            const brandIds = brand.split(',').map(Number);
            productFilterConditions.push(`EXISTS (SELECT 1 FROM product_brands pb WHERE pb.product_id = p.id AND pb.brand_id IN (${brandIds.join(',')}))`);
        }

        if (deal_id) {
            productFilterConditions.push("EXISTS (SELECT 1 FROM deal_products dp JOIN deals d ON dp.deal_id = d.id WHERE dp.product_id = p.id AND d.id = :dealId AND d.is_active = true AND d.is_deleted = false AND d.valid_from <= NOW() AND d.valid_to >= NOW())");
            productFilterParams.dealId = parseInt(deal_id);
        }

        if (priceRange) {
            productFilterConditions.push(`EXISTS (
                SELECT 1
                FROM (
                    SELECT MIN(pv2.price) AS min_price
                    FROM product_variants pv2
                    WHERE 
                        pv2.product_id = p.id
                        AND pv2.status = 'active'
                        AND pv2.deleted_at IS NULL
                        AND pv2.price IS NOT NULL
                        AND pv2.price > 0
                ) AS min_price_table
                WHERE min_price BETWEEN :minPrice AND :maxPrice
            )`);
            productFilterParams.minPrice = priceRange.min;
            productFilterParams.maxPrice = priceRange.max;
        }

        if (variantFilters.id) {
            productFilterConditions.push("EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.id = :variantId)");
            productFilterParams.variantId = variantFilters.id;
        }

        // Add attribute filtering
        if (Object.keys(selectedAttributes).length > 0) {
            Object.entries(selectedAttributes).forEach(([attrId, termIds]) => {
                if (Array.isArray(termIds) && termIds.length > 0) {
                    productFilterConditions.push(`EXISTS (
                        SELECT 1 FROM product_attribute_terms pat
                        WHERE pat.product_id = p.id
                        AND pat.attribute_id = ${parseInt(attrId)}
                        AND pat.term_id IN (${termIds.join(',')})
                        AND pat.deleted_at IS NULL
                    )`);
                }
            });
        }

        const sqlProductWhereClause = productFilterConditions.length > 0 
            ? "WHERE " + productFilterConditions.join(" AND ") 
            : "";

        // Optimized main products query - only essential fields
        const productsQuery = `
            SELECT 
                p.id, p.name, p.slug, p.price, p.discount_price,
                p.stock_quantity, p.puff_count, p.is_new, p.is_discontinued, p.status, p.createdAt
            FROM products p
            ${sqlProductWhereClause}
            ORDER BY p.createdAt DESC, p.${sort_by} ${order}
            LIMIT :limit OFFSET :offset
        `;

        // Count query
        const countQuery = `
            SELECT COUNT(DISTINCT p.id) as total_count
            FROM products p
            ${sqlProductWhereClause}
        `;

        // Execute main queries
        const [productsResult, countResult] = await Promise.all([
            Product.sequelize.query(productsQuery, {
                replacements: { ...productFilterParams, limit: parsedLimit, offset: parsedOffset },
                type: Product.sequelize.QueryTypes.SELECT
            }),
            Product.sequelize.query(countQuery, {
                replacements: productFilterParams,
                type: Product.sequelize.QueryTypes.SELECT
            })
        ]);

        const totalCount = countResult[0].total_count;
        const totalPages = Math.ceil(totalCount / parsedLimit);
        const currentPage = Math.floor(parsedOffset / parsedLimit) + 1;

        // Get product IDs for related data queries
        const productIds = productsResult.map(p => p.id);
        if (productIds.length === 0) {
            return {
                products: [],
                category_items: [],
                brand_items: [],
                deal_items: [],
                attributes: [],
                price_ranges: [],
                pagination: {
                    total_count: 0,
                    total_pages: 0,
                    current_page: 1,
                    limit: parsedLimit,
                    offset: parsedOffset
                }
            };
        }

        // Fetch reviews for all products in batch (similar to fetchProducts implementation)
        let productReviews = [];
        if (productIds.length > 0) {
            productReviews = await Product.sequelize.query(`
                SELECT 
                    r.id, r.product_id, r.user_id, r.order_id, r.user_name, r.company_name,
                    r.rating, r.comment, r.verified_by, r.testimonial, r.created_at,
                    u.first_name, u.last_name, u.profile_pic_url,
                    o.order_unique_id
                FROM reviews r
                LEFT JOIN users u ON u.id = r.user_id
                LEFT JOIN orders o ON o.id = r.order_id
                WHERE r.product_id IN (:productIds)
                AND r.is_visible = true
                AND r.deleted_at IS NULL
                ORDER BY r.product_id, r.created_at DESC
            `, { 
                replacements: { productIds },
                type: Product.sequelize.QueryTypes.SELECT 
            });
        }

        // Group reviews by product_id for efficient lookup
        const reviewsMap = new Map();
        productReviews.forEach(review => {
            if (!reviewsMap.has(review.product_id)) reviewsMap.set(review.product_id, []);
            reviewsMap.get(review.product_id).push(review);
        });

        // Execute essential queries in parallel (including deals and attributes for UI requirements)
        const [
            categoriesResult,
            brandsResult,
            productImagesResult,
            variantsResult,
            variantImagesResult,
            dealsResult,
            attributeTermsResult
        ] = await Promise.all([
            // Categories query - only essential fields
            Product.sequelize.query(`
                SELECT 
                    c.id, c.name, c.slug, pc.product_id, pc.is_primary
                FROM product_categories pc
                JOIN categories c ON pc.category_id = c.id
                WHERE pc.product_id IN (:productIds)
            `, {
                replacements: { productIds },
                type: Product.sequelize.QueryTypes.SELECT
            }),
            
            // Brands query - only essential fields
            Product.sequelize.query(`
                SELECT 
                    b.id, b.name, b.slug, pb.product_id, pb.is_primary
                FROM product_brands pb
                JOIN brands b ON pb.brand_id = b.id
                WHERE pb.product_id IN (:productIds)
            `, {
                replacements: { productIds },
                type: Product.sequelize.QueryTypes.SELECT
            }),
            
            // Product Images query - only essential fields
            Product.sequelize.query(`
                SELECT 
                    id, product_id, image_url, is_primary, alt_text
                FROM product_images
                WHERE product_id IN (:productIds)
            `, {
                replacements: { productIds },
                type: Product.sequelize.QueryTypes.SELECT
            }),
            
            // Variants query - only essential fields
            Product.sequelize.query(`
                SELECT 
                    id, product_id, price, discount_price, stock, stock_status, status, is_discontinued
                FROM product_variants
                WHERE product_id IN (:productIds) AND status = 'active'
            `, {
                replacements: { productIds },
                type: Product.sequelize.QueryTypes.SELECT
            }),
            
            // Variant Images query - only essential fields
            Product.sequelize.query(`
                SELECT 
                    variant_id, image_url, is_primary
                FROM product_variant_images
                WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id IN (:productIds) AND status = 'active')
                AND deleted_at IS NULL
                LIMIT 50
            `, {
                replacements: { productIds },
                type: Product.sequelize.QueryTypes.SELECT
            }),
            
            // Deals query - only essential fields
            Product.sequelize.query(`
                SELECT 
                    d.id, d.name, d.deal_type, d.discount_percent, dp.product_id
                FROM deal_products dp
                JOIN deals d ON dp.deal_id = d.id
                WHERE dp.product_id IN (:productIds)
                    AND d.is_active = 1 
                    AND d.is_deleted = 0 
                    AND d.valid_from <= NOW() 
                    AND d.valid_to >= NOW()
            `, {
                replacements: { productIds },
                type: Product.sequelize.QueryTypes.SELECT
            }),
            
            // Product Attribute Terms query - only essential fields
            // Use LIKE pattern to match both "number-of-puffs" and "number of puffs" formats (similar to JavaScript regex)
            Product.sequelize.query(`
                SELECT 
                    pat.product_id, pat.attribute_id, pat.term_id,
                    a.name as attr_name,
                    t.name as term_name
                FROM product_attribute_terms pat
                JOIN attributes a ON pat.attribute_id = a.id
                JOIN attribute_terms t ON pat.term_id = t.id
                WHERE pat.product_id IN (:productIds)
                AND (LOWER(a.name) LIKE LOWER('number%of%puffs') OR LOWER(a.name) = LOWER('flavour'))
            `, {
                replacements: { productIds },
                type: Product.sequelize.QueryTypes.SELECT
            })
        ]);

        // Create maps for efficient data lookup
        const categoriesMap = new Map();
        categoriesResult.forEach(cat => {
            if (!categoriesMap.has(cat.product_id)) {
                categoriesMap.set(cat.product_id, []);
            }
            categoriesMap.get(cat.product_id).push({
                id: cat.id,
                name: cat.name,
                slug: cat.slug,
                ProductCategory: {
                    is_primary: cat.is_primary
                }
            });
        });

        const brandsMap = new Map();
        brandsResult.forEach(brand => {
            if (!brandsMap.has(brand.product_id)) {
                brandsMap.set(brand.product_id, []);
            }
            brandsMap.get(brand.product_id).push({
                id: brand.id,
                name: brand.name,
                slug: brand.slug,
                ProductBrand: {
                    is_primary: brand.is_primary
                }
            });
        });

        const productImagesMap = new Map();
        productImagesResult.forEach(img => {
            if (!productImagesMap.has(img.product_id)) {
                productImagesMap.set(img.product_id, []);
            }
            productImagesMap.get(img.product_id).push({
                id: img.id,
                product_id: img.product_id,
                image_url: img.image_url,
                is_primary: img.is_primary,
                alt_text: img.alt_text
            });
        });

        const variantsMap = new Map();
        variantsResult.forEach(variant => {
            if (!variantsMap.has(variant.product_id)) {
                variantsMap.set(variant.product_id, []);
            }
            variantsMap.get(variant.product_id).push(variant);
        });

        const variantImagesMap = new Map();
        variantImagesResult.forEach(img => {
            if (!variantImagesMap.has(img.variant_id)) {
                variantImagesMap.set(img.variant_id, []);
            }
            variantImagesMap.get(img.variant_id).push({
                variant_id: img.variant_id,
                image_url: img.image_url,
                is_primary: img.is_primary
            });
        });

        const dealsMap = new Map();
        dealsResult.forEach(deal => {
            if (!dealsMap.has(deal.product_id)) {
                dealsMap.set(deal.product_id, []);
            }
            dealsMap.get(deal.product_id).push({
                id: deal.id,
                name: deal.name,
                deal_type: deal.deal_type,
                discount_percent: deal.discount_percent
            });
        });

        const attributeTermsMap = new Map();
        attributeTermsResult.forEach(pat => {
            if (!attributeTermsMap.has(pat.product_id)) {
                attributeTermsMap.set(pat.product_id, []);
            }
            attributeTermsMap.get(pat.product_id).push({
                product_id: pat.product_id,
                attribute_id: pat.attribute_id,
                term_id: pat.term_id,
                attribute: {
                    name: pat.attr_name
                },
                term: {
                    id: pat.term_id,
                    name: pat.term_name
                }
            });
        });

        // Process products with essential UI data (puff count, deals, stock status)
        const availableProducts = productsResult.map(product => {
            // Extract puff count from attributes
            let puffCount = product.puff_count; // Use direct field first
            const productAttributeTerms = attributeTermsMap.get(product.id) || [];
            if (productAttributeTerms.length > 0) {
                const puffAttributes = productAttributeTerms.filter(pat => {
                    if (!pat.attribute || !pat.attribute.name) return false;
                    // Case-insensitive regex match for "number of puffs" with flexible spacing
                    return /number\s+of\s+puffs/i.test(pat.attribute.name);
                });
                
                if (puffAttributes.length > 0) {
                    let maxPuffCount = 0;
                    let maxPuffTerm = null;
                    
                    puffAttributes.forEach(pat => {
                        if (pat.term) {
                            const puffMatches = pat.term.name.match(/(\d+)/g);
                            if (puffMatches) {
                                const count = Math.max(...puffMatches.map(Number));
                                if (count > maxPuffCount) {
                                    maxPuffCount = count;
                                    maxPuffTerm = pat.term.name;
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

            // Get flavors
            let flavorTerms = [];
            if (productAttributeTerms && productAttributeTerms.length > 0) {
                flavorTerms = productAttributeTerms
                    .filter(pat => {
                        // Case-insensitive check for flavour attribute
                        const attrName = pat.attribute && pat.attribute.name;
                        return attrName && 
                               attrName.toLowerCase().trim() === 'flavour' && 
                               pat.term && 
                               pat.term.id && 
                               pat.term.name;
                    })
                    .map(pat => ({
                        id: pat.term.id,
                        name: pat.term.name,
                        slug: pat.term.slug
                    }));
            }

            // Get variants with images
            const variants = (variantsMap.get(product.id) || []).map(variant => ({
                ...variant,
                is_discontinued: Boolean(variant.is_discontinued),
                variantImages: variantImagesMap.get(variant.id) || []
            }));

            // Check stock status
            const hasInStockVariant = !product.is_discontinued && variants.some(variant =>
                variant.status === 'active' &&
                !variant.is_discontinued &&
                variant.stock > 0 &&
                variant.stock_status === 'in_stock' &&
                variant.price !== null &&
                parseFloat(variant.price) > 0
            );

            // Get min price variant
            const minPriceVariant = getMinPriceVariant({
                variants: variants,
                ProductImages: productImagesMap.get(product.id) || []
            });

            // Calculate is_new: either database field is true OR product is within last 30 days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const isWithinLast30Days = new Date(product.createdAt) >= thirtyDaysAgo;
            const isNewProduct = product.is_new || isWithinLast30Days;

            // Process reviews for this product (similar to fetchProducts implementation)
            const productReviewsData = reviewsMap.get(product.id) || [];
            
            // Process reviews efficiently - OPTIMIZED: Single pass processing
            const reviewsMapForProduct = new Map();
            let totalRating = 0;
            let verifiedCount = 0;
            let testimonialCount = 0;
            const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
            
            // Single pass: process reviews and calculate statistics simultaneously
            productReviewsData.forEach(review => {
                if (!reviewsMapForProduct.has(review.id)) {
                    const processedReview = {
                        id: review.id,
                        user_id: review.user_id,
                        order_id: review.order_id,
                        user_name: review.user_name,
                        company_name: review.company_name,
                        rating: review.rating,
                        comment: review.comment,
                        verified_by: review.verified_by,
                        testimonial: review.testimonial,
                        created_at: review.created_at,
                        user: review.user_id ? {
                            id: review.user_id,
                            first_name: review.first_name,
                            last_name: review.last_name,
                            profile_pic_url: review.profile_pic_url
                        } : null,
                        order: review.order_id ? {
                            id: review.order_id,
                            order_unique_id: review.order_unique_id
                        } : null
                    };
                    
                    reviewsMapForProduct.set(review.id, processedReview);
                    
                    // Calculate statistics in the same loop
                    totalRating += review.rating;
                    ratingDistribution[review.rating]++;
                    if (review.verified_by) verifiedCount++;
                    if (review.testimonial) testimonialCount++;
                }
            });
            
            const processedReviews = Array.from(reviewsMapForProduct.values());
            
            // Calculate review statistics - OPTIMIZED: Pre-calculated values
            const reviewStats = {
                total_reviews: processedReviews.length,
                average_rating: processedReviews.length > 0 ? Math.round((totalRating / processedReviews.length) * 10) / 10 : 0,
                rating_distribution: ratingDistribution,
                verified_reviews: verifiedCount,
                testimonials: testimonialCount
            };

            return {
                id: product.id,
                name: product.name,
                slug: product.slug,
                price: minPriceVariant ? minPriceVariant.price : parseFloat(product.price) || 0,
                discount_price: product.discount_price,
                stock_quantity: product.stock_quantity,
                puff_count: puffCount,
                is_new: isNewProduct,
                is_discontinued: Boolean(product.is_discontinued),
                status: product.status,
                createdAt: product.createdAt,
                Categories: categoriesMap.get(product.id) || [],
                Brands: brandsMap.get(product.id) || [],
                ProductImages: productImagesMap.get(product.id) || [],
                variants: variants,
                deals: dealsMap.get(product.id) || [],
                flavors: flavorTerms,
                flavor_count: flavorTerms.length,
                out_of_stock: Boolean(product.is_discontinued) || !hasInStockVariant,
                min_price_variant: minPriceVariant,
                // Add review data and statistics
                reviews: processedReviews,
                review_stats: reviewStats
            };
        });

        // Get simplified filter options (only essential ones for performance)
        const [
            categoryResults,
            brandResults
        ] = await Promise.all([
            // Simplified categories query
            Product.sequelize.query(`
                SELECT 
                    c.id, c.name, c.slug, 
                    COUNT(DISTINCT pc.product_id) as product_count
                FROM categories c
                JOIN product_categories pc ON pc.category_id = c.id
                JOIN products p ON p.id = pc.product_id
                WHERE p.deletedAt IS NULL
                AND p.status = 'published'
                GROUP BY c.id, c.name, c.slug
                LIMIT 20
            `, {
                type: Product.sequelize.QueryTypes.SELECT
            }),

            // Simplified brands query
            Product.sequelize.query(`
                SELECT 
                    b.id, b.name, b.slug, 
                    COUNT(DISTINCT pb.product_id) as product_count
                FROM brands b
                JOIN product_brands pb ON pb.brand_id = b.id
                JOIN products p ON p.id = pb.product_id
                WHERE p.deletedAt IS NULL
                AND p.status = 'published'
                GROUP BY b.id, b.name, b.slug
                LIMIT 20
            `, {
                type: Product.sequelize.QueryTypes.SELECT
            })
        ]);

        return {
            products: availableProducts,
            category_items: categoryResults,
            brand_items: brandResults,
            deal_items: [], // Simplified - no deal filter options for now
            attributes: [], // Simplified - no attribute filter options for now
            price_ranges: [], // Simplified - no price range filter options for now
            pagination: {
                total_count: totalCount,
                total_pages: totalPages,
                current_page: currentPage,
                limit: parsedLimit,
                offset: parsedOffset
            }
        };
        }, 60);

        return successResponse(res, data, 'Success');

    } catch (error) {
        logger.error(error);
        return errorResponse(res, error, error.message);
    }
}

module.exports.getProductByid = async (req, res, next) => {
    try {
        const productId = req.params.id;
        const responseData = await cacheOrFetch(`product:detail:${productId}`, async () => {
        const includeClause = [
            {
                model: Category,
                as: 'Categories',
                through: { attributes: ['is_primary'] }
            },
            {
                model: Brand,
                as: 'Brands',
                through: { attributes: ['is_primary'] }
            },
            {
                model: ProductVariant,
                as: 'variants',
                where: {
                    status: 'active'
                },
                include: [
                    {
                        model: ProductVariantAttribute,
                        as: 'variantAttributes',
                        include: [
                            { 
                                model: Attribute, 
                                as: 'attribute', 
                                attributes: ['id', 'name', 'type', 'image_url'] 
                            },
                            { model: AttributeTerm, as: 'term', attributes: ['id', 'name', 'slug'] }
                        ]
                    },
                    {
                        model: ProductVariantImage,
                        as: 'variantImages',
                        attributes: ['id', 'variant_id', 'image_url', 'is_primary']
                    }
                ]
            },
            {
                model: ProductAttributeTerm,
                as: 'productAttributeTerms',
                include: [
                    { 
                        model: Attribute, 
                        as: 'attribute', 
                        attributes: ['id', 'name', 'type', 'image_url'] 
                    },
                    { model: AttributeTerm, as: 'term', attributes: ['id', 'name', 'slug'] }
                ]
            },
            {
                model: ProductImage,
                as: 'ProductImages'
            },
            {
                model: Deal,
                as: 'deals',
                through: { 
                    model: DealProduct,
                    attributes: [] // Exclude DealProduct table data from response
                },
                where: {
                    is_active: true,
                    is_deleted: false,
                    valid_from: { [Op.lte]: new Date() },
                    valid_to: { [Op.gte]: new Date() }
                },
                required: false,
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
                    'valid_from',
                    'valid_to'
                ]
            }
        ];
        const product = await Product.findOne({
            where: { 
                id: productId,
                status: productStatus.PUBLISHED
            }, 
            include: includeClause
        });
        if (!product) {
            return null;
        }

        // Group attributes and their terms
        const attributeTermsMap = new Map();
        product.productAttributeTerms.forEach((pat) => {
            const attribute = pat.attribute;
            if (!attributeTermsMap.has(attribute.id)) {
                attributeTermsMap.set(attribute.id, {
                    attribute: {
                        id: attribute.id,
                        name: attribute.name,
                        type: attribute.type,
                        image_url: attribute.image_url,
                        is_visible_page: pat.is_visible_page,
                        used_in_variation: pat.used_in_variation
                    },
                    terms: []
                });
            }
            
            // Check if the term is used in variation
            if (pat.used_in_variation) {
                // Check if this term has any corresponding variants
                const hasVariants = product.variants.some(variant => 
                    variant.variantAttributes.some(va => 
                        va.attribute.id === attribute.id && va.term.id === pat.term.id
                    )
                );
                
                // Only add the term if it has variants
                if (hasVariants) {
                    attributeTermsMap.get(attribute.id).terms.push({
                        id: pat.term.id,
                        name: pat.term.name,
                        slug: pat.term.slug,
                        used_in_variation: pat.used_in_variation,
                        is_visible_page: pat.is_visible_page
                    });
                }
            } else {
                // If not used in variation, add it regardless
                attributeTermsMap.get(attribute.id).terms.push({
                    id: pat.term.id,
                    name: pat.term.name,
                    slug: pat.term.slug,
                    used_in_variation: pat.used_in_variation,
                    is_visible_page: pat.is_visible_page
                });
            }
        });

        // Generate all possible combinations of attributes and terms
        const generateCombinations = (attributes) => {
            const combinations = [];
            // Filter attributes to only include those used in variations
            const variationAttributes = Array.from(attributes.values())
                .filter(attr => attr.attribute.used_in_variation);
            
            const combine = (current, index) => {
                if (index === variationAttributes.length) {
                    combinations.push([...current]);
                    return;
                }

                const { terms } = variationAttributes[index];
                // Filter terms to only include those used in variations
                const variationTerms = terms.filter(term => term.used_in_variation);
                
                variationTerms.forEach(term => {
                    current.push({
                        attributeId: variationAttributes[index].attribute.id,
                        attributeName: variationAttributes[index].attribute.name,
                        termId: term.id,
                        termName: term.name,
                        termSlug: term.slug
                    });
                    combine(current, index + 1);
                    current.pop();
                });
            };

            combine([], 0);
            return combinations;
        };

        const attributeCombinations = generateCombinations(attributeTermsMap);

        // Map combinations to variant stock information
        const variantStockMap = new Map();
        product.variants.forEach(variant => {
            const variantAttributes = variant.variantAttributes.map(va => ({
                attributeId: va.attribute.id,
                termId: va.term.id,
                isVisible: va.is_visible,
                usedInVariation: va.used_in_variation
            }));
            
            // Create a key for the combination
            const combinationKey = variantAttributes
                .map(va => `${va.attributeId}:${va.termId}`)
                .sort()
                .join('|');

            // Get primary image
            const primaryImage = variant.variantImages.find(img => img.is_primary) || variant.variantImages[0];

            // Check if product has deals and set apply_coupon based on stock quantity
            let apply_deals = false;
            if (product.deals && product.deals.length > 0) {
                // Check if any deal's required_qty is met by the variant's stock
                apply_deals = product.deals.some(deal => {
                    return variant.stock >= deal.required_qty;
                });
            }

            variantStockMap.set(combinationKey, {
                variantId: variant.id,
                slug: variant.slug,
                price: variant.price,
                discountPrice: variant.discount_price,
                purchasePrice: variant.purchase_price,
                weight: variant.weight,
                dimensions: {
                    length: variant.length,
                    width: variant.width,
                    height: variant.height
                },
                description: variant.description,
                barcode: variant.barcode,
                stock: variant.stock,
                low_stock_threshold: variant.low_stock_threshold,
                stock_status: variant.stock_status,
                status: variant.status,
                isInStock: variant.stock > 0,
                apply_deals: apply_deals,
                primaryImage: primaryImage ? {
                    id: primaryImage.id,
                    url: primaryImage.image_url,
                    altText: primaryImage.alt_text,
                    isPrimary: primaryImage.is_primary,
                    sortOrder: primaryImage.sort_order
                } : null,
                allImages: variant.variantImages.map(img => ({
                    id: img.id,
                    url: img.image_url,
                    altText: img.alt_text,
                    isPrimary: img.is_primary,
                    sortOrder: img.sort_order
                }))
            });
        });

        // Find default variant (first active in-stock variant)
        let defaultVariant = null;
        for (const combination of attributeCombinations) {
            const combinationKey = combination
                .map(c => `${c.attributeId}:${c.termId}`)
                .sort()
                .join('|');
            
            const variantInfo = variantStockMap.get(combinationKey);
            if (variantInfo && 
                variantInfo.isInStock && 
                variantInfo.status === 'active' && 
                variantInfo.stock_status !== 'out_of_stock') {
                defaultVariant = {
                    combination,
                    ...variantInfo
                };
                break;
            }
        }

        // Convert Map to array
        const attributeTerms = Array.from(attributeTermsMap.values());

        const hide_variant_selector = shouldHideVariantSelector(
            product.variants.length,
            product.productAttributeTerms
        );
        const soleVariant = hide_variant_selector ? product.variants[0] : null;
        
        // Fetch loyalty points settings
        const loyaltySettings = await LoyaltyPointsSettings.findOne({
            where: { status: true },
            order: [['createdAt', 'DESC']]
        });
        
        // Prepare the response
        const minPriceVariant = getMinPriceVariant(product);
        const productPrice = minPriceVariant ? minPriceVariant.price : product.price;
        
        // Calculate loyalty points for this product (always calculate for display, regardless of minimum threshold)
        let loyaltyPointsInfo = null;
        if (loyaltySettings && productPrice) {
            const minAmountForPoints = parseFloat(loyaltySettings.min_amount_for_loyalty_points) || 0;
            const meetsMinimum = parseFloat(productPrice) >= minAmountForPoints;
            
            // Always calculate points for display purposes (no minimum threshold check)
            let calculatedPoints = null;
            let calculationMethod = null;
            
            // Use same calculation logic as payment webhooks
            if (loyaltySettings.amount_divisor && parseFloat(loyaltySettings.amount_divisor) > 0) {
                calculatedPoints = Math.floor(parseFloat(productPrice) / parseFloat(loyaltySettings.amount_divisor));
                calculationMethod = 'amount_divisor';
            } else {
                calculatedPoints = parseFloat(loyaltySettings.points_value);
                calculationMethod = 'points_value';
            }
            
            loyaltyPointsInfo = {
                calculated: calculatedPoints,
                canEarn: calculatedPoints !== null && calculatedPoints > 0,
                meetsMinimum: meetsMinimum,  // Keep for informational purposes
                calculationMethod: calculationMethod,
                settings: {
                    program_name: loyaltySettings.program_name,
                    points_value: parseFloat(loyaltySettings.points_value),
                    loyalty_amount: loyaltySettings.loyalty_amount,
                    loyalty_amount_type: loyaltySettings.loyalty_amount_type,
                    minimum_points_redemption: loyaltySettings.minimum_points_redemption,
                    minimum_purchase_amount: loyaltySettings.minimum_purchase_amount,
                    min_amount_for_loyalty_points: loyaltySettings.min_amount_for_loyalty_points,
                    amount_divisor: loyaltySettings.amount_divisor,
                    status: loyaltySettings.status
                }
            };
        }
        
        // Extract largest puff count from number-of-puffs attribute
        let puffCount = null;
        if (product.productAttributeTerms) {
            const puffAttributes = product.productAttributeTerms.filter(pat => {
                if (!pat.attribute || !pat.attribute.name) return false;
                // Case-insensitive regex match for "number of puffs" with flexible spacing
                return /number\s+of\s+puffs/i.test(pat.attribute.name);
            });
            
            if (puffAttributes.length > 0) {
                let maxPuffCount = 0;
                let maxPuffTerm = null;
                
                puffAttributes.forEach(puffAttribute => {
                    if (puffAttribute.term) {
                        // Find all numbers in the string
                        const puffMatches = puffAttribute.term.name.match(/(\d+)/g);
                        if (puffMatches) {
                            // Use the largest number in the string
                            const count = Math.max(...puffMatches.map(Number));
                            if (count > maxPuffCount) {
                                maxPuffCount = count;
                                maxPuffTerm = puffAttribute.term.name;
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

        // Prepare the response
        const response = {
            ...product.toJSON(),
            hide_variant_selector,
            default_variant_id: soleVariant ? soleVariant.id : null,
            default_variant_slug: soleVariant ? soleVariant.slug : null,
            puff_count: puffCount,
            price: productPrice,
            regular_price: minPriceVariant ? minPriceVariant.regular_price : product.regular_price,
            discount_price: minPriceVariant ? minPriceVariant.discount_price : product.discount_price,
            attributeTerms,
            attributeCombinations,
            variantStockMap: Object.fromEntries(variantStockMap),
            defaultVariant,
            stockSummary: {
                totalVariants: product.variants.length,
                inStockVariants: product.variants.filter(v => v.stock > 0).length,
                lowStockVariants: product.variants.filter(v => 
                    v.stock > 0 && v.stock <= v.low_stock_threshold
                ).length,
                outOfStockVariants: product.variants.filter(v => v.stock <= 0).length
            },
            loyaltyPoints: loyaltyPointsInfo,
            // Keep loyaltySettings for backward compatibility
            loyaltySettings: loyaltySettings ? {
                program_name: loyaltySettings.program_name,
                points_value: parseFloat(loyaltySettings.points_value),
                loyalty_amount: loyaltySettings.loyalty_amount,
                loyalty_amount_type: loyaltySettings.loyalty_amount_type,
                minimum_points_redemption: loyaltySettings.minimum_points_redemption,
                minimum_purchase_amount: loyaltySettings.minimum_purchase_amount,
                min_amount_for_loyalty_points: loyaltySettings.min_amount_for_loyalty_points,
                status: loyaltySettings.status
            } : null,
            min_price_variant: minPriceVariant
        };

        return response;
        }, 60);

        if (!responseData) {
            return errorResponse(res, {}, 'Product not found', 404);
        }
        return successResponse(res, responseData, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

module.exports.getProductDescription = async (req, res, next) => {
    try {
        const productId = req.params.id;
        const responseData = await cacheOrFetch(`product:description:${productId}`, async () => {
            const productResult = await Product.sequelize.query(`
                SELECT p.id, p.description, p.updatedAt
                FROM products p
                WHERE p.id = :product_id
                AND p.status = 'published'
                AND p.deletedAt IS NULL
            `, {
                replacements: { product_id: productId },
                type: Product.sequelize.QueryTypes.SELECT
            });

            if (!productResult.length) {
                return null;
            }

            const product = productResult[0];
            return {
                product_id: product.id,
                description: product.description,
                updated_at: product.updatedAt
            };
        }, 300);

        if (!responseData) {
            return errorResponse(res, {}, 'Product not found', 404);
        }
        return successResponse(res, responseData, 'Product description fetched successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.createProduct = async (req, res, next) => {
    const transaction = await Product.sequelize.transaction();
    try {
        const { name, slug, sku, description, price, discount_price, stock_quantity, puff_count, is_new, battery_capacity, coil_style, device_style, eliquid_capacity, pod_coil_style, pod_fill_style, power_supply, nicotine_strength, nicotine_type, vg_ratio, vaping_style, bottle_size, category_ids, brand_ids, flavour_ids, product_images } = req.body;
        const { id: updated_by } = req.user; // Authenticated user

        if (!sku) {
            throw new Error('SKU is required');
        }

        // find product by slug
        const existingProduct = await Product.findOne({ where: { slug } });
        if (existingProduct) {
            throw new Error('Product already exists');
        }

        const existingProductSku = await Product.findOne({ where: { sku } });
        if (existingProductSku) {
            throw new Error('Product with this SKU already exists');
        }

        // Create the product
        const product = await Product.create(
            { name, slug, sku, description, price, discount_price, stock_quantity, puff_count, is_new, battery_capacity, coil_style, device_style, eliquid_capacity, pod_coil_style, pod_fill_style, power_supply, nicotine_strength, nicotine_type, vg_ratio, vaping_style, bottle_size, updated_by },
            { transaction }
        );

        // If flavors are provided, associate them
        if (flavour_ids && flavour_ids.length > 0) {
            const flavorRecords = flavour_ids.map(item => ({
                product_id: product.id,
                flavor_id: item.flavor_id,
                ...(item.price && { price: item.price }),
                ...(item.discount_price && { discount_price: item.discount_price }),
                ...(item.stock_quantity && { stock_quantity: item.stock_quantity }),
            }));
            await ProductFlavor.bulkCreate(flavorRecords, { transaction });
        }
        // Create category associations
        if (category_ids && category_ids.length > 0) {
            const categoryIds = Array.isArray(category_ids) ? category_ids : [category_ids];
            const categoryData = categoryIds.map((categoryId, index) => ({
                product_id: product.id,
                category_id: categoryId,
                is_primary: index === 0 // First category is primary
            }));
            
            await ProductCategory.bulkCreate(categoryData, { transaction });
        }

        // Create brand associations
        if (brand_ids && brand_ids.length > 0) {
            const brandIds = Array.isArray(brand_ids) ? brand_ids : [brand_ids];
            const brandData = brandIds.map((brandId, index) => ({
                product_id: product.id,
                brand_id: brandId,
                is_primary: index === 0 // First brand is primary
            }));
            
            await ProductBrand.bulkCreate(brandData, { transaction });
        }

        // If product_images are provided, associate them
        if (product_images && product_images.length > 0) {
            const productImages = product_images.map(item => ({
                product_id: product.id,
                image_url: item.image_url,
                is_primary: item.is_primary,
                updated_by
            }));
            await ProductImage.bulkCreate(productImages, { transaction });
        }

        await transaction.commit();

        // Fetch the created product with related models
        const newProduct = await Product.findByPk(product.id, {
            include: [
                { model: Category, as: 'Categories', through: { attributes: ['is_primary'] } },
                { model: Brand, as: 'Brands', through: { attributes: ['is_primary'] } },
                { model: ProductImage, as: 'ProductImages' },
                {
                    model: Flavor, as: 'Flavors', through: {
                        model: ProductFlavor,
                    }
                }
            ]
        });

        return successResponse(res, newProduct, 'Product created successfully');
    } catch (error) {
        await transaction.rollback();
        logger.error(error)
        return errorResponse(res, error, error.message);
    }
}

module.exports.updateProduct = async (req, res, next) => {
    const transaction = await Product.sequelize.transaction();
    try {
        const { id } = req.params;
        const { name, slug, sku, description, price, discount_price, stock_quantity, puff_count, is_new, battery_capacity, coil_style, device_style, eliquid_capacity, pod_coil_style, pod_fill_style, power_supply, nicotine_strength, nicotine_type, vg_ratio, vaping_style, bottle_size, category_ids, brand_ids, flavour_ids, product_images } = req.body;
        const { id: updated_by } = req.user

        // Find the product
        const product = await Product.findByPk(id, { transaction });
        if (!product) {
            await transaction.rollback();
            throw new Error('Product not found');
        }
        // Update product fields
        if (sku && sku !== product.sku) {
            const existingProductSku = await Product.findOne({ where: { sku }, transaction });
            if (existingProductSku && existingProductSku.id !== product.id) {
                await transaction.rollback();
                throw new Error('Product with this SKU already exists');
            }
        }

        const updatedFields = {
            ...(name && { name }),
            ...(slug && { slug }),
            ...(sku && { sku }),
            ...(description && { description }),
            ...(price && { price }),
            ...(discount_price && { discount_price }),
            ...(stock_quantity && { stock_quantity }),
            ...(puff_count && { puff_count }),
            ...(is_new !== undefined && { is_new }),
            ...(battery_capacity && { battery_capacity }),
            ...(coil_style && { coil_style }),
            ...(device_style && { device_style }),
            ...(eliquid_capacity && { eliquid_capacity }),
            ...(pod_coil_style && { pod_coil_style }),
            ...(pod_fill_style && { pod_fill_style }),
            ...(power_supply && { power_supply }),
            ...(nicotine_strength && { nicotine_strength }),
            ...(nicotine_type && { nicotine_type }),
            ...(vg_ratio && { vg_ratio }),
            ...(vaping_style && { vaping_style }),
            ...(bottle_size && { bottle_size }),
            ...(updated_by && { updated_by })
        };

        await product.update(updatedFields, { transaction });

        // Update category associations if provided
        if (category_ids !== undefined) {
            await ProductCategory.destroy({ where: { product_id: id }, transaction });
            if (category_ids && category_ids.length > 0) {
                const categoryIds = Array.isArray(category_ids) ? category_ids : [category_ids];
                const categoryData = categoryIds.map((categoryId, index) => ({
                    product_id: id,
                    category_id: categoryId,
                    is_primary: index === 0 // First category is primary
                }));
                await ProductCategory.bulkCreate(categoryData, { transaction });
            }
        }

        // Update brand associations if provided
        if (brand_ids !== undefined) {
            await ProductBrand.destroy({ where: { product_id: id }, transaction });
            if (brand_ids && brand_ids.length > 0) {
                const brandIds = Array.isArray(brand_ids) ? brand_ids : [brand_ids];
                const brandData = brandIds.map((brandId, index) => ({
                    product_id: id,
                    brand_id: brandId,
                    is_primary: index === 0 // First brand is primary
                }));
                await ProductBrand.bulkCreate(brandData, { transaction });
            }
        }

        // Update associated flavors
        if (flavour_ids && flavour_ids.length > 0) {
            await ProductFlavor.destroy({ where: { product_id: id }, transaction });
            const flavorRecords = flavour_ids.map(item => ({
                product_id: id,
                flavor_id: item.flavor_id,
                ...(item.price && { price: item.price }),
                ...(item.discount_price && { discount_price: item.discount_price }),
                ...(item.stock_quantity && { stock_quantity: item.stock_quantity }),
            }));
            await ProductFlavor.bulkCreate(flavorRecords, { transaction });
        }

        // Update associated images
        if (product_images && product_images.length > 0) {
            await ProductImage.destroy({ where: { product_id: id }, transaction });
            const imageRecords = product_images.map(item => ({
                product_id: id,
                image_url: item.image_url,
                is_primary: item.is_primary,
                updated_by
            }));
            await ProductImage.bulkCreate(imageRecords, { transaction });
        }
        await transaction.commit();

        await invalidateCache([`product:detail:${id}`, `product:description:${id}`]);

        // Fetch the updated product with related models
        const updatedProduct = await Product.findByPk(id, {
            include: [
                { model: Category, as: 'Categories', through: { attributes: ['is_primary'] } },
                { model: Brand, as: 'Brands', through: { attributes: ['is_primary'] } },
                { model: ProductImage, as: 'ProductImages' },
                {
                    model: Flavor, as: 'Flavors', through: {
                        model: ProductFlavor,
                    }
                }
            ]
        });
        successResponse(res, updatedProduct, 'Product updated');
    } catch (error) {
        await transaction.rollback();
        logger.error(error)
        return errorResponse(res, error, error.message);
    }
}

module.exports.deleteProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const product = await Product.findByPk(id);
        if (!product) {
            throw new Error('Product not found');
        }
        await product.destroy();
        successResponse(res, { message: 'Product deleted successfully' });
    } catch (error) {
        logger.error(error)
        return errorResponse(res, error, error.message);
    }
}

module.exports.trendingProduct = async (req, res) => {
    try {
        const trendingProducts = await getTrendingProducts(10);
        return successResponse(res, trendingProducts, { message: 'Top 10 trending products fetched successfully' },)
    } catch (error) {
        logger.error(error);
        console.log("🚀 ~ module.exports.trendingProduct= ~ error:", error)
        return errorResponse(res, error, error.message);
    }
}

module.exports.uploadImage = async (req, res) => {
    try {
        console.log('Uploading image', req.files)
        const { files } = req;
        if (!files || files.length === 0) {
            throw new Error('No file uploaded.');
        }

        const uploadPromise = files.map(async (image) => {
            const { originalname, mimetype } = image;
            const buffer = await readUploadFile(image);
            
            // Resize to max 1920x1080 if larger
            let processedBuffer = buffer;
            try {
                const { resizeToMaxSize, getUniqueFileNameWithPrefix } = require("../../../library/s3/s3Helper");
                processedBuffer = await resizeToMaxSize(buffer, mimetype);
                if (processedBuffer !== buffer) {
                    console.log(`📐 Image resized to max 1920x1080: ${originalname}`);
                }
                
                // Get unique filename preserving original name
                const fileName = await getUniqueFileNameWithPrefix(originalname, 'products');
                const params = {
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: `products/${fileName}`,
                    Body: processedBuffer,
                    ContentType: mimetype
                }
                return uploadFiletToS3(params)
            } catch (resizeError) {
                console.error(`⚠️ Error resizing image, using original: ${resizeError.message}`);
                // Fallback to original processing
                const { getUniqueFileNameWithPrefix } = require("../../../library/s3/s3Helper");
                const fileName = await getUniqueFileNameWithPrefix(originalname, 'products');
                const params = {
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: `products/${fileName}`,
                    Body: buffer,
                    ContentType: mimetype
                }
                return uploadFiletToS3(params)
            }
        })
        const uploadedImages = await Promise.all(uploadPromise);
        const response = uploadedImages.map(item => {
            return {
                Location: item.Location,
                Key: item.key,
            }
        })

        return successResponse(res, response);
    } catch (error) {
        console.log("🚀 ~ module.exports.uploadImage= ~ error:", error)
        logger.error(error)
        return errorResponse(res, error, error.message);
    } finally {
        await cleanupMulterFiles(req.files);
    }
}

module.exports.listAllproductsBySlug = async (req, res, next) => {
    try {
        const slug = req.params.slug;
        
        // Main product query - OPTIMIZED with raw SQL (exclude soft-deleted)
        const productQuery = `
            SELECT 
                p.id, p.updated_by, p.name, p.slug, p.description, p.price, p.discount_price,
                p.stock_quantity, p.puff_count, p.is_new, p.battery_capacity, p.coil_style,
                p.device_style, p.eliquid_capacity, p.pod_coil_style, p.pod_fill_style,
                p.power_supply, p.nicotine_strength, p.nicotine_type, p.vg_ratio,
                p.vaping_style, p.bottle_size, p.status, p.createdAt, p.updatedAt, p.deletedAt
            FROM products p
            WHERE p.slug = :slug AND p.status = :status AND p.deleted_at IS NULL
        `;
        
        // Execute main product query
        const [productResult] = await Product.sequelize.query(productQuery, {
            replacements: { slug, status: productStatus.PUBLISHED },
            type: Product.sequelize.QueryTypes.SELECT
        });
        
        if (!productResult) {
            // Check for soft-deleted product with redirect URL (301 redirect for SEO)
            const [deletedWithRedirect] = await Product.sequelize.query(
                `SELECT redirect_url FROM products WHERE slug = :slug AND deleted_at IS NOT NULL AND redirect_url IS NOT NULL AND redirect_url != '' LIMIT 1`,
                { replacements: { slug }, type: Product.sequelize.QueryTypes.SELECT }
            );
            if (deletedWithRedirect && deletedWithRedirect.redirect_url) {
                return res.redirect(301, deletedWithRedirect.redirect_url);
            }
            throw new Error('Product not found');
        }
        
        // Execute all related queries in parallel for maximum performance
        const [
            categoriesResult,
            brandsResult,
            productImagesResult,
            variantsResult,
            variantImagesResult,
            dealsResult,
            attributeTermsResult
        ] = await Promise.all([
            // Categories query
            Product.sequelize.query(`
                SELECT 
                    c.id, c.updated_by, c.name, c.description, c.slug, c.parent_id, c.logo_url,
                    c.createdAt, c.updatedAt, c.deletedAt, pc.is_primary
                FROM product_categories pc
                JOIN categories c ON pc.category_id = c.id
                WHERE pc.product_id = :productId
            `, {
                replacements: { productId: productResult.id },
                type: Product.sequelize.QueryTypes.SELECT
            }),
            
            // Brands query
            Product.sequelize.query(`
                SELECT 
                    b.id, b.updated_by, b.slug, b.name, b.description, b.logo_url,
                    b.createdAt, b.updatedAt, b.deletedAt, pb.is_primary
                FROM product_brands pb
                JOIN brands b ON pb.brand_id = b.id
                WHERE pb.product_id = :productId
            `, {
                replacements: { productId: productResult.id },
                type: Product.sequelize.QueryTypes.SELECT
            }),
            
            // Product Images query
            Product.sequelize.query(`
                SELECT 
                    id, updated_by, product_id, image_url, is_primary, alt_text, createdAt, updatedAt, deletedAt
                FROM product_images
                WHERE product_id = :productId
            `, {
                replacements: { productId: productResult.id },
                type: Product.sequelize.QueryTypes.SELECT
            }),
            
            // Variants query
            Product.sequelize.query(`
                SELECT 
                    id, product_id, slug, regular_price, price, discount_price, purchase_price,
                    weight, length, width, height, description, barcode, stock, low_stock_threshold,
                    stock_status, status, updated_by, created_at, updated_at, deleted_at
                FROM product_variants
                WHERE product_id = :productId AND status = 'active'
            `, {
                replacements: { productId: productResult.id },
                type: Product.sequelize.QueryTypes.SELECT
            }),
            
            // Variant Images query
            Product.sequelize.query(`
                SELECT 
                    id, variant_id, image_url, is_primary
                FROM product_variant_images
                WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id = :productId AND status = 'active')
                AND deleted_at IS NULL
            `, {
                replacements: { productId: productResult.id },
                type: Product.sequelize.QueryTypes.SELECT
            }),
            
            // Deals query
            Product.sequelize.query(`
                SELECT 
                    d.id, d.name, d.slug, d.image_url, d.deal_type, d.required_qty,
                    d.get_qty, d.fixed_price, d.discount_percent, d.tiered_qty_json,
                    d.bundle_product_ids_json, d.valid_from, d.valid_to
                FROM deal_products dp
                JOIN deals d ON dp.deal_id = d.id
                WHERE dp.product_id = :productId 
                    AND d.is_active = 1 
                    AND d.is_deleted = 0 
                    AND d.valid_from <= NOW() 
                    AND d.valid_to >= NOW()
            `, {
                replacements: { productId: productResult.id },
                type: Product.sequelize.QueryTypes.SELECT
            }),
            
            // Product Attribute Terms query
            Product.sequelize.query(`
                SELECT 
                    pat.id, pat.product_id, pat.attribute_id, pat.term_id, pat.is_visible_page,
                    pat.used_in_variation, pat.updated_by, pat.created_at, pat.updated_at, pat.deleted_at,
                    a.id as attr_id, a.name as attr_name, a.type as attr_type,
                    t.id as term_id, t.name as term_name, t.slug as term_slug
                FROM product_attribute_terms pat
                JOIN attributes a ON pat.attribute_id = a.id
                JOIN attribute_terms t ON pat.term_id = t.id
                WHERE pat.product_id = :productId
            `, {
                replacements: { productId: productResult.id },
                type: Product.sequelize.QueryTypes.SELECT
            })
        ]);
        // Parse and structure the data
        const product = {
            id: productResult.id,
            updated_by: productResult.updated_by,
            name: productResult.name,
            slug: productResult.slug,
            description: productResult.description,
            price: productResult.price,
            discount_price: productResult.discount_price,
            stock_quantity: productResult.stock_quantity,
            puff_count: productResult.puff_count,
            is_new: productResult.is_new,
            battery_capacity: productResult.battery_capacity,
            coil_style: productResult.coil_style,
            device_style: productResult.device_style,
            eliquid_capacity: productResult.eliquid_capacity,
            pod_coil_style: productResult.pod_coil_style,
            pod_fill_style: productResult.pod_fill_style,
            power_supply: productResult.power_supply,
            nicotine_strength: productResult.nicotine_strength,
            nicotine_type: productResult.nicotine_type,
            vg_ratio: productResult.vg_ratio,
            vaping_style: productResult.vaping_style,
            bottle_size: productResult.bottle_size,
            status: productResult.status,
            createdAt: productResult.createdAt,
            updatedAt: productResult.updatedAt,
            deletedAt: productResult.deletedAt
        };
        
        // Parse Categories
        product.Categories = categoriesResult.map(cat => ({
            id: cat.id,
            updated_by: cat.updated_by,
            name: cat.name,
            description: cat.description,
            slug: cat.slug,
            parent_id: cat.parent_id,
            logo_url: cat.logo_url,
            createdAt: cat.createdAt,
            updatedAt: cat.updatedAt,
            deletedAt: cat.deletedAt,
            ProductCategory: {
                is_primary: cat.is_primary
            }
        }));
        
        // Parse Brands
        product.Brands = brandsResult.map(brand => ({
            id: brand.id,
            updated_by: brand.updated_by,
            slug: brand.slug,
            name: brand.name,
            description: brand.description,
            logo_url: brand.logo_url,
            createdAt: brand.createdAt,
            updatedAt: brand.updatedAt,
            deletedAt: brand.deletedAt,
            ProductBrand: {
                is_primary: brand.is_primary
            }
        }));
        
        // Parse Product Images
        product.ProductImages = productImagesResult.map(img => ({
            id: img.id,
            updated_by: img.updated_by,
            product_id: img.product_id,
            image_url: img.image_url,
            is_primary: img.is_primary,
            alt_text: img.alt_text,
            createdAt: img.createdAt,
            updatedAt: img.updatedAt,
            deletedAt: img.deletedAt
        }));
        
        // Create variant images map
        const variantImagesMap = new Map();
        variantImagesResult.forEach(img => {
            if (!variantImagesMap.has(img.variant_id)) {
                variantImagesMap.set(img.variant_id, []);
            }
            variantImagesMap.get(img.variant_id).push({
                id: img.id,
                variant_id: img.variant_id,
                image_url: img.image_url,
                is_primary: img.is_primary
            });
        });
        
        // Parse Variants with Images
        product.variants = variantsResult.map(variant => ({
            id: variant.id,
            product_id: variant.product_id,
            slug: variant.slug,
            regular_price: variant.regular_price,
            price: variant.price,
            discount_price: variant.discount_price,
            purchase_price: variant.purchase_price,
            weight: variant.weight,
            length: variant.length,
            width: variant.width,
            height: variant.height,
            description: variant.description,
            barcode: variant.barcode,
            stock: variant.stock,
            low_stock_threshold: variant.low_stock_threshold,
            stock_status: variant.stock_status,
            status: variant.status,
            updated_by: variant.updated_by,
            created_at: variant.created_at,
            updated_at: variant.updated_at,
            deleted_at: variant.deleted_at,
            variantImages: variantImagesMap.get(variant.id) || []
        }));
        
        // Parse Deals
        product.deals = dealsResult.map(deal => ({
            id: deal.id,
            name: deal.name,
            slug: deal.slug,
            image_url: deal.image_url,
            deal_type: deal.deal_type,
            required_qty: deal.required_qty,
            get_qty: deal.get_qty,
            fixed_price: deal.fixed_price,
            discount_percent: deal.discount_percent,
            tiered_qty_json: deal.tiered_qty_json,
            bundle_product_ids_json: deal.bundle_product_ids_json,
            valid_from: deal.valid_from,
            valid_to: deal.valid_to
        }));
        
        // Parse Product Attribute Terms
        product.productAttributeTerms = attributeTermsResult.map(pat => ({
            id: pat.id,
            product_id: pat.product_id,
            attribute_id: pat.attribute_id,
            term_id: pat.term_id,
            is_visible_page: pat.is_visible_page,
            used_in_variation: pat.used_in_variation,
            updated_by: pat.updated_by,
            created_at: pat.created_at,
            updated_at: pat.updated_at,
            deleted_at: pat.deleted_at,
            attribute: {
                id: pat.attr_id,
                name: pat.attr_name,
                type: pat.attr_type
            },
            term: {
                id: pat.term_id,
                name: pat.term_name,
                slug: pat.term_slug
            }
        }));
        
        // **Transform the response** to group attribute terms (same logic as original)
        const attributeTermsMap = new Map();

        product.productAttributeTerms.forEach((pat) => {
            const attribute = pat.attribute;

            if (!attributeTermsMap.has(attribute.id)) {
                attributeTermsMap.set(attribute.id, {
                    attribute: {
                        id: attribute.id,
                        name: attribute.name,
                        type: attribute.type,
                        is_visible_page: pat.is_visible_page
                    },
                    terms: []
                });
            }
            attributeTermsMap.get(attribute.id).terms.push({
                id: pat.term.id,
                name: pat.term.name,
                slug: pat.term.slug
            });
        });

        // Extract largest puff count from number-of-puffs attribute
        let puffCount = null;
        if (product.productAttributeTerms) {
            const puffAttributes = product.productAttributeTerms.filter(pat => {
                if (!pat.attribute || !pat.attribute.name) return false;
                // Case-insensitive regex match for "number of puffs" with flexible spacing
                return /number\s+of\s+puffs/i.test(pat.attribute.name);
            });
            
            if (puffAttributes.length > 0) {
                let maxPuffCount = 0;
                let maxPuffTerm = null;
                
                puffAttributes.forEach(puffAttribute => {
                    if (puffAttribute.term) {
                        // Find all numbers in the string
                        const puffMatches = puffAttribute.term.name.match(/(\d+)/g);
                        if (puffMatches) {
                            // Use the largest number in the string
                            const count = Math.max(...puffMatches.map(Number));
                            if (count > maxPuffCount) {
                                maxPuffCount = count;
                                maxPuffTerm = puffAttribute.term.name;
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

        // Get min price variant
        const minPriceVariant = getMinPriceVariant(product);

        // Convert Map to array
        const attributeTerms = Array.from(attributeTermsMap.values());

        const hide_variant_selector = shouldHideVariantSelector(
            product.variants.length,
            product.productAttributeTerms
        );
        const soleVariant = hide_variant_selector ? product.variants[0] : null;
        
        // Get primary product image
        const primaryProductImage = product.ProductImages && product.ProductImages.length > 0 
            ? product.ProductImages.find(img => img.is_primary) || product.ProductImages[0]
            : null;
        
        // Transform ProductImages to all_images format
        const all_images = product.ProductImages && product.ProductImages.length > 0
            ? product.ProductImages.map(img => ({
                id: img.id,
                url: img.image_url,
                alt_text: img.alt_text,
                is_primary: Boolean(img.is_primary)
            }))
            : [];
        
        // Transform primary image
        const primary_image = primaryProductImage ? {
            id: primaryProductImage.id,
            url: primaryProductImage.image_url,
            alt_text: primaryProductImage.alt_text,
            is_primary: Boolean(primaryProductImage.is_primary)
        } : null;
        
        // **Modify the response** (same logic as original)
        const response = {
            ...product,  // Use parsed product object instead of toJSON()
            hide_variant_selector,
            default_variant_id: soleVariant ? soleVariant.id : null,
            default_variant_slug: soleVariant ? soleVariant.slug : null,
            puff_count: puffCount,
            price: minPriceVariant ? minPriceVariant.price : product.price,
            regular_price: minPriceVariant ? minPriceVariant.regular_price : product.regular_price,
            discount_price: minPriceVariant ? minPriceVariant.discount_price : product.discount_price,
            min_price_variant: minPriceVariant,
            primary_image: primary_image,
            all_images: all_images,
            attributeTerms,
            deals: product.deals && product.deals.length > 0 ? product.deals.map(deal => ({
                id: deal.id,
                name: deal.name,
                slug: deal.slug,
                description: deal.description,
                image_url: deal.image_url,
                deal_type: deal.deal_type,
                required_qty: deal.required_qty,
                get_qty: deal.get_qty,
                fixed_price: deal.fixed_price,
                discount_percent: deal.discount_percent,
                tiered_qty_json: deal.tiered_qty_json,
                bundle_product_ids_json: deal.bundle_product_ids_json,
                valid_from: deal.valid_from,
                valid_to: deal.valid_to
            })) : []
        };
        successResponse(res, response, 'Success');
    } catch (error) {
        logger.error(error)
        return errorResponse(res, error, error.message);
    }
}

module.exports.filterVariantsByAttributes = async (req, res, next) => {
    try {
        const { product_id, attribute_terms, slugs } = req.body;
        
        // Basic validation (route validation handles detailed checks, this is a safety net)
        if (!product_id) {
            throw new Error('Product ID is required');
        }

        // OPTIMIZED: Use raw SQL queries with strategic parallelization for maximum performance

        // 1. Get product basic info with raw SQL (MUST run first for validation)
        const productResult = await Product.sequelize.query(`
            SELECT 
                p.id, p.name, p.slug, p.description, p.price, p.discount_price,
                p.is_discontinued, p.createdAt, p.updatedAt
            FROM products p
            WHERE p.id = :product_id 
            AND p.status = 'published'
            AND p.deletedAt IS NULL
        `, {
            replacements: { product_id },
            type: Product.sequelize.QueryTypes.SELECT
        });

        if (productResult.length === 0) {
            throw new Error('Product not found');
        }

        const product = productResult[0];

        // NEW: Handle slugs parameter - convert to attribute_terms format
        let processedAttributeTerms = attribute_terms;
        
        if (slugs && !attribute_terms) {
            // Find variant(s) by slug first
            const variantBySlugResult = await Product.sequelize.query(`
                SELECT id, slug
                FROM product_variants
                WHERE product_id = :product_id 
                AND slug = :slug
                AND status = 'active'
                AND deleted_at IS NULL
            `, {
                replacements: { product_id, slug: slugs.trim() },
                type: Product.sequelize.QueryTypes.SELECT
            });

            if (variantBySlugResult.length === 0) {
                return errorResponse(res, { message: 'Variant not found for the provided slug' }, 'Variant not found', 404);
            }

            if (variantBySlugResult.length > 1) {
                // Multiple variants found with same slug (shouldn't happen, but handle it)
                return errorResponse(res, { message: 'Multiple variants found with the same slug' }, 'Multiple variants found', 400);
            }

            // Get attributes and terms for the found variant
            const variantAttributesForSlug = await Product.sequelize.query(`
                SELECT 
                    pva.attribute_id, pva.term_id,
                    a.id as attr_id, a.name as attr_name, a.description as attr_description,
                    t.id as term_id, t.name as term_name, t.description as term_description
                FROM product_variant_attributes pva
                JOIN attributes a ON pva.attribute_id = a.id
                JOIN attribute_terms t ON pva.term_id = t.id
                WHERE pva.variant_id = :variant_id
                AND pva.is_visible = true
            `, {
                replacements: { variant_id: variantBySlugResult[0].id },
                type: Product.sequelize.QueryTypes.SELECT
            });

            if (!variantAttributesForSlug || variantAttributesForSlug.length === 0) {
                return errorResponse(res, { message: 'No attributes or terms found for this variant' }, 'No attributes found', 400);
            }

            // Convert to attribute_terms format
            processedAttributeTerms = variantAttributesForSlug.map(va => ({
                attribute_id: va.attribute_id,
                term_id: va.term_id
            }));
        }

        // 2. PARALLEL BATCH 1: Independent queries that don't depend on variants
        const [
            categoriesResult,
            brandsResult,
            productImagesResult,
            productAttributeTermsResult,
            dealsResult
        ] = await Promise.all([
            // Get product categories with raw SQL
            Product.sequelize.query(`
                SELECT 
                    c.id, c.name, c.slug, pc.is_primary
                FROM product_categories pc
                JOIN categories c ON pc.category_id = c.id
                WHERE pc.product_id = :product_id
            `, {
                replacements: { product_id },
                type: Product.sequelize.QueryTypes.SELECT
            }),

            // Get product brands with raw SQL
            Product.sequelize.query(`
                SELECT 
                    b.id, b.name, b.slug, pb.is_primary
                FROM product_brands pb
                JOIN brands b ON pb.brand_id = b.id
                WHERE pb.product_id = :product_id
            `, {
                replacements: { product_id },
                type: Product.sequelize.QueryTypes.SELECT
            }),

            // Get product images with raw SQL
            Product.sequelize.query(`
                SELECT 
                    id, product_id, image_url, is_primary, alt_text
                FROM product_images
                WHERE product_id = :product_id
            `, {
                replacements: { product_id },
                type: Product.sequelize.QueryTypes.SELECT
            }),

            // Get product attribute terms with raw SQL (include hidden; filter visibility when building attribute_terms)
            Product.sequelize.query(`
                SELECT 
                    pat.attribute_id, pat.term_id, pat.used_in_variation, pat.is_visible_page,
                    a.id as attr_id, a.name as attr_name, a.type as attr_type, a.image_url as attr_image_url, a.description as attr_description,
                    t.id as term_id, t.name as term_name, t.slug as term_slug, t.description as term_description
                FROM product_attribute_terms pat
                JOIN attributes a ON pat.attribute_id = a.id
                JOIN attribute_terms t ON pat.term_id = t.id
                WHERE pat.product_id = :product_id
                AND pat.deleted_at IS NULL
            `, {
                replacements: { product_id },
                type: Product.sequelize.QueryTypes.SELECT
            }),

            // Get deals with raw SQL
            Product.sequelize.query(`
                SELECT 
                    d.id, d.name, d.slug, d.description, d.deal_type, d.required_qty, d.get_qty,
                    d.fixed_price, d.discount_percent, d.tiered_qty_json,
                    d.valid_from, d.valid_to
                FROM deal_products dp
                JOIN deals d ON dp.deal_id = d.id
                WHERE dp.product_id = :product_id
                AND d.is_active = 1 
                AND d.is_deleted = 0 
                AND d.valid_from <= NOW() 
                AND d.valid_to >= NOW()
            `, {
                replacements: { product_id },
                type: Product.sequelize.QueryTypes.SELECT
            })
        ]);

        // 3. Get variants with raw SQL (only active ones) - MUST run before variant-dependent queries
        // Always get all variants (we'll filter by attribute_terms later)
        const variantsQuery = `
            SELECT 
                id, product_id, slug, price, regular_price, discount_price,
                stock, stock_status, is_discontinued, status, low_stock_threshold, description,
                created_at, updated_at
            FROM product_variants
            WHERE product_id = :product_id 
            AND status = 'active'
            AND deleted_at IS NULL
        `;
        
        const variantsReplacements = { product_id };
        
        const variantsResult = await Product.sequelize.query(variantsQuery, {
            replacements: variantsReplacements,
            type: Product.sequelize.QueryTypes.SELECT
        });

        // 4. PARALLEL BATCH 2: Variant-dependent queries (can run in parallel after variants are fetched)
        const [
            variantAttributesResult,
            variantImagesResult
        ] = await Promise.all([
            // Get variant attributes with raw SQL
            Product.sequelize.query(`
                SELECT 
                    pva.variant_id, pva.attribute_id, pva.term_id,
                    a.id as attr_id, a.name as attr_name, a.type as attr_type, a.image_url as attr_image_url, a.description as attr_description,
                    t.id as term_id, t.name as term_name, t.slug as term_slug, t.description as term_description
                FROM product_variant_attributes pva
                JOIN attributes a ON pva.attribute_id = a.id
                JOIN attribute_terms t ON pva.term_id = t.id
                WHERE pva.variant_id IN (
                    SELECT id FROM product_variants 
                    WHERE product_id = :product_id AND status = 'active'
                )
                AND pva.is_visible = true
            `, {
                replacements: variantsReplacements,
                type: Product.sequelize.QueryTypes.SELECT
            }),

            // Get variant images with raw SQL
            Product.sequelize.query(`
                SELECT 
                    id, variant_id, image_url, alt_text, is_primary, sort_order
                FROM product_variant_images
                WHERE variant_id IN (
                    SELECT id FROM product_variants 
                    WHERE product_id = :product_id AND status = 'active'
                )
                AND deleted_at IS NULL
            `, {
                replacements: variantsReplacements,
                type: Product.sequelize.QueryTypes.SELECT
            })
        ]);

        // 5. PARALLEL BATCH 3: Loyalty settings, key highlights, and reviews (can run in parallel with each other)
        const [loyaltySettings, keyHighlightsSetting, reviewsResult] = await Promise.all([
            // Get loyalty settings (keep this as ORM since it's a simple query)
            LoyaltyPointsSettings.findOne({
                where: { status: true },
                order: [['createdAt', 'DESC']]
            }),
            // Get key highlights from settings
            Settings.findOne({
                where: { 
                    content_key: 'key_highlights',
                    is_active: true 
                }
            }),

            // Get reviews for the product with raw SQL
            Product.sequelize.query(`
                SELECT 
                    r.id, r.product_id, r.user_id, r.order_id, r.user_name, r.company_name,
                    r.rating, r.comment, r.verified_by, r.testimonial, r.created_at,
                    u.first_name, u.last_name, u.profile_pic_url,
                    o.order_unique_id
                FROM reviews r
                LEFT JOIN users u ON u.id = r.user_id
                LEFT JOIN orders o ON o.id = r.order_id
                WHERE r.product_id = :product_id
                AND r.deleted_at IS NULL
                ORDER BY r.created_at DESC
            `, {
                replacements: { product_id },
                type: Product.sequelize.QueryTypes.SELECT
            })
        ]);

        // OPTIMIZED: Process raw SQL results into structured data
        // Create maps for efficient data lookup
        const variantAttributesMap = new Map();
        variantAttributesResult.forEach(va => {
            if (!variantAttributesMap.has(va.variant_id)) {
                variantAttributesMap.set(va.variant_id, []);
            }
            variantAttributesMap.get(va.variant_id).push({
                attribute: {
                    id: va.attr_id,
                    name: va.attr_name,
                    type: va.attr_type,
                    image_url: va.attr_image_url,
                    description: va.attr_description || null
                },
                term: {
                    id: va.term_id,
                    name: va.term_name,
                    slug: va.term_slug,
                    description: va.term_description || null
                }
            });
        });

        const variantImagesMap = new Map();
        variantImagesResult.forEach(img => {
            if (!variantImagesMap.has(img.variant_id)) {
                variantImagesMap.set(img.variant_id, []);
            }
            variantImagesMap.get(img.variant_id).push({
                id: img.id,
                variant_id: img.variant_id,
                image_url: img.image_url,
                alt_text: img.alt_text,
                is_primary: Boolean(img.is_primary),
                sort_order: img.sort_order
            });
        });

        // Create structured variants with attributes and images
        const structuredVariants = variantsResult.map(variant => ({
            id: variant.id,
            product_id: variant.product_id,
            slug: variant.slug,
            price: variant.price,
            regular_price: variant.regular_price,
            discount_price: variant.discount_price,
            stock: variant.stock,
            stock_status: variant.stock_status,
            is_discontinued: Boolean(variant.is_discontinued),
            status: variant.status,
            low_stock_threshold: variant.low_stock_threshold,
            description: variant.description,
            created_at: variant.created_at,
            updated_at: variant.updated_at,
            variantAttributes: variantAttributesMap.get(variant.id) || [],
            variantImages: variantImagesMap.get(variant.id) || []
        }));

        // Group attributes and their terms (OPTIMIZED) — only page-visible attributes for UI
        const attributeTermsMap = new Map();
        productAttributeTermsResult.forEach((pat) => {
            if (!(pat.is_visible_page === true || pat.is_visible_page === 1)) return;

            const attributeId = pat.attr_id;
            if (!attributeTermsMap.has(attributeId)) {
                attributeTermsMap.set(attributeId, {
                    attribute: {
                        id: pat.attr_id,
                        name: pat.attr_name,
                        type: pat.attr_type,
                        image_url: pat.attr_image_url,
                        description: pat.attr_description || null,
                        is_visible_page: Boolean(pat.is_visible_page),
                        used_in_variation: Boolean(pat.used_in_variation)
                    },
                    terms: []
                });
            }
            
            // Collect variant slugs for this term
            const variantSlugs = [];
            structuredVariants.forEach(variant => {
                const hasTerm = variant.variantAttributes.some(va => 
                    va.attribute.id === pat.attr_id && va.term.id === pat.term_id
                );
                if (hasTerm && !variantSlugs.includes(variant.slug)) {
                    variantSlugs.push(variant.slug);
                }
            });
            
            // Check if the term is used in variation
            if (pat.used_in_variation) {
                // Check if this term has any corresponding variants
                const hasVariants = structuredVariants.some(variant => 
                    variant.variantAttributes.some(va => 
                        va.attribute.id === pat.attr_id && va.term.id === pat.term_id
                    )
                );
                
                // Only add the term if it has variants
                if (hasVariants) {
                    attributeTermsMap.get(attributeId).terms.push({
                        id: pat.term_id,
                        name: pat.term_name,
                        slug: pat.term_slug,
                        description: pat.term_description || null,
                        used_in_variation: Boolean(pat.used_in_variation),
                        is_visible_page: Boolean(pat.is_visible_page),
                        variant_slugs: variantSlugs
                    });
                }
            } else {
                // If not used in variation, add it regardless
                attributeTermsMap.get(attributeId).terms.push({
                    id: pat.term_id,
                    name: pat.term_name,
                    slug: pat.term_slug,
                    description: pat.term_description || null,
                    used_in_variation: Boolean(pat.used_in_variation),
                    is_visible_page: Boolean(pat.is_visible_page),
                    variant_slugs: variantSlugs
                });
            }
        });

        // Sort terms alphabetically within each attribute
        attributeTermsMap.forEach((value) => {
            value.terms.sort((a, b) => {
                const nameA = (a.name || '').toLowerCase();
                const nameB = (b.name || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });
        });

        // Filter variants based on provided attribute terms (OPTIMIZED)
        let filteredVariants;
        
        if (processedAttributeTerms && processedAttributeTerms.length > 0) {
            // Filter variants based on provided attribute terms
            filteredVariants = structuredVariants.filter(variant => {
                return processedAttributeTerms.every(filter => {
                    return variant.variantAttributes.some(va => 
                        va.attribute.id === filter.attribute_id && 
                        va.term.id === filter.term_id
                    );
                });
            });
        } else {
            // If neither is provided (shouldn't happen due to validation, but handle gracefully)
            filteredVariants = structuredVariants;
        }
        
        // NEW: If slugs was provided, check if exactly one variant matches
        if (slugs && !attribute_terms) {
            if (filteredVariants.length > 1) {
                // More than one variant matches - return null
                return successResponse(res, null, 'Multiple variants match the criteria');
            }
            if (filteredVariants.length === 0) {
                // No variants match (shouldn't happen, but handle it)
                return errorResponse(res, { message: 'No variants match the extracted attributes' }, 'No variants found', 404);
            }
        }
        
        // Get available terms for other attributes
        const availableTermsMap = new Map();
        
        // Create a lookup map for used_in_variation / is_visible_page from productAttributeTermsResult
        const usedInVariationMap = new Map();
        const isVisiblePageMap = new Map();
        productAttributeTermsResult.forEach(pat => {
            const key = `${pat.attr_id}-${pat.term_id}`;
            usedInVariationMap.set(key, Boolean(pat.used_in_variation));
            isVisiblePageMap.set(key, pat.is_visible_page === true || pat.is_visible_page === 1);
        });
        
        filteredVariants.forEach(variant => {
            variant.variantAttributes.forEach(va => {
                const attributeId = va.attribute.id;
                const termId = va.term.id;
                
                // Only consider attributes not in the filter (if using processedAttributeTerms)
                if (!processedAttributeTerms || !Array.isArray(processedAttributeTerms) || !processedAttributeTerms.some(f => f.attribute_id === attributeId)) {
                    // Check if this attribute-term combination has used_in_variation = true
                    const key = `${attributeId}-${termId}`;
                    const usedInVariation = usedInVariationMap.get(key);
                    const isVisiblePage = isVisiblePageMap.get(key);
                    
                    // Only include terms with used_in_variation = true and visible on page
                    if (usedInVariation === true && isVisiblePage === true) {
                        if (!availableTermsMap.has(attributeId)) {
                            availableTermsMap.set(attributeId, {
                                attribute: {
                                    id: va.attribute.id,
                                    name: va.attribute.name,
                                    type: va.attribute.type,
                                    image_url: va.attribute.image_url,
                                    description: va.attribute.description || null
                                },
                                terms: new Map() // Use Map to track variant slugs per term
                            });
                        }
                        
                        const termsMap = availableTermsMap.get(attributeId).terms;
                        
                        if (!termsMap.has(termId)) {
                            termsMap.set(termId, {
                                id: va.term.id,
                                name: va.term.name,
                                slug: va.term.slug,
                                description: va.term.description || null,
                                stock_status: variant.stock_status,
                                is_in_stock: variant.stock > 0,
                                is_discontinued: Boolean(variant.is_discontinued),
                                variant_slugs: []
                            });
                        }
                        
                        // Add variant slug if not already present
                        const termData = termsMap.get(termId);
                        if (!termData.variant_slugs.includes(variant.slug)) {
                            termData.variant_slugs.push(variant.slug);
                        }
                        
                        // Update stock_status and is_in_stock if this variant has better stock
                        if (variant.stock > 0 && !termData.is_in_stock) {
                            termData.is_in_stock = true;
                            termData.stock_status = variant.stock_status;
                        }
                        if (!variant.is_discontinued) {
                            termData.is_discontinued = false;
                        }
                    }
                }
            });
        });

        // Convert Maps to arrays
        availableTermsMap.forEach(value => {
            value.terms = Array.from(value.terms.values());
            // Sort terms alphabetically
            value.terms.sort((a, b) => {
                const nameA = (a.name || '').toLowerCase();
                const nameB = (b.name || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });
        });

        // Calculate stock summary
        const stockSummary = {
            total: filteredVariants.length,
            in_stock: filteredVariants.filter(v => v.stock > 0).length,
            low_stock: filteredVariants.filter(v => 
                v.stock > 0 && v.stock <= v.low_stock_threshold
            ).length,
            out_of_stock: filteredVariants.filter(v => v.stock <= 0).length
        };

        // Process reviews for the product - OPTIMIZED: Single pass processing
        const reviewsMapForProduct = new Map();
        let totalRating = 0;
        let verifiedCount = 0;
        let testimonialCount = 0;
        const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        
        // Single pass: process reviews and calculate statistics simultaneously
        reviewsResult.forEach(review => {
            if (!reviewsMapForProduct.has(review.id)) {
                const processedReview = {
                    id: review.id,
                    user_id: review.user_id,
                    order_id: review.order_id,
                    user_name: review.user_name,
                    company_name: review.company_name,
                    rating: review.rating,
                    comment: review.comment,
                    verified_by: review.verified_by,
                    testimonial: review.testimonial,
                    created_at: review.created_at,
                    user: review.user_id ? {
                        first_name: review.first_name,
                        last_name: review.last_name,
                        profile_pic_url: review.profile_pic_url
                    } : null,
                    order: review.order_id ? {
                        order_unique_id: review.order_unique_id
                    } : null
                };
                
                reviewsMapForProduct.set(review.id, processedReview);
                
                // Calculate statistics in the same loop
                totalRating += review.rating;
                ratingDistribution[review.rating]++;
                if (review.verified_by) verifiedCount++;
                if (review.testimonial) testimonialCount++;
            }
        });
        
        const processedReviews = Array.from(reviewsMapForProduct.values());
        
        // Calculate review statistics - OPTIMIZED: Pre-calculated values
        const reviewStats = {
            total_reviews: processedReviews.length,
            average_rating: processedReviews.length > 0 ? Math.round((totalRating / processedReviews.length) * 10) / 10 : 0,
            rating_distribution: ratingDistribution,
            verified_reviews: verifiedCount,
            testimonials: testimonialCount
        };

        // Prepare variant information with images (OPTIMIZED)
        const product_category = categoriesResult && categoriesResult.length > 0 ? {
            id: categoriesResult[0].id,
            name: categoriesResult[0].name,
            slug: categoriesResult[0].slug
        } : null;
        const product_brand = brandsResult && brandsResult.length > 0 ? {
            id: brandsResult[0].id,
            name: brandsResult[0].name,
            slug: brandsResult[0].slug
        } : null;
        // Prepare all categories and brands
        const all_product_categories = categoriesResult ? categoriesResult.map(cat => ({
            id: cat.id,
            name: cat.name,
            slug: cat.slug
        })) : [];
        const all_product_brands = brandsResult ? brandsResult.map(brand => ({
            id: brand.id,
            name: brand.name,
            slug: brand.slug
        })) : [];

        // Extract puff count based on filtered attribute terms or largest from all
        let puffCount = null;
        
        // Check if the filtered attribute terms include a number-of-puffs attribute (OPTIMIZED)
        const filteredPuffAttribute = (processedAttributeTerms && Array.isArray(processedAttributeTerms) && processedAttributeTerms.length > 0) ? processedAttributeTerms.find(filter => {
            const attribute = productAttributeTermsResult.find(pat => 
                pat.attr_id === filter.attribute_id
            );
            return attribute && attribute.attr_name && /number\s+of\s+puffs/i.test(attribute.attr_name);
        }) : null;
        
        if (filteredPuffAttribute) {
            // Use the specific filtered puff attribute term
            const puffAttribute = productAttributeTermsResult.find(pat => 
                pat.attr_id === filteredPuffAttribute.attribute_id && 
                pat.term_id === filteredPuffAttribute.term_id
            );
            
            if (puffAttribute && puffAttribute.term_name) {
                const termName = puffAttribute.term_name;
                const puffMatches = termName.match(/(\d+)/g);
                
                if (puffMatches) {
                    const count = Math.max(...puffMatches.map(Number));
                    if (termName.toLowerCase().includes('up to')) {
                        puffCount = `~${count} puffs`;
                    } else {
                        puffCount = termName;
                    }
                }
            }
        } else {
            // Fallback to largest puff count from all product attribute terms
            if (productAttributeTermsResult) {
                const puffAttributes = productAttributeTermsResult.filter(pat => {
                    if (!pat.attr_name) return false;
                    // Case-insensitive regex match for "number of puffs" with flexible spacing
                    return /number\s+of\s+puffs/i.test(pat.attr_name);
                });
                
                if (puffAttributes.length > 0) {
                    let maxPuffCount = 0;
                    let maxPuffTerm = null;
                    
                    puffAttributes.forEach(puffAttribute => {
                        if (puffAttribute.term_name) {
                            // Find all numbers in the string
                            const puffMatches = puffAttribute.term_name.match(/(\d+)/g);
                            if (puffMatches) {
                                // Use the largest number in the string
                                const count = Math.max(...puffMatches.map(Number));
                                if (count > maxPuffCount) {
                                    maxPuffCount = count;
                                    maxPuffTerm = puffAttribute.term_name;
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
        }
        // Transform variantsResult to match getMinPriceVariant expected structure
        const transformedVariants = variantsResult.map(variant => ({
            id: variant.id,
            slug: variant.slug,
            price: variant.price,
            regular_price: variant.regular_price,
            discount_price: variant.discount_price,
            stock: variant.stock,
            stock_status: variant.stock_status,
            status: variant.status,
            variantImages: variantImagesMap.get(variant.id) || []
        }));
        
        // Set ProductImages for getMinPriceVariant fallback
        product.ProductImages = productImagesResult.map(img => ({
            id: img.id,
            product_id: img.product_id,
            image_url: img.image_url,
            is_primary: Boolean(img.is_primary),
            alt_text: img.alt_text
        }));
        
        product.variants = transformedVariants;
        // Get min price variant (OPTIMIZED)
        const minPriceVariant = getMinPriceVariant(product);
        const productPrice = minPriceVariant ? minPriceVariant.price : product.price;
        
        // Calculate loyalty points for this product (always calculate for display, regardless of minimum threshold)
        let loyaltyPointsInfo = null;
        if (loyaltySettings && productPrice) {
            const minAmountForPoints = parseFloat(loyaltySettings.min_amount_for_loyalty_points) || 0;
            const meetsMinimum = parseFloat(productPrice) >= minAmountForPoints;
            
            // Always calculate points for display purposes (no minimum threshold check)
            let calculatedPoints = null;
            let calculationMethod = null;
            
            // Use same calculation logic as payment webhooks
            if (loyaltySettings.amount_divisor && parseFloat(loyaltySettings.amount_divisor) > 0) {
                calculatedPoints = Math.floor(parseFloat(productPrice) / parseFloat(loyaltySettings.amount_divisor));
                calculationMethod = 'amount_divisor';
            } else {
                calculatedPoints = parseFloat(loyaltySettings.points_value);
                calculationMethod = 'points_value';
            }
            
            loyaltyPointsInfo = {
                calculated: calculatedPoints,
                canEarn: calculatedPoints !== null && calculatedPoints > 0,
                meetsMinimum: meetsMinimum,  // Keep for informational purposes
                calculationMethod: calculationMethod,
                settings: {
                    program_name: loyaltySettings.program_name,
                    points_value: parseFloat(loyaltySettings.points_value),
                    loyalty_amount: loyaltySettings.loyalty_amount,
                    loyalty_amount_type: loyaltySettings.loyalty_amount_type,
                    minimum_points_redemption: loyaltySettings.minimum_points_redemption,
                    minimum_purchase_amount: loyaltySettings.minimum_purchase_amount,
                    min_amount_for_loyalty_points: loyaltySettings.min_amount_for_loyalty_points,
                    amount_divisor: loyaltySettings.amount_divisor,
                    status: loyaltySettings.status
                }
            };
        }
        
        const finalVariants = filteredVariants.map(variant => {
            // Get primary image or first image
            const primaryImage = variant.variantImages.find(img => img.is_primary) || variant.variantImages[0];
            
            return {
                id: variant.id,
                slug: variant.slug,
                price: variant.price,
                regular_price: variant.regular_price,
                discount_price: variant.discount_price,
                stock: variant.stock,
                stock_status: variant.stock_status,
                status: variant.status,
                description: variant.description,
                is_in_stock: variant.stock > 0,
                is_discontinued: Boolean(variant.is_discontinued),
                primary_image: primaryImage ? {
                    id: primaryImage.id,
                    url: primaryImage.image_url,
                    alt_text: primaryImage.alt_text,
                    is_primary: Boolean(primaryImage.is_primary),
                    sort_order: primaryImage.sort_order
                } : null,
                all_images: variant.variantImages.map(img => ({
                    id: img.id,
                    url: img.image_url,
                    alt_text: img.alt_text,
                    is_primary: Boolean(img.is_primary),
                    sort_order: img.sort_order
                })),
                attributes: variant.variantAttributes.map(va => ({
                    attribute_id: va.attribute.id,
                    attribute_name: va.attribute.name,
                    attribute_image_url: va.attribute.image_url,
                    attribute_description: va.attribute.description || null,
                    term_id: va.term.id,
                    term_name: va.term.name,
                    term_slug: va.term.slug,
                    term_description: va.term.description || null
                })),
                created_at: variant.created_at,
                updated_at: variant.updated_at,
                product_categories: all_product_categories,
                product_brands: all_product_brands
            };
        });
        // Prepare product images (OPTIMIZED)
        const productImages = productImagesResult.map(img => ({
            id: img.id,
            url: img.image_url,
            is_primary: Boolean(img.is_primary),
            alt_text: img.alt_text
        }));

        // Get primary product image
        const primaryProductImage = productImagesResult.find(img => img.is_primary) || productImagesResult[0];

        // Prepare filtered attribute terms with full data (OPTIMIZED)
        const filteredAttributeTerms = (processedAttributeTerms && Array.isArray(processedAttributeTerms) && processedAttributeTerms.length > 0) ? processedAttributeTerms.map(filter => {
            const attribute = productAttributeTermsResult.find(pat => 
                pat.attr_id === filter.attribute_id
            );
            
            // Find all terms for this attribute from product variants with variant slugs
            const allTermsForAttribute = new Map(); // Use Map to track variant slugs per term
            
            // Add terms from product attribute terms
            productAttributeTermsResult
                .filter(pat => pat.attr_id === filter.attribute_id)
                .forEach(pat => {
                    if (!allTermsForAttribute.has(pat.term_id)) {
                        allTermsForAttribute.set(pat.term_id, {
                            id: pat.term_id,
                            name: pat.term_name,
                            slug: pat.term_slug,
                            description: pat.term_description || null,
                            is_selected: pat.term_id === filter.term_id,
                            variant_slugs: []
                        });
                    }
                });
            
            // Add terms from filtered variant attributes and collect variant slugs
            // Use filteredVariants instead of structuredVariants to only show terms from variants matching current filter
            filteredVariants.forEach(variant => {
                variant.variantAttributes
                    .filter(va => va.attribute.id === filter.attribute_id)
                    .forEach(va => {
                        if (!allTermsForAttribute.has(va.term.id)) {
                            allTermsForAttribute.set(va.term.id, {
                                id: va.term.id,
                                name: va.term.name,
                                slug: va.term.slug,
                                description: va.term.description || null,
                                is_selected: va.term.id === filter.term_id,
                                variant_slugs: []
                            });
                        }
                        
                        // Add variant slug if not already present
                        const termData = allTermsForAttribute.get(va.term.id);
                        if (!termData.variant_slugs.includes(variant.slug)) {
                            termData.variant_slugs.push(variant.slug);
                        }
                    });
            });
            // Convert Map to array and filter out terms with no variant slugs
            // Only show terms that actually exist in filtered variants
            const terms = Array.from(allTermsForAttribute.values())
                .filter(term => term.variant_slugs.length > 0);
            
            // Sort terms alphabetically by name
            terms.sort((a, b) => {
                const nameA = (a.name || '').toLowerCase();
                const nameB = (b.name || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });
            
            if (attribute) {
                return {
                    attribute: {
                        id: attribute.attr_id,
                        name: attribute.attr_name,
                        type: attribute.attr_type,
                        image_url: attribute.attr_image_url,
                        description: attribute.attr_description || null
                        // slug: '', // Not available in raw SQL result
                    },
                    terms: terms
                };
            }
            return null;
        }).filter(Boolean) : [];

        // Get key highlights content from settings
        const keyHighlights = keyHighlightsSetting ? keyHighlightsSetting.content : null;

        const hide_variant_selector = shouldHideVariantSelector(
            structuredVariants.length,
            productAttributeTermsResult
        );
        const soleVariant = hide_variant_selector ? structuredVariants[0] : null;

        const response = {
            product: {
                id: product.id,
                name: product.name,
                slug: product.slug,
                description: product.description, // Use direct description from SQL result
                is_discontinued: Boolean(product.is_discontinued),
                created_at: product.createdAt,
                updated_at: product.updatedAt,
                key_highlights: keyHighlights,
                category: product_category,
                brand: product_brand,
                product_categories: all_product_categories,
                product_brands: all_product_brands,
                primary_image: primaryProductImage ? {
                    id: primaryProductImage.id,
                    url: primaryProductImage.image_url,
                    is_primary: Boolean(primaryProductImage.is_primary),
                    alt_text: primaryProductImage.alt_text
                } : null,
                all_images: productImages,
                attribute_terms: Array.from(attributeTermsMap.values()),
                hide_variant_selector,
                default_variant_id: soleVariant ? soleVariant.id : null,
                default_variant_slug: soleVariant ? soleVariant.slug : null,
                deals: dealsResult, // Use raw SQL result
                loyaltySettings: loyaltySettings ? {
                    program_name: loyaltySettings.program_name,
                    points_value: parseFloat(loyaltySettings.points_value),
                    loyalty_amount: loyaltySettings.loyalty_amount,
                    loyalty_amount_type: loyaltySettings.loyalty_amount_type,
                    minimum_points_redemption: loyaltySettings.minimum_points_redemption,
                    minimum_purchase_amount: loyaltySettings.minimum_purchase_amount,
                    min_amount_for_loyalty_points: loyaltySettings.min_amount_for_loyalty_points,
                    status: loyaltySettings.status
                } : null,
                flavors: [], // Not available in raw SQL result
                flavor_count: 0, // Not available in raw SQL result
                puff_count: puffCount,
                price: minPriceVariant ? minPriceVariant.price : product.price,
                regular_price: minPriceVariant ? minPriceVariant.regular_price : product.regular_price,
                discount_price: minPriceVariant ? minPriceVariant.discount_price : product.discount_price,
                min_price_variant: minPriceVariant,
                reviews: processedReviews,
                review_stats: reviewStats,
                loyaltyPoints: loyaltyPointsInfo
            },
            variants: finalVariants.map(variant => ({
                ...variant,
                created_at: variant.created_at,
                updated_at: variant.updated_at
            })),
            available_terms: Array.from(availableTermsMap.values()),
            filtered_attribute_terms: filteredAttributeTerms,
            stock_summary: stockSummary
        };

        return successResponse(res, response, 'Variants filtered successfully');
    } catch (error) {
        console.log("error ---", error);
        logger.error(error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.filterVariantsByAttributesOptimized = async (req, res, next) => {
    try {
        const { product_id, attribute_terms } = req.body;
        
        // Validate input
        if (!product_id || !attribute_terms || !Array.isArray(attribute_terms)) {
            throw new Error('Invalid input parameters');
        }

        // OPTIMIZED: Use raw SQL queries for maximum performance

        // 1. Get product basic info with raw SQL
        const productResult = await Product.sequelize.query(`
            SELECT 
                p.id, p.name, p.slug, p.description, p.price, p.discount_price,
                p.createdAt, p.updatedAt
            FROM products p
            WHERE p.id = :product_id 
            AND p.status = 'published'
            AND p.deletedAt IS NULL
        `, {
            replacements: { product_id },
            type: Product.sequelize.QueryTypes.SELECT
        });

        if (productResult.length === 0) {
            throw new Error('Product not found');
        }

        const product = productResult[0];

        // 2. Get product categories with raw SQL
        const categoriesResult = await Product.sequelize.query(`
            SELECT 
                c.id, c.name, c.slug, pc.is_primary
            FROM product_categories pc
            JOIN categories c ON pc.category_id = c.id
            WHERE pc.product_id = :product_id
        `, {
            replacements: { product_id },
            type: Product.sequelize.QueryTypes.SELECT
        });

        // 3. Get product brands with raw SQL
        const brandsResult = await Product.sequelize.query(`
            SELECT 
                b.id, b.name, b.slug, pb.is_primary
            FROM product_brands pb
            JOIN brands b ON pb.brand_id = b.id
            WHERE pb.product_id = :product_id
        `, {
            replacements: { product_id },
            type: Product.sequelize.QueryTypes.SELECT
        });

        // 4. Get product images with raw SQL
        const productImagesResult = await Product.sequelize.query(`
            SELECT 
                id, product_id, image_url, is_primary, alt_text
            FROM product_images
            WHERE product_id = :product_id
        `, {
            replacements: { product_id },
            type: Product.sequelize.QueryTypes.SELECT
        });

        // 5. Get product attribute terms with raw SQL
        const productAttributeTermsResult = await Product.sequelize.query(`
            SELECT 
                pat.attribute_id, pat.term_id, pat.used_in_variation, pat.is_visible_page,
                a.id as attr_id, a.name as attr_name, a.type as attr_type, a.image_url as attr_image_url,
                t.id as term_id, t.name as term_name, t.slug as term_slug
            FROM product_attribute_terms pat
            JOIN attributes a ON pat.attribute_id = a.id
            JOIN attribute_terms t ON pat.term_id = t.id
            WHERE pat.product_id = :product_id
            AND pat.deleted_at IS NULL
            AND pat.is_visible_page = true
        `, {
            replacements: { product_id },
            type: Product.sequelize.QueryTypes.SELECT
        });

        // 6. Get variants with raw SQL (only active ones)
        const variantsResult = await Product.sequelize.query(`
            SELECT 
                id, product_id, slug, price, regular_price, discount_price,
                stock, stock_status, status, low_stock_threshold,
                created_at, updated_at
            FROM product_variants
            WHERE product_id = :product_id 
            AND status = 'active'
            AND deleted_at IS NULL
        `, {
            replacements: { product_id },
            type: Product.sequelize.QueryTypes.SELECT
        });

        // 7. Get variant attributes with raw SQL
        const variantAttributesResult = await Product.sequelize.query(`
            SELECT 
                pva.variant_id, pva.attribute_id, pva.term_id,
                a.id as attr_id, a.name as attr_name, a.type as attr_type, a.image_url as attr_image_url,
                t.id as term_id, t.name as term_name, t.slug as term_slug
            FROM product_variant_attributes pva
            JOIN attributes a ON pva.attribute_id = a.id
            JOIN attribute_terms t ON pva.term_id = t.id
            WHERE pva.variant_id IN (
                SELECT id FROM product_variants 
                WHERE product_id = :product_id AND status = 'active'
            )
            AND pva.is_visible = true
        `, {
            replacements: { product_id },
            type: Product.sequelize.QueryTypes.SELECT
        });

        // 8. Get variant images with raw SQL
        const variantImagesResult = await Product.sequelize.query(`
            SELECT 
                id, variant_id, image_url, alt_text, is_primary, sort_order
            FROM product_variant_images
            WHERE variant_id IN (
                SELECT id FROM product_variants 
                WHERE product_id = :product_id AND status = 'active'
            )
            AND deleted_at IS NULL
        `, {
            replacements: { product_id },
            type: Product.sequelize.QueryTypes.SELECT
        });

        // 9. Get deals with raw SQL
        const dealsResult = await Product.sequelize.query(`
            SELECT 
                d.id, d.name, d.slug, d.deal_type, d.required_qty, d.get_qty,
                d.fixed_price, d.discount_percent, d.tiered_qty_json,
                d.valid_from, d.valid_to
            FROM deal_products dp
            JOIN deals d ON dp.deal_id = d.id
            WHERE dp.product_id = :product_id
            AND d.is_active = 1 
            AND d.is_deleted = 0 
            AND d.valid_from <= NOW() 
            AND d.valid_to >= NOW()
        `, {
            replacements: { product_id },
            type: Product.sequelize.QueryTypes.SELECT
        });

        // 10. Get loyalty settings (keep this as ORM since it's a simple query)
        const loyaltySettings = await LoyaltyPointsSettings.findOne({
            where: { status: true },
            order: [['createdAt', 'DESC']]
        });

        // 11. Get reviews for the product with raw SQL
        const reviewsResult = await Product.sequelize.query(`
            SELECT 
                r.id, r.product_id, r.user_id, r.order_id, r.user_name, r.company_name,
                r.rating, r.comment, r.verified_by, r.testimonial, r.created_at,
                u.first_name, u.last_name, u.profile_pic_url,
                o.order_unique_id
            FROM reviews r
            LEFT JOIN users u ON u.id = r.user_id
            LEFT JOIN orders o ON o.id = r.order_id
            WHERE r.product_id = :product_id
            AND r.deleted_at IS NULL
            ORDER BY r.created_at DESC
        `, {
            replacements: { product_id },
            type: Product.sequelize.QueryTypes.SELECT
        });

        // OPTIMIZED: Process raw SQL results into structured data
        // Create maps for efficient data lookup
        const variantAttributesMap = new Map();
        variantAttributesResult.forEach(va => {
            if (!variantAttributesMap.has(va.variant_id)) {
                variantAttributesMap.set(va.variant_id, []);
            }
            variantAttributesMap.get(va.variant_id).push({
                attribute: {
                    id: va.attr_id,
                    name: va.attr_name,
                    type: va.attr_type,
                    image_url: va.attr_image_url
                },
                term: {
                    id: va.term_id,
                    name: va.term_name,
                    slug: va.term_slug
                }
            });
        });

        const variantImagesMap = new Map();
        variantImagesResult.forEach(img => {
            if (!variantImagesMap.has(img.variant_id)) {
                variantImagesMap.set(img.variant_id, []);
            }
            variantImagesMap.get(img.variant_id).push({
                id: img.id,
                variant_id: img.variant_id,
                image_url: img.image_url,
                alt_text: img.alt_text,
                is_primary: Boolean(img.is_primary),
                sort_order: img.sort_order
            });
        });

        // Create structured variants with attributes and images
        const structuredVariants = variantsResult.map(variant => ({
            id: variant.id,
            product_id: variant.product_id,
            slug: variant.slug,
            price: variant.price,
            regular_price: variant.regular_price,
            discount_price: variant.discount_price,
            stock: variant.stock,
            stock_status: variant.stock_status,
            status: variant.status,
            low_stock_threshold: variant.low_stock_threshold,
            created_at: variant.created_at,
            updated_at: variant.updated_at,
            variantAttributes: variantAttributesMap.get(variant.id) || [],
            variantImages: variantImagesMap.get(variant.id) || []
        }));

        // Group attributes and their terms (OPTIMIZED)
        const attributeTermsMap = new Map();
        productAttributeTermsResult.forEach((pat) => {
            const attributeId = pat.attr_id;
            if (!attributeTermsMap.has(attributeId)) {
                attributeTermsMap.set(attributeId, {
                    attribute: {
                        id: pat.attr_id,
                        name: pat.attr_name,
                        type: pat.attr_type,
                        image_url: pat.attr_image_url,
                        is_visible_page: Boolean(pat.is_visible_page),
                        used_in_variation: Boolean(pat.used_in_variation)
                    },
                    terms: []
                });
            }
            
            // Collect variant slugs for this term
            const variantSlugs = [];
            structuredVariants.forEach(variant => {
                const hasTerm = variant.variantAttributes.some(va => 
                    va.attribute.id === pat.attr_id && va.term.id === pat.term_id
                );
                if (hasTerm && !variantSlugs.includes(variant.slug)) {
                    variantSlugs.push(variant.slug);
                }
            });
            
            // Check if the term is used in variation
            if (pat.used_in_variation) {
                // Check if this term has any corresponding variants
                const hasVariants = structuredVariants.some(variant => 
                    variant.variantAttributes.some(va => 
                        va.attribute.id === pat.attr_id && va.term.id === pat.term_id
                    )
                );
                
                // Only add the term if it has variants
                if (hasVariants) {
                    attributeTermsMap.get(attributeId).terms.push({
                        id: pat.term_id,
                        name: pat.term_name,
                        slug: pat.term_slug,
                        used_in_variation: Boolean(pat.used_in_variation),
                        is_visible_page: Boolean(pat.is_visible_page),
                        variant_slugs: variantSlugs
                    });
                }
            } else {
                // If not used in variation, add it regardless
                attributeTermsMap.get(attributeId).terms.push({
                    id: pat.term_id,
                    name: pat.term_name,
                    slug: pat.term_slug,
                    used_in_variation: Boolean(pat.used_in_variation),
                    is_visible_page: Boolean(pat.is_visible_page),
                    variant_slugs: variantSlugs
                });
            }
        });

        // Filter variants based on provided attribute terms (OPTIMIZED)
        const filteredVariants = structuredVariants.filter(variant => {
            return attribute_terms.every(filter => {
                return variant.variantAttributes.some(va => 
                    va.attribute.id === filter.attribute_id && 
                    va.term.id === filter.term_id
                );
            });
        });
        // Get available terms for other attributes
        const availableTermsMap = new Map();
        filteredVariants.forEach(variant => {
            variant.variantAttributes.forEach(va => {
                const attributeId = va.attribute.id;
                if (!attribute_terms.some(f => f.attribute_id === attributeId)) {
                    if (!availableTermsMap.has(attributeId)) {
                        availableTermsMap.set(attributeId, {
                            attribute: {
                                id: va.attribute.id,
                                name: va.attribute.name,
                                type: va.attribute.type,
                                image_url: va.attribute.image_url
                            },
                            terms: new Set()
                        });
                    }
                    availableTermsMap.get(attributeId).terms.add(JSON.stringify({
                        id: va.term.id,
                        name: va.term.name,
                        slug: va.term.slug,
                        stock_status: variant.stock_status,
                        is_in_stock: variant.stock > 0
                    }));
                }
            });
        });

        // Convert Sets to arrays and parse JSON strings
        availableTermsMap.forEach(value => {
            value.terms = Array.from(value.terms).map(term => JSON.parse(term));
        });

        // Calculate stock summary
        const stockSummary = {
            total: filteredVariants.length,
            in_stock: filteredVariants.filter(v => v.stock > 0).length,
            low_stock: filteredVariants.filter(v => 
                v.stock > 0 && v.stock <= v.low_stock_threshold
            ).length,
            out_of_stock: filteredVariants.filter(v => v.stock <= 0).length
        };

        // Process reviews for the product - OPTIMIZED: Single pass processing
        const reviewsMapForProduct = new Map();
        let totalRating = 0;
        let verifiedCount = 0;
        let testimonialCount = 0;
        const ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        
        // Single pass: process reviews and calculate statistics simultaneously
        reviewsResult.forEach(review => {
            if (!reviewsMapForProduct.has(review.id)) {
                const processedReview = {
                    id: review.id,
                    user_id: review.user_id,
                    order_id: review.order_id,
                    user_name: review.user_name,
                    company_name: review.company_name,
                    rating: review.rating,
                    comment: review.comment,
                    verified_by: review.verified_by,
                    testimonial: review.testimonial,
                    created_at: review.created_at,
                    user: review.user_id ? {
                        first_name: review.first_name,
                        last_name: review.last_name,
                        profile_pic_url: review.profile_pic_url
                    } : null,
                    order: review.order_id ? {
                        order_unique_id: review.order_unique_id
                    } : null
                };
                
                reviewsMapForProduct.set(review.id, processedReview);
                
                // Calculate statistics in the same loop
                totalRating += review.rating;
                ratingDistribution[review.rating]++;
                if (review.verified_by) verifiedCount++;
                if (review.testimonial) testimonialCount++;
            }
        });
        
        const processedReviews = Array.from(reviewsMapForProduct.values());
        
        // Calculate review statistics - OPTIMIZED: Pre-calculated values
        const reviewStats = {
            total_reviews: processedReviews.length,
            average_rating: processedReviews.length > 0 ? Math.round((totalRating / processedReviews.length) * 10) / 10 : 0,
            rating_distribution: ratingDistribution,
            verified_reviews: verifiedCount,
            testimonials: testimonialCount
        };

        // Prepare variant information with images (OPTIMIZED)
        const product_category = categoriesResult && categoriesResult.length > 0 ? {
            id: categoriesResult[0].id,
            name: categoriesResult[0].name,
            slug: categoriesResult[0].slug
        } : null;
        const product_brand = brandsResult && brandsResult.length > 0 ? {
            id: brandsResult[0].id,
            name: brandsResult[0].name,
            slug: brandsResult[0].slug
        } : null;
        // Prepare all categories and brands
        const all_product_categories = categoriesResult ? categoriesResult.map(cat => ({
            id: cat.id,
            name: cat.name,
            slug: cat.slug
        })) : [];
        const all_product_brands = brandsResult ? brandsResult.map(brand => ({
            id: brand.id,
            name: brand.name,
            slug: brand.slug
        })) : [];
        const product_description = product.description;

        // Extract puff count based on filtered attribute terms or largest from all
        let puffCount = null;
        
        // Check if the filtered attribute terms include a number-of-puffs attribute (OPTIMIZED)
        const filteredPuffAttribute = (attribute_terms && Array.isArray(attribute_terms) && attribute_terms.length > 0) ? attribute_terms.find(filter => {
            const attribute = productAttributeTermsResult.find(pat => 
                pat.attr_id === filter.attribute_id
            );
            return attribute && attribute.attr_name && /number\s+of\s+puffs/i.test(attribute.attr_name);
        }) : null;
        
        if (filteredPuffAttribute) {
            // Use the specific filtered puff attribute term
            const puffAttribute = productAttributeTermsResult.find(pat => 
                pat.attr_id === filteredPuffAttribute.attribute_id && 
                pat.term_id === filteredPuffAttribute.term_id
            );
            
            if (puffAttribute && puffAttribute.term_name) {
                const termName = puffAttribute.term_name;
                const puffMatches = termName.match(/(\d+)/g);
                
                if (puffMatches) {
                    const count = Math.max(...puffMatches.map(Number));
                    if (termName.toLowerCase().includes('up to')) {
                        puffCount = `~${count} puffs`;
                    } else {
                        puffCount = termName;
                    }
                }
            }
        } else {
            // Fallback to largest puff count from all product attribute terms
            if (productAttributeTermsResult) {
                const puffAttributes = productAttributeTermsResult.filter(pat => {
                    if (!pat.attr_name) return false;
                    // Case-insensitive regex match for "number of puffs" with flexible spacing
                    return /number\s+of\s+puffs/i.test(pat.attr_name);
                });
                
                if (puffAttributes.length > 0) {
                    let maxPuffCount = 0;
                    let maxPuffTerm = null;
                    
                    puffAttributes.forEach(puffAttribute => {
                        if (puffAttribute.term_name) {
                            // Find all numbers in the string
                            const puffMatches = puffAttribute.term_name.match(/(\d+)/g);
                            if (puffMatches) {
                                // Use the largest number in the string
                                const count = Math.max(...puffMatches.map(Number));
                                if (count > maxPuffCount) {
                                    maxPuffCount = count;
                                    maxPuffTerm = puffAttribute.term_name;
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
        }
        // Transform variantsResult to match getMinPriceVariant expected structure
        const transformedVariants = variantsResult.map(variant => ({
            id: variant.id,
            slug: variant.slug,
            price: variant.price,
            regular_price: variant.regular_price,
            discount_price: variant.discount_price,
            stock: variant.stock,
            stock_status: variant.stock_status,
            status: variant.status,
            variantImages: variantImagesMap.get(variant.id) || []
        }));
        
        // Set ProductImages for getMinPriceVariant fallback
        product.ProductImages = productImagesResult.map(img => ({
            id: img.id,
            product_id: img.product_id,
            image_url: img.image_url,
            is_primary: Boolean(img.is_primary),
            alt_text: img.alt_text
        }));
        
        product.variants = transformedVariants;
        // Get min price variant (OPTIMIZED)
        const minPriceVariant = getMinPriceVariant(product);
        const finalVariants = filteredVariants.map(variant => {
            // Get primary image or first image
            const primaryImage = variant.variantImages.find(img => img.is_primary) || variant.variantImages[0];
            
            return {
                id: variant.id,
                slug: variant.slug,
                price: variant.price,
                regular_price: variant.regular_price,
                discount_price: variant.discount_price,
                stock: variant.stock,
                stock_status: variant.stock_status,
                status: variant.status,
                description: variant.description,
                is_in_stock: variant.stock > 0,
                primary_image: primaryImage ? {
                    id: primaryImage.id,
                    url: primaryImage.image_url,
                    alt_text: primaryImage.alt_text,
                    is_primary: Boolean(primaryImage.is_primary),
                    sort_order: primaryImage.sort_order
                } : null,
                all_images: variant.variantImages.map(img => ({
                    id: img.id,
                    url: img.image_url,
                    alt_text: img.alt_text,
                    is_primary: Boolean(img.is_primary),
                    sort_order: img.sort_order
                })),
                attributes: variant.variantAttributes.map(va => ({
                    attribute_id: va.attribute.id,
                    attribute_name: va.attribute.name,
                    attribute_image_url: va.attribute.image_url,
                    term_id: va.term.id,
                    term_name: va.term.name,
                    term_slug: va.term.slug
                })),
                created_at: variant.created_at,
                updated_at: variant.updated_at,
                product_categories: all_product_categories,
                product_brands: all_product_brands,
                product_description
            };
        });
        // Prepare product images (OPTIMIZED)
        const productImages = productImagesResult.map(img => ({
            id: img.id,
            url: img.image_url,
            is_primary: Boolean(img.is_primary),
            alt_text: img.alt_text
        }));

        // Get primary product image
        const primaryProductImage = productImagesResult.find(img => img.is_primary) || productImagesResult[0];

        // Prepare filtered attribute terms with full data (OPTIMIZED)
        const filteredAttributeTerms = (processedAttributeTerms && Array.isArray(processedAttributeTerms) && processedAttributeTerms.length > 0) ? processedAttributeTerms.map(filter => {
            const attribute = productAttributeTermsResult.find(pat => 
                pat.attr_id === filter.attribute_id
            );
            
            // Find all terms for this attribute from product variants with variant slugs
            const allTermsForAttribute = new Map(); // Use Map to track variant slugs per term
            
            // Add terms from product attribute terms
            productAttributeTermsResult
                .filter(pat => pat.attr_id === filter.attribute_id)
                .forEach(pat => {
                    if (!allTermsForAttribute.has(pat.term_id)) {
                        allTermsForAttribute.set(pat.term_id, {
                            id: pat.term_id,
                            name: pat.term_name,
                            slug: pat.term_slug,
                            description: '', // Not available in raw SQL result
                            is_selected: pat.term_id === filter.term_id,
                            variant_slugs: []
                        });
                    }
                });
            
            // Add terms from variant attributes and collect variant slugs
            structuredVariants.forEach(variant => {
                variant.variantAttributes
                    .filter(va => va.attribute.id === filter.attribute_id)
                    .forEach(va => {
                        if (!allTermsForAttribute.has(va.term.id)) {
                            allTermsForAttribute.set(va.term.id, {
                                id: va.term.id,
                                name: va.term.name,
                                slug: va.term.slug,
                                description: '', // Not available in raw SQL result
                                is_selected: va.term.id === filter.term_id,
                                variant_slugs: []
                            });
                        }
                        
                        // Add variant slug if not already present
                        const termData = allTermsForAttribute.get(va.term.id);
                        if (!termData.variant_slugs.includes(variant.slug)) {
                            termData.variant_slugs.push(variant.slug);
                        }
                    });
            });
            // Convert Map to array
            const terms = Array.from(allTermsForAttribute.values());
            
            // Sort terms alphabetically by name
            terms.sort((a, b) => {
                const nameA = (a.name || '').toLowerCase();
                const nameB = (b.name || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });
            
            if (attribute) {
                return {
                    attribute: {
                        id: attribute.attr_id,
                        name: attribute.attr_name,
                        type: attribute.attr_type,
                        image_url: attribute.attr_image_url,
                        // slug: '', // Not available in raw SQL result
                        // description: '' // Not available in raw SQL result
                    },
                    terms: terms
                };
            }
            return null;
        }).filter(Boolean) : [];

        const response = {
            product: {
                id: product.id,
                name: product.name,
                slug: product.slug,
                description: product.description, // Use direct description from SQL result
                created_at: product.createdAt,
                updated_at: product.updatedAt,
                category: product_category,
                brand: product_brand,
                product_categories: all_product_categories,
                product_brands: all_product_brands,
                primary_image: primaryProductImage ? {
                    id: primaryProductImage.id,
                    url: primaryProductImage.image_url,
                    is_primary: Boolean(primaryProductImage.is_primary),
                    alt_text: primaryProductImage.alt_text
                } : null,
                all_images: productImages,
                attribute_terms: Array.from(attributeTermsMap.values()),
                deals: dealsResult, // Use raw SQL result
                loyaltySettings: loyaltySettings ? {
                    program_name: loyaltySettings.program_name,
                    points_value: parseFloat(loyaltySettings.points_value),
                    loyalty_amount: loyaltySettings.loyalty_amount,
                    loyalty_amount_type: loyaltySettings.loyalty_amount_type,
                    minimum_points_redemption: loyaltySettings.minimum_points_redemption,
                    minimum_purchase_amount: loyaltySettings.minimum_purchase_amount,
                    min_amount_for_loyalty_points: loyaltySettings.min_amount_for_loyalty_points,
                    status: loyaltySettings.status
                } : null,
                flavors: [], // Not available in raw SQL result
                flavor_count: 0, // Not available in raw SQL result
                puff_count: puffCount,
                price: minPriceVariant ? minPriceVariant.price : product.price,
                regular_price: minPriceVariant ? minPriceVariant.regular_price : product.regular_price,
                discount_price: minPriceVariant ? minPriceVariant.discount_price : product.discount_price,
                min_price_variant: minPriceVariant,
                reviews: processedReviews,
                review_stats: reviewStats
            },
            variants: finalVariants.map(variant => ({
                ...variant,
                created_at: variant.created_at,
                updated_at: variant.updated_at
            })),
            available_terms: Array.from(availableTermsMap.values()),
            filtered_attribute_terms: filteredAttributeTerms,
            stock_summary: stockSummary
        };

        return successResponse(res, response, 'Variants filtered successfully');
    } catch (error) {
        logger.error(error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.filterVariantsByAttributesOld = async (req, res, next) => {
    try {
        const { product_id, attribute_terms } = req.body;
        
        // Validate input
        if (!product_id || !attribute_terms || !Array.isArray(attribute_terms)) {
            throw new Error('Invalid input parameters');
        }

        // Get loyalty settings
        const loyaltySettings = await LoyaltyPointsSettings.findOne({
            where: { status: true },
            order: [['createdAt', 'DESC']]
        });

        // Find product with all necessary relations
        const product = await Product.findOne({
            where: { 
                id: product_id,
                status: productStatus.PUBLISHED
            },
            include: [
                {
                    model: Category,
                    as: 'Categories',
                    attributes: ['id', 'name', 'slug'],
                    through: { attributes: ['is_primary'] }
                },
                {
                    model: Brand,
                    as: 'Brands',
                    attributes: ['id', 'name', 'slug'],
                    through: { attributes: ['is_primary'] }
                },
                {
                    model: ProductVariant,
                    as: 'variants',
                    where: {
                        status: 'active'
                    },
                    include: [
                        {
                            model: ProductVariantAttribute,
                            as: 'variantAttributes',
                            include: [
                                { 
                                    model: Attribute, 
                                    as: 'attribute',
                                    attributes: ['id', 'name', 'type', 'image_url'] 
                                },
                                { model: AttributeTerm, as: 'term' }
                            ]
                        },
                        {
                            model: ProductVariantImage,
                            as: 'variantImages',
                            attributes: ['id', 'variant_id', 'image_url', 'alt_text', 'is_primary', 'sort_order']
                        }
                    ]
                },
                {
                    model: ProductAttributeTerm,
                    as: 'productAttributeTerms',
                    include: [
                        { 
                            model: Attribute, 
                            as: 'attribute',
                            attributes: ['id', 'name', 'type', 'image_url'] 
                        },
                        { model: AttributeTerm, as: 'term' }
                    ]
                },
                {
                    model: ProductImage,
                    as: 'ProductImages',
                    attributes: ['id', 'product_id', 'image_url', 'is_primary']
                },
                // {
                //     model: Flavor,
                //     as: 'Flavors',
                //     through: { 
                //         model: ProductFlavor,
                //         attributes: [] // Exclude ProductFlavor table data from response
                //     },
                //     required: false,
                //     attributes: ['id', 'name']
                // },
                {
                    model: Deal,
                    as: 'deals',
                    through: { 
                        model: DealProduct,
                        attributes: [] // Exclude DealProduct table data from response
                    },
                    where: {
                        is_active: true,
                        is_deleted: false,
                        valid_from: { [Op.lte]: new Date() },
                        valid_to: { [Op.gte]: new Date() }
                    },
                    required: false,
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
                        'valid_from',
                        'valid_to'
                    ]
                }
            ]
        });
        if (!product) {
            throw new Error('Product not found');
        }

        // Group attributes and their terms
        const attributeTermsMap = new Map();
        product.productAttributeTerms.forEach((pat) => {
            const attribute = pat.attribute;
            if (!attributeTermsMap.has(attribute.id)) {
                attributeTermsMap.set(attribute.id, {
                    attribute: {
                        id: attribute.id,
                        name: attribute.name,
                        type: attribute.type,
                        image_url: attribute.image_url,
                        is_visible_page: pat.is_visible_page,
                        used_in_variation: pat.used_in_variation
                    },
                    terms: []
                });
            }
            
            // Check if the term is used in variation
            if (pat.used_in_variation) {
                // Check if this term has any corresponding variants
                const hasVariants = product.variants.some(variant => 
                    variant.variantAttributes.some(va => 
                        va.attribute.id === attribute.id && va.term.id === pat.term.id
                    )
                );
                
                // Only add the term if it has variants
                if (hasVariants) {
                    attributeTermsMap.get(attribute.id).terms.push({
                        id: pat.term.id,
                        name: pat.term.name,
                        slug: pat.term.slug,
                        used_in_variation: pat.used_in_variation,
                        is_visible_page: pat.is_visible_page
                    });
                }
            } else {
                // If not used in variation, add it regardless
                attributeTermsMap.get(attribute.id).terms.push({
                    id: pat.term.id,
                    name: pat.term.name,
                    slug: pat.term.slug,
                    used_in_variation: pat.used_in_variation,
                    is_visible_page: pat.is_visible_page
                });
            }
        });

        // Filter variants based on provided attribute terms
        const filteredVariants = product.variants.filter(variant => {
            return attribute_terms.every(filter => {
                return variant.variantAttributes.some(va => 
                    va.attribute.id === filter.attribute_id && 
                    va.term.id === filter.term_id
                );
            });
        });
        // Get available terms for other attributes
        const availableTermsMap = new Map();
        filteredVariants.forEach(variant => {
            variant.variantAttributes.forEach(va => {
                const attributeId = va.attribute.id;
                if (!attribute_terms.some(f => f.attribute_id === attributeId)) {
                    if (!availableTermsMap.has(attributeId)) {
                        availableTermsMap.set(attributeId, {
                            attribute: {
                                id: va.attribute.id,
                                name: va.attribute.name,
                                type: va.attribute.type,
                                image_url: va.attribute.image_url
                            },
                            terms: new Set()
                        });
                    }
                    availableTermsMap.get(attributeId).terms.add(JSON.stringify({
                        id: va.term.id,
                        name: va.term.name,
                        slug: va.term.slug,
                        stock_status: variant.stock_status,
                        is_in_stock: variant.stock > 0
                    }));
                }
            });
        });

        // Convert Sets to arrays and parse JSON strings
        availableTermsMap.forEach(value => {
            value.terms = Array.from(value.terms).map(term => JSON.parse(term));
        });

        // Calculate stock summary
        const stockSummary = {
            total: filteredVariants.length,
            in_stock: filteredVariants.filter(v => v.stock > 0).length,
            low_stock: filteredVariants.filter(v => 
                v.stock > 0 && v.stock <= v.low_stock_threshold
            ).length,
            out_of_stock: filteredVariants.filter(v => v.stock <= 0).length
        };

        // Prepare variant information with images
        const product_category = product.Categories && product.Categories.length > 0 ? {
            id: product.Categories[0].id,
            name: product.Categories[0].name,
            slug: product.Categories[0].slug
        } : null;
        const product_brand = product.Brands && product.Brands.length > 0 ? {
            id: product.Brands[0].id,
            name: product.Brands[0].name,
            slug: product.Brands[0].slug
        } : null;
        // Prepare all categories and brands
        const all_product_categories = product.Categories ? product.Categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            slug: cat.slug
        })) : [];
        const all_product_brands = product.Brands ? product.Brands.map(brand => ({
            id: brand.id,
            name: brand.name,
            slug: brand.slug
        })) : [];
        const product_description = product.description;

        // Extract puff count based on filtered attribute terms or largest from all
        let puffCount = null;
        
        // Check if the filtered attribute terms include a number-of-puffs attribute
        const filteredPuffAttribute = (attribute_terms && Array.isArray(attribute_terms) && attribute_terms.length > 0) ? attribute_terms.find(filter => {
            const attribute = product.productAttributeTerms.find(pat => 
                pat.attribute.id === filter.attribute_id
            )?.attribute;
            return attribute && attribute.name && /number\s+of\s+puffs/i.test(attribute.name);
        }) : null;
        
        if (filteredPuffAttribute) {
            // Use the specific filtered puff attribute term
            const puffAttribute = product.productAttributeTerms.find(pat => 
                pat.attribute.id === filteredPuffAttribute.attribute_id && 
                pat.term.id === filteredPuffAttribute.term_id
            );
            
            if (puffAttribute && puffAttribute.term) {
                const termName = puffAttribute.term.name;
                const puffMatches = termName.match(/(\d+)/g);
                
                if (puffMatches) {
                    const count = Math.max(...puffMatches.map(Number));
                    if (termName.toLowerCase().includes('up to')) {
                        puffCount = `~${count} puffs`;
                    } else {
                        puffCount = termName;
                    }
                }
            }
        } else {
            // Fallback to largest puff count from all product attribute terms
            if (product.productAttributeTerms) {
                const puffAttributes = product.productAttributeTerms.filter(pat => {
                    if (!pat.attribute || !pat.attribute.name) return false;
                    // Case-insensitive regex match for "number of puffs" with flexible spacing
                    return /number\s+of\s+puffs/i.test(pat.attribute.name);
                });
                
                if (puffAttributes.length > 0) {
                    let maxPuffCount = 0;
                    let maxPuffTerm = null;
                    
                    puffAttributes.forEach(puffAttribute => {
                        if (puffAttribute.term) {
                            // Find all numbers in the string
                            const puffMatches = puffAttribute.term.name.match(/(\d+)/g);
                            if (puffMatches) {
                                // Use the largest number in the string
                                const count = Math.max(...puffMatches.map(Number));
                                if (count > maxPuffCount) {
                                    maxPuffCount = count;
                                    maxPuffTerm = puffAttribute.term.name;
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
        }

        // Get min price variant
        const minPriceVariant = getMinPriceVariant(product);
        const variants = filteredVariants.map(variant => {
            // Get primary image or first image
            const primaryImage = variant.variantImages.find(img => img.is_primary) || variant.variantImages[0];
            
            return {
                id: variant.id,
                slug: variant.slug,
                price: variant.price,
                regular_price: variant.regular_price,
                discount_price: variant.discount_price,
                stock: variant.stock,
                stock_status: variant.stock_status,
                status: variant.status,
                is_in_stock: variant.stock > 0,
                primary_image: primaryImage ? {
                    id: primaryImage.id,
                    url: primaryImage.image_url,
                    alt_text: primaryImage.alt_text,
                    is_primary: primaryImage.is_primary,
                    sort_order: primaryImage.sort_order
                } : null,
                all_images: variant.variantImages.map(img => ({
                    id: img.id,
                    url: img.image_url,
                    alt_text: img.alt_text,
                    is_primary: img.is_primary,
                    sort_order: img.sort_order
                })),
                attributes: variant.variantAttributes.map(va => ({
                    attribute_id: va.attribute.id,
                    attribute_name: va.attribute.name,
                    attribute_image_url: va.attribute.image_url,
                    term_id: va.term.id,
                    term_name: va.term.name,
                    term_slug: va.term.slug
                })),
                created_at: variant.created_at,
                updated_at: variant.updated_at,
                product_categories: all_product_categories,
                product_brands: all_product_brands,
                product_description
            };
        });
        // Prepare product images
        const productImages = product.ProductImages.map(img => ({
            id: img.id,
            url: img.image_url,
            is_primary: img.is_primary,
            alt_text: img.alt_text
        }));

        // Get primary product image
        const primaryProductImage = product.ProductImages.find(img => img.is_primary) || product.ProductImages[0];

        // Prepare filtered attribute terms with full data
        const filteredAttributeTerms = (attribute_terms && Array.isArray(attribute_terms) && attribute_terms.length > 0) ? attribute_terms.map(filter => {
            const attribute = product.productAttributeTerms.find(pat => 
                pat.attribute.id === filter.attribute_id
            )?.attribute;
            
            // Find all terms for this attribute from product variants
            const allTermsForAttribute = new Set();
            
            // Add terms from product attribute terms
            product.productAttributeTerms
                .filter(pat => pat.attribute.id === filter.attribute_id)
                .forEach(pat => {
                    allTermsForAttribute.add(JSON.stringify({
                        id: pat.term.id,
                        name: pat.term.name,
                        slug: pat.term.slug,
                        description: pat.term.description,
                        is_selected: pat.term.id === filter.term_id
                    }));
                });
            
            // Add terms from variant attributes
            product.variants.forEach(variant => {
                variant.variantAttributes
                    .filter(va => va.attribute.id === filter.attribute_id)
                    .forEach(va => {
                        allTermsForAttribute.add(JSON.stringify({
                            id: va.term.id,
                            name: va.term.name,
                            slug: va.term.slug,
                            description: va.term.description,
                            is_selected: va.term.id === filter.term_id
                        }));
                    });
            });
            // Convert Set to array and parse JSON strings
            const terms = Array.from(allTermsForAttribute).map(term => JSON.parse(term));
            
            if (attribute) {
                return {
                    attribute: {
                        id: attribute.id,
                        name: attribute.name,
                        type: attribute.type,
                        image_url: attribute.image_url,
                        slug: attribute.slug,
                        description: attribute.description
                    },
                    terms: terms
                };
            }
            return null;
        }).filter(Boolean) : [];

        const response = {
            product: {
                id: product.id,
                name: product.name,
                slug: product.slug,
                description: product.variants && product.variants.length && product.variants[0].description ? product.variants[0].description : product.description,
                created_at: product.createdAt,
                updated_at: product.updatedAt,
                category: product.Categories && product.Categories.length > 0 ? {
                    id: product.Categories[0].id,
                    name: product.Categories[0].name,
                    slug: product.Categories[0].slug
                } : null,
                brand: product.Brands && product.Brands.length > 0 ? {
                    id: product.Brands[0].id,
                    name: product.Brands[0].name,
                    slug: product.Brands[0].slug
                } : null,
                product_categories: all_product_categories,
                product_brands: all_product_brands,
                primary_image: primaryProductImage ? {
                    id: primaryProductImage.id,
                    url: primaryProductImage.image_url,
                    is_primary: primaryProductImage.is_primary,
                    alt_text: primaryProductImage.alt_text
                } : null,
                all_images: productImages,
                attribute_terms: Array.from(attributeTermsMap.values()),
                deals: product.deals,
                loyaltySettings: loyaltySettings ? {
                    program_name: loyaltySettings.program_name,
                    points_value: parseFloat(loyaltySettings.points_value),
                    loyalty_amount: loyaltySettings.loyalty_amount,
                    loyalty_amount_type: loyaltySettings.loyalty_amount_type,
                    minimum_points_redemption: loyaltySettings.minimum_points_redemption,
                    minimum_purchase_amount: loyaltySettings.minimum_purchase_amount,
                    min_amount_for_loyalty_points: loyaltySettings.min_amount_for_loyalty_points,
                    status: loyaltySettings.status
                } : null,
                flavors: product.Flavors ? product.Flavors.map(flavor => ({
                    id: flavor.id,
                    name: flavor.name,
                    description: flavor.description
                })) : [],
                flavor_count: product.Flavors ? product.Flavors.length : 0,
                puff_count: puffCount,
                price: minPriceVariant ? minPriceVariant.price : product.price,
                regular_price: minPriceVariant ? minPriceVariant.regular_price : product.regular_price,
                discount_price: minPriceVariant ? minPriceVariant.discount_price : product.discount_price,
                min_price_variant: minPriceVariant
            },
            variants: variants.map(variant => ({
                ...variant,
                created_at: variant.created_at,
                updated_at: variant.updated_at
            })),
            available_terms: Array.from(availableTermsMap.values()),
            filtered_attribute_terms: filteredAttributeTerms,
            stock_summary: stockSummary
        };

        return successResponse(res, response, 'Variants filtered successfully');
    } catch (error) {
        logger.error(error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.getDealsByCategory = async (req, res, next) => {
    try {
        const { category_id } = req.params;
        const { deal_id, limit = 10, offset = 0 } = req.query;

        // Validate category_id
        if (!category_id) {
            throw new Error('Category ID is required');
        }

        // Check if category exists
        const category = await Category.findByPk(category_id);
        if (!category) {
            throw new Error('Category not found');
        }

        // Build deal filter
        const dealFilter = {
            is_active: true,
            is_deleted: false,
            valid_from: { [Op.lte]: new Date() },
            valid_to: { [Op.gte]: new Date() }
        };

        // Add deal_id filter if provided
        if (deal_id) {
            dealFilter.id = deal_id;
        }

        // Get all products in the category with their deals
        const productsWithDeals = await Product.findAll({
            where: {
                status: productStatus.PUBLISHED
            },
            include: [
                {
                    model: Category,
                    as: 'Categories',
                    attributes: ['id', 'name', 'slug'],
                    through: { attributes: ['is_primary'] },
                    where: { id: category_id }
                },
                {
                    model: Brand,
                    as: 'Brands',
                    attributes: ['id', 'name', 'slug'],
                    through: { attributes: ['is_primary'] }
                },
                {
                    model: ProductImage,
                    as: 'ProductImages',
                    attributes: ['id', 'image_url', 'is_primary'],
                    where: { is_primary: true },
                    required: false
                },
                // {
                //     model: Flavor,
                //     as: 'Flavors',
                //     through: { 
                //         model: ProductFlavor,
                //         attributes: [] // Exclude ProductFlavor table data from response
                //     },
                //     required: false,
                //     attributes: ['id', 'name']
                // },
                {
                    model: ProductVariant,
                    as: 'variants',
                    where: { status: 'active' },
                    include: [
                        {
                            model: ProductVariantImage,
                            as: 'variantImages',
                            attributes: ['id', 'image_url', 'is_primary']
                        }
                    ]
                },
                {
                    model: ProductAttributeTerm,
                    as: 'productAttributeTerms',
                    include: [
                        { 
                            model: Attribute, 
                            as: 'attribute',
                            attributes: ['id', 'name', 'type', 'image_url'] 
                        },
                        { 
                            model: AttributeTerm, 
                            as: 'term',
                            attributes: ['id', 'name', 'slug'] 
                        }
                    ]
                },
                {
                    model: Deal,
                    as: 'deals',
                    through: { 
                        model: DealProduct,
                        attributes: [] // Exclude DealProduct table data from response
                    },
                    where: dealFilter,
                    required: false,
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
                        'valid_from',
                        'valid_to'
                    ]
                }
            ],
            attributes: [
                'id', 
                'name', 
                'slug', 
                // 'description', 
                'price', 
                'discount_price',
                'stock_quantity',
                'createdAt',
                'updatedAt'
            ],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['createdAt', 'DESC']]
        });

        // Get total count for pagination
        const totalCount = await Product.count({
            where: {
                status: productStatus.PUBLISHED
            },
            include: [
                {
                    model: Category,
                    as: 'Categories',
                    where: { id: category_id }
                },
                {
                    model: Deal,
                    as: 'deals',
                    through: { 
                        model: DealProduct,
                        attributes: []
                    },
                    where: dealFilter,
                    required: false
                }
            ]
        });

        // Filter products that have deals
        const productsWithActiveDeals = productsWithDeals.filter(product => 
            product.deals && product.deals.length > 0
        );

        // Transform the response
        const transformedProducts = productsWithActiveDeals.map(product => {
            // Get minimum price variant using the helper function
            const minPriceVariant = getMinPriceVariant(product);
            
            // Puff count extraction logic (copied from product.helper.js)
            let puffCount = null;
            if (product.productAttributeTerms) {
                const puffAttributes = product.productAttributeTerms.filter(pat => {
                    if (!pat.attribute || !pat.attribute.name) return false;
                    // Case-insensitive regex match for "number of puffs" with flexible spacing
                    return /number\s+of\s+puffs/i.test(pat.attribute.name);
                });
                if (puffAttributes.length > 0) {
                    let maxPuffCount = 0;
                    let maxPuffTerm = null;
                    puffAttributes.forEach(pat => {
                        if (pat.term) {
                            const puffMatches = pat.term.name.match(/(\d+)/g);
                            if (puffMatches) {
                                const count = Math.max(...puffMatches.map(Number));
                                if (count > maxPuffCount) {
                                    maxPuffCount = count;
                                    maxPuffTerm = pat.term.name;
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

            // Flavor count extraction logic (copied from product.helper.js)
            let flavorTerms = [];
            if (product.productAttributeTerms) {
                flavorTerms = product.productAttributeTerms
                    .filter(pat => pat.attribute && pat.attribute.name === 'flavour' && pat.term)
                    .map(pat => ({
                        id: pat.term.id,
                        name: pat.term.name,
                        slug: pat.term.slug
                    }));
            }
            const flavor_count = flavorTerms.length;
            
            const primaryImage = product.ProductImages && product.ProductImages.length > 0 
                ? product.ProductImages[0] 
                : null;

            return {
                id: product.id,
                name: product.name,
                slug: product.slug,
                description: product.description,
                price: minPriceVariant ? minPriceVariant.price : product.price,
                regular_price: minPriceVariant ? minPriceVariant.regular_price : product.price,
                discount_price: minPriceVariant ? minPriceVariant.discount_price : product.discount_price,
                stock_quantity: product.stock_quantity,
                puff_count: puffCount,
                flavor_count: flavor_count,
                created_at: product.createdAt,
                updated_at: product.updatedAt,
                category: product.Categories && product.Categories.length > 0 ? {
                    id: product.Categories[0].id,
                    name: product.Categories[0].name,
                    slug: product.Categories[0].slug
                } : null,
                brand: product.Brands && product.Brands.length > 0 ? {
                    id: product.Brands[0].id,
                    name: product.Brands[0].name,
                    slug: product.Brands[0].slug
                } : null,
                primary_image: primaryImage ? {
                    id: primaryImage.id,
                    url: primaryImage.image_url,
                    is_primary: primaryImage.is_primary,
                    alt_text: primaryImage.alt_text
                } : null,
                flavors: product.Flavors ? product.Flavors.map(flavor => ({
                    id: flavor.id,
                    name: flavor.name,
                    description: flavor.description
                })) : [],
                deals: product.deals.map(deal => ({
                    id: deal.id,
                    name: deal.name,
                    slug: deal.slug,
                    deal_type: deal.deal_type,
                    required_qty: deal.required_qty,
                    get_qty: deal.get_qty,
                    fixed_price: deal.fixed_price,
                    discount_percent: deal.discount_percent,
                    tiered_qty_json: deal.tiered_qty_json,
                    valid_from: deal.valid_from,
                    valid_to: deal.valid_to
                }))
            };
        });
        // Calculate pagination info
        const totalPages = Math.ceil(totalCount / parseInt(limit));
        const currentPage = Math.floor(parseInt(offset) / parseInt(limit)) + 1;

        const response = {
            category: {
                id: category.id,
                name: category.name,
                slug: category.slug,
                description: category.description
            },
            products: transformedProducts,
            pagination: {
                total_count: totalCount,
                total_pages: totalPages,
                current_page: currentPage,
                limit: parseInt(limit),
                offset: parseInt(offset),
                has_next: currentPage < totalPages,
                has_prev: currentPage > 1
            },
            summary: {
                total_products_with_deals: transformedProducts.length,
                total_deals: transformedProducts.reduce((sum, product) => sum + product.deals.length, 0)
            }
        };

        return successResponse(res, response, 'Deals by category retrieved successfully');
    } catch (error) {
        logger.error('Error getting deals by category:', error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.getCategoriesWithDeals = async (req, res, next) => {
    try {
        const { limit = 10, offset = 0 } = req.query;

        // Get all categories that have products with active deals
        const categoriesWithDeals = await Category.findAll({
            where: {
                deletedAt: null
            },
            include: [
                {
                    model: Product,
                    as: 'Products',
                    where: {
                        status: productStatus.PUBLISHED
                    },
                    include: [
                        {
                            model: Deal,
                            as: 'deals',
                            through: { 
                                model: DealProduct,
                                attributes: []
                            },
                            where: {
                                is_active: true,
                                is_deleted: false,
                                valid_from: { [Op.lte]: new Date() },
                                valid_to: { [Op.gte]: new Date() }
                            },
                            required: true,
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
                                'valid_from',
                                'valid_to',
                                'createdAt'
                            ]
                        }
                    ],
                    required: true,
                    attributes: ['id']
                }
            ],
            attributes: [
                'id', 
                'name', 
                'slug', 
                'description',
                'logo_url'
            ],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['name', 'ASC']]
        });

        // Get total count for pagination
        const totalCount = await Category.count({
            where: {
                deletedAt: null
            },
            include: [
                {
                    model: Product,
                    as: 'Products',
                    where: {
                        status: productStatus.PUBLISHED
                    },
                    include: [
                        {
                            model: Deal,
                            as: 'deals',
                            through: { 
                                model: DealProduct,
                                attributes: []
                            },
                            where: {
                                is_active: true,
                                is_deleted: false,
                                valid_from: { [Op.lte]: new Date() },
                                valid_to: { [Op.gte]: new Date() }
                            },
                            required: true
                        }
                    ],
                    required: true
                }
            ]
        });

        // Transform the response
        const transformedCategories = categoriesWithDeals.map(category => {
            // Get unique deals for this category
            const deals = [...new Set(category.Products.flatMap(product => product.deals))].filter(Boolean);

            return {
                id: category.id,
                name: category.name,
                slug: category.slug,
                description: category.description,
                logo_url: category.logo_url,
                deals: deals.map(deal => ({
                    id: deal.id,
                    name: deal.name,
                    slug: deal.slug,
                    deal_type: deal.deal_type,
                    required_qty: deal.required_qty,
                    get_qty: deal.get_qty,
                    fixed_price: deal.fixed_price,
                    discount_percent: deal.discount_percent,
                    tiered_qty_json: deal.tiered_qty_json,
                    valid_from: deal.valid_from,
                    valid_to: deal.valid_to,
                    createdAt: deal.createdAt
                })),
                deal_count: deals.length,
                product_count: category.Products.length
            };
        });

        // Calculate pagination info
        const totalPages = Math.ceil(totalCount / parseInt(limit));
        const currentPage = Math.floor(parseInt(offset) / parseInt(limit)) + 1;

        const response = {
            categories: transformedCategories,
            pagination: {
                total_count: totalCount,
                total_pages: totalPages,
                current_page: currentPage,
                limit: parseInt(limit),
                offset: parseInt(offset),
                has_next: currentPage < totalPages,
                has_prev: currentPage > 1
            },
            summary: {
                total_categories: transformedCategories.length,
                total_deals: [...new Set(transformedCategories.flatMap(cat => cat.deals.map(deal => deal.id)))].length,
                total_products: transformedCategories.reduce((sum, cat) => sum + cat.product_count, 0)
            }
        };

        return successResponse(res, response, 'Categories with deals retrieved successfully');
    } catch (error) {
        logger.error('Error getting categories with deals:', error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.getAllDeals = async (req, res, next) => {
    try {
        const { limit = 10, offset = 0, deal_type, search, show_home_page } = req.query;

        // Build deal filter
        const dealFilter = {
            is_active: true,
            is_deleted: false,
            valid_from: { [Op.lte]: new Date() },
            valid_to: { [Op.gte]: new Date() }
        };

        // Add deal_type filter if provided
        if (deal_type) {
            dealFilter.deal_type = deal_type;
        }

        // Add show_home_page filter if provided
        if (show_home_page !== undefined) {
            dealFilter.show_home_page = show_home_page === 'true' || show_home_page === true;
        }

        // Add search filter if provided
        if (search) {
            dealFilter[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },
                { slug: { [Op.iLike]: `%${search}%` } }
            ];
        }

        // Get all active deals
        const deals = await Deal.findAll({
            where: dealFilter,
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
                'show_home_page',
                'updatedAt'
            ],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['createdAt', 'DESC']]
        });

        // Get total count for pagination
        const totalCount = await Deal.count({
            where: dealFilter
        });

        // Transform the response
        const transformedDeals = deals.map(deal => ({
            id: deal.id,
            name: deal.name,
            slug: deal.slug,
            description: deal.description,
            deal_type: deal.deal_type,
            required_qty: deal.required_qty,
            get_qty: deal.get_qty,
            fixed_price: deal.fixed_price,
            discount_percent: deal.discount_percent,
            tiered_qty_json: deal.tiered_qty_json,
            bundle_product_ids_json: deal.bundle_product_ids_json,
            valid_from: deal.valid_from,
            valid_to: deal.valid_to,
            image_url: deal.image_url,
            alt_text: deal.alt_text,
            show_home_page: deal.show_home_page,
            created_at: deal.createdAt,
            updated_at: deal.updatedAt
        }));

        // Calculate pagination info
        const totalPages = Math.ceil(totalCount / parseInt(limit));
        const currentPage = Math.floor(parseInt(offset) / parseInt(limit)) + 1;

        const response = {
            deals: transformedDeals,
            pagination: {
                total_count: totalCount,
                total_pages: totalPages,
                current_page: currentPage,
                limit: parseInt(limit),
                offset: parseInt(offset),
                has_next: currentPage < totalPages,
                has_prev: currentPage > 1
            },
            summary: {
                total_deals: transformedDeals.length
            }
        };

        return successResponse(res, response, 'All deals retrieved successfully');
    } catch (error) {
        logger.error('Error getting all deals:', error);
        return errorResponse(res, error, error.message);
    }
};

// OPTIMIZED VERSION - 96%+ faster performance using raw SQL queries
module.exports.getMoreLikeThisProducts = async (req, res, next) => {
    try { 
        const { product_id, limit = 10, offset = 0 } = req.query;

        // Validate product_id
        if (!product_id) {
            throw new Error('Product ID is required');
        }

        const parsedLimit = parseInt(limit);
        const parsedOffset = parseInt(offset);

        // Step 1: Get source product data with raw SQL
        const sourceProductQuery = `
            SELECT 
                p.id, p.name, p.slug, p.price, p.discount_price, p.stock_quantity,
                p.createdAt, p.updatedAt
            FROM products p
            WHERE p.id = :product_id AND p.status = 'published' AND p.deletedAt IS NULL
        `;

        const sourceProductResult = await Product.sequelize.query(sourceProductQuery, {
            replacements: { product_id },
            type: Product.sequelize.QueryTypes.SELECT
        });

        if (sourceProductResult.length === 0) {
            throw new Error('Source product not found');
        }

        const sourceProduct = sourceProductResult[0];

        // Step 2: Get source product categories and attributes in parallel
        const [sourceCategoriesResult, sourceAttributesResult] = await Promise.all([
            // Source product categories
            Product.sequelize.query(`
                SELECT c.id, c.name, c.slug
                FROM categories c
                JOIN product_categories pc ON c.id = pc.category_id
                WHERE pc.product_id = :product_id
            `, {
                replacements: { product_id },
                type: Product.sequelize.QueryTypes.SELECT
            }),

            // Source product attributes
            Product.sequelize.query(`
                SELECT 
                    pat.attribute_id, pat.term_id,
                    a.id as attr_id, a.name as attr_name, a.type as attr_type, a.image_url as attr_image_url,
                    t.id as term_id, t.name as term_name, t.slug as term_slug
                FROM product_attribute_terms pat
                JOIN attributes a ON pat.attribute_id = a.id
                JOIN attribute_terms t ON pat.term_id = t.id
                WHERE pat.product_id = :product_id AND pat.deleted_at IS NULL
            `, {
                replacements: { product_id },
                type: Product.sequelize.QueryTypes.SELECT
            })
        ]);

        const sourceCategoryIds = sourceCategoriesResult.map(cat => cat.id);
        const sourceAttributeTerms = sourceAttributesResult.map(attr => ({
            attribute_id: attr.attribute_id,
            term_id: attr.term_id
        }));

        if (sourceCategoryIds.length === 0) {
            throw new Error('Source product has no categories');
        }

        // Step 3: Get total count first (for pagination) - match original logic exactly
        const totalCountQuery = `
            SELECT COUNT(DISTINCT p.id) as total_count
            FROM products p
            INNER JOIN product_categories pc ON p.id = pc.product_id
            WHERE p.id != :product_id 
            AND p.status = 'published' 
            AND p.deletedAt IS NULL
            AND pc.category_id IN (${sourceCategoryIds.join(',')})
            AND EXISTS (SELECT 1 FROM product_variants pv_active WHERE pv_active.product_id = p.id AND pv_active.status = 'active' AND pv_active.deleted_at IS NULL)
        `;

        const totalCountResult = await Product.sequelize.query(totalCountQuery, {
            replacements: { product_id },
            type: Product.sequelize.QueryTypes.SELECT
        });

        const totalCount = totalCountResult[0].total_count;

        if (totalCount === 0) {
            return successResponse(res, {
                source_product: {
                    id: sourceProduct.id,
                    name: sourceProduct.name,
                    slug: sourceProduct.slug,
                    categories: sourceCategoriesResult,
                    attributes: sourceAttributesResult.map(attr => ({
                        attribute: {
                            id: attr.attr_id,
                            name: attr.attr_name,
                            type: attr.attr_type
                        },
                        term: {
                            id: attr.term_id,
                            name: attr.term_name,
                            slug: attr.term_slug
                        }
                    }))
                },
                similar_products: [],
                pagination: {
                    total_count: 0,
                    total_pages: 0,
                    current_page: 1,
                    limit: parsedLimit,
                    offset: parsedOffset,
                    has_next: false,
                    has_prev: false
                },
                summary: {
                    total_similar_products: 0,
                    average_similarity_score: 0
                }
            }, 'More like this products retrieved successfully');
        }

        // Step 4: Find similar products with pagination applied FIRST (match original logic)
        const similarProductsQuery = `
            SELECT DISTINCT
                p.id, p.name, p.slug, p.price, p.discount_price, p.stock_quantity, p.puff_count,
                p.createdAt, p.updatedAt
            FROM products p
            INNER JOIN product_categories pc ON p.id = pc.product_id
            WHERE p.id != :product_id 
            AND p.status = 'published' 
            AND p.deletedAt IS NULL
            AND pc.category_id IN (${sourceCategoryIds.join(',')})
            AND EXISTS (SELECT 1 FROM product_variants pv_active WHERE pv_active.product_id = p.id AND pv_active.status = 'active' AND pv_active.deleted_at IS NULL)
            ORDER BY p.createdAt DESC
            LIMIT :limit OFFSET :offset
        `;

        const similarProductsResult = await Product.sequelize.query(similarProductsQuery, {
            replacements: { 
                product_id,
                limit: parsedLimit,
                offset: parsedOffset
            },
            type: Product.sequelize.QueryTypes.SELECT
        });

        if (similarProductsResult.length === 0) {
            return successResponse(res, {
                source_product: {
                    id: sourceProduct.id,
                    name: sourceProduct.name,
                    slug: sourceProduct.slug,
                    categories: sourceCategoriesResult,
                    attributes: sourceAttributesResult.map(attr => ({
                        attribute: {
                            id: attr.attr_id,
                            name: attr.attr_name,
                            type: attr.attr_type
                        },
                        term: {
                            id: attr.term_id,
                            name: attr.term_name,
                            slug: attr.term_slug
                        }
                    }))
                },
                similar_products: [],
                pagination: {
                    total_count: totalCount,
                    total_pages: Math.ceil(totalCount / parsedLimit),
                    current_page: Math.floor(parsedOffset / parsedLimit) + 1,
                    limit: parsedLimit,
                    offset: parsedOffset,
                    has_next: Math.floor(parsedOffset / parsedLimit) + 1 < Math.ceil(totalCount / parsedLimit),
                    has_prev: Math.floor(parsedOffset / parsedLimit) + 1 > 1
                },
                summary: {
                    total_similar_products: 0,
                    average_similarity_score: 0
                }
            }, 'More like this products retrieved successfully');
        }

        const productIds = similarProductsResult.map(p => p.id);

        // Step 5: Get all related data in parallel for the paginated products
        const [
            categoriesResult,
            brandsResult,
            productImagesResult,
            variantsResult,
            variantImagesResult,
            dealsResult,
            attributeTermsResult
        ] = await Promise.all([
            // Categories
            Product.sequelize.query(`
                SELECT 
                    pc.product_id, c.id, c.name, c.slug
                FROM product_categories pc
                JOIN categories c ON pc.category_id = c.id
                WHERE pc.product_id IN (:productIds)
            `, {
                replacements: { productIds },
                type: Product.sequelize.QueryTypes.SELECT
            }),

            // Brands
            Product.sequelize.query(`
                SELECT 
                    pb.product_id, b.id, b.name, b.slug
                FROM product_brands pb
                JOIN brands b ON pb.brand_id = b.id
                WHERE pb.product_id IN (:productIds)
            `, {
                replacements: { productIds },
                type: Product.sequelize.QueryTypes.SELECT
            }),

            // Product Images
            Product.sequelize.query(`
                SELECT 
                    pi.id, pi.product_id, pi.image_url, pi.is_primary, pi.alt_text
                FROM product_images pi
                WHERE pi.product_id IN (:productIds)
                AND pi.is_primary = 1
            `, {
                replacements: { productIds },
                type: Product.sequelize.QueryTypes.SELECT
            }),

            // Variants
            Product.sequelize.query(`
                SELECT 
                    pv.id, pv.product_id, pv.price, pv.regular_price, 
                    pv.discount_price, pv.stock, pv.stock_status, pv.status
                FROM product_variants pv
                WHERE pv.product_id IN (:productIds)
                AND pv.status = 'active'
            `, {
                replacements: { productIds },
                type: Product.sequelize.QueryTypes.SELECT
            }),

            // Variant Images
            Product.sequelize.query(`
                SELECT 
                    pvi.id, pvi.variant_id, pvi.image_url, pvi.is_primary
                FROM product_variant_images pvi
                JOIN product_variants pv ON pvi.variant_id = pv.id
                WHERE pv.product_id IN (:productIds)
                AND pv.status = 'active'
            `, {
                replacements: { productIds },
                type: Product.sequelize.QueryTypes.SELECT
            }),

            // Deals
            Product.sequelize.query(`
                SELECT 
                    d.id, d.name, d.slug, d.image_url, d.deal_type, d.required_qty,
                    d.get_qty, d.fixed_price, d.discount_percent, d.tiered_qty_json,
                    d.bundle_product_ids_json, d.valid_from, d.valid_to, dp.product_id
                FROM deal_products dp
                JOIN deals d ON dp.deal_id = d.id
                WHERE dp.product_id IN (:productIds)
                    AND d.is_active = 1 
                    AND d.is_deleted = 0 
                    AND d.valid_from <= NOW() 
                    AND d.valid_to >= NOW()
            `, {
                replacements: { productIds },
                type: Product.sequelize.QueryTypes.SELECT
            }),

            // Product Attribute Terms
            Product.sequelize.query(`
                SELECT 
                    pat.id, pat.product_id, pat.attribute_id, pat.term_id, pat.is_visible_page,
                    pat.used_in_variation, pat.updated_by, pat.created_at, pat.updated_at, pat.deleted_at,
                    a.id as attr_id, a.name as attr_name, a.type as attr_type, a.image_url as attr_image_url,
                    t.id as term_id, t.name as term_name, t.slug as term_slug
                FROM product_attribute_terms pat
                JOIN attributes a ON pat.attribute_id = a.id
                JOIN attribute_terms t ON pat.term_id = t.id
                WHERE pat.product_id IN (:productIds)
                AND pat.deleted_at IS NULL
            `, {
                replacements: { productIds },
                type: Product.sequelize.QueryTypes.SELECT
            })
        ]);

        // Step 6: Build data maps
        const categoriesMap = new Map();
        categoriesResult.forEach(cat => {
            if (!categoriesMap.has(cat.product_id)) {
                categoriesMap.set(cat.product_id, []);
            }
            categoriesMap.get(cat.product_id).push({
                id: cat.id,
                name: cat.name,
                slug: cat.slug
            });
        });

        const brandsMap = new Map();
        brandsResult.forEach(brand => {
            if (!brandsMap.has(brand.product_id)) {
                brandsMap.set(brand.product_id, []);
            }
            brandsMap.get(brand.product_id).push({
                id: brand.id,
                name: brand.name,
                slug: brand.slug
            });
        });

        const productImagesMap = new Map();
        productImagesResult.forEach(img => {
            productImagesMap.set(img.product_id, {
                id: img.id,
                image_url: img.image_url,
                is_primary: img.is_primary,
                alt_text: img.alt_text
            });
        });

        const variantsMap = new Map();
        variantsResult.forEach(variant => {
            if (!variantsMap.has(variant.product_id)) {
                variantsMap.set(variant.product_id, []);
            }
            variantsMap.get(variant.product_id).push({
                id: variant.id,
                price: variant.price,
                regular_price: variant.regular_price,
                discount_price: variant.discount_price,
                stock: variant.stock,
                stock_status: variant.stock_status,
                status: variant.status
            });
        });

        const variantImagesMap = new Map();
        variantImagesResult.forEach(img => {
            if (!variantImagesMap.has(img.variant_id)) {
                variantImagesMap.set(img.variant_id, []);
            }
            variantImagesMap.get(img.variant_id).push({
                id: img.id,
                image_url: img.image_url,
                is_primary: img.is_primary
            });
        });

        const dealsMap = new Map();
        dealsResult.forEach(deal => {
            if (!dealsMap.has(deal.product_id)) {
                dealsMap.set(deal.product_id, []);
            }
            dealsMap.get(deal.product_id).push({
                id: deal.id,
                name: deal.name,
                deal_type: deal.deal_type,
                discount_percent: deal.discount_percent
            });
        });

        const attributeTermsMap = new Map();
        attributeTermsResult.forEach(pat => {
            if (!attributeTermsMap.has(pat.product_id)) {
                attributeTermsMap.set(pat.product_id, []);
            }
            attributeTermsMap.get(pat.product_id).push({
                id: pat.id,
                product_id: pat.product_id,
                attribute_id: pat.attribute_id,
                term_id: pat.term_id,
                is_visible_page: pat.is_visible_page,
                used_in_variation: pat.used_in_variation,
                updated_by: pat.updated_by,
                created_at: pat.created_at,
                updated_at: pat.updated_at,
                deleted_at: pat.deleted_at,
                attribute: {
                    id: pat.attr_id,
                    name: pat.attr_name,
                    type: pat.attr_type,
                    image_url: pat.attr_image_url
                },
                term: {
                    id: pat.term_id,
                    name: pat.term_name,
                    slug: pat.term_slug
                }
            });
        });

        // Step 6: Calculate similarity scores for the paginated products
        const productsWithScores = similarProductsResult.map(product => {
            // Get product data
            const categories = categoriesMap.get(product.id) || [];
            const productCategoryIds = categories.map(cat => cat.id);
            
            // Calculate category matches
            const categoryMatches = sourceCategoryIds.filter(id => 
                productCategoryIds.includes(id)
            ).length;
            const categoryScore = (categoryMatches / sourceCategoryIds.length) * 0.4;
            
            // Calculate attribute matches
            const productAttributeTerms = attributeTermsMap.get(product.id) || [];
            const productAttrTerms = productAttributeTerms.map(pat => ({
                attribute_id: pat.attribute_id,
                term_id: pat.term_id
            }));
            
            let matchingAttributes = 0;
            sourceAttributeTerms.forEach(sourceAttr => {
                const hasMatchingAttribute = productAttrTerms.some(prodAttr => 
                    prodAttr.attribute_id === sourceAttr.attribute_id && 
                    prodAttr.term_id === sourceAttr.term_id
                );
                if (hasMatchingAttribute) {
                    matchingAttributes++;
                }
            });
            
            const attributeScore = sourceAttributeTerms.length > 0 ? 
                (matchingAttributes / sourceAttributeTerms.length) * 0.6 : 0;
            
            const similarityScore = categoryScore + attributeScore;
            
            return {
                product,
                similarityScore,
                categoryMatches,
                attributeMatches: matchingAttributes,
                totalSourceAttributes: sourceAttributeTerms.length
            };
        });
        
        // Sort by similarity score (highest first) - match original logic
        productsWithScores.sort((a, b) => b.similarityScore - a.similarityScore);
        
        // Step 7: Transform products with similarity calculations
        const transformedProducts = productsWithScores.map(({ product, similarityScore, categoryMatches, attributeMatches, totalSourceAttributes }) => {

            // Get product data
            const categories = categoriesMap.get(product.id) || [];
            const brands = brandsMap.get(product.id) || [];
            const primaryImage = productImagesMap.get(product.id);
            const variants = (variantsMap.get(product.id) || []).map(variant => ({
                ...variant,
                variantImages: variantImagesMap.get(variant.id) || []
            }));

            // Get minimum price variant
            const minPriceVariant = getMinPriceVariant({
                variants: variants,
                ProductImages: primaryImage ? [primaryImage] : []
            });

            // Extract puff count from attributes
            let puffCount = product.puff_count; // Use direct field first
            const productAttributeTerms = attributeTermsMap.get(product.id) || [];
            if (productAttributeTerms.length > 0) {
                const puffAttributes = productAttributeTerms.filter(pat => {
                    if (!pat.attribute || !pat.attribute.name) return false;
                    // Case-insensitive regex match for "number of puffs" with flexible spacing
                    return /number\s+of\s+puffs/i.test(pat.attribute.name);
                });
                if (puffAttributes.length > 0) {
                    let maxPuffCount = 0;
                    let maxPuffTerm = null;
                    puffAttributes.forEach(pat => {
                        if (pat.term) {
                            const puffMatches = pat.term.name.match(/(\d+)/g);
                            if (puffMatches) {
                                const count = Math.max(...puffMatches.map(Number));
                                if (count > maxPuffCount) {
                                    maxPuffCount = count;
                                    maxPuffTerm = pat.term.name;
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

            // Get flavors
            let flavorTerms = [];
            if (productAttributeTerms && productAttributeTerms.length > 0) {
                flavorTerms = productAttributeTerms
                    .filter(pat => {
                        // Case-insensitive check for flavour attribute
                        const attrName = pat.attribute && pat.attribute.name;
                        return attrName && 
                               attrName.toLowerCase().trim() === 'flavour' && 
                               pat.term && 
                               pat.term.id && 
                               pat.term.name;
                    })
                    .map(pat => ({
                        id: pat.term.id,
                        name: pat.term.name,
                        slug: pat.term.slug
                    }));
            }
            const flavor_count = flavorTerms.length;

            // Add out_of_stock assessment (same logic as fetchProducts)
            const hasInStockVariant = variants && variants.some(variant =>
                variant.status === 'active' &&
                variant.stock > 0 &&
                variant.stock_status === 'in_stock' &&
                variant.price !== null &&
                parseFloat(variant.price) > 0
            );

            // Group attributes for the response
            const attributeTermsMapForProduct = new Map();
            productAttributeTerms.forEach((pat) => {
                const attribute = pat.attribute;
                if (!attributeTermsMapForProduct.has(attribute.id)) {
                    attributeTermsMapForProduct.set(attribute.id, {
                        attribute: {
                            id: attribute.id,
                            name: attribute.name,
                            type: attribute.type,
                            image_url: attribute.image_url
                        },
                        terms: []
                    });
                }
                attributeTermsMapForProduct.get(attribute.id).terms.push({
                    id: pat.term.id,
                    name: pat.term.name,
                    slug: pat.term.slug
                });
            });

            return {
                id: product.id,
                name: product.name,
                slug: product.slug,
                price: minPriceVariant ? minPriceVariant.price.toString() : product.price,
                regular_price: minPriceVariant ? minPriceVariant.regular_price.toString() : product.price,
                discount_price: minPriceVariant ? minPriceVariant.discount_price?.toString() : product.discount_price,
                stock_quantity: product.stock_quantity,
                puff_count: puffCount,
                flavor_count: flavor_count,
                out_of_stock: !hasInStockVariant,
                created_at: product.createdAt,
                updated_at: product.updatedAt,
                category: categories.length > 0 ? categories[0] : null,
                brand: brands.length > 0 ? brands[0] : null,
                primary_image: primaryImage ? {
                    id: primaryImage.id,
                    url: primaryImage.image_url,
                    is_primary: primaryImage.is_primary,
                    alt_text: primaryImage.alt_text
                } : null,
                attribute_terms: Array.from(attributeTermsMapForProduct.values()),
                deals: dealsMap.get(product.id) || [],
                similarity: {
                    score: Math.round(similarityScore * 100) / 100,
                    category_matches: categoryMatches,
                    attribute_matches: attributeMatches,
                    total_source_attributes: totalSourceAttributes,
                    percentage: Math.round(similarityScore * 100)
                }
            };
        });

        // Step 9: Calculate pagination and summary
        const totalPages = Math.ceil(totalCount / parsedLimit);
        const currentPage = Math.floor(parsedOffset / parsedLimit) + 1;
        const averageSimilarityScore = transformedProducts.length > 0 ? 
            Math.round((transformedProducts.reduce((sum, p) => sum + p.similarity.score, 0) / transformedProducts.length) * 100) / 100 : 0;

        const response = {
            source_product: {
                id: sourceProduct.id,
                name: sourceProduct.name,
                slug: sourceProduct.slug,
                categories: sourceCategoriesResult,
                attributes: sourceAttributesResult.map(attr => ({
                    attribute: {
                        id: attr.attr_id,
                        name: attr.attr_name,
                        type: attr.attr_type
                    },
                    term: {
                        id: attr.term_id,
                        name: attr.term_name,
                        slug: attr.term_slug
                    }
                }))
            },
            similar_products: transformedProducts,
            pagination: {
                total_count: totalCount,
                total_pages: totalPages,
                current_page: currentPage,
                limit: parsedLimit,
                offset: parsedOffset,
                has_next: currentPage < totalPages,
                has_prev: currentPage > 1
            },
            summary: {
                total_similar_products: transformedProducts.length,
                average_similarity_score: averageSimilarityScore
            }
        };

        return successResponse(res, response, 'More like this products retrieved successfully');
    } catch (error) {
        logger.error('Error getting more like this products:', error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.getDealProducts = async (req, res, next) => {
    try {
        const { deal_id } = req.params;
        const { limit = 10, offset = 0, product_id } = req.query;

        // Parse limit and offset as integers
        const parsedLimit = parseInt(limit);
        const parsedOffset = parseInt(offset);

        // Validate deal_id
        if (!deal_id || isNaN(parseInt(deal_id))) {
            return errorResponse(res, null, 'Invalid deal ID provided');
        }

        // Step 1: Check if deal exists and is active with raw SQL
        const dealQuery = `
            SELECT id, name, slug, fixed_price, discount_percent, tiered_qty_json, bundle_product_ids_json
            FROM deals 
            WHERE id = :deal_id 
            AND is_active = 1 
            AND is_deleted = 0 
            AND valid_from <= NOW() 
            AND valid_to >= NOW()
        `;

        const dealResult = await Product.sequelize.query(dealQuery, {
            replacements: { deal_id: parseInt(deal_id) },
            type: Product.sequelize.QueryTypes.SELECT
        });

        if (dealResult.length === 0) {
            return errorResponse(res, null, 'Deal not found or not active');
        }

        const deal = dealResult[0];

        // Step 2: Get deal products with basic product info using raw SQL
        const dealProductsQuery = `
            SELECT DISTINCT
                p.id, p.name, p.slug, p.price, p.discount_price, p.stock_quantity,
                p.puff_count, p.is_new, p.battery_capacity, p.coil_style, p.device_style,
                p.eliquid_capacity, p.pod_coil_style, p.pod_fill_style, p.power_supply,
                p.nicotine_strength, p.nicotine_type, p.vg_ratio, p.vaping_style,
                p.bottle_size, p.status, p.createdAt, p.updatedAt, dp.createdAt as deal_created_at
            FROM deal_products dp
            INNER JOIN products p ON dp.product_id = p.id
            WHERE dp.deal_id = :deal_id
            AND p.status = 'published'
            AND p.deletedAt IS NULL
            ${product_id ? 'AND p.id != :product_id' : ''}
            ORDER BY dp.createdAt DESC
        `;

        const dealProductsResult = await Product.sequelize.query(dealProductsQuery, {
            replacements: { 
                deal_id: parseInt(deal_id),
                ...(product_id ? { product_id: parseInt(product_id) } : {})
            },
            type: Product.sequelize.QueryTypes.SELECT
        });

        if (dealProductsResult.length === 0) {
            return successResponse(res, {
                deal: {
                    id: deal.id,
                    name: deal.name,
                    slug: deal.slug
                },
                products: [],
                pagination: {
                    total_count: 0,
                    total_pages: 0,
                    current_page: 1,
                    limit: parsedLimit,
                    offset: parsedOffset,
                    has_next: false,
                    has_prev: false
                }
            }, 'Deal products retrieved successfully');
        }

        const productIds = dealProductsResult.map(p => p.id);

        // Step 3: Get all related data in parallel using raw SQL
        const [
            categoriesResult,
            brandsResult,
            productImagesResult,
            variantsResult,
            variantImagesResult,
            variantAttributesResult
        ] = await Promise.all([
            // Categories
            Product.sequelize.query(`
                SELECT 
                    pc.product_id, c.id, c.name, c.slug, pc.is_primary
                FROM product_categories pc
                JOIN categories c ON pc.category_id = c.id
                WHERE pc.product_id IN (${productIds.join(',')})
            `, {
                type: Product.sequelize.QueryTypes.SELECT
            }),

            // Brands
            Product.sequelize.query(`
                SELECT 
                    pb.product_id, b.id, b.name, b.slug, pb.is_primary
                FROM product_brands pb
                JOIN brands b ON pb.brand_id = b.id
                WHERE pb.product_id IN (${productIds.join(',')})
            `, {
                type: Product.sequelize.QueryTypes.SELECT
            }),

            // Product Images
            Product.sequelize.query(`
                SELECT 
                    pi.id, pi.product_id, pi.image_url, pi.is_primary, pi.alt_text
                FROM product_images pi
                WHERE pi.product_id IN (${productIds.join(',')})
            `, {
                type: Product.sequelize.QueryTypes.SELECT
            }),

            // Variants
            Product.sequelize.query(`
                SELECT 
                    pv.id, pv.product_id, pv.slug, pv.price, pv.regular_price, 
                    pv.discount_price, pv.stock, pv.stock_status, pv.status
                FROM product_variants pv
                WHERE pv.product_id IN (${productIds.join(',')})
                AND pv.status = 'active'
            `, {
                type: Product.sequelize.QueryTypes.SELECT
            }),

            // Variant Images
            Product.sequelize.query(`
                SELECT 
                    pvi.id, pvi.variant_id, pvi.image_url, pvi.is_primary
                FROM product_variant_images pvi
                JOIN product_variants pv ON pvi.variant_id = pv.id
                WHERE pv.product_id IN (${productIds.join(',')})
                AND pv.status = 'active'
                AND pvi.deleted_at IS NULL
            `, {
                type: Product.sequelize.QueryTypes.SELECT
            }),

            // Variant Attributes
            Product.sequelize.query(`
                SELECT 
                    pva.variant_id, pva.attribute_id, pva.term_id,
                    a.id as attr_id, a.name as attr_name, a.type as attr_type, a.image_url as attr_image_url,
                    t.id as term_id, t.name as term_name, t.slug as term_slug
                FROM product_variant_attributes pva
                JOIN attributes a ON pva.attribute_id = a.id
                JOIN attribute_terms t ON pva.term_id = t.id
                WHERE pva.variant_id IN (
                    SELECT pv.id FROM product_variants pv 
                    WHERE pv.product_id IN (${productIds.join(',')}) 
                    AND pv.status = 'active'
                )
            `, {
                type: Product.sequelize.QueryTypes.SELECT
            })
        ]);

        // Step 4: Build data maps for efficient lookup
        const categoriesMap = new Map();
        categoriesResult.forEach(cat => {
            if (!categoriesMap.has(cat.product_id)) {
                categoriesMap.set(cat.product_id, []);
            }
            categoriesMap.get(cat.product_id).push({
                id: cat.id,
                name: cat.name,
                slug: cat.slug,
                is_primary: cat.is_primary
            });
        });

        const brandsMap = new Map();
        brandsResult.forEach(brand => {
            if (!brandsMap.has(brand.product_id)) {
                brandsMap.set(brand.product_id, []);
            }
            brandsMap.get(brand.product_id).push({
                id: brand.id,
                name: brand.name,
                slug: brand.slug,
                is_primary: brand.is_primary
            });
        });

        const productImagesMap = new Map();
        productImagesResult.forEach(img => {
            if (!productImagesMap.has(img.product_id)) {
                productImagesMap.set(img.product_id, []);
            }
            productImagesMap.get(img.product_id).push({
                id: img.id,
                image_url: img.image_url,
                is_primary: img.is_primary,
                alt_text: img.alt_text
            });
        });

        const variantsMap = new Map();
        variantsResult.forEach(variant => {
            if (!variantsMap.has(variant.product_id)) {
                variantsMap.set(variant.product_id, []);
            }
            variantsMap.get(variant.product_id).push({
                id: variant.id,
                slug: variant.slug,
                price: variant.price,
                regular_price: variant.regular_price,
                discount_price: variant.discount_price,
                stock: variant.stock,
                stock_status: variant.stock_status,
                status: variant.status
            });
        });

        const variantImagesMap = new Map();
        variantImagesResult.forEach(img => {
            if (!variantImagesMap.has(img.variant_id)) {
                variantImagesMap.set(img.variant_id, []);
            }
            variantImagesMap.get(img.variant_id).push({
                id: img.id,
                image_url: img.image_url,
                is_primary: img.is_primary
            });
        });

        const variantAttributesMap = new Map();
        variantAttributesResult.forEach(va => {
            if (!variantAttributesMap.has(va.variant_id)) {
                variantAttributesMap.set(va.variant_id, []);
            }
            variantAttributesMap.get(va.variant_id).push({
                attribute: {
                    id: va.attr_id,
                    name: va.attr_name,
                    type: va.attr_type,
                    image_url: va.attr_image_url
                },
                term: {
                    id: va.term_id,
                    name: va.term_name,
                    slug: va.term_slug
                }
            });
        });

        // Step 5: Transform products and filter out out-of-stock ones
        const allTransformedProducts = dealProductsResult.map(product => {
            // Get related data
            const categories = categoriesMap.get(product.id) || [];
            const brands = brandsMap.get(product.id) || [];
            const productImages = productImagesMap.get(product.id) || [];
            const variants = (variantsMap.get(product.id) || []).map(variant => ({
                ...variant,
                variantImages: variantImagesMap.get(variant.id) || [],
                variantAttributes: variantAttributesMap.get(variant.id) || []
            }));

            // Create a product object similar to Sequelize result
            const productObj = {
                id: product.id,
                name: product.name,
                slug: product.slug,
                price: product.price,
                discount_price: product.discount_price,
                stock_quantity: product.stock_quantity,
                puff_count: product.puff_count,
                is_new: product.is_new,
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
                Categories: categories,
                Brands: brands,
                ProductImages: productImages,
                variants: variants
            };

            // Get minimum price variant using the helper function
            const minPriceVariant = getMinPriceVariant(productObj);

            // Skip products that have no available variants (out of stock)
            if (!minPriceVariant) {
                return null;
            }

            return {
                id: product.id,
                name: product.name,
                slug: product.slug,
                price: minPriceVariant.price,
                regular_price: minPriceVariant.regular_price,
                discount_price: minPriceVariant.discount_price,
                stock_quantity: product.stock_quantity,
                puff_count: product.puff_count,
                is_new: product.is_new,
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
                created_at: product.createdAt,
                updated_at: product.updatedAt,
                category: categories.length > 0 
                    ? {
                        id: categories.find(cat => cat.is_primary)?.id || categories[0].id,
                        name: categories.find(cat => cat.is_primary)?.name || categories[0].name,
                        slug: categories.find(cat => cat.is_primary)?.slug || categories[0].slug
                    }
                    : null,
                brand: brands.length > 0
                    ? {
                        id: brands.find(brand => brand.is_primary)?.id || brands[0].id,
                        name: brands.find(brand => brand.is_primary)?.name || brands[0].name,
                        slug: brands.find(brand => brand.is_primary)?.slug || brands[0].slug
                    }
                    : null,
                primary_image: productImages.length > 0
                    ? {
                        id: productImages.find(img => img.is_primary)?.id || productImages[0].id,
                        url: productImages.find(img => img.is_primary)?.image_url || productImages[0].image_url,
                        is_primary: productImages.find(img => img.is_primary)?.is_primary || productImages[0].is_primary
                    }
                    : null,
                min_price_variant: minPriceVariant,
                variants: variants.map(variant => ({
                    id: variant.id,
                    slug: variant.slug,
                    price: variant.price,
                    regular_price: variant.regular_price,
                    discount_price: variant.discount_price,
                    stock: variant.stock,
                    stock_status: variant.stock_status,
                    status: variant.status,
                    attributes: variant.variantAttributes,
                    images: variant.variantImages.map(img => ({
                        id: img.id,
                        url: img.image_url,
                        is_primary: img.is_primary
                    }))
                }))
            };
        });

        // Filter out null products and get total available count
        const allAvailableProducts = allTransformedProducts.filter(product => product !== null);
        const totalAvailableCount = allAvailableProducts.length;

        // Apply pagination to the available products
        const dealProducts = allAvailableProducts.slice(parsedOffset, parsedOffset + parsedLimit);

        // Calculate pagination info using the total available count
        const totalPages = Math.ceil(totalAvailableCount / parsedLimit);
        const currentPage = Math.floor(parsedOffset / parsedLimit) + 1;

        const response = {
            deal: {
                id: deal.id,
                name: deal.name,
                slug: deal.slug
            },
            products: dealProducts.map(product => ({
                id: product.id,
                name: product.name,
                slug: product.slug,
                price: product.price,
                regular_price: product.regular_price,
                discount_price: product.discount_price,
                image: product.min_price_variant?.variant_image || product.primary_image
            })),
            pagination: {
                total_count: totalAvailableCount,
                total_pages: totalPages,
                current_page: currentPage,
                limit: parsedLimit,
                offset: parsedOffset,
                has_next: currentPage < totalPages,
                has_prev: currentPage > 1
            }
        };

        return successResponse(res, response, 'Deal products retrieved successfully');
    } catch (error) {
        console.log(error);
        logger.error('Error getting deal products:', error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Get linked published products for a specific product
 * Uses variant-based pricing via getMinPriceVariant
 * @route GET /api/product/:id/linked-products
 */
module.exports.getLinkedProducts = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { page, limit, offset } = req.query;

        // Parse pagination parameters
        const parsedLimit = limit ? parseInt(limit, 10) : 10;
        let parsedOffset = 0;

        if (offset !== undefined) {
            parsedOffset = parseInt(offset, 10);
        } else if (page !== undefined) {
            const parsedPage = parseInt(page, 10);
            parsedOffset = (parsedPage - 1) * parsedLimit;
        }

        // Validate pagination parameters
        if (isNaN(parsedLimit) || parsedLimit < 1) {
            return errorResponse(
                res,
                { message: "Limit must be a positive integer" },
                "Invalid limit parameter",
                400
            );
        }
        if (isNaN(parsedOffset) || parsedOffset < 0) {
            return errorResponse(
                res,
                { message: "Offset/Page must be a non-negative integer" },
                "Invalid offset/page parameter",
                400
            );
        }

        // Validate product exists
        const product = await Product.findByPk(id);
        if (!product) {
            return errorResponse(
                res,
                { message: "Product not found" },
                "Product not found",
                404
            );
        }

        // Get linked product IDs from the junction table
        const linkedProductLinks = await ProductLinkedProduct.findAll({
            where: { product_id: id },
            attributes: ["linked_product_id"],
        });

        if (linkedProductLinks.length === 0) {
            return successResponse(
                res,
                {
                    product_id: parseInt(id, 10),
                    linked_products: [],
                    count: 0,
                    pagination: {
                        total_count: 0,
                        total_pages: 0,
                        current_page: page ? parseInt(page, 10) : 1,
                        limit: parsedLimit,
                        offset: parsedOffset,
                    },
                },
                "Linked products fetched successfully"
            );
        }

        const linkedProductIds = linkedProductLinks.map(
            (link) => link.linked_product_id
        );

        // Get total count for pagination
        const totalCount = await Product.count({
            where: {
                id: { [Op.in]: linkedProductIds },
                status: productStatus.PUBLISHED,
                deletedAt: null,
            },
        });

        // Fetch linked products that are published with pagination
        // Include variants so we can compute min variant price
        const linkedProducts = await Product.findAll({
            where: {
                id: { [Op.in]: linkedProductIds },
                status: productStatus.PUBLISHED,
                deletedAt: null,
            },
            include: [
                {
                    model: ProductImage,
                    as: "ProductImages",
                    attributes: [
                        "id",
                        "image_url",
                        "image_url_low",
                        "image_url_mid",
                        "image_url_high",
                        "is_primary",
                        "alt_text",
                    ],
                    required: false,
                },
                {
                    model: ProductVariant,
                    as: "variants",
                    attributes: [
                        "id",
                        "slug",
                        "price",
                        "regular_price",
                        "discount_price",
                        "stock",
                        "stock_status",
                        "status",
                    ],
                    required: false,
                },
                {
                    model: Category,
                    as: "Categories",
                    through: { attributes: ["is_primary"] },
                    attributes: ["id", "name", "slug"],
                    required: false,
                },
                {
                    model: Brand,
                    as: "Brands",
                    through: { attributes: ["is_primary"] },
                    attributes: ["id", "name", "slug"],
                    required: false,
                },
            ],
            order: [["name", "ASC"]],
            limit: parsedLimit,
            offset: parsedOffset,
        });

        // Format response using min variant price when available
        const formattedProducts = linkedProducts.map((p) => {
            const minPriceVariant = getMinPriceVariant({
                variants: p.variants || [],
                ProductImages: p.ProductImages || [],
            });

            // regular_price: actual/original price (from variant or fallback to product.price)
            const finalRegularPrice =
                minPriceVariant && minPriceVariant.regular_price != null
                    ? minPriceVariant.regular_price
                    : p.price;

            // price: sale price (from variant or fallback to product.price)
            const finalPrice =
                minPriceVariant && minPriceVariant.price != null
                    ? minPriceVariant.price
                    : p.price;

            // discount_price: discount/sale price (from variant or fallback to product.discount_price)
            const finalDiscountPrice =
                minPriceVariant && minPriceVariant.discount_price != null
                    ? minPriceVariant.discount_price
                    : p.discount_price;

            const primaryImage =
                (minPriceVariant && minPriceVariant.variant_image) ||
                (p.ProductImages && p.ProductImages.length > 0
                    ? p.ProductImages.find((img) => img.is_primary) ||
                      p.ProductImages[0]
                    : null);

            return {
                id: p.id,
                name: p.name,
                slug: p.slug,
                description: p.description,
                regular_price: finalRegularPrice,
                price: finalPrice,
                discount_price: finalDiscountPrice,
                status: p.status,
                image: primaryImage,
                categories: p.Categories || [],
                brands: p.Brands || [],
                created_at: p.createdAt,
                updated_at: p.updatedAt,
            };
        });

        // Calculate pagination details
        const totalPages =
            totalCount > 0 ? Math.ceil(totalCount / parsedLimit) : 0;
        const currentPage = page
            ? parseInt(page, 10)
            : Math.floor(parsedOffset / parsedLimit) + 1;

        return successResponse(
            res,
            {
                product_id: parseInt(id, 10),
                linked_products: formattedProducts,
                count: formattedProducts.length,
                pagination: {
                    total_count: totalCount,
                    total_pages: totalPages,
                    current_page: currentPage,
                    limit: parsedLimit,
                    offset: parsedOffset,
                },
            },
            "Linked products fetched successfully"
        );
    } catch (error) {
        logger.error("Error fetching linked products:", error);
        return errorResponse(res, error, error.message);
    }
};

