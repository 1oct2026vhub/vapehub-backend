const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Product, Category, Brand, ProductImage, Menu, ProductAttributeTerm, Attribute, AttributeTerm, ProductVariant, ProductVariantImage, ProductVariantAttribute, SlugRelation, ProductCategory, ProductBrand, ProductLinkedProduct, SeoMeta } = require("../../../../models");
const { Sequelize, Op } = require("sequelize");
const logger = require("../../../../library/logger");
const AWS = require("aws-sdk");
const { uploadFiletToS3, generateUniqueFileName, resizeToMaxSize, deleteFile } = require("../../../../library/s3/s3Helper");
const { processProductImageInMultipleSizes } = require("../../../../library/imageResize/productImageResizer");
const ExcelJS = require("exceljs");
const SlugManager = require("../../../../utils/slugManager");
const SeoService = require('../../seo/domain/seo.service');
const { syncProductToMenus } = require('../../menu/domain/menu.controller');

const slugManager = new SlugManager(SlugRelation);

const buildCanonicalUrl = (slug) => {
    const baseUrl = process.env.FRONTEND_URL ? process.env.FRONTEND_URL.replace(/\/+$/, '') : null;
    if (!baseUrl || !slug) {
        return null;
    }

    const normalizedSlug = slug.replace(/^\/+/, '');
    return `${baseUrl}/${normalizedSlug}`;
};

const ensureProductSeoMeta = async ({
    productId,
    productName,
    productDescription,
    productStatus,
    slug,
    transaction
}) => {
    const normalizedSlug = slugManager.normalizeSlug(slug || '');

    if (!normalizedSlug) {
        throw new Error('A valid slug is required to create SEO metadata for this product');
    }

    return SeoMeta.create({
        entityType: 'product',
        entityId: productId,
        title: productName || normalizedSlug,
        description: productDescription || null,
        slug: normalizedSlug,
        canonicalUrl: buildCanonicalUrl(normalizedSlug),
        noIndex: productStatus !== 'published'
    }, { transaction });
};

const formatMenuDetails = (menuInstance) => {
    if (!menuInstance) {
        return null;
    }

    const menu = typeof menuInstance.get === 'function'
        ? menuInstance.get({ plain: true })
        : menuInstance;

    return {
        id: menu.id,
        label: menu.label,
        original: menu.original,
        status: menu.status,
        menu_parent: menu.menu_parent,
        order: menu.order,
        show_image: menu.show_image,
        image_url: menu.image_url,
        icon: menu.icon,
        icon_position: menu.icon_position,
        hide_text: menu.hide_text,
        hide_mobile_view: menu.hide_mobile_view,
        hide_desktop_view: menu.hide_desktop_view,
        list_on_active_product: menu.list_on_active_product,
        created_at: menu.createdAt,
        updated_at: menu.updatedAt
    };
};

const buildMenuAssociationPayload = (records, entityKey, menuRows) => {
    if (!records?.length) {
        return [];
    }

    const menuMap = new Map();
    menuRows.forEach((row) => {
        const entityId = row.entity_id;
        if (!menuMap.has(entityId)) {
            menuMap.set(entityId, []);
        }
        menuMap.get(entityId).push(row);
    });

    const entityMap = new Map();
    records.forEach((record) => {
        const entity = record?.[entityKey];
        if (!entity || entityMap.has(entity.id)) {
            return;
        }

        const relatedMenus = menuMap.get(entity.id) || [];
        entityMap.set(entity.id, {
            id: entity.id,
            name: entity.name,
            slug: entity.slug,
            isOnMenu: relatedMenus.length > 0,
            hasListOnActiveProduct: relatedMenus.some(menu => menu.list_on_active_product),
            menuItems: relatedMenus.map(formatMenuDetails)
        });
    });

    return Array.from(entityMap.values());
};

const removeProductMenus = async (productId, transaction) => {
    const productMenus = await Menu.findAll({
        where: {
            entity_type: 'product',
            entity_id: productId
        },
        transaction
    });

    if (!productMenus.length) {
        return;
    }

    const parentIds = [
        ...new Set(
            productMenus
                .map(menu => menu.menu_parent)
                .filter(id => id !== null && id !== undefined)
        )
    ];

    const menuIds = productMenus.map(menu => menu.id);

    await Menu.destroy({
        where: { id: menuIds },
        transaction
    });

    if (!parentIds.length) {
        return;
    }

    const parentMenus = await Menu.findAll({
        where: { id: parentIds },
        transaction
    });

    for (const parentMenu of parentMenus) {
        const remainingChildren = await Menu.count({
            where: { menu_parent: parentMenu.id },
            transaction
        });

        if (remainingChildren === 0) {
            await parentMenu.destroy({ transaction });
        }
    }
};

module.exports.listAllProducts = async (req, res, next) => {
    try {
        const {
            sort_by = 'id', order = 'ASC', limit = 10, offset = 0, keyword, price_range,
            categories, brands, deleted, is_new, variant_attributes, status
        } = req.query;
        const parsedLimit = parseInt(limit, 10);
        const parsedOffset = parseInt(offset, 10);
        let whereClause = { 
            [Op.and]: []
        };

        // Keyword search
        if (keyword) {
            whereClause = { 
                [Op.and]: [],
                [Op.or]: []
            };
            
            // Check if keyword is a number for ID search
            const numericKeyword = parseInt(keyword, 10);
            if (!isNaN(numericKeyword)) {
                whereClause[Op.or].push(
                    { id: numericKeyword }
                );
            }
            
            // Add text-based searches
            whereClause[Op.or].push(
                { name: { [Op.like]: `%${keyword}%` } },
                { slug: { [Op.like]: `%${keyword}%` } }
            );
        }

        // Status filter
        if (status && status !== 'all') {
            whereClause[Op.and].push({ status });
        } else if (!status) {
            whereClause[Op.and].push({ status: 'published' });
        }


        // Price range filter based on product variants or product price
        if (price_range) {
            const [minPrice, maxPrice] = price_range.split('-').map(Number);
            whereClause[Op.and].push({
                [Op.or]: [
                    { price: { [Op.between]: [minPrice, maxPrice] } },
                    Sequelize.literal(`EXISTS (
                        SELECT 1 FROM product_variants 
                        WHERE product_variants.product_id = Product.id 
                        AND product_variants.price BETWEEN ${minPrice ?? 0} ${maxPrice ? `AND ${maxPrice}` : ''}
                    )`)
                ]
            });
        }

        // Brand filter
        if (brands) {
            const brandIds = brands.split(',').map(Number);
            whereClause[Op.and].push({
                id: {
                    [Op.in]: Sequelize.literal(`(
                        SELECT DISTINCT product_id 
                        FROM product_brands 
                        WHERE brand_id IN (${brandIds.join(',')})
                    )`)
                }
            });
        }

        // Category filter
        if (categories) {
            const categoryIds = categories.split(',').map(Number);
            whereClause[Op.and].push({
                id: {
                    [Op.in]: Sequelize.literal(`(
                        SELECT DISTINCT product_id 
                        FROM product_categories 
                        WHERE category_id IN (${categoryIds.join(',')})
                    )`)
                }
            });
        }

        // Variant attribute filters
        if (variant_attributes) {
            const attributes = variant_attributes.split(',').map(attr => {
                const [key, value] = attr.split(':');
                return { [key]: value };
            });
            whereClause[Op.and].push({
                [Op.or]: attributes.map(attr => Sequelize.literal(`EXISTS (
                    SELECT 1 FROM product_variants 
                    WHERE product_variants.product_id = Product.id 
                    AND product_variants.${Object.keys(attr)[0]} = '${Object.values(attr)[0]}'
                )`))
            });
        }

        // "Is New" filter (Products created in the last 30 days)
        if (is_new) {
            const lastMonthDate = new Date();
            lastMonthDate.setDate(lastMonthDate.getDate() - 30);
            whereClause[Op.and].push({ createdAt: { [Op.gte]: lastMonthDate } });
        }

        // Deleted filter (Soft-delete support)
        if (deleted !== undefined && (deleted === "true" || deleted === true)) {
            whereClause.deletedAt = { [Op.ne]: null }
        }
        // Optimized include clause - only essential relationships for better performance
        const includeClause = [
            { 
                model: Category, 
                as: 'Categories',
                required: false,
                through: { attributes: ['is_primary'] },
                attributes: ['id', 'name', 'slug'] // Limit attributes
            },
            { 
                model: Brand, 
                as: 'Brands',
                required: false,
                through: { attributes: ['is_primary'] },
                attributes: ['id', 'name', 'slug'] // Limit attributes
            },
            { 
                model: ProductImage, 
                as: 'ProductImages',
                required: false,
                attributes: ['id', 'product_id', 'image_url', 'is_primary'] // Limit attributes
            }
        ];

        // Separate query for variants and attributes to reduce JOIN complexity
        const variantIncludeClause = [
            {
                model: ProductVariant,
                as: "variants",
                attributes: [
                    "id",
                    "product_id",
                    "sku",
                    "slug",
                    "price",
                    "discount_price",
                    "purchase_price",
                    "weight",
                    "length",
                    "width",
                    "height",
                    "description",
                    "barcode",
                    "stock",
                    "low_stock_threshold",
                    "stock_status",
                    "status"
                ],
                include: [
                    {
                        model: ProductVariantImage,
                        as: "variantImages",
                        attributes: [
                            "id",
                            "variant_id",
                            "image_url",
                            "is_primary"
                        ]
                    },
                    {
                        model: ProductVariantAttribute,
                        as: "variantAttributes",
                        attributes: [
                            "id",
                            "variant_id",
                            "attribute_id",
                            "term_id",
                            "is_visible",
                            "used_in_variation"
                        ],
                        include: [
                            {
                                model: AttributeTerm,
                                as: "term",
                                attributes: [
                                    "id",
                                    "name",
                                    "slug"
                                ]
                            },
                            {
                                model: Attribute,
                                as: "attribute",
                                attributes: [
                                    "id",
                                    "name",
                                    "type"
                                ]
                            }
                        ]
                    }
                ]
            }
        ];

        const attributeIncludeClause = [
            {
                model: ProductAttributeTerm,
                as: "productAttributeTerms",
                attributes: [
                    "id",
                    "product_id",
                    "attribute_id",
                    "term_id",
                    "is_visible_page",
                    "used_in_variation"
                ],
                include: [  
                    {
                        model: Attribute,
                        as: "attribute",
                        attributes: [
                            "id",
                            "name",
                            "slug"
                        ]
                    },
                    {
                        model: AttributeTerm,
                        as: "term",
                        attributes: [
                            "id",
                            "name",
                            "slug"
                        ]
                    }
                ]
            }
        ];

        // Optimized query execution - separate count and data queries
        const totalCount = await Product.count({
            where: whereClause,
            paranoid: deleted === "true" || deleted === true ? false : true
        });

        // Calculate pagination details
        const totalPages = totalCount > 0 ? Math.ceil(totalCount / parsedLimit) : 1;
        const currentPage = Math.floor(parsedOffset / parsedLimit) + 1;

        const pagination = {
            total_count: totalCount,
            total_pages: totalPages,
            current_page: currentPage,
            limit: parsedLimit,
            offset: parsedOffset
        };

        // Fetch basic product data first (faster)
        const products = await Product.findAll({
            where: whereClause,
            include: includeClause,
            order: [[sort_by, order]],
            limit: parsedLimit,
            offset: parsedOffset,
            paranoid: !(deleted === "true" || deleted === true)
        });

        // Fetch variants and attributes separately for better performance
        if (products.length > 0) {
            const productIds = products.map(p => p.id);
            
            // Get variants for these products
            const variants = await ProductVariant.findAll({
                where: { product_id: { [Op.in]: productIds } },
                include: variantIncludeClause[0].include,
                attributes: variantIncludeClause[0].attributes
            });

            // Get attributes for these products
            const attributes = await ProductAttributeTerm.findAll({
                where: { product_id: { [Op.in]: productIds } },
                include: attributeIncludeClause[0].include,
                attributes: attributeIncludeClause[0].attributes
            });

            // Attach variants and attributes to products
            products.forEach(product => {
                product.dataValues.variants = variants.filter(v => v.product_id === product.id);
                product.dataValues.productAttributeTerms = attributes.filter(a => a.product_id === product.id);
            });
        }
        
        return successResponse(res, { products, pagination }, 'Success');
    } catch (error) {
        console.log(error);
        logger.error(error)
        return errorResponse(res, error, error.message);
    }
}

module.exports.getProductById = async (req, res, next) => {
    try {
        const { id } = req.params; 

        // Use Promise.all for parallel execution of optimized queries
        const [product, categories, brands, images, attributeTerms, variants, linkedProducts] = await Promise.all([
            // Main product query - minimal data first
            Product.findByPk(id, {
                paranoid: false,
                benchmark: false,
                logging: false,
                attributes: [
                    'id', 'updated_by', 'name', 'slug', 'description', 'price', 'discount_price', 
                    'stock_quantity', 'puff_count', 'is_new', 'battery_capacity', 
                    'coil_style', 'device_style', 'eliquid_capacity', 'pod_coil_style', 
                    'pod_fill_style', 'power_supply', 'nicotine_strength', 'nicotine_type', 'sku',
                    'vg_ratio', 'vaping_style', 'bottle_size', 'status', 'createdAt', 'updatedAt', 'deletedAt'
                ]
            }),
            
            // Categories query
            Product.findByPk(id, {
                paranoid: false,
                include: [{
                    model: Category,
                    as: "Categories",
                    paranoid: false,
                    through: { attributes: ['is_primary'] },
                    attributes: ['id', 'updated_by', 'name', 'description', 'slug', 'parent_id', 'logo_url', 'createdAt', 'updatedAt', 'deletedAt']
                }],
                attributes: []
            }).then(result => result?.Categories || []),
            
            // Brands query
            Product.findByPk(id, {
                paranoid: false,
                include: [{
                    model: Brand,
                    as: "Brands",
                    paranoid: false,
                    through: { attributes: ['is_primary'] },
                    attributes: ['id', 'updated_by', 'slug', 'name', 'description', 'logo_url', 'createdAt', 'updatedAt', 'deletedAt']
                }],
                attributes: []
            }).then(result => result?.Brands || []),
            
            // Images query
            Product.findByPk(id, {
                paranoid: false,
                include: [{
                    model: ProductImage,
                    as: "ProductImages",
                    attributes: ['id', 'updated_by', 'product_id', 'image_url', 'alt_text', 'is_primary', 'createdAt', 'updatedAt', 'deletedAt']
                }],
                attributes: []
            }).then(result => result?.ProductImages || []),
            
            // Attribute terms query with optimized includes
            Product.findByPk(id, {
                paranoid: false,
                include: [{
                    model: ProductAttributeTerm,
                    as: "productAttributeTerms",
                    attributes: [
                        "id", "product_id", "attribute_id", "term_id", 
                        "is_visible_page", "used_in_variation"
                    ],
                    include: [  
                        {
                            model: Attribute,
                            as: "attribute",
                            attributes: ["id", "name", "slug"]
                        },
                        {
                            model: AttributeTerm,
                            as: "term",
                            attributes: ["id", "name", "slug"]
                        }
                    ]
                }],
                attributes: []
            }).then(result => result?.productAttributeTerms || []),
            
            // Variants query with optimized includes
            Product.findByPk(id, {
                paranoid: false,
                include: [{
                    model: ProductVariant,
                    as: "variants",
                    attributes: [
                        "id", "product_id", "slug", "price", "regular_price", "discount_price",
                        "purchase_price", "weight", "length", "width", "height", "description","sku",
                        "barcode", "stock", "low_stock_threshold", "stock_status", "status"
                    ],
                    include: [
                        {
                            model: ProductVariantImage,
                            as: "variantImages",
                            attributes: ["id", "variant_id", "image_url", "is_primary"]
                        },
                        {
                            model: ProductVariantAttribute,
                            as: "variantAttributes",
                            attributes: [
                                "id", "variant_id", "attribute_id", "term_id", 
                                "is_visible", "used_in_variation"
                            ],
                            include: [
                                {
                                    model: AttributeTerm,
                                    as: "term",
                                    attributes: ["id", "name", "slug"]
                                },
                                {
                                    model: Attribute,
                                    as: "attribute",
                                    attributes: ["id", "name", "type"]
                                }
                            ]
                        }
                    ]
                }],
                attributes: []
            }).then(result => result?.variants || []),
            
            // Linked Products query
            Product.findByPk(id, {
                paranoid: false,
                include: [{
                    model: Product,
                    as: "LinkedProducts",
                    paranoid: false,
                    attributes: [
                        'id', 'name', 'slug', 'description', 'price', 'discount_price', 
                        'stock_quantity', 'puff_count', 'is_new', 'battery_capacity', 
                        'coil_style', 'device_style', 'eliquid_capacity', 'pod_coil_style', 
                        'pod_fill_style', 'power_supply', 'nicotine_strength', 'nicotine_type', 'sku',
                        'vg_ratio', 'vaping_style', 'bottle_size', 'status', 'createdAt', 'updatedAt', 'deletedAt'
                    ],
                    include: [
                        {
                            model: ProductImage,
                            as: "ProductImages",
                            attributes: ['id', 'product_id', 'image_url', 'alt_text', 'is_primary'],
                            limit: 1,
                            order: [['is_primary', 'DESC'], ['id', 'ASC']],
                            required: false
                        },
                        {
                            model: Category,
                            as: "Categories",
                            paranoid: false,
                            through: { attributes: ['is_primary'] },
                            attributes: ['id', 'name', 'slug'],
                            required: false
                        },
                        {
                            model: Brand,
                            as: "Brands",
                            paranoid: false,
                            through: { attributes: ['is_primary'] },
                            attributes: ['id', 'name', 'slug'],
                            required: false
                        }
                    ]
                }],
                attributes: []
            }).then(result => result?.LinkedProducts || [])
        ]);

        // If the product does not exist, return a 404 error response
        if (!product) {
            return errorResponse(res, { message: "Product not found" }, "Product not found", 404);
        }

        // Manually construct the product object with all related data
        const productData = product.toJSON();
        productData.Categories = categories;
        productData.Brands = brands;
        productData.ProductImages = images;
        productData.productAttributeTerms = attributeTerms;
        productData.variants = variants;
        
        // Format linked products to include only essential details
        productData.LinkedProducts = linkedProducts.map(linkedProduct => {
            const productJson = linkedProduct.toJSON ? linkedProduct.toJSON() : linkedProduct;
            const primaryImage = productJson.ProductImages && productJson.ProductImages.length > 0 
                ? productJson.ProductImages[0] 
                : null;
            
            return {
                id: productJson.id,
                name: productJson.name,
                image: primaryImage ? {
                    id: primaryImage.id,
                    url: primaryImage.image_url,
                    alt_text: primaryImage.alt_text,
                    is_primary: primaryImage.is_primary
                } : null,
                price: productJson.price,
                discount_price: productJson.discount_price
            };
        });

        // Process variants to update stock_status based on low stock threshold
        // Optimize the loop with early exit conditions
        if (variants && variants.length > 0) {
            for (const variant of variants) {
                // Update stock_status based on stock level and low_stock_threshold
                if (variant.stock <= 0) {
                    variant.stock_status = 'out_of_stock';
                } else if (variant.stock <= variant.low_stock_threshold) {
                    variant.stock_status = 'low_stock';
                }
            }
        }

        // Extract largest puff count from number-of-puffs attribute
        // Optimize the puff count extraction with early exit
        let puffCount = null;
        if (attributeTerms && attributeTerms.length > 0) {
            let maxPuffCount = 0;
            let maxPuffTerm = null;
            
            for (const pat of attributeTerms) {
                if (pat.attribute && pat.attribute.name === 'number-of-puffs' && pat.term) {
                    // Find all numbers in the string
                    const puffMatches = pat.term.name.match(/(\d+)/g);
                    if (puffMatches) {
                        // Use the largest number in the string
                        const count = Math.max(...puffMatches.map(Number));
                        if (count > maxPuffCount) {
                            maxPuffCount = count;
                            maxPuffTerm = pat.term.name;
                        }
                    }
                }
            }
            
            if (maxPuffCount > 0) {
                if (maxPuffTerm && maxPuffTerm.toLowerCase().includes('up to')) {
                    puffCount = `~${maxPuffCount} puffs`;
                } else {
                    puffCount = maxPuffTerm;
                }
            }
        }

        // Add puff count to the product response
        const productResponse = {
            ...productData,
            puff_count: puffCount
        };
        
        // Return success response with the retrieved product data
        return successResponse(res, productResponse, "Product retrieved successfully");
        
    } catch (error) {
        // Handle any unexpected errors and return an appropriate error response
        return errorResponse(res, error, error.message);
    }
};

module.exports.getProductByIdOriginal = async (req, res, next) => {
    try {
        const { id } = req.params; 

        // Fetch the product by ID along with related data (Categories, Brands, Images, Flavors, Variants, and Attributes)
        const product = await Product.findByPk(id, {
            paranoid: false,
            include: [
                {
                    model: Category,
                    as: "Categories",
                    paranoid: false,
                    through: { attributes: ['is_primary'] }
                },
                {
                    model: Brand,
                    as: "Brands",
                    paranoid: false,
                    through: { attributes: ['is_primary'] }
                },
                {
                    model: ProductImage,
                    as: "ProductImages",
                },
                {
                    model: ProductAttributeTerm,
                    as: "productAttributeTerms",
                    attributes: [
                        "id",
                        "product_id",
                        "attribute_id",
                        "term_id",
                        "is_visible_page",
                        "used_in_variation"
                    ],
                    include: [  
                        {
                            model: Attribute,
                            as: "attribute",
                            attributes: [
                                "id",
                                "name",
                                "slug"
                            ]
                        },
                        {
                            model: AttributeTerm,
                            as: "term",
                            attributes: [
                                "id",
                                "name",
                                "slug"
                            ]
                        }
                    ]
                },
                {
                    model: ProductVariant,
                    as: "variants",
                    attributes: [
                        "id",
                        "product_id",
                        "slug",
                        "price",
                        "regular_price",
                        "discount_price",
                        "purchase_price",
                        "weight",
                        "length",
                        "width",
                        "height",
                        "description",
                        "barcode",
                        "stock",
                        "low_stock_threshold",
                        "stock_status",
                        "status"
                    ],
                    include: [
                        {
                            model: ProductVariantImage,
                            as: "variantImages",
                            attributes: [
                                "id",
                                "variant_id",
                                "image_url",
                                "is_primary"
                            ]
                        },
                        {
                            model: ProductVariantAttribute,
                            as: "variantAttributes",
                            attributes: [
                                "id",
                                "variant_id",
                                "attribute_id",
                                "term_id",
                                "is_visible",
                                "used_in_variation"
                            ],
                            include: [
                                {
                                    model: AttributeTerm,
                                    as: "term",
                                    attributes: [
                                        "id",
                                        "name",
                                        "slug"
                                    ]
                                },
                                {
                                    model: Attribute,
                                    as: "attribute",
                                    attributes: [
                                        "id",
                                        "name",
                                        "type"
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        });

        // If the product does not exist, return a 404 error response
        if (!product) {
            return errorResponse(res, { message: "Product not found" }, "Product not found", 404);
        }

        // Process variants to update stock_status based on low stock threshold
        if (product.variants && product.variants.length > 0) {
            product.variants.forEach(variant => {
                // Update stock_status based on stock level and low_stock_threshold
                if (variant.stock <= 0) {
                    variant.stock_status = 'out_of_stock';
                } else if (variant.stock <= variant.low_stock_threshold) {
                    variant.stock_status = 'low_stock';
                }
                //  else {
                //     variant.stock_status = 'in_stock';
                // }
            });
        }

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

        // Add puff count to the product response
        const productResponse = {
            ...product.toJSON(),
            puff_count: puffCount
        };
        // Return success response with the retrieved product data
        return successResponse(res, productResponse, "Product retrieved successfully");
    } catch (error) {
        // Handle any unexpected errors and return an appropriate error response
        return errorResponse(res, error, error.message);
    }
};

module.exports.createProduct = async (req, res, next) => {
    const transaction = await Product.sequelize.transaction();
    try {
        const {
            name,
            slug,
            sku,
            description,
            price,
            discount_price,
            stock_quantity,
            puff_count,
            is_new,
            battery_capacity,
            coil_style,
            device_style,
            eliquid_capacity,
            pod_coil_style,
            pod_fill_style,
            power_supply,
            nicotine_strength,
            nicotine_type,
            vg_ratio,
            vaping_style,
            bottle_size,
            category_ids,
            brand_ids,
            linked_product_ids
        } = req.body;

        const { id: updated_by } = req.user;

        // Clean the name and slug
        const cleanName = name.trim();
        const cleanSlug = slug.toLowerCase().trim();
        const cleanSku = sku === undefined || sku === null
            ? null
            : String(sku).trim() || null;

        // Validate categories if provided
        if (category_ids && category_ids.length > 0) {
            const categoryIds = Array.isArray(category_ids) ? category_ids : [category_ids];
            const categories = await Category.findAll({
                where: { id: { [Op.in]: categoryIds } }
            });
            
            if (categories.length !== categoryIds.length) {
                await transaction.rollback();
                return errorResponse(res, { message: "One or more invalid category IDs" }, "Invalid category IDs", 400);
            }
        }

        // Validate brands if provided
        if (brand_ids && brand_ids.length > 0) {
            const brandIds = Array.isArray(brand_ids) ? brand_ids : [brand_ids];
            const brands = await Brand.findAll({
                where: { id: { [Op.in]: brandIds } }
            });
            
            if (brands.length !== brandIds.length) {
                await transaction.rollback();
                return errorResponse(res, { message: "One or more invalid brand IDs" }, "Invalid brand IDs", 400);
            }
        }

        // Validate linked products if provided
        if (linked_product_ids && linked_product_ids.length > 0) {
            const linkedProductIds = Array.isArray(linked_product_ids) ? linked_product_ids : [linked_product_ids];
            
            // Validate that all linked product IDs exist
            const linkedProducts = await Product.findAll({
                where: { id: { [Op.in]: linkedProductIds } }
            });
            
            if (linkedProducts.length !== linkedProductIds.length) {
                await transaction.rollback();
                return errorResponse(res, { message: "One or more invalid linked product IDs" }, "Invalid linked product IDs", 400);
            }
        }

        // Check for duplicate name (case-insensitive)
        const existingProductName = await Product.findOne({
            where: {
                name: {
                    [Op.like]: cleanName // Case-insensitive comparison
                }
            },
            transaction
        });

        if (existingProductName) {
            await transaction.rollback();
            return errorResponse(
                res, 
                { 
                    message: "Product with this name already exists",
                    existing_product: {
                        id: existingProductName.id,
                        name: existingProductName.name
                    }
                }, 
                "Duplicate product name", 
                400
            );
        }

        // Check for duplicate slug
        const existingProductSlug = await Product.findOne({
            where: {
                slug: cleanSlug
            },
            transaction
        });

        if (existingProductSlug) {
            await transaction.rollback();
            return errorResponse(
                res, 
                { 
                    message: "This slug already exists in another product",
                    existing_product: {
                        id: existingProductSlug.id,
                        name: existingProductSlug.name,
                        slug: existingProductSlug.slug
                    }
                }, 
                "Duplicate product slug", 
                400
            );
        }

        if (cleanSku) {
            const existingProductSku = await Product.findOne({
                where: {
                    sku: cleanSku
                },
                transaction
            });

            if (existingProductSku) {
                await transaction.rollback();
                return errorResponse(
                    res,
                    {
                        message: "This SKU already exists in another product",
                        existing_product: {
                            id: existingProductSku.id,
                            name: existingProductSku.name,
                            sku: existingProductSku.sku
                        }
                    },
                    "Duplicate product SKU",
                    400
                );
            }
        }

        // Create the product record
        const product = await Product.create(
            {
                name: cleanName,
                slug: cleanSlug,
                sku: cleanSku,
                description,
                price,
                discount_price,
                stock_quantity,
                puff_count,
                is_new,
                battery_capacity,
                coil_style,
                device_style,
                eliquid_capacity,
                pod_coil_style,
                pod_fill_style,
                power_supply,
                nicotine_strength,
                nicotine_type,
                vg_ratio,
                vaping_style,
                bottle_size,
                updated_by
            },
            { transaction }
        );

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

        // Create linked product associations
        if (linked_product_ids && linked_product_ids.length > 0) {
            const linkedProductIds = Array.isArray(linked_product_ids) ? linked_product_ids : [linked_product_ids];
            
            // Prevent self-linking
            const validLinkedProductIds = linkedProductIds.filter(linkedId => linkedId !== product.id);
            
            if (validLinkedProductIds.length > 0) {
                const linkedProductData = validLinkedProductIds.map(linkedProductId => ({
                    product_id: product.id,
                    linked_product_id: linkedProductId
                }));
                
                await ProductLinkedProduct.bulkCreate(linkedProductData, { transaction });
            }
        }

        // Create slug relation
        await slugManager.createOrUpdateSlug(cleanSlug, 'product', product.id, transaction);

        await transaction.commit();

        // Fetch and return the created product with related models
        const newProduct = await Product.findByPk(product.id, {
            include: [
                { 
                    model: Category, 
                    as: "Categories",
                    attributes: ['id', 'name', 'slug'],
                    through: { attributes: ['is_primary'] }
                },
                { 
                    model: Brand, 
                    as: "Brands",
                    attributes: ['id', 'name', 'slug'],
                    through: { attributes: ['is_primary'] }
                },
                { 
                    model: ProductImage, 
                    as: "ProductImages",
                    attributes: ['id', 'image_url', 'is_primary']
                }
            ]
        });

        return successResponse(res, newProduct, "Product created successfully", 201);
    } catch (error) {
        await transaction.rollback();
        console.log(error);
        logger.error('Create Product Error:', {
            error: error.message,
            stack: error.stack,
            body: req.body
        });
        
        // Handle Sequelize validation errors
        if (error.name === 'SequelizeValidationError') {
            const validationErrors = error.errors.map(err => ({
                message: err.message,
                field: err.path,
                value: err.value
            }));
            return errorResponse(res, { message: "Validation failed", errors: validationErrors }, "Validation error", 400);
        }
        
        // Handle Sequelize unique constraint errors
        if (error.name === 'SequelizeUniqueConstraintError') {
            const uniqueErrors = error.errors.map(err => ({
                message: err.message,
                field: err.path,
                value: err.value
            }));
            return errorResponse(res, { message: "Unique constraint violation", errors: uniqueErrors }, "Duplicate entry", 400);
        }
        
        return errorResponse(res, error, error.message);
    }
};

module.exports.updateProduct = async (req, res, next) => {
    const transaction = await Product.sequelize.transaction();
    try {
        const { id } = req.params;
        const {
            name,
            slug,
            sku,
            description,
            price,
            discount_price,
            stock_quantity,
            puff_count,
            is_new,
            battery_capacity,
            coil_style,
            device_style,
            eliquid_capacity,
            pod_coil_style,
            pod_fill_style,
            power_supply,
            nicotine_strength,
            nicotine_type,
            vg_ratio,
            vaping_style,
            bottle_size,
            category_ids,
            brand_ids,
            linked_product_ids
        } = req.body;

        const { id: updated_by } = req.user;

        // Find the existing product
        const product = await Product.findByPk(id, { transaction });
        if (!product) {
            await transaction.rollback();
            return errorResponse(res, { message: "Product not found" }, "Product not found", 404);
        }

        // Clean the input values if provided
        const cleanName = name?.trim();
        const cleanSlug = slug?.toLowerCase().trim();
        const cleanSku = sku === undefined
            ? undefined
            : sku === null
                ? null
                : String(sku).trim() || null;

        if (sku !== undefined && cleanSku && cleanSku !== product.sku) {
            const existingProductSku = await Product.findOne({
                where: {
                    sku: cleanSku,
                    id: { [Op.ne]: id }
                },
                transaction
            });

            if (existingProductSku) {
                await transaction.rollback();
                return errorResponse(
                    res,
                    {
                        message: "Product with this SKU already exists",
                        existing_product: {
                            id: existingProductSku.id,
                            name: existingProductSku.name,
                            sku: existingProductSku.sku
                        }
                    },
                    "Duplicate product SKU",
                    400
                );
            }
        }

        // Check for duplicate name if name is being updated
        if (cleanName && cleanName !== product.name) {
            const existingProductName = await Product.findOne({
                where: {
                    name: {
                        [Op.like]: cleanName // Case-insensitive comparison
                    },
                    id: { [Op.ne]: id } // Exclude current product
                },
                transaction
            });

            if (existingProductName) {
                await transaction.rollback();
                return errorResponse(
                    res, 
                    { 
                        message: "Product with this name already exists",
                        existing_product: {
                            id: existingProductName.id,
                            name: existingProductName.name
                        }
                    }, 
                    "Duplicate product name", 
                    400
                );
            }
        }
        // Check for duplicate slug if slug is provided
        if (cleanSlug) {
            const existingProductSlug = await Product.findOne({
                where: {
                    slug: cleanSlug,
                    id: { [Op.ne]: id } // Exclude current product
                },
                transaction
            });

            if (existingProductSlug) {
                await transaction.rollback();
                return errorResponse(
                    res, 
                    { 
                        message: "This slug already exists in another product",
                        existing_product: {
                            id: existingProductSlug.id,
                            name: existingProductSlug.name,
                            slug: existingProductSlug.slug
                        }
                    }, 
                    "Duplicate product slug", 
                    400
                );
            }
        }

        // Validate categories if provided
        if (category_ids && category_ids.length > 0) {
            const categoryIds = Array.isArray(category_ids) ? category_ids : [category_ids];
            const categories = await Category.findAll({
                where: { id: { [Op.in]: categoryIds } }
            });
            
            if (categories.length !== categoryIds.length) {
                await transaction.rollback();
                return errorResponse(res, { message: "One or more invalid category IDs" }, "Invalid category IDs", 400);
            }
        }

        // Validate brands if provided
        if (brand_ids && brand_ids.length > 0) {
            const brandIds = Array.isArray(brand_ids) ? brand_ids : [brand_ids];
            const brands = await Brand.findAll({
                where: { id: { [Op.in]: brandIds } }
            });
            
            if (brands.length !== brandIds.length) {
                await transaction.rollback();
                return errorResponse(res, { message: "One or more invalid brand IDs" }, "Invalid brand IDs", 400);
            }
        }

        // Validate linked products if provided
        if (linked_product_ids !== undefined) {
            if (linked_product_ids && linked_product_ids.length > 0) {
                const linkedProductIds = Array.isArray(linked_product_ids) ? linked_product_ids : [linked_product_ids];
                
                // Prevent self-linking
                const validLinkedProductIds = linkedProductIds.filter(linkedId => linkedId !== parseInt(id));
                
                if (validLinkedProductIds.length === 0 && linkedProductIds.length > 0) {
                    await transaction.rollback();
                    return errorResponse(res, { message: "Cannot link product to itself" }, "Invalid linked product IDs", 400);
                }
                
                // Validate that all linked product IDs exist
                if (validLinkedProductIds.length > 0) {
                    const linkedProducts = await Product.findAll({
                        where: { id: { [Op.in]: validLinkedProductIds } }
                    });
                    
                    if (linkedProducts.length !== validLinkedProductIds.length) {
                        await transaction.rollback();
                        return errorResponse(res, { message: "One or more invalid linked product IDs" }, "Invalid linked product IDs", 400);
                    }
                }
            }
        }

        // Prepare update fields
        const updatedFields = {};

        if (cleanName) {
            updatedFields.name = cleanName;
        }
        if (cleanSlug) {
            updatedFields.slug = cleanSlug;
        }
        if (sku !== undefined) {
            updatedFields.sku = cleanSku;
        }
        if (description !== undefined) {
            updatedFields.description = typeof description === 'string' ? description.trim() : description;
        }
        if (price !== undefined) {
            updatedFields.price = price;
        }
        if (discount_price !== undefined) {
            updatedFields.discount_price = discount_price;
        }
        if (stock_quantity !== undefined) {
            updatedFields.stock_quantity = stock_quantity;
        }
        if (puff_count !== undefined) {
            updatedFields.puff_count = puff_count;
        }
        if (is_new !== undefined) {
            updatedFields.is_new = is_new;
        }
        if (battery_capacity !== undefined) {
            updatedFields.battery_capacity = battery_capacity;
        }
        if (coil_style !== undefined) {
            updatedFields.coil_style = coil_style;
        }
        if (device_style !== undefined) {
            updatedFields.device_style = device_style;
        }
        if (eliquid_capacity !== undefined) {
            updatedFields.eliquid_capacity = eliquid_capacity;
        }
        if (pod_coil_style !== undefined) {
            updatedFields.pod_coil_style = pod_coil_style;
        }
        if (pod_fill_style !== undefined) {
            updatedFields.pod_fill_style = pod_fill_style;
        }
        if (power_supply !== undefined) {
            updatedFields.power_supply = power_supply;
        }
        if (nicotine_strength !== undefined) {
            updatedFields.nicotine_strength = nicotine_strength;
        }
        if (nicotine_type !== undefined) {
            updatedFields.nicotine_type = nicotine_type;
        }
        if (vg_ratio !== undefined) {
            updatedFields.vg_ratio = vg_ratio;
        }
        if (vaping_style !== undefined) {
            updatedFields.vaping_style = vaping_style;
        }
        if (bottle_size !== undefined) {
            updatedFields.bottle_size = bottle_size;
        }

        updatedFields.updated_by = updated_by;

        // Check if SEO metadata exists for slug update (within transaction)
        let shouldUpdateSeoSlug = false;
        if (cleanSlug && product.slug !== cleanSlug) {
            shouldUpdateSeoSlug = true;
        }

        // Wrap SEO check in try-catch to prevent transaction hangs if SEO query fails
        let seoMetaExists = false;
        try {
            const existingSeoMeta = await SeoMeta.findOne({
                where: {
                    entityType: 'product',
                    entityId: id
                },
                transaction
            });
            seoMetaExists = !!existingSeoMeta;
        } catch (seoCheckError) {
            // If SEO check fails, log but continue - don't block the update
            logger.warn('Error checking SEO metadata during product update:', {
                error: seoCheckError.message,
                productId: id
            });
            seoMetaExists = false; // Assume no SEO exists to be safe
        }

        if (!seoMetaExists) {
            const seoSlugSource = cleanSlug || product.slug;
            
            // Only create SEO metadata if we have a valid slug
            if (seoSlugSource && seoSlugSource.trim()) {
                try {
                    const normalizedSlug = slugManager.normalizeSlug(seoSlugSource);
                    
                    if (!normalizedSlug) {
                        logger.warn('Skipping SEO metadata creation - invalid slug after normalization:', {
                            productId: id,
                            slug: seoSlugSource
                        });
                    } else {
                        // Check if slug is already taken BEFORE attempting to create (prevents unique constraint violation)
                        const existingSlugSeo = await SeoMeta.findOne({
                            where: {
                                slug: normalizedSlug,
                                [Op.or]: [
                                    { entityType: { [Op.ne]: 'product' } },
                                    { entityId: { [Op.ne]: id } }
                                ]
                            },
                            transaction
                        });

                        if (existingSlugSeo) {
                            logger.warn('Skipping SEO metadata creation - slug already exists for another entity:', {
                                productId: id,
                                slug: normalizedSlug,
                                existingEntity: {
                                    type: existingSlugSeo.entityType,
                                    id: existingSlugSeo.entityId
                                }
                            });
                        } else {
                            // Slug is available - safe to create
                            await ensureProductSeoMeta({
                                productId: id,
                                productName: cleanName || product.name,
                                productDescription: description !== undefined
                                    ? (typeof description === 'string' ? description.trim() : description)
                                    : product.description,
                                productStatus: product.status,
                                slug: seoSlugSource,
                                transaction
                            });
                            seoMetaExists = true;
                        }
                    }
                } catch (seoError) {
                    // Log error but don't fail the product update
                    logger.warn('Error creating SEO metadata during product update:', {
                        error: seoError.message,
                        productId: id,
                        slug: seoSlugSource
                    });
                    // Continue without SEO metadata - it can be created later when slug is available
                }
            } else {
                // Log warning but don't fail - SEO can be created later when slug is set
                logger.warn('Skipping SEO metadata creation - product has no slug:', {
                    productId: id
                });
            }
        }

        const shouldUpdateSeoNoIndex = seoMetaExists;

        // Update only if there are changes
        if (Object.keys(updatedFields).length > 0) {
            await product.update(updatedFields, { transaction });
        }

        // Get old categories and brands before updating (for menu cleanup)
        let oldCategoryIds = [];
        let oldBrandIds = [];
        if (category_ids !== undefined || brand_ids !== undefined) {
            const oldProduct = await Product.findByPk(id, {
                include: [
                    {
                        model: Category,
                        as: 'Categories',
                        attributes: ['id'],
                        through: { attributes: [] }
                    },
                    {
                        model: Brand,
                        as: 'Brands',
                        attributes: ['id'],
                        through: { attributes: [] }
                    }
                ],
                transaction
            });
            
            if (oldProduct) {
                oldCategoryIds = (oldProduct.Categories || []).map(cat => cat.id);
                oldBrandIds = (oldProduct.Brands || []).map(brand => brand.id);
            }
        }

        // Update category associations if provided
        if (category_ids !== undefined) {
            // Remove existing category associations
            await ProductCategory.destroy({
                where: { product_id: id },
                transaction
            });

            // Create new category associations
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
            // Remove existing brand associations
            await ProductBrand.destroy({
                where: { product_id: id },
                transaction
            });

            // Create new brand associations
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

        // Update linked product associations if provided
        if (linked_product_ids !== undefined) {
            // Remove existing linked product associations
            await ProductLinkedProduct.destroy({
                where: { product_id: id },
                transaction
            });

            // Create new linked product associations
            if (linked_product_ids && linked_product_ids.length > 0) {
                const linkedProductIds = Array.isArray(linked_product_ids) ? linked_product_ids : [linked_product_ids];
                
                // Prevent self-linking
                const validLinkedProductIds = linkedProductIds.filter(linkedId => linkedId !== parseInt(id));
                
                if (validLinkedProductIds.length > 0) {
                    const linkedProductData = validLinkedProductIds.map(linkedProductId => ({
                        product_id: id,
                        linked_product_id: linkedProductId
                    }));
                    
                    await ProductLinkedProduct.bulkCreate(linkedProductData, { transaction });
                }
            }
        }

        // Handle menu cleanup and sync when categories/brands are updated
        if ((category_ids !== undefined || brand_ids !== undefined)) {
            // Get new category and brand IDs after update
            const newCategoryIds = category_ids !== undefined 
                ? (category_ids && category_ids.length > 0 
                    ? (Array.isArray(category_ids) ? category_ids : [category_ids])
                    : [])
                : oldCategoryIds;
            
            const newBrandIds = brand_ids !== undefined
                ? (brand_ids && brand_ids.length > 0
                    ? (Array.isArray(brand_ids) ? brand_ids : [brand_ids])
                    : [])
                : oldBrandIds;

            // Find removed categories and brands
            const removedCategoryIds = oldCategoryIds.filter(id => !newCategoryIds.includes(id));
            const removedBrandIds = oldBrandIds.filter(id => !newBrandIds.includes(id));

            // Remove product menus from removed category/brand menus
            if (removedCategoryIds.length > 0 || removedBrandIds.length > 0) {
                try {
                    // Find category/brand menus for removed entities
                    const removedEntityMenus = await Menu.findAll({
                        where: {
                            [Op.or]: [
                                {
                                    entity_type: 'category',
                                    entity_id: { [Op.in]: removedCategoryIds }
                                },
                                {
                                    entity_type: 'brand',
                                    entity_id: { [Op.in]: removedBrandIds }
                                }
                            ]
                        },
                        attributes: ['id'],
                        transaction
                    });

                    if (removedEntityMenus.length > 0) {
                        const removedMenuIds = removedEntityMenus.map(menu => menu.id);
                        
                        // Find letter menus under these category/brand menus
                        const letterMenus = await Menu.findAll({
                            where: {
                                menu_parent: { [Op.in]: removedMenuIds },
                                entity_type: 'page'
                            },
                            attributes: ['id'],
                            transaction
                        });

                        if (letterMenus.length > 0) {
                            const letterMenuIds = letterMenus.map(menu => menu.id);
                            
                            // Remove product menus under these letter menus
                            await Menu.destroy({
                                where: {
                                    menu_parent: { [Op.in]: letterMenuIds },
                                    entity_type: 'product',
                                    entity_id: id
                                },
                                transaction
                            });
                        }
                    }
                } catch (cleanupError) {
                    // Log error but don't fail the update
                    logger.warn('Error cleaning up product menus from removed categories/brands:', {
                        error: cleanupError.message,
                        productId: id,
                        removedCategoryIds,
                        removedBrandIds
                    });
                }
            }

            // Fetch the current product status
            const currentProduct = await Product.findByPk(id, { 
                attributes: ['status'],
                transaction 
            });
            
            // Sync product to menus if product is published
            // This will add product to new category/brand menus
            if (currentProduct && currentProduct.status === 'published') {
                try {
                    await syncProductToMenus(id, transaction, updated_by);
                } catch (syncError) {
                    // Log error but don't fail the update
                    logger.warn('Error syncing product to menus after category/brand update:', {
                        error: syncError.message,
                        productId: id
                    });
                }
            }
        }

        // Update slug if provided and changed (wrap in try-catch to prevent transaction hangs)
        if (cleanSlug) {
            try {
                await slugManager.createOrUpdateSlug(cleanSlug, 'product', id, transaction);
            } catch (slugError) {
                logger.warn('Error updating slug relation during product update:', {
                    error: slugError.message,
                    productId: id,
                    slug: cleanSlug
                });
                // Continue - slug relation can be updated later
            }
        }

        // Menu update (wrap in try-catch to prevent transaction hangs)
        try {
            const menu = await Menu.findOne({ where: { entity_id: id }, transaction });
            if (menu && cleanSlug) {
                await Menu.update({
                    original: `/${cleanSlug.trim()}`
                }, { where: { entity_id: id }, transaction });
            }
        } catch (menuError) {
            logger.warn('Error updating menu during product update:', {
                error: menuError.message,
                productId: id
            });
            // Continue - menu can be updated later
        }
        // Fetch the updated product with related models (wrap in try-catch with fallback)
        let updatedProduct;
        try {
            updatedProduct = await Product.findByPk(id, {
                include: [
                    { 
                        model: Category, 
                        as: "Categories",
                        attributes: ['id', 'name', 'slug'],
                        through: { attributes: ['is_primary'] }
                    },
                    { 
                        model: Brand, 
                        as: "Brands",
                        attributes: ['id', 'name', 'slug'],
                        through: { attributes: ['is_primary'] }
                    },
                    { 
                        model: ProductImage, 
                        as: "ProductImages",
                        attributes: ['id', 'image_url', 'is_primary']
                    },
                    {
                        model: ProductVariant,
                        as: "variants",
                        attributes: ['id', 'price', 'stock', 'discount_price', 'stock_status', 'low_stock_threshold']
                    }
                ],
                transaction
            });
        } catch (fetchError) {
            logger.warn('Error fetching updated product with relations, using fallback:', {
                error: fetchError.message,
                productId: id
            });
            // Fallback: fetch product without relations to ensure we can return something
            updatedProduct = await Product.findByPk(id, { transaction });
            if (!updatedProduct) {
                throw new Error('Failed to fetch updated product');
            }
        }

        const productStatus = updatedProduct.status;

        // Commit transaction FIRST to avoid conflicts
        await transaction.commit();

        // Update SEO AFTER transaction commit (non-blocking to avoid affecting response)
        if (shouldUpdateSeoSlug && cleanSlug) {
            SeoService.updateSeoSlug('product', id, cleanSlug).catch(seoError => {
                logger.warn('Error updating SEO slug during product update:', {
                    error: seoError.message,
                    productId: id,
                    slug: cleanSlug
                });
            });
        }

        if (shouldUpdateSeoNoIndex) {
            SeoService.updateProductNoIndex(id, productStatus).catch(seoError => {
                logger.warn('Error updating SEO noIndex during product update:', {
                    error: seoError.message,
                    productId: id,
                    status: productStatus
                });
            });
        }

        return successResponse(res, updatedProduct, "Product updated successfully");
    } catch (error) {
        await transaction.rollback();
        console.log(error);
        logger.error('Update Product Error:', {
            error: error.message,
            stack: error.stack,
            productId: req.params.id,
            body: req.body
        });
        return errorResponse(res, error, "Error updating product");
    }
};

module.exports.deleteProduct = async (req, res, next) => {
    const transaction = await Product.sequelize.transaction();
    try {
        const { id } = req.params;

        // Find the product by ID
        const product = await Product.findByPk(id);

        // Check if the product exists
        if (!product) {
            await transaction.rollback();
            return errorResponse(res, { message: "Product not found" }, "Product not found", 404);
        }

        // Delete slug relation first
        await slugManager.deleteSlug('product', id, transaction);

        // Update SEO noIndex to true before deletion
        await SeoService.updateNoIndex('product', id, true);

        // Remove related menu entries
        await removeProductMenus(id, transaction);

        // Perform a soft delete
        await product.destroy({ transaction });

        await transaction.commit();
        logger.info(`Product ID ${id} deleted successfully`);

        return successResponse(res, { message: "Product deleted successfully" });
    } catch (error) {
        await transaction.rollback();
        logger.error(error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Bulk soft-deletes products by IDs.
 */
module.exports.bulkDeleteProducts = async (req, res, next) => {
    try {
        const { ids } = req.body;

        const deletedProducts = [];
        const notDeletedProducts = [];

        for (const rawId of ids) {
            const id = Number(rawId);
            const t = await Product.sequelize.transaction();
            try {
                // Find the product by ID
                const product = await Product.findByPk(id, { transaction: t });
                
                if (!product) {
                    await t.rollback();
                    notDeletedProducts.push({ 
                        id, 
                        reason: 'Product not found' 
                    });
                    continue;
                }

                // Delete slug relation first
                await slugManager.deleteSlug('product', id, t);

                // Update SEO noIndex to true before deletion
                await SeoService.updateNoIndex('product', id, true);

                // Remove related menu entries
                await removeProductMenus(id, t);

                // Perform a soft delete
                await product.destroy({ transaction: t });

                await t.commit();
                
                deletedProducts.push({ 
                    id: product.id, 
                    name: product.name,
                    slug: product.slug 
                });
            } catch (error) {
                await t.rollback();
                notDeletedProducts.push({ 
                    id, 
                    reason: error.message || 'Failed to delete product' 
                });
                logger.error(`Error deleting product ${id}:`, error);
            }
        }

        const responseData = {
            deleted: deletedProducts,
            not_deleted: notDeletedProducts,
            summary: {
                total_requested: ids.length,
                deleted_count: deletedProducts.length,
                not_deleted_count: notDeletedProducts.length,
            },
        };

        const statusCode = deletedProducts.length > 0 ? 200 : 400;
        const message = deletedProducts.length === ids.length
            ? 'All products deleted successfully'
            : deletedProducts.length > 0
                ? 'Some products deleted successfully'
                : 'No products were deleted';

        return successResponse(res, responseData, message, statusCode);
    } catch (error) {
        logger.error('Bulk delete products error:', error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.restoreProduct = async (req, res, next) => {
    const transaction = await Product.sequelize.transaction();
    try {
        const { id } = req.params;

        // Find the product, including soft-deleted ones
        const product = await Product.findOne({
            where: { id },
            paranoid: false 
        });

        // Check if the product exists
        if (!product) {
            await transaction.rollback();
            return errorResponse(res, { message: "Product not found" }, "Product not found", 404);
        }

        // Check if the product is already active
        if (!product.deletedAt) {
            await transaction.rollback();
            return errorResponse(res, { message: "Product is not deleted" }, "Product is not deleted", 400);
        }

        // Restore the product
        await product.restore({ transaction });

        // Recreate slug relation
        await slugManager.createOrUpdateSlug(product.slug, 'product', product.id, transaction);

        // Update SEO noIndex based on product status and published state
        const noIndex = product.status !== 'published';
        await SeoService.updateNoIndex('product', id, noIndex);

        await transaction.commit();
        logger.info(`Product ID ${id} restored successfully`);

        return successResponse(res, { message: "Product restored successfully" });
    } catch (error) {
        await transaction.rollback();
        logger.error(error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Bulk restores soft-deleted products by IDs.
 */
module.exports.bulkRestoreProducts = async (req, res, next) => {
    try {
        const { ids } = req.body;

        const restoredProducts = [];
        const notRestoredProducts = [];

        for (const rawId of ids) {
            const id = Number(rawId);
            const t = await Product.sequelize.transaction();
            try {
                // Find the product, including soft-deleted ones
                const product = await Product.findOne({
                    where: { id },
                    paranoid: false,
                    transaction: t
                });
                
                if (!product) {
                    await t.rollback();
                    notRestoredProducts.push({ 
                        id, 
                        reason: 'Product not found' 
                    });
                    continue;
                }

                // Check if the product is already active (not deleted)
                if (!product.deletedAt) {
                    await t.rollback();
                    notRestoredProducts.push({ 
                        id, 
                        name: product.name,
                        reason: 'Product is already active (not deleted)' 
                    });
                    continue;
                }

                // Restore the product
                await product.restore({ transaction: t });

                // Recreate slug relation
                await slugManager.createOrUpdateSlug(product.slug, 'product', product.id, t);

                await t.commit();

                // Update SEO noIndex based on product status and published state (outside transaction)
                const noIndex = product.status !== 'published';
                await SeoService.updateNoIndex('product', id, noIndex);

                restoredProducts.push({ 
                    id: product.id, 
                    name: product.name,
                    slug: product.slug 
                });
            } catch (error) {
                await t.rollback();
                notRestoredProducts.push({ 
                    id, 
                    reason: error.message || 'Failed to restore product' 
                });
                logger.error(`Error restoring product ${id}:`, error);
            }
        }

        const responseData = {
            restored: restoredProducts,
            not_restored: notRestoredProducts,
            summary: {
                total_requested: ids.length,
                restored_count: restoredProducts.length,
                not_restored_count: notRestoredProducts.length,
            },
        };

        const statusCode = restoredProducts.length > 0 ? 200 : 400;
        const message = restoredProducts.length === ids.length
            ? 'All products restored successfully'
            : restoredProducts.length > 0
                ? 'Some products restored successfully'
                : 'No products were restored';

        return successResponse(res, responseData, message, statusCode);
    } catch (error) {
        logger.error('Bulk restore products error:', error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.uploadImage = async (req, res) => {
    console.log('Uploading image', req.files)
    const transaction = await Product.sequelize.transaction();
    try {
        const { files } = req;
        const { product_id } = req.body; // Get product ID from request body

        // Validate if files are present
        if (!files || files.length === 0) {
            return errorResponse(res, { message: "No files uploaded" }, "No file uploaded", 400);
        }

        // Validate if product_id is provided and exists
        if (!product_id) {
            return errorResponse(res, { message: "Product ID is required" }, "Missing product ID", 400);
        }

        const product = await Product.findByPk(product_id);
        if (!product) {
            return errorResponse(res, { message: "Product not found" }, "Product not found", 404);
        }

        // Check if the product has a primary image
        const existingPrimaryImage = await ProductImage.findOne({
            where: { product_id, is_primary: true }
        });

        // Upload files to AWS S3 and generate resized versions
        const uploadedImages = await Promise.all(
            files.map(async (image) => {
                const { originalname, mimetype, buffer } = image;
                const { getUniqueFileNameWithPrefix } = require("../../../../library/s3/s3Helper");
                const fileName = await getUniqueFileNameWithPrefix(originalname, 'products', product_id);
                const s3Key = `products/${product_id}/${fileName}`;
                
                // Resize original image to max 1920x1080 if larger
                let processedBuffer = buffer;
                try {
                    processedBuffer = await resizeToMaxSize(buffer, mimetype);
                    if (processedBuffer !== buffer) {
                        console.log(`📐 Original image resized to max 1920x1080: ${originalname}`);
                    }
                } catch (resizeError) {
                    console.error(`⚠️ Error resizing original image, using original: ${resizeError.message}`);
                    // Continue with original buffer if resize fails
                }
                
                // Upload original image (now max 1920x1080)
                const params = {
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: s3Key,
                    Body: processedBuffer,
                    ContentType: mimetype
                };

                const originalUpload = await uploadFiletToS3(params);
                
                // Generate resized versions using the processed buffer
                console.log(`🖼️ Generating resized versions for: ${originalname}`);
                console.log(`📊 Environment check - AWS_S3_BUCKET: ${process.env.AWS_S3_BUCKET}`);
                
                let resizedResults = {};
                try {
                    resizedResults = await processProductImageInMultipleSizes(
                        processedBuffer,  // Use processed buffer instead of original
                        originalname, 
                        product_id, 
                        mimetype, 
                        s3Key
                    );
                    
                    console.log(`📊 Resize results:`, Object.keys(resizedResults).map(size => 
                        `${size}: ${resizedResults[size] ? 'Success' : 'Failed'}`
                    ).join(', '));
                } catch (resizeError) {
                    console.error(`❌ Resize error for ${originalname}:`, resizeError.message);
                    // Continue with original upload even if resize fails
                    resizedResults = {
                        thumb: null,
                        low: null,
                        mid: null,
                        high: null,
                        normal: null
                    };
                }
                
                return {
                    ...originalUpload,
                    resizedResults,
                    originalS3Key: s3Key
                };
            })
        );

                // Save uploaded images in ProductImage table with resized URLs
                // Support both single alt_text (for all images) or array of alt_texts (one per image)
                const altTexts = Array.isArray(req.body.alt_texts) 
                    ? req.body.alt_texts 
                    : req.body.alt_text 
                        ? [req.body.alt_text] 
                        : [];
                
                const imageRecords = uploadedImages.map(({ Location, Key, resizedResults }, index) => ({
                    product_id,
                    image_url: Location,
                    image_url_low: resizedResults.low?.url || null,
                    image_url_mid: resizedResults.mid?.url || null,
                    image_url_high: resizedResults.high?.url || null,
                    alt_text: altTexts[index] || null,
                    is_primary: existingPrimaryImage ? false : index === 0,
                    updated_by: req.user.id
                }));

        const createdImages = await ProductImage.bulkCreate(imageRecords, { transaction });

        await transaction.commit();

                // Fetch the created images to get their IDs and resized URLs
                const savedImages = await ProductImage.findAll({
                    where: {
                        product_id,
                        image_url: {
                            [Op.in]: uploadedImages.map(img => img.Location)
                        }
                    },
                    attributes: [
                        'id', 
                        'image_url', 
                        'image_url_low',
                        'image_url_mid',
                        'image_url_high',
                        'is_primary',
                        'alt_text'
                    ]
                });

        // Create a map of image URLs to their IDs
        const imageUrlToIdMap = {};
        savedImages.forEach(img => {
            imageUrlToIdMap[img.image_url] = img.id;
        });

                // Format images for API response using database fields
                const formattedImages = savedImages.map(savedImage => {
                    return {
                        id: savedImage.id,
                        is_primary: savedImage.is_primary,
                        urls: {
                            original: savedImage.image_url,
                            low: savedImage.image_url_low,
                            mid: savedImage.image_url_mid,
                            high: savedImage.image_url_high
                        },
                        // Legacy support
                        image_url: savedImage.image_url
                    };
                });

        return successResponse(res, {
            message: "Images uploaded and resized successfully",
            images: formattedImages
        });

    } catch (error) {
        await transaction.rollback();
        logger.error(error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.deleteProductImage = async (req, res) => {
    const transaction = await ProductImage.sequelize.transaction();
    try {
        const { product_id, image_id } = req.params; // Get IDs from request parameters

        // Validate if the product exists
        const product = await Product.findByPk(product_id);
        if (!product) {
            return errorResponse(res, { message: "Product not found" }, "Product not found", 404);
        }

        // Find all images associated with the product
        const productImages = await ProductImage.findAll({
            where: { product_id },
            order: [['is_primary', 'DESC']], // Ensure primary image is prioritized
            transaction
        });

        if (!productImages || productImages.length < 2) {
            return errorResponse(res, { message: "At least two images are required to delete one" }, "Deletion not allowed", 400);
        }

        // Find the image to be deleted
        const productImage = productImages.find(img => img.id === parseInt(image_id));

        if (!productImage) {
            return errorResponse(res, { message: "Product image not found" }, "Image not found", 404);
        }

        // Helper function to extract S3 key from URL
        const extractS3Key = (imageUrl) => {
            if (!imageUrl) return null;
            
            try {
                let s3Key;
                
                // Extract S3 key based on URL format
                if (imageUrl.includes('.amazonaws.com/')) {
                    // S3 direct URL format: https://bucket.s3.region.amazonaws.com/folder/filename
                    s3Key = imageUrl.split('.amazonaws.com/')[1];
                } else if (imageUrl.includes('cloudfront') || imageUrl.includes('cf-')) {
                    // CloudFront URL format: https://d1234567890.cloudfront.net/folder/filename
                    const urlParts = imageUrl.split('/');
                    s3Key = urlParts.slice(3).join('/'); // Remove domain parts
                } else if (imageUrl.includes('.com/')) {
                    // Fallback: try splitting on .com/
                    s3Key = imageUrl.split('.com/')[1];
                } else {
                    // Last resort: assume last two parts are folder/filename
                    const urlParts = imageUrl.split('/');
                    s3Key = urlParts.slice(-2).join('/');
                }
                
                // Remove query parameters if any
                if (s3Key) {
                    s3Key = s3Key.split('?')[0];
                }
                
                return s3Key;
            } catch (error) {
                logger.error(`Error extracting S3 key from URL: ${imageUrl}`, error);
                return null;
            }
        };

        // Extract the S3 key from the image URL
        const imageKey = extractS3Key(productImage.image_url);
        
        if (!imageKey) {
            logger.warn(`Could not extract S3 key from image URL: ${productImage.image_url}`);
            // Continue with database deletion even if S3 key extraction fails
        } else {
            // Delete the original image from AWS S3
            try {
                await deleteFile(imageKey);
                logger.info(`✅ Deleted original image from S3: ${imageKey}`);
            } catch (s3Error) {
                logger.error(`Error deleting image from S3: ${imageKey}`, s3Error);
                // Continue with database deletion even if S3 deletion fails
            }
        }
        
        // Delete resized versions if they exist
        const resizedUrls = [
            productImage.image_url_low,
            productImage.image_url_mid,
            productImage.image_url_high
        ].filter(url => url);
        
        if (resizedUrls.length > 0) {
            const deletePromises = resizedUrls.map(async (url) => {
                const resizedKey = extractS3Key(url);
                if (resizedKey) {
                    try {
                        await deleteFile(resizedKey);
                        logger.info(`✅ Deleted resized image from S3: ${resizedKey}`);
                    } catch (s3Error) {
                        logger.error(`Error deleting resized image from S3: ${resizedKey}`, s3Error);
                        // Continue even if individual resized image deletion fails
                    }
                }
            });
            
            await Promise.all(deletePromises);
            console.log(`✅ Deleted ${resizedUrls.length} resized versions`);
        }

        // Remove the image record from the database
        await productImage.destroy({ transaction });

        // If the deleted image was the primary image, assign a new primary image
        if (productImage.is_primary) {
            const newPrimaryImage = productImages.find(img => img.id !== parseInt(image_id));
            if (newPrimaryImage) {
                await newPrimaryImage.update({ is_primary: true }, { transaction });
                logger.info(`New primary image set: ${newPrimaryImage.id} for Product ${product_id}`);
            }
        }

        // Commit the transaction
        await transaction.commit();

        logger.info(`Product image ${image_id} for Product ${product_id} deleted successfully`);

        return successResponse(res, { message: "Product image deleted successfully" });
    } catch (error) {
        await transaction.rollback();
        logger.error(error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.switchPrimaryImage = async (req, res) => {
    const transaction = await ProductImage.sequelize.transaction();
    try {
        const { product_id, image_id } = req.params; // Get IDs from request parameters

        // Validate if the product exists
        const product = await Product.findByPk(product_id);
        if (!product) {
            return errorResponse(res, { message: "Product not found" }, "Product not found", 404);
        }

        // Find the image to be set as primary
        const newPrimaryImage = await ProductImage.findOne({
            where: { id: image_id, product_id },
            transaction
        });

        if (!newPrimaryImage) {
            return errorResponse(res, { message: "Product image not found" }, "Image not found", 404);
        }

        // Find the current primary image
        const currentPrimaryImage = await ProductImage.findOne({
            where: { product_id, is_primary: true },
            transaction
        });

        // If the selected image is already primary, return success
        if (currentPrimaryImage && currentPrimaryImage.id === newPrimaryImage.id) {
            return successResponse(res, { message: "Image is already the primary image" });
        }

        // Remove primary status from the current primary image (if exists)
        if (currentPrimaryImage) {
            await currentPrimaryImage.update({ is_primary: false }, { transaction });
        }

        // Set the new image as primary
        await newPrimaryImage.update({ is_primary: true }, { transaction });

        // Commit transaction
        await transaction.commit();

        logger.info(`Primary image switched to ${image_id} for Product ${product_id}`);

        return successResponse(res, { message: "Primary image switched successfully" });

    } catch (error) {
        await transaction.rollback();
        logger.error(error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.updateProductImageAltText = async (req, res) => {
    const transaction = await ProductImage.sequelize.transaction();
    try {
        const { product_id, image_id } = req.params;
        const { alt_text } = req.body;

        // Validate if the product exists
        const product = await Product.findByPk(product_id);
        if (!product) {
            await transaction.rollback();
            return errorResponse(res, { message: "Product not found" }, "Product not found", 404);
        }

        // Find the image to update
        const productImage = await ProductImage.findOne({
            where: { id: image_id, product_id },
            transaction
        });

        if (!productImage) {
            await transaction.rollback();
            return errorResponse(res, { message: "Product image not found" }, "Image not found", 404);
        }

        // Update alt_text (can be null to clear it)
        const updatedAltText = alt_text !== undefined ? (alt_text?.trim() || null) : productImage.alt_text;
        
        await productImage.update({ 
            alt_text: updatedAltText,
            updated_by: req.user.id 
        }, { transaction });

        // Commit transaction
        await transaction.commit();

        // Fetch updated image with all details
        const updatedImage = await ProductImage.findByPk(image_id, {
            attributes: [
                'id',
                'product_id',
                'image_url',
                'image_url_low',
                'image_url_mid',
                'image_url_high',
                'alt_text',
                'is_primary',
                'updated_by',
                'createdAt',
                'updatedAt'
            ]
        });

        logger.info(`Alt text updated for image ${image_id} of Product ${product_id}`);

        return successResponse(res, {
            message: "Product image alt text updated successfully",
            data: updatedImage
        });

    } catch (error) {
        // Only rollback if transaction hasn't been committed
        if (!transaction.finished) {
            await transaction.rollback();
        }
        logger.error('Update Product Image Alt Text Error:', error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.getPriceRanges = async (req, res, next) => {
    try {
        // Fetch distinct price ranges from the ProductVariants table
        const priceRanges = await ProductVariant.findAll({
            attributes: [
                [Sequelize.fn('MIN', Sequelize.col('price')), 'minPrice'],
                [Sequelize.fn('MAX', Sequelize.col('price')), 'maxPrice']
            ],
            group: ['product_id'] // Group by product_id to get ranges for each product
        });

        // Transform the result into a more usable format
        const ranges = priceRanges.map(range => ({
            min: range.get('minPrice'),
            max: range.get('maxPrice')
        }));

        return successResponse(res, ranges, 'Price ranges retrieved successfully');
    } catch (error) {
        logger.error(error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Bulk updates products from an Excel file.
 * If product ID exists, update that product; if not, create a new one.
 */
module.exports.bulkUpdateProducts = async (req, res, next) => {
    try {
        const { file } = req;
        const { id: updated_by } = req.user;

        if (!file) {
            return errorResponse(res, { message: "No file uploaded" }, "No file uploaded", 400);
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(file.buffer);

        // Process main products sheet
        const productSheet = workbook.worksheets[0];
        const attributeSheet = workbook.worksheets[1]; // Second sheet for attributes

        let results = {
            products: [],
            attributes: []
        };
        
        // First, process all products
        if (productSheet) {
            const headerRow = productSheet.getRow(1).values;
            const isFirstHeaderEmpty = !headerRow[0] || headerRow[0] !== 'ID';
            const rows = productSheet.getRows(2, productSheet.rowCount - 1) || [];

            // Process each product row
            for (const row of rows) {
                if (!row.values || row.values.length === 0) continue;

                const rowValues = isFirstHeaderEmpty ? row.values.slice(1) : row.values;
                const [
                    id,
                    name,
                    slug,
                    description,
                    brand_slugs,
                    category_slugs
                ] = rowValues;

                // Skip if required fields are missing
                if (!name || !slug) {
                    results.products.push({
                        id: id || 'N/A',
                        slug: slug || 'Missing slug',
                        status: 'Skipped',
                        message: 'Missing required fields (name or slug)'
                    });
                    continue;
                }

                await processProductRow({
                    id, name, slug, description, 
                    brand_slugs, category_slugs, updated_by, 
                    results
                });
            }
        }

        // Then, process all attributes after products are created/updated
        if (attributeSheet) {
            const attrHeaderRow = attributeSheet.getRow(1).values;
            const isFirstAttrHeaderEmpty = !attrHeaderRow[0] || attrHeaderRow[0] !== 'Product Slug';
            const attrRows = attributeSheet.getRows(2, attributeSheet.rowCount - 1) || [];

            // Process each attribute row
            for (const row of attrRows) {
                if (!row.values || row.values.length === 0) continue;

                const rowValues = isFirstAttrHeaderEmpty ? row.values.slice(1) : row.values;
                const [
                    product_slug,
                    attribute_slug,
                    term_slugs,
                    is_visible_page,
                    used_in_variation
                ] = rowValues;

                // Skip if required fields are missing
                if (!product_slug || !attribute_slug || !term_slugs) {
                    results.attributes.push({
                        product_slug: product_slug || 'N/A',
                        attribute_slug: attribute_slug || 'N/A',
                        status: 'Skipped',
                        message: 'Missing required fields'
                    });
                    continue;
                }

                await processAttributeRow({
                    product_slug,
                    attribute_slug,
                    term_slugs,
                    is_visible_page,
                    used_in_variation,
                    updated_by,
                    results
                });
            }
        }

        // Sort results
        results.products.sort(sortByStatus);
        results.attributes.sort(sortByStatus);

        // Generate summary
        const summary = {
            products: generateSummary(results.products),
            attributes: generateSummary(results.attributes)
        };

        return successResponse(res, {
            summary,
            results
        }, "Products and attributes processed successfully");

    } catch (error) {
        logger.error('Error during bulk update:', error);
        return errorResponse(res, error, "Error processing products and attributes");
    }
};

// Helper function to process a product row
const processProductRow = async ({ id, name, slug, description, brand_slugs, category_slugs, updated_by, results }) => {
    try {
        // Find brands if brand_slugs exists
        let brands = [];
        if (brand_slugs) {
            const brandSlugsArray = brand_slugs.split(',').map(slug => slug.trim()).filter(slug => slug);
            if (brandSlugsArray.length > 0) {
                brands = await Brand.findAll({ 
                    where: { slug: { [Op.in]: brandSlugsArray } } 
                });
                
                if (brands.length !== brandSlugsArray.length) {
                    const foundSlugs = brands.map(brand => brand.slug);
                    const missingSlugs = brandSlugsArray.filter(slug => !foundSlugs.includes(slug));
                    throw new Error(`Some brands not found: ${missingSlugs.join(', ')}`);
                }
            }
        }

        // Find categories if category_slugs exists
        let categories = [];
        if (category_slugs) {
            const categorySlugsArray = category_slugs.split(',').map(slug => slug.trim()).filter(slug => slug);
            if (categorySlugsArray.length > 0) {
                categories = await Category.findAll({ 
                    where: { slug: { [Op.in]: categorySlugsArray } } 
                });
                
                if (categories.length !== categorySlugsArray.length) {
                    const foundSlugs = categories.map(category => category.slug);
                    const missingSlugs = categorySlugsArray.filter(slug => !foundSlugs.includes(slug));
                    throw new Error(`Some categories not found: ${missingSlugs.join(', ')}`);
                }
            }
        }

        const productData = {
            name: typeof name === 'string' ? name.trim() : name,
            slug: typeof slug === 'string' ? slug.trim() : slug,
            description: typeof description === 'string' ? description.trim() : description,
            updated_by
        };

        let product;
        let action;

        if (id) {
            product = await Product.findByPk(id);
            if (product) {
                if (product.slug !== productData.slug) {
                    const existingProductWithSlug = await Product.findOne({
                        where: { 
                            slug: productData.slug,
                            id: { [Op.ne]: id }
                        }
                    });
                    if (existingProductWithSlug) {
                        throw new Error(`Duplicate slug: ${productData.slug} already exists`);
                    }
                }
                await product.update(productData);
                action = 'Updated';
            } else {
                throw new Error(`Product with ID ${id} not found`);
            }
        } else {
            const existingProduct = await Product.findOne({
                where: { slug: productData.slug }
            });
            if (existingProduct) {
                throw new Error(`Duplicate slug: ${productData.slug} already exists`);
            }
            product = await Product.create(productData);
            action = 'Created';
        }

        // Update category associations
        if (categories.length > 0) {
            // Remove existing category associations
            await ProductCategory.destroy({
                where: { product_id: product.id }
            });

            // Create new category associations
            const categoryData = categories.map((category, index) => ({
                product_id: product.id,
                category_id: category.id,
                is_primary: index === 0 // First category is primary
            }));
            
            await ProductCategory.bulkCreate(categoryData);
        }

        // Update brand associations
        if (brands.length > 0) {
            // Remove existing brand associations
            await ProductBrand.destroy({
                where: { product_id: product.id }
            });

            // Create new brand associations
            const brandData = brands.map((brand, index) => ({
                product_id: product.id,
                brand_id: brand.id,
                is_primary: index === 0 // First brand is primary
            }));
            
            await ProductBrand.bulkCreate(brandData);
        }

        // Create or update slug relation
        await slugManager.createOrUpdateSlug(product.slug, 'product', product.id);

        results.products.push({
            id: product.id,
            slug: product.slug,
            status: action,
            message: `Product successfully ${action.toLowerCase()}`
        });

    } catch (error) {
        results.products.push({
            id: id || 'N/A',
            slug: slug || 'Unknown',
            status: 'Error',
            message: error.message
        });
        logger.error(`Error processing product ${id ? `with ID ${id}` : `with slug ${slug}`}:`, error);
    }
};

// Helper function to process an attribute row
const processAttributeRow = async ({ product_slug, attribute_slug, term_slugs, is_visible_page, used_in_variation, updated_by, results }) => {
    try {
        // Find the product
        const product = await Product.findOne({ where: { slug: product_slug } });
        if (!product) throw new Error(`Product with slug ${product_slug} not found`);

        // Find the attribute
        const attribute = await Attribute.findOne({ where: { slug: attribute_slug } });
        if (!attribute) throw new Error(`Attribute with slug ${attribute_slug} not found`);

        // Process terms
        const termSlugsArray = term_slugs.split(',').map(slug => slug.trim());
        
        // Find all terms
        const terms = await AttributeTerm.findAll({
            where: {
                slug: { [Op.in]: termSlugsArray },
                attribute_id: attribute.id
            }
        });

        if (terms.length !== termSlugsArray.length) {
            const foundSlugs = terms.map(term => term.slug);
            const missingSlugs = termSlugsArray.filter(slug => !foundSlugs.includes(slug));
            throw new Error(`Some terms not found: ${missingSlugs.join(', ')}`);
        }

        // Process each term
        for (const term of terms) {
            // Use findOrCreate to handle existing records
            const [attributeTerm, created] = await ProductAttributeTerm.findOrCreate({
                where: {
                    product_id: product.id,
                    attribute_id: attribute.id,
                    term_id: term.id
                },
                defaults: {
                    is_visible_page: is_visible_page === 'true' || is_visible_page === true,
                    used_in_variation: used_in_variation === 'true' || used_in_variation === true,
                    updated_by
                }
            });

            // If the record already existed, update its properties
            if (!created) {
                await attributeTerm.update({
                    is_visible_page: is_visible_page === 'true' || is_visible_page === true,
                    used_in_variation: used_in_variation === 'true' || used_in_variation === true,
                    updated_by
                });
            }
        }

        results.attributes.push({
            product_slug,
            attribute_slug,
            status: 'Updated',
            message: `Attribute terms successfully updated`
        });

    } catch (error) {
        results.attributes.push({
            product_slug: product_slug || 'N/A',
            attribute_slug: attribute_slug || 'N/A',
            status: 'Error',
            message: error.message
        });
        logger.error(`Error processing attribute for product ${product_slug}:`, error);
    }
};

// Helper function to sort results by status
const sortByStatus = (a, b) => {
    const statusOrder = {
        'Created': 1,
        'Updated': 2,
        'Error': 3,
        'Skipped': 4
    };
    return statusOrder[a.status] - statusOrder[b.status];
};

// Helper function to generate summary
const generateSummary = (results) => ({
    total: results.length,
    created: results.filter(r => r.status === 'Created').length,
    updated: results.filter(r => r.status === 'Updated').length,
    errors: results.filter(r => r.status === 'Error').length,
    skipped: results.filter(r => r.status === 'Skipped').length,
});

/**
 * Generates and downloads a sample Excel file for products.
 */
module.exports.downloadSampleExcel = async (req, res, next) => {
    try {
        const workbook = new ExcelJS.Workbook();

        // Products Sheet
        const productSheet = workbook.addWorksheet('Products');
        productSheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Name', key: 'name', width: 30 },
            { header: 'Slug', key: 'slug', width: 30 },
            { header: 'Description', key: 'description', width: 50 },
            { header: 'Brand Slugs (comma-separated)', key: 'brand_slugs', width: 30 },
            { header: 'Category Slugs (comma-separated)', key: 'category_slugs', width: 30 }
        ];

        // Add sample product data
        productSheet.addRow({
            id: '', // Empty for new product
            name: 'Sample Product',
            slug: 'sample-product',
            description: 'This is a sample product description',
            brand_slugs: 'sample-brand,premium-brand',
            category_slugs: 'sample-category,featured-category'
        });

        productSheet.addRow({
            id: '1', // For updating existing product
            name: 'Existing Product',
            slug: 'existing-product',
            description: 'This is an existing product',
            brand_slugs: 'existing-brand',
            category_slugs: 'existing-category,popular-category'
        });

        // Attributes Sheet
        const attributeSheet = workbook.addWorksheet('Product Attributes');
        attributeSheet.columns = [
            { header: 'Product Slug', key: 'product_slug', width: 30 },
            { header: 'Attribute Slug', key: 'attribute_slug', width: 30 },
            { header: 'Term Slugs (comma-separated)', key: 'term_slugs', width: 40 },
            { header: 'Is Visible on Page', key: 'is_visible_page', width: 20 },
            { header: 'Used in Variation', key: 'used_in_variation', width: 20 }
        ];

        // Add sample attribute data
        attributeSheet.addRow({
            product_slug: 'sample-product',
            attribute_slug: 'color',
            term_slugs: 'red,blue,green',
            is_visible_page: true,
            used_in_variation: true
        });

        attributeSheet.addRow({
            product_slug: 'existing-product',
            attribute_slug: 'size',
            term_slugs: 'small,medium,large',
            is_visible_page: true,
            used_in_variation: false
        });

        // Add notes
        productSheet.addRow({});
        productSheet.addRow(['NOTE:', 'Leave ID empty for new products. Fill ID for updating existing products.']);
        productSheet.addRow(['NOTE:', 'Multiple brands and categories should be comma-separated (e.g., "brand1,brand2").']);
        attributeSheet.addRow({});
        attributeSheet.addRow(['NOTE:', 'Multiple terms should be comma-separated. Product slug must match a product in the Products sheet.']);

        // Set response headers
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=SampleProductsWithAttributes.xlsx');

        // Write workbook to response
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        logger.error('Error generating sample Excel:', error);
        return errorResponse(res, error, "Error generating sample Excel file");
    }
};

/**
 * Updates the status of a product
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
module.exports.updateProductStatus = async (req, res, next) => {
    const transaction = await Product.sequelize.transaction();
    try {
        const { productId, status } = req.body;
        const { id: updated_by } = req.user;

        // Find the product
        const product = await Product.findByPk(productId, { transaction });
        if (!product) {
            await transaction.rollback();
            return errorResponse(res, { message: "Product not found" }, "Product not found", 404);
        }

        // Update the product status
        await product.update({ 
            status,
            updated_by
        }, { transaction });

        // Check if SEO metadata exists (within transaction)
        const existingSeoMeta = await SeoMeta.findOne({
            where: {
                entityType: 'product',
                entityId: productId
            },
            transaction
        });

        let seoMetaExists = !!existingSeoMeta;

        // Create SEO metadata if it doesn't exist (similar to updateProduct)
        if (!seoMetaExists) {
            const seoSlugSource = product.slug;
            
            // Only create SEO metadata if we have a valid slug
            if (seoSlugSource && seoSlugSource.trim()) {
                try {
                    const normalizedSlug = slugManager.normalizeSlug(seoSlugSource);
                    
                    if (!normalizedSlug) {
                        logger.warn('Skipping SEO metadata creation - invalid slug after normalization:', {
                            productId: productId,
                            slug: seoSlugSource
                        });
                    } else {
                        // Check if slug is already taken BEFORE attempting to create (prevents unique constraint violation)
                        const existingSlugSeo = await SeoMeta.findOne({
                            where: {
                                slug: normalizedSlug,
                                [Op.or]: [
                                    { entityType: { [Op.ne]: 'product' } },
                                    { entityId: { [Op.ne]: productId } }
                                ]
                            },
                            transaction
                        });

                        if (existingSlugSeo) {
                            logger.warn('Skipping SEO metadata creation - slug already exists for another entity:', {
                                productId: productId,
                                slug: normalizedSlug,
                                existingEntity: {
                                    type: existingSlugSeo.entityType,
                                    id: existingSlugSeo.entityId
                                }
                            });
                        } else {
                            // Slug is available - safe to create
                            await ensureProductSeoMeta({
                                productId: productId,
                                productName: product.name,
                                productDescription: product.description,
                                productStatus: status,
                                slug: seoSlugSource,
                                transaction
                            });
                            seoMetaExists = true;
                        }
                    }
                } catch (seoError) {
                    // Log error but don't fail the product status update
                    logger.warn('Error creating SEO metadata during product status update:', {
                        error: seoError.message,
                        productId: productId,
                        slug: seoSlugSource
                    });
                    // Continue without SEO metadata - it can be created later when slug is available
                }
            } else {
                // Log warning but don't fail - SEO can be created later when slug is set
                logger.warn('Skipping SEO metadata creation - product has no slug:', {
                    productId: productId
                });
            }
        }

        const shouldUpdateSeoNoIndex = seoMetaExists;

        // Get category and brand IDs for SEO updates (within transaction)
        const productCategories = await ProductCategory.findAll({
            where: { product_id: productId },
            include: [{ model: Category, as: 'Category' }],
            transaction
        });

        const productBrands = await ProductBrand.findAll({
            where: { product_id: productId },
            include: [{ model: Brand, as: 'Brand' }],
            transaction
        });

        // Store category and brand IDs for SEO updates after transaction
        const categoryIdsForSeo = productCategories
            .filter(pc => pc.Category)
            .map(pc => pc.Category.id);
        
        const brandIdsForSeo = productBrands
            .filter(pb => pb.Brand)
            .map(pb => pb.Brand.id);

        if (status !== 'published') {
            await removeProductMenus(productId, transaction);
            await transaction.commit();

            // Update SEO AFTER transaction commit (non-blocking)
            if (shouldUpdateSeoNoIndex) {
                SeoService.updateProductNoIndex(productId, status).catch(seoError => {
                    logger.warn('Error updating SEO noIndex during product status update:', {
                        error: seoError.message,
                        productId: productId,
                        status: status
                    });
                });
            }

            // Update category and brand SEO (non-blocking)
            categoryIdsForSeo.forEach(categoryId => {
                SeoService.updateCategoryNoIndex(categoryId).catch(seoError => {
                    logger.warn('Error updating category SEO noIndex:', {
                        error: seoError.message,
                        categoryId: categoryId
                    });
                });
            });

            brandIdsForSeo.forEach(brandId => {
                SeoService.updateBrandNoIndex(brandId).catch(seoError => {
                    logger.warn('Error updating brand SEO noIndex:', {
                        error: seoError.message,
                        brandId: brandId
                    });
                });
            });

            return successResponse(
                res,
                {
                    product: {
                        id: product.id,
                        name: product.name,
                        status
                    }
                },
                "Product status updated successfully",
                200,
                { isOnMenu: false }
            );
        }

        const categoryIds = productCategories
            .map(item => item?.Category?.id)
            .filter(Boolean);

        const brandIds = productBrands
            .map(item => item?.Brand?.id)
            .filter(Boolean);

        const [categoryMenus, brandMenus] = await Promise.all([
            categoryIds.length
                ? Menu.findAll({
                    where: {
                        entity_type: 'category',
                        entity_id: { [Op.in]: categoryIds }
                    },
                    transaction
                })
                : [],
            brandIds.length
                ? Menu.findAll({
                    where: {
                        entity_type: 'brand',
                        entity_id: { [Op.in]: brandIds }
                    },
                    transaction
                })
                : []
        ]);

        const categoryAssociations = buildMenuAssociationPayload(
            productCategories,
            'Category',
            categoryMenus
        );
        const brandAssociations = buildMenuAssociationPayload(
            productBrands,
            'Brand',
            brandMenus
        );

        const filteredCategoryAssociations = categoryAssociations.filter(
            item => item.isOnMenu || item.hasListOnActiveProduct
        );
        const filteredBrandAssociations = brandAssociations.filter(
            item => item.isOnMenu || item.hasListOnActiveProduct
        );

        const hasCategoryAssociation = filteredCategoryAssociations.length > 0;
        const hasBrandAssociation = filteredBrandAssociations.length > 0;

        const responsePayload = {
            product: {
                id: product.id,
                name: product.name,
                status
            },
            menuAssociations: {
                hasAssociation: hasCategoryAssociation || hasBrandAssociation,
                hasCategoryAssociation,
                hasBrandAssociation,
                categories: filteredCategoryAssociations,
                brands: filteredBrandAssociations
            }
        };

        await transaction.commit();

        // Update SEO AFTER transaction commit (non-blocking)
        if (shouldUpdateSeoNoIndex) {
            SeoService.updateProductNoIndex(productId, status).catch(seoError => {
                logger.warn('Error updating SEO noIndex during product status update:', {
                    error: seoError.message,
                    productId: productId,
                    status: status
                });
            });
        }

        // Update category and brand SEO (non-blocking)
        categoryIdsForSeo.forEach(categoryId => {
            SeoService.updateCategoryNoIndex(categoryId).catch(seoError => {
                logger.warn('Error updating category SEO noIndex:', {
                    error: seoError.message,
                    categoryId: categoryId
                });
            });
        });

        brandIdsForSeo.forEach(brandId => {
            SeoService.updateBrandNoIndex(brandId).catch(seoError => {
                logger.warn('Error updating brand SEO noIndex:', {
                    error: seoError.message,
                    brandId: brandId
                });
            });
        });

        return successResponse(
            res,
            responsePayload,
            "Product status updated successfully",
            200,
            { isOnMenu: responsePayload.menuAssociations.hasAssociation }
        );
    } catch (error) {
        console.log(error);
        await transaction.rollback();
        logger.error('Error updating product status:', error);
        return errorResponse(res, error, error.message);
    }
};


