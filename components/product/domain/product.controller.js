const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Product, Category, Brand, Flavor, ProductImage, ProductFlavor, ProductAttributeTerm, Attribute, AttributeTerm, ProductVariant, ProductVariantImage, ProductVariantAttribute, Deal, DealProduct, ProductCategory, ProductBrand, LoyaltyPointsSettings } = require("../../../models");
const { Sequelize, Op } = require("sequelize");
const logger = require("../../../library/logger");
const { getTrendingProducts, generateUniqueFileName, fetchProducts, getMinPriceVariant } = require("../helper/product.helper");
const { uploadFiletToS3 } = require("../../../library/s3/s3Helper");
const { productStatus } = require("../../../config/constants");

module.exports.listAllproducts = async (req, res, next) => {
    try {
        req.query.source = 'product';
        const {additionalData, products, category_items, brand_items, attributes,allAttributes, price_ranges, pagination } = await fetchProducts({
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
            price_ranges, 
            pagination
        }, 'Success');
        
    } catch (error) {
        logger.error(error)
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
        console.log("product>", product);
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
        
        // Prepare the response
        const minPriceVariant = getMinPriceVariant(product);
        const response = {
            ...product.toJSON(),
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
        const product = await Product.findOne({
            where: { 
                slug: req.params.slug,
                status: productStatus.PUBLISHED
            }, 
            include: [
                { model: Category, as: 'Categories', through: { attributes: ['is_primary'] } },
                { model: Brand, as: 'Brands', through: { attributes: ['is_primary'] } },
                {
                    model: ProductAttributeTerm,
                    as: 'productAttributeTerms',
                    include: [
                        { model: Attribute, as: 'attribute', attributes: ['id', 'name', 'type'] },
                        { model: AttributeTerm, as: 'term', attributes: ['id', 'name', 'slug'] }
                    ]
                },
                { model: ProductImage, as: 'ProductImages' },
                {
                    model: Flavor, as: 'Flavors', through: {
                        model: ProductFlavor,
                    }
                },
                {   // for min price variant
                    model: ProductVariant,
                    as: 'variants',
                    where: { status: 'active' },
                    required: false,
                    include: [
                        {
                            model: ProductVariantImage,
                            as: 'variantImages',
                            attributes: ['id', 'variant_id', 'image_url', 'is_primary']
                        }
                    ]
                }
            ]
        });
        if (!product) {
            throw new Error('Product not found');
        }
        // **Transform the response** to group attribute terms
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

        // Get min price variant
        const minPriceVariant = getMinPriceVariant(product);

    //    Convert Map to array
       const attributeTerms = Array.from(attributeTermsMap.values());
       // **Modify the response**
       const response = {
           ...product.toJSON(),  // Convert Sequelize object to plain JSON
           price: minPriceVariant ? minPriceVariant.price : product.price,
           regular_price: minPriceVariant ? minPriceVariant.regular_price : product.regular_price,
           discount_price: minPriceVariant ? minPriceVariant.discount_price : product.discount_price,
           min_price_variant: minPriceVariant,
           attributeTerms
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
                {
                    model: Flavor,
                    as: 'Flavors',
                    through: { 
                        model: ProductFlavor,
                        attributes: [] // Exclude ProductFlavor table data from response
                    },
                    required: false,
                    attributes: ['id', 'name']
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
                {
                    model: Flavor,
                    as: 'Flavors',
                    through: { 
                        model: ProductFlavor,
                        attributes: [] // Exclude ProductFlavor table data from response
                    },
                    required: false,
                    attributes: ['id', 'name']
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
                'description', 
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
            const primaryImage = product.ProductImages && product.ProductImages.length > 0 
                ? product.ProductImages[0] 
                : null;

            return {
                id: product.id,
                name: product.name,
                slug: product.slug,
                description: product.description,
                price: product.price,
                discount_price: product.discount_price,
                stock_quantity: product.stock_quantity,
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
            ],
            attributes: [
                'id', 
                'name', 
                'slug', 
                'description', 
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
                description: product.description,
                price: product.price,
                discount_price: product.discount_price,
                stock_quantity: product.stock_quantity,
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

