const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Product, Category, Brand, Flavor, ProductImage, ProductFlavor, ProductAttributeTerm, Attribute, AttributeTerm, ProductVariant, ProductVariantImage, ProductVariantAttribute } = require("../../../models");;
const { Sequelize, Op } = require("sequelize");
const logger = require("../../../library/logger");
const { getTrendingProducts, generateUniqueFileName, fetchProducts } = require("../helper/product.helper");
const { uploadFiletToS3 } = require("../../../library/s3/s3Helper");

module.exports.listAllproducts = async (req, res, next) => {
    try {
        const { products, productAttributeTerms, pagination } = await fetchProducts(req.query)
        return successResponse(res, { products, productAttributeTerms, pagination }, 'Success');
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
                include: [
                    {
                        model: ProductVariantAttribute,
                        as: 'variantAttributes',
                        include: [
                            { model: Attribute, as: 'attribute', attributes: ['id', 'name', 'type'] },
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
                    { model: Attribute, as: 'attribute', attributes: ['id', 'name', 'type'] },
                    { model: AttributeTerm, as: 'term', attributes: ['id', 'name', 'slug'] }
                ]
            },
            {
                model: ProductImage,
                as: 'ProductImages'
            }
        ];
        const product = await Product.findOne({
            where: { id: req.params.id }, include: includeClause
        });
        if (!product) {
            throw {
                message: "Product not found",
                statusCode: 400,
            }
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
                        is_visible_page: pat.is_visible_page,
                        used_in_variation: pat.used_in_variation
                    },
                    terms: []
                });
            }
            attributeTermsMap.get(attribute.id).terms.push({
                id: pat.term.id,
                name: pat.term.name,
                slug: pat.term.slug,
                used_in_variation: pat.used_in_variation,
                is_visible_page: pat.is_visible_page
            });
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
            throw {
                statusCode: 400,
                message: 'Product already exists'
            }
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
            throw {
                statusCode: 404,
                message: 'Product not found'
            }
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
            throw {
                statusCode: 404,
                message: 'Product not found'
            }
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
            where: { slug: req.params.slug }, include: [
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
            throw {
                message: "Product not found",
                statusCode: 400,
            }
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