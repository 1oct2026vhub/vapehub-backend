const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Product, Category, Brand, ProductImage, ProductAttributeTerm, Attribute, AttributeTerm, ProductVariant, ProductVariantImage, ProductVariantAttribute, Deal, DealProduct, ProductCategory, ProductBrand, LoyaltyPointsSettings } = require("../../../models");
const { Sequelize, Op } = require("sequelize");
const logger = require("../../../library/logger");
const { getTrendingProducts, generateUniqueFileName, fetchProducts, getMinPriceVariant } = require("../helper/product.helper");
const { uploadFiletToS3 } = require("../../../library/s3/s3Helper");
const { productStatus } = require("../../../config/constants");

module.exports.listAllproducts = async (req, res, next) => {
    try {
        req.query.source = 'product';
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

        // Build base where conditions for new products (all products, descending order)
        let productFilterConditions = [
            "p.deletedAt IS NULL",
            "p.status = 'published'"
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

        // Simplified main products query (no subqueries for better performance)
        const productsQuery = `
            SELECT 
                p.id, p.updated_by, p.name, p.slug, p.price, p.discount_price,
                p.stock_quantity, p.puff_count, p.is_new, p.battery_capacity, p.coil_style,
                p.device_style, p.eliquid_capacity, p.pod_coil_style, p.pod_fill_style,
                p.power_supply, p.nicotine_strength, p.nicotine_type, p.vg_ratio,
                p.vaping_style, p.bottle_size, p.status, p.createdAt, p.updatedAt, p.deletedAt
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
            return successResponse(res, {
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
            }, 'Success');
        }

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
            // Categories query
            Product.sequelize.query(`
                SELECT 
                    c.id, c.updated_by, c.name, c.description, c.slug, c.parent_id, c.logo_url,
                    c.createdAt, c.updatedAt, c.deletedAt, pc.product_id, pc.is_primary
                FROM product_categories pc
                JOIN categories c ON pc.category_id = c.id
                WHERE pc.product_id IN (${productIds.join(',')})
            `, {
                type: Product.sequelize.QueryTypes.SELECT
            }),
            
            // Brands query
            Product.sequelize.query(`
                SELECT 
                    b.id, b.updated_by, b.slug, b.name, b.description, b.logo_url,
                    b.createdAt, b.updatedAt, b.deletedAt, pb.product_id, pb.is_primary
                FROM product_brands pb
                JOIN brands b ON pb.brand_id = b.id
                WHERE pb.product_id IN (${productIds.join(',')})
            `, {
                type: Product.sequelize.QueryTypes.SELECT
            }),
            
            // Product Images query
            Product.sequelize.query(`
                SELECT 
                    id, updated_by, product_id, image_url, is_primary, createdAt, updatedAt, deletedAt
                FROM product_images
                WHERE product_id IN (${productIds.join(',')})
            `, {
                type: Product.sequelize.QueryTypes.SELECT
            }),
            
            // Variants query
            Product.sequelize.query(`
                SELECT 
                    id, product_id, slug, regular_price, price, discount_price, purchase_price,
                    weight, length, width, height, description, barcode, stock, low_stock_threshold,
                    stock_status, status, updated_by, created_at, updated_at, deleted_at
                FROM product_variants
                WHERE product_id IN (${productIds.join(',')}) AND status = 'active'
            `, {
                type: Product.sequelize.QueryTypes.SELECT
            }),
            
            // Variant Images query (simplified)
            Product.sequelize.query(`
                SELECT 
                    id, variant_id, image_url, is_primary
                FROM product_variant_images
                WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id IN (${productIds.join(',')}) AND status = 'active')
                LIMIT 100
            `, {
                type: Product.sequelize.QueryTypes.SELECT
            }),
            
            // Deals query (essential for UI)
            Product.sequelize.query(`
                SELECT 
                    d.id, d.name, d.slug, d.image_url, d.deal_type, d.required_qty,
                    d.get_qty, d.fixed_price, d.discount_percent, d.tiered_qty_json,
                    d.bundle_product_ids_json, d.valid_from, d.valid_to, dp.product_id
                FROM deal_products dp
                JOIN deals d ON dp.deal_id = d.id
                WHERE dp.product_id IN (${productIds.join(',')})
                    AND d.is_active = 1 
                    AND d.is_deleted = 0 
                    AND d.valid_from <= NOW() 
                    AND d.valid_to >= NOW()
            `, {
                type: Product.sequelize.QueryTypes.SELECT
            }),
            
            // Product Attribute Terms query (for puff count)
            Product.sequelize.query(`
                SELECT 
                    pat.id, pat.product_id, pat.attribute_id, pat.term_id, pat.is_visible_page,
                    pat.used_in_variation, pat.updated_by, pat.created_at, pat.updated_at, pat.deleted_at,
                    a.id as attr_id, a.name as attr_name, a.type as attr_type,
                    t.id as term_id, t.name as term_name, t.slug as term_slug
                FROM product_attribute_terms pat
                JOIN attributes a ON pat.attribute_id = a.id
                JOIN attribute_terms t ON pat.term_id = t.id
                WHERE pat.product_id IN (${productIds.join(',')})
                AND a.name IN ('number-of-puffs', 'flavour')
            `, {
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
            });
        });

        const brandsMap = new Map();
        brandsResult.forEach(brand => {
            if (!brandsMap.has(brand.product_id)) {
                brandsMap.set(brand.product_id, []);
            }
            brandsMap.get(brand.product_id).push({
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
            });
        });

        const productImagesMap = new Map();
        productImagesResult.forEach(img => {
            if (!productImagesMap.has(img.product_id)) {
                productImagesMap.set(img.product_id, []);
            }
            productImagesMap.get(img.product_id).push({
                id: img.id,
                updated_by: img.updated_by,
                product_id: img.product_id,
                image_url: img.image_url,
                is_primary: img.is_primary,
                createdAt: img.createdAt,
                updatedAt: img.updatedAt,
                deletedAt: img.deletedAt
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
                id: img.id,
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
                deleted_at: pat.deletedAt,
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
            });
        });

        // Process products with essential UI data (puff count, deals, stock status)
        const availableProducts = productsResult.map(product => {
            // Extract puff count from attributes
            let puffCount = product.puff_count; // Use direct field first
            const productAttributeTerms = attributeTermsMap.get(product.id) || [];
            if (productAttributeTerms.length > 0) {
                const puffAttributes = productAttributeTerms.filter(pat => 
                    pat.attribute && pat.attribute.name === 'number-of-puffs'
                );
                
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
            if (productAttributeTerms.length > 0) {
                flavorTerms = productAttributeTerms
                    .filter(pat => pat.attribute && pat.attribute.name === 'flavour' && pat.term)
                    .map(pat => ({
                        id: pat.term.id,
                        name: pat.term.name,
                        slug: pat.term.slug
                    }));
            }

            // Get variants with images
            const variants = (variantsMap.get(product.id) || []).map(variant => ({
                ...variant,
                variantImages: variantImagesMap.get(variant.id) || []
            }));

            // Check stock status
            const hasInStockVariant = variants.some(variant =>
                variant.status === 'active' &&
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

            return {
                id: product.id,
                updated_by: product.updated_by,
                name: product.name,
                slug: product.slug,
                price: minPriceVariant ? minPriceVariant.price : parseFloat(product.price) || 0,
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
                Categories: categoriesMap.get(product.id) || [],
                Brands: brandsMap.get(product.id) || [],
                ProductImages: productImagesMap.get(product.id) || [],
                variants: variants,
                deals: dealsMap.get(product.id) || [],
                flavors: flavorTerms,
                flavor_count: flavorTerms.length,
                out_of_stock: !hasInStockVariant,
                min_price_variant: minPriceVariant
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

        return successResponse(res, {
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
        }, 'Success');

    } catch (error) {
        logger.error(error);
        return errorResponse(res, error, error.message);
    }
}

module.exports.getProductByid = async (req, res, next) => {
    try {
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
                id: req.params.id,
                status: productStatus.PUBLISHED
            }, 
            include: includeClause
        });
        if (!product) {
            throw new Error("Product not found");
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
        
        // Fetch loyalty points settings
        const loyaltySettings = await LoyaltyPointsSettings.findOne({
            where: { status: true },
            order: [['createdAt', 'DESC']]
        });
        
        // Extract largest puff count from number-of-puffs attribute
        let puffCount = null;
        if (product.productAttributeTerms) {
            const puffAttributes = product.productAttributeTerms.filter(pat => 
                pat.attribute && pat.attribute.name === 'number-of-puffs'
            );
            
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
        const minPriceVariant = getMinPriceVariant(product);
        const response = {
            ...product.toJSON(),
            puff_count: puffCount,
            price: minPriceVariant ? minPriceVariant.price : product.price,
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

        successResponse(res, response, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

module.exports.createProduct = async (req, res, next) => {
    const transaction = await Product.sequelize.transaction();
    try {
        const { name, slug, description, price, discount_price, stock_quantity, puff_count, is_new, battery_capacity, coil_style, device_style, eliquid_capacity, pod_coil_style, pod_fill_style, power_supply, nicotine_strength, nicotine_type, vg_ratio, vaping_style, bottle_size, category_ids, brand_ids, flavour_ids, product_images } = req.body;
        const { id: updated_by } = req.user; // Authenticated user

        // find product by slug
        const existingProduct = await Product.findOne({ where: { slug } });
        if (existingProduct) {
            throw new Error('Product already exists');
        }

        // Create the product
        const product = await Product.create(
            { name, slug, description, price, discount_price, stock_quantity, puff_count, is_new, battery_capacity, coil_style, device_style, eliquid_capacity, pod_coil_style, pod_fill_style, power_supply, nicotine_strength, nicotine_type, vg_ratio, vaping_style, bottle_size, updated_by },
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
        const { name, slug, description, price, discount_price, stock_quantity, puff_count, is_new, battery_capacity, coil_style, device_style, eliquid_capacity, pod_coil_style, pod_fill_style, power_supply, nicotine_strength, nicotine_type, vg_ratio, vaping_style, bottle_size, category_ids, brand_ids, flavour_ids, product_images } = req.body;
        const { id: updated_by } = req.user

        // Find the product
        const product = await Product.findByPk(id, { transaction });
        if (!product) {
            await transaction.rollback();
            throw new Error('Product not found');
        }
        // Update product fields
        const updatedFields = {
            ...(name && { name }),
            ...(slug && { slug }),
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

        const uploadPromise = files.map(image => {
            const { originalname, mimetype, buffer } = image;
            const fileName = generateUniqueFileName(originalname)
            const params = {
                Bucket: process.env.AWS_S3_BUCKET,
                Key: `products/${fileName}`,
                Body: buffer,
                ContentType: mimetype
            }
            return uploadFiletToS3(params)
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
    }
}

module.exports.listAllproductsBySlug = async (req, res, next) => {
    try {
        const slug = req.params.slug;
        
        // Main product query - OPTIMIZED with raw SQL
        const productQuery = `
            SELECT 
                p.id, p.updated_by, p.name, p.slug, p.description, p.price, p.discount_price,
                p.stock_quantity, p.puff_count, p.is_new, p.battery_capacity, p.coil_style,
                p.device_style, p.eliquid_capacity, p.pod_coil_style, p.pod_fill_style,
                p.power_supply, p.nicotine_strength, p.nicotine_type, p.vg_ratio,
                p.vaping_style, p.bottle_size, p.status, p.createdAt, p.updatedAt, p.deletedAt
            FROM products p
            WHERE p.slug = :slug AND p.status = :status
        `;
        
        // Execute main product query
        const [productResult] = await Product.sequelize.query(productQuery, {
            replacements: { slug, status: productStatus.PUBLISHED },
            type: Product.sequelize.QueryTypes.SELECT
        });
        
        if (!productResult) {
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
                    id, updated_by, product_id, image_url, is_primary, createdAt, updatedAt, deletedAt
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
            const puffAttributes = product.productAttributeTerms.filter(pat => 
                pat.attribute && pat.attribute.name === 'number-of-puffs'
            );
            
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
        
        // **Modify the response** (same logic as original)
        const response = {
            ...product,  // Use parsed product object instead of toJSON()
            puff_count: puffCount,
            price: minPriceVariant ? minPriceVariant.price : product.price,
            regular_price: minPriceVariant ? minPriceVariant.regular_price : product.regular_price,
            discount_price: minPriceVariant ? minPriceVariant.discount_price : product.discount_price,
            min_price_variant: minPriceVariant,
            attributeTerms,
            deals: product.deals && product.deals.length > 0 ? product.deals.map(deal => ({
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
        const filteredPuffAttribute = attribute_terms.find(filter => {
            const attribute = product.productAttributeTerms.find(pat => 
                pat.attribute.id === filter.attribute_id
            )?.attribute;
            return attribute && attribute.name === 'number-of-puffs';
        });
        
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
                const puffAttributes = product.productAttributeTerms.filter(pat => 
                    pat.attribute && pat.attribute.name === 'number-of-puffs'
                );
                
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
            is_primary: img.is_primary
        }));

        // Get primary product image
        const primaryProductImage = product.ProductImages.find(img => img.is_primary) || product.ProductImages[0];

        // Prepare filtered attribute terms with full data
        const filteredAttributeTerms = attribute_terms.map(filter => {
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
        }).filter(Boolean);

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
                    is_primary: primaryProductImage.is_primary
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
                const puffAttributes = product.productAttributeTerms.filter(pat => 
                    pat.attribute && pat.attribute.name === 'number-of-puffs'
                );
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
                    is_primary: primaryImage.is_primary
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
        const { limit = 10, offset = 0, deal_type, search } = req.query;

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

module.exports.getMoreLikeThisProducts = async (req, res, next) => {
    try {
        const { product_id, limit = 10, offset = 0 } = req.query;

        // Validate product_id
        if (!product_id) {
            throw new Error('Product ID is required');
        }

        // Find the source product with its categories and attributes
        const sourceProduct = await Product.findOne({
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
                }
            ]
        });

        if (!sourceProduct) {
            throw new Error('Source product not found');
        }

        // Get category IDs from source product
        const sourceCategoryIds = sourceProduct.Categories.map(cat => cat.id);

        // Get attribute-term combinations from source product
        const sourceAttributeTerms = sourceProduct.productAttributeTerms.map(pat => ({
            attribute_id: pat.attribute_id,
            term_id: pat.term_id
        }));

        // Build the query to find similar products
        const similarProductsQuery = {
            where: {
                id: { [Op.ne]: product_id }, // Exclude the source product
                status: productStatus.PUBLISHED
            },
            include: [
                {
                    model: Category,
                    as: 'Categories',
                    attributes: ['id', 'name', 'slug'],
                    through: { attributes: ['is_primary'] },
                    where: {
                        id: { [Op.in]: sourceCategoryIds }
                    },
                    required: true
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
                    through: { attributes: [] },
                    where: {
                        is_active: true,
                        is_deleted: false,
                        valid_from: { [Op.lte]: new Date() },
                        valid_to: { [Op.gte]: new Date() }
                    },
                    required: false
                }
            ],
            attributes: [
                'id', 
                'name', 
                'slug', 
                'price', 
                'discount_price',
                'stock_quantity',
                'createdAt',
                'updatedAt'
            ],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [['createdAt', 'DESC']]
        };

        // Get similar products
        const similarProducts = await Product.findAll(similarProductsQuery);

        // Calculate similarity scores and sort by relevance
        const productsWithScores = similarProducts.map(product => {
            let similarityScore = 0;
            let matchingAttributes = 0;
            let totalSourceAttributes = sourceAttributeTerms.length;

            // Check category similarity (weight: 40%)
            const productCategoryIds = product.Categories.map(cat => cat.id);
            const categoryMatches = sourceCategoryIds.filter(id => 
                productCategoryIds.includes(id)
            ).length;
            const categoryScore = (categoryMatches / sourceCategoryIds.length) * 0.4;

            // Check attribute similarity (weight: 60%)
            const productAttributeTerms = product.productAttributeTerms.map(pat => ({
                attribute_id: pat.attribute_id,
                term_id: pat.term_id
            }));

            sourceAttributeTerms.forEach(sourceAttr => {
                const hasMatchingAttribute = productAttributeTerms.some(prodAttr => 
                    prodAttr.attribute_id === sourceAttr.attribute_id && 
                    prodAttr.term_id === sourceAttr.term_id
                );
                if (hasMatchingAttribute) {
                    matchingAttributes++;
                }
            });

            const attributeScore = totalSourceAttributes > 0 ? 
                (matchingAttributes / totalSourceAttributes) * 0.6 : 0;

            similarityScore = categoryScore + attributeScore;

            return {
                product,
                similarityScore,
                categoryMatches,
                attributeMatches: matchingAttributes,
                totalSourceAttributes
            };
        });

        // Sort by similarity score (highest first)
        productsWithScores.sort((a, b) => b.similarityScore - a.similarityScore);

        // Get total count for pagination
        const totalCount = await Product.count({
            where: {
                id: { [Op.ne]: product_id },
                status: productStatus.PUBLISHED
            },
            include: [
                {
                    model: Category,
                    as: 'Categories',
                    where: {
                        id: { [Op.in]: sourceCategoryIds }
                    },
                    required: true
                }
            ]
        });

        // Transform the response
        const transformedProducts = productsWithScores.map(({ product, similarityScore, categoryMatches, attributeMatches, totalSourceAttributes }) => {
            const primaryImage = product.ProductImages && product.ProductImages.length > 0 
                ? product.ProductImages[0] 
                : null;

            // Get minimum price variant using the helper function
            const minPriceVariant = getMinPriceVariant(product);

            // Puff count extraction logic (copied from product.helper.js)
            let puffCount = null;
            if (product.productAttributeTerms) {
                const puffAttributes = product.productAttributeTerms.filter(pat => 
                    pat.attribute && pat.attribute.name === 'number-of-puffs'
                );
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

            // Group attributes for the response
            const attributeTermsMap = new Map();
            product.productAttributeTerms.forEach((pat) => {
                const attribute = pat.attribute;
                if (!attributeTermsMap.has(attribute.id)) {
                    attributeTermsMap.set(attribute.id, {
                        attribute: {
                            id: attribute.id,
                            name: attribute.name,
                            type: attribute.type,
                            image_url: attribute.image_url
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

            return {
                id: product.id,
                name: product.name,
                slug: product.slug,
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
                    is_primary: primaryImage.is_primary
                } : null,
                attribute_terms: Array.from(attributeTermsMap.values()),
                deals: product.deals && product.deals.length > 0 ? product.deals.map(deal => ({
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
                })) : [],
                similarity: {
                    score: Math.round(similarityScore * 100) / 100, // Round to 2 decimal places
                    category_matches: categoryMatches,
                    attribute_matches: attributeMatches,
                    total_source_attributes: totalSourceAttributes,
                    percentage: Math.round(similarityScore * 100)
                }
            };
        });

        // Calculate pagination info
        const totalPages = Math.ceil(totalCount / parseInt(limit));
        const currentPage = Math.floor(parseInt(offset) / parseInt(limit)) + 1;

        const response = {
            source_product: {
                id: sourceProduct.id,
                name: sourceProduct.name,
                slug: sourceProduct.slug,
                categories: sourceProduct.Categories.map(cat => ({
                    id: cat.id,
                    name: cat.name,
                    slug: cat.slug
                })),
                attributes: sourceProduct.productAttributeTerms.map(pat => ({
                    attribute: {
                        id: pat.attribute.id,
                        name: pat.attribute.name,
                        type: pat.attribute.type
                    },
                    term: {
                        id: pat.term.id,
                        name: pat.term.name,
                        slug: pat.term.slug
                    }
                }))
            },
            similar_products: transformedProducts,
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
                total_similar_products: transformedProducts.length,
                average_similarity_score: transformedProducts.length > 0 ? 
                    Math.round((transformedProducts.reduce((sum, p) => sum + p.similarity.score, 0) / transformedProducts.length) * 100) / 100 : 0
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
  
        // First, check if the deal exists and is active
        const deal = await Deal.findOne({
            where: {
                id: deal_id,
                is_active: true,
                is_deleted: false,
                valid_from: { [Op.lte]: new Date() },
                valid_to: { [Op.gte]: new Date() }
            },
            attributes: ['id', 'name', 'slug', 'fixed_price', 'discount_percent', 'tiered_qty_json', 'bundle_product_ids_json']
        });
  
        if (!deal) {
            return errorResponse(res, null, 'Deal not found or not active');
        }
  
        // Get total count of products in this deal (before filtering out out-of-stock products)
        const totalCount = await DealProduct.count({
            where: { deal_id: parseInt(deal_id),
                ...(product_id ? { product_id: { [Op.ne]: parseInt(product_id) } } : {})
             },
             include: [
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'slug', 'price'],
                    where: { status: 'published' },
                }
            ]
        });
        // Fetch ALL deal products with full product details (without pagination) to calculate total available count
        const allDealProducts = await DealProduct.findAll({
            where: { deal_id: parseInt(deal_id),
                ...(product_id ? { product_id: { [Op.ne]: parseInt(product_id) } } : {})
             },
            include: [
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'slug', 'price'],
                    where: { status: 'published' },
                    include: [
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
                            where: { status: 'active' },
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
                            model: ProductImage,
                            as: 'ProductImages',
                            attributes: ['id', 'product_id', 'image_url', 'is_primary']
                        }
                    ]
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        // Transform ALL products to filter out out-of-stock ones and get total available count
        const allTransformedProducts = await Promise.all(allDealProducts.map(async (dealProduct) => {
            const product = dealProduct.product;
            
            // Get minimum price variant using the helper function
            const minPriceVariant = getMinPriceVariant(product);
            
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
                category: product.Categories && product.Categories.length > 0 
                    ? {
                        id: product.Categories.find(cat => cat.ProductCategory?.is_primary) || product.Categories[0].id,
                        name: product.Categories.find(cat => cat.ProductCategory?.is_primary) || product.Categories[0].name,
                        slug: product.Categories.find(cat => cat.ProductCategory?.is_primary) || product.Categories[0].slug
                    }
                    : null,
                brand: product.Brands && product.Brands.length > 0
                    ? {
                        id: product.Brands.find(brand => brand.ProductBrand?.is_primary) || product.Brands[0].id,
                        name: product.Brands.find(brand => brand.ProductBrand?.is_primary) || product.Brands[0].name,
                        slug: product.Brands.find(brand => brand.ProductBrand?.is_primary) || product.Brands[0].slug
                    }
                    : null,
                primary_image: product.ProductImages && product.ProductImages.length > 0
                    ? {
                        id: product.ProductImages.find(img => img.is_primary) || product.ProductImages[0].id,
                        url: product.ProductImages.find(img => img.is_primary) || product.ProductImages[0].image_url,
                        is_primary: product.ProductImages.find(img => img.is_primary) || product.ProductImages[0].is_primary
                    }
                    : null,
                min_price_variant: minPriceVariant,
                variants: product.variants.map(variant => ({
                    id: variant.id,
                    slug: variant.slug,
                    price: variant.price,
                    regular_price: variant.regular_price,
                    discount_price: variant.discount_price,
                    stock: variant.stock,
                    stock_status: variant.stock_status,
                    status: variant.status,
                    attributes: variant.variantAttributes.map(va => ({
                        attribute: {
                            id: va.attribute.id,
                            name: va.attribute.name,
                            type: va.attribute.type,
                            image_url: va.attribute.image_url
                        },
                        term: {
                            id: va.term.id,
                            name: va.term.name,
                            slug: va.term.slug
                        }
                    })),
                    images: variant.variantImages.map(img => ({
                        id: img.id,
                        url: img.image_url,
                        is_primary: img.is_primary
                    }))
                }))
            };
        }));

        // Filter out null products and get total available count
        const allAvailableProducts = allTransformedProducts.filter(product => product !== null);
        const totalAvailableCount = allAvailableProducts.length;

        // Apply pagination to the available products
        const dealProducts = allAvailableProducts.slice(parsedOffset, parsedOffset + parsedLimit);
  
        // dealProducts now contains the paginated subset of available products        
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

