const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Product, Category, Brand, Flavor, ProductImage, ProductFlavor, ProductAttributeTerm, Attribute, AttributeTerm, ProductVariant, ProductVariantImage, ProductVariantAttribute } = require("../../../models");;
const { Sequelize, Op } = require("sequelize");
const logger = require("../../../library/logger");
const { getTrendingProducts, generateUniqueFileName, fetchProducts } = require("../helper/product.helper");
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
                as: 'Category'
            },
            {
                model: Brand,
                as: 'Brand'
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
        
        // Prepare the response
        const response = {
            ...product.toJSON(),
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
            }
        };

        successResponse(res, response, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

module.exports.createProduct = async (req, res, next) => {
    const transaction = await Product.sequelize.transaction();
    try {
        const { name, slug, description, price, discount_price, stock_quantity, puff_count, is_new, battery_capacity, coil_style, device_style, eliquid_capacity, pod_coil_style, pod_fill_style, power_supply, nicotine_strength, nicotine_type, vg_ratio, vaping_style, bottle_size, category_id, brand_id, flavour_ids, product_images } = req.body;
        const { id: updated_by } = req.user; // Authenticated user

        // find product by slug
        const existingProduct = await Product.findOne({ where: { slug } });
        if (existingProduct) {
            throw new Error('Product already exists');
        }

        // Create the product
        const product = await Product.create(
            { name, slug, description, price, discount_price, stock_quantity, puff_count, is_new, battery_capacity, coil_style, device_style, eliquid_capacity, pod_coil_style, pod_fill_style, power_supply, nicotine_strength, nicotine_type, vg_ratio, vaping_style, bottle_size, category_id, brand_id, updated_by },
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
        const { name, slug, description, price, discount_price, stock_quantity, puff_count, is_new, battery_capacity, coil_style, device_style, eliquid_capacity, pod_coil_style, pod_fill_style, power_supply, nicotine_strength, nicotine_type, vg_ratio, vaping_style, bottle_size, category_id, brand_id, flavour_ids, product_images } = req.body;
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
            ...(category_id && { category_id }),
            ...(brand_id && { brand_id }),
            ...(updated_by && { updated_by })
        };

        await product.update(updatedFields, { transaction });

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
        logger.error(error)
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
                { model: Category, as: 'Category' },
                { model: Brand, as: 'Brand' },
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


    //    Convert Map to array
       const attributeTerms = Array.from(attributeTermsMap.values());
       // **Modify the response**
       const response = {
           ...product.toJSON(),  // Convert Sequelize object to plain JSON
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

        // Find product with all necessary relations
        const product = await Product.findOne({
            where: { 
                id: product_id,
                status: productStatus.PUBLISHED
            },
            include: [
                {
                    model: Category,
                    as: 'Category',
                    attributes: ['id', 'name', 'slug']
                },
                {
                    model: Brand,
                    as: 'Brand',
                    attributes: ['id', 'name', 'slug']
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
        const variants = filteredVariants.map(variant => {
            // Get primary image or first image
            const primaryImage = variant.variantImages.find(img => img.is_primary) || variant.variantImages[0];
            
            return {
                id: variant.id,
                slug: variant.slug,
                price: variant.price,
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
                updated_at: variant.updated_at
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
                description: product.description,
                created_at: product.createdAt,
                updated_at: product.updatedAt,
                category: product.Category ? {
                    id: product.Category.id,
                    name: product.Category.name,
                    slug: product.Category.slug
                } : null,
                brand: product.Brand ? {
                    id: product.Brand.id,
                    name: product.Brand.name,
                    slug: product.Brand.slug
                } : null,
                primary_image: primaryProductImage ? {
                    id: primaryProductImage.id,
                    url: primaryProductImage.image_url,
                    is_primary: primaryProductImage.is_primary
                } : null,
                all_images: productImages,
                attribute_terms: Array.from(attributeTermsMap.values())
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