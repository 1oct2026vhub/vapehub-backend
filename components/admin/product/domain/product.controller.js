const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Product, Category, Brand, ProductImage, Menu, ProductAttributeTerm, Attribute, AttributeTerm, ProductVariant, ProductVariantImage, ProductVariantAttribute, SlugRelation, ProductCategory, ProductBrand } = require("../../../../models");
const { Sequelize, Op } = require("sequelize");
const logger = require("../../../../library/logger");
const AWS = require("aws-sdk");
const { uploadFiletToS3, generateUniqueFileName } = require("../../../../library/s3/s3Helper");
const ExcelJS = require("exceljs");
const SlugManager = require("../../../../utils/slugManager");
const SeoService = require('../../seo/domain/seo.service');

const slugManager = new SlugManager(SlugRelation);

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
        const [product, categories, brands, images, attributeTerms, variants] = await Promise.all([
            // Main product query - minimal data first
            Product.findByPk(id, {
                paranoid: false,
                benchmark: false,
                logging: false,
                attributes: [
                    'id', 'updated_by', 'name', 'slug', 'description', 'price', 'discount_price', 
                    'stock_quantity', 'puff_count', 'is_new', 'battery_capacity', 
                    'coil_style', 'device_style', 'eliquid_capacity', 'pod_coil_style', 
                    'pod_fill_style', 'power_supply', 'nicotine_strength', 'nicotine_type', 
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
                    attributes: ['id', 'updated_by', 'product_id', 'image_url', 'is_primary', 'createdAt', 'updatedAt', 'deletedAt']
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
                        "purchase_price", "weight", "length", "width", "height", "description",
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
            }).then(result => result?.variants || [])
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
            name, slug, description, category_ids, brand_ids
        } = req.body;

        const { id: updated_by } = req.user;

        // Validate required fields
        if (!name || !slug) {
            await transaction.rollback();
            return errorResponse(
                res, 
                { message: "Name and slug are required" }, 
                "Missing required fields", 
                400
            );
        }

        // Clean the name and slug
        const cleanName = name.trim();
        const cleanSlug = slug.toLowerCase().trim();

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

        // Check for duplicate name (case-insensitive)
        const existingProductName = await Product.findOne({
            where: {
                name: {
                    [Op.like]: cleanName // Case-insensitive comparison
                }
            }
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

        // Create the product record
        const product = await Product.create(
            {
                name: cleanName,
                slug: cleanSlug,
                description,
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
        return errorResponse(res, error, error.message);
    }
};

module.exports.updateProduct = async (req, res, next) => {
    const transaction = await Product.sequelize.transaction();
    try {
        const { id } = req.params;
        const {
            name, slug, description, category_ids, brand_ids
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


        // Prepare update fields
        const updatedFields = {
            ...(cleanName && { name: cleanName }),
            ...(cleanSlug && { slug: cleanSlug }),
            ...(description && { description: description.trim() }),
            updated_by
        };

        // Update SEO metadata when slug changes
        if (cleanSlug && product.slug !== cleanSlug) {
            await SeoService.updateSeoSlug('product', id, cleanSlug);
        }

        // Update only if there are changes
        if (Object.keys(updatedFields).length > 0) {
            await product.update(updatedFields, { transaction });
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

        // Update slug if provided and changed
        if (cleanSlug) {
            await slugManager.createOrUpdateSlug(cleanSlug, 'product', id, transaction);
        }
        const menu = await Menu.findOne({ where: { entity_id: id} });
        if (menu) {
            await Menu.update({
                original: `/${slug?.trim()}`,

            }, { where: { entity_id: id } }, { transaction });
        }
        // Fetch the updated product with related models
        const updatedProduct = await Product.findByPk(id, {
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
            ]
        });

        // Update SEO noIndex based on product status
        await SeoService.updateProductNoIndex(id, updatedProduct.status);

        await transaction.commit();
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

module.exports.uploadImage = async (req, res) => {
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

        // Upload files to AWS S3
        const uploadedImages = await Promise.all(
            files.map(async (image) => {
                const { originalname, mimetype, buffer } = image;
                const fileName = generateUniqueFileName(originalname);
                const params = {
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: `products/${product_id}/${fileName}`,
                    Body: buffer,
                    ContentType: mimetype
                };

                return uploadFiletToS3(params);
            })
        );

        // Save uploaded images in ProductImage table
        const imageRecords = uploadedImages.map(({ Location, Key }, index) => ({
            product_id,
            image_url: Location,
            is_primary: existingPrimaryImage ? false : index === 0,
            updated_by: req.user.id
        }));

        const createdImages = await ProductImage.bulkCreate(imageRecords, { transaction });

        await transaction.commit();

        // Fetch the created images to get their IDs
        const savedImages = await ProductImage.findAll({
            where: {
                product_id,
                image_url: {
                    [Op.in]: uploadedImages.map(img => img.Location)
                }
            },
            attributes: ['id', 'image_url', 'is_primary']
        });

        // Create a map of image URLs to their IDs
        const imageUrlToIdMap = {};
        savedImages.forEach(img => {
            imageUrlToIdMap[img.image_url] = img.id;
        });

        return successResponse(res, {
            message: "Images uploaded and associated successfully",
            images: uploadedImages.map(({ Location, Key }) => ({
                id: imageUrlToIdMap[Location],
                url: Location,
                key: Key,
            }))
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

        // Extract the S3 key from the image URL
        const imageKey = productImage.image_url.split(".amazonaws.com/")[1];

        // Initialize S3 client
        const s3 = new AWS.S3();

        // Delete the image from AWS S3
        await s3.deleteObject({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: imageKey
        }).promise();

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

        // Update SEO noIndex based on product status
        await SeoService.updateProductNoIndex(productId, status);

        // Update category and brand SEO based on product status
        const productCategories = await ProductCategory.findAll({
            where: { product_id: productId },
            include: [{ model: Category, as: 'Category' }],
            transaction
        });

        for (const productCategory of productCategories) {
            if (productCategory.Category) {
                await SeoService.updateCategoryNoIndex(productCategory.Category.id);
            }
        }

        const productBrands = await ProductBrand.findAll({
            where: { product_id: productId },
            include: [{ model: Brand, as: 'Brand' }],
            transaction
        });

        for (const productBrand of productBrands) {
            if (productBrand.Brand) {
                await SeoService.updateBrandNoIndex(productBrand.Brand.id);
            }
        }

        await transaction.commit();
        return successResponse(res, { message: "Product status updated successfully" });
    } catch (error) {
        console.log(error);
        await transaction.rollback();
        logger.error('Error updating product status:', error);
        return errorResponse(res, error, error.message);
    }
};





