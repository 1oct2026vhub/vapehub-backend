const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Product, ProductAttributeTerm, Attribute, AttributeTerm, ProductVariant, ProductVariantImage, ProductVariantAttribute, Category, Brand } = require("../../../../models");
const { Sequelize, Op } = require("sequelize");
const logger = require("../../../../library/logger");
const AWS = require("aws-sdk");
const { uploadFiletToS3, generateUniqueFileName, deleteFile } = require("../../../../library/s3/s3Helper");

const ERROR_MESSAGES = {
    VARIANT_NOT_FOUND: "Variant not found",
    PRODUCT_NOT_FOUND: "Product not found",
    DUPLICATE_SLUG: (slug) => `Slug ${slug} already exists`,
    DUPLICATE_BARCODE: (barcode) => `Barcode ${barcode} already exists`,
    INVALID_DISCOUNT: "Discount price must be less than regular price",
    ATTRIBUTE_TERM_NOT_FOUND: "Attribute term not found",
    ATTRIBUTE_TERM_IN_USE: "Cannot remove attribute term as it is associated with existing product variants",
};

// Add attributes to a product
module.exports.addProductAttributes = async (req, res) => {
    const transaction = await Product.sequelize.transaction();
    try {
        const { product_id } = req.params;
        const { attributes } = req.body;
        const { id: updated_by } = req.user;

        // Check if product exists
        const product = await Product.findByPk(product_id);
        if (!product) {
            return errorResponse(res, { message: ERROR_MESSAGES.PRODUCT_NOT_FOUND }, ERROR_MESSAGES.PRODUCT_NOT_FOUND, 404);
        }

        // Add attributes and terms
        if (Array.isArray(attributes) && attributes.length > 0) {
            // First check for existing combinations
            const existingAttributes = await ProductAttributeTerm.findAll({
                where: {
                    product_id,
                    [Op.or]: attributes.map(attr => ({
                        [Op.and]: {
                            attribute_id: attr.attribute_id,
                            term_id: attr.term_id
                        }
                    }))
                }
            });

            // Filter out existing combinations
            const newAttributes = attributes.filter(attr => 
                !existingAttributes.some(existing => 
                    existing.attribute_id === attr.attribute_id && 
                    existing.term_id === attr.term_id
                )
            );

            if (newAttributes.length > 0) {
                const productAttributeTerms = newAttributes.map(attr => ({
                    product_id,
                    attribute_id: attr.attribute_id,
                    term_id: attr.term_id,
                    is_visible_page: attr.is_visible_page ?? true,
                    used_in_variation: attr.used_in_variation ?? false,
                    updated_by
                }));

                await ProductAttributeTerm.bulkCreate(productAttributeTerms, { 
                    transaction,
                    validate: true,
                    updateOnDuplicate: ['is_visible_page', 'used_in_variation', 'updated_by']
                });
            }
        }

        await transaction.commit();

        // Fetch updated product with attributes
        const updatedProduct = await Product.findByPk(product_id, {
            include: [{ 
                model: ProductAttributeTerm,
                as: "productAttributeTerms",
                include: [
                    { 
                        model: Attribute, 
                        as: "attribute" 
                    },
                    { 
                        model: AttributeTerm, 
                        as: "term" 
                    }
                ]
            }]
        });

        return successResponse(res, updatedProduct, "Product attributes added successfully");
    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        logger.error('Add Product Attributes Error:', error);
        
        // Handle unique constraint violation specifically
        if (error.name === 'SequelizeUniqueConstraintError') {
            return errorResponse(res, error, 'This attribute combination already exists for this product', 409);
        }
        
        return errorResponse(res, error, error.message);
    }
};

// Get product attributes that can be used for variants
module.exports.getVariantAttributes = async (req, res) => {
    try {
        const { product_id } = req.params;

        const variantAttributes = await ProductAttributeTerm.findAll({
            where: {
                product_id,
                used_in_variation: true
            },
            include: [
                { 
                    model: Attribute,
                    as: "attribute"
                },
                { 
                    model: AttributeTerm,
                    as: "term"
                }
            ]
        });

        return successResponse(res, variantAttributes, "Variant attributes retrieved successfully");
    } catch (error) {
        logger.error('Get Variant Attributes Error:', error);
        return errorResponse(res, error, error.message);
    }
};

// Update product attributes
module.exports.updateProductAttributes = async (req, res) => {
    const transaction = await Product.sequelize.transaction();
    try {
        const { product_id } = req.params;
        const { attributes } = req.body;
        const { id: updated_by } = req.user;

        // Check if product exists
        const product = await Product.findByPk(product_id);
        if (!product) {
            await transaction.rollback();
            return errorResponse(res, { message: ERROR_MESSAGES.PRODUCT_NOT_FOUND }, ERROR_MESSAGES.PRODUCT_NOT_FOUND, 404);
        }

        // Update existing attributes
        if (Array.isArray(attributes) && attributes.length > 0) {
            for (const attr of attributes) {
                await ProductAttributeTerm.upsert({
                    product_id,
                    attribute_id: attr.attribute_id,
                    term_id: attr.term_id,
                    is_visible_page: attr.is_visible_page ?? true,
                    used_in_variation: attr.used_in_variation ?? false,
                    updated_by
                }, { transaction });
            }
        }

        await transaction.commit();

        // Fetch updated product with attributes
        const updatedProduct = await Product.findByPk(product_id, {
            include: [{ 
                model: ProductAttributeTerm,
                as: "productAttributeTerms",
                include: [
                    { model: Attribute, as: "attribute" },
                    { model: AttributeTerm, as: "term" }
                ]
            }]
        });

        return successResponse(res, updatedProduct, "Product attributes updated successfully");
    } catch (error) {
        await transaction.rollback();
        logger.error('Update Product Attributes Error:', error);
        return errorResponse(res, error, error.message);
    }
};

// Helper functions (add these before the main function)
const validateVariantSlug = async (slug, transaction) => {
    const existingSlug = await ProductVariant.findOne({
        where: { slug },
        transaction
    });
    if (existingSlug) {
        throw new Error(ERROR_MESSAGES.DUPLICATE_SLUG(slug));
    }
};

const validateVariantBarcode = async (barcode, transaction) => {
    if (!barcode) return;
    const existingBarcode = await ProductVariant.findOne({
        where: { barcode },
        transaction
    });
    if (existingBarcode) {
        throw new Error(ERROR_MESSAGES.DUPLICATE_BARCODE(barcode));
    }
};

const validateVariantAttributes = async (attributes, product_id, transaction) => {
    if (!Array.isArray(attributes) || attributes.length === 0) {
        throw new Error("Each variant must have at least one attribute");
    }

    for (const attr of attributes) {
        const isValidAttribute = await ProductAttributeTerm.findOne({
            where: {
                product_id,
                attribute_id: attr.attribute_id,
                term_id: attr.term_id,
                used_in_variation: true
            },
            transaction
        });
        if (!isValidAttribute) {
            throw new Error("Invalid attribute combination for variant");
        }
    }
};

const createVariantRecord = async (variant, product_id, updated_by, transaction) => {
    if (variant.discount_price && variant.discount_price >= variant.price) {
        throw new Error(ERROR_MESSAGES.INVALID_DISCOUNT);
    }

    return await ProductVariant.create({
        product_id,
        slug: variant.slug,
        price: variant.price,
        discount_price: variant.discount_price || null,
        purchase_price: variant.purchase_price || null,
        weight: variant.weight || null,
        length: variant.length || null,
        width: variant.width || null,
        height: variant.height || null,
        description: variant.description || null,
        barcode: variant.barcode || null,
        stock: variant.stock || 0,
        low_stock_threshold: variant.low_stock_threshold || 5,
        stock_status: updateStockStatus(variant.stock || 0, variant.low_stock_threshold || 5),
        status: variant.status || 'active',
        updated_by
    }, { transaction });
};

// Refactored main function
module.exports.createProductVariants = async (req, res) => {
    const transaction = await Product.sequelize.transaction();
    try {
        const { product_id } = req.params;
        const { id: updated_by } = req.user;

        // Handle variants data whether it's a string or object
        let variantsData;
        console.log(req.body);
        try {
            variantsData = typeof req.body.variants === 'string' 
                ? JSON.parse(req.body.variants) 
                : req.body.variants || [];
        } catch (error) {
            return errorResponse(res, { message: "Invalid variants data format" }, "Invalid variants data format", 400);
        }

        // Ensure variantsData is an array
        if (!Array.isArray(variantsData)) {
            return errorResponse(res, { message: "Variants must be an array" }, "Invalid variants format", 400);
        }

        const product = await Product.findByPk(product_id);
        if (!product) {
            await transaction.rollback();
            return errorResponse(res, { message: ERROR_MESSAGES.PRODUCT_NOT_FOUND }, ERROR_MESSAGES.PRODUCT_NOT_FOUND, 404);
        }

        const hasVariationAttributes = await ProductAttributeTerm.findOne({
            where: { product_id, used_in_variation: true }
        });

        if (!hasVariationAttributes) {
            await transaction.rollback();
            return errorResponse(res, { message: "Product must have at least one attribute marked for variation" }, "No variation attributes", 400);
        }

        const createdVariants = [];
        for (const variant of variantsData) {
            try {
                await validateVariantSlug(variant.slug, transaction);
                await validateVariantBarcode(variant.barcode, transaction);
                await validateVariantAttributes(variant.attributes, product_id, transaction);

                const productVariant = await createVariantRecord(variant, product_id, updated_by, transaction);

                const variantAttributeTerms = variant.attributes.map(attr => ({
                    variant_id: productVariant.id,
                    attribute_id: attr.attribute_id,
                    term_id: attr.term_id,
                    updated_by
                }));
                
                await ProductVariantAttribute.bulkCreate(variantAttributeTerms, { 
                    transaction,
                    updateOnDuplicate: ['attribute_id', 'term_id', 'updated_by']
                });

                createdVariants.push(productVariant.id);
            } catch (error) {
                if (!transaction.finished) {
                    await transaction.rollback();
                }
                return errorResponse(res, { message: error.message }, error.message, 400);
            }
        }

        await transaction.commit();

        // Fetch the created variants without the problematic associations for now
        const newVariants = await ProductVariant.findAll({
            where: { id: createdVariants },
            include: [
                {
                    model: ProductVariantAttribute,
                    as: "variantAttributes",
                    include: [
                        { model: Attribute, as: "attribute" },
                        { model: AttributeTerm, as: "term" }
                    ]
                }
            ]
        });

        return successResponse(res, newVariants, "Product variants created successfully", 201);
    } catch (error) {
        if (!transaction.finished) {
            await transaction.rollback();
        }
        logger.error('Create Product Variants Error:', error);
        return errorResponse(res, error, error.message);
    }
};

// Helper functions
const validateVariantUpdate = async (variantId, transaction) => {
    const existingVariant = await ProductVariant.findByPk(variantId, { transaction });
    if (!existingVariant) {
        throw new Error(ERROR_MESSAGES.VARIANT_NOT_FOUND);
    }
    return existingVariant;
};

const validateUpdateData = async (variantData, existingVariant, variantId, transaction) => {
    // Check slug uniqueness
    if (variantData.slug && variantData.slug !== existingVariant.slug) {
        const existingSlug = await ProductVariant.findOne({
            where: { 
                slug: variantData.slug,
                id: { [Op.ne]: variantId }
            },
            transaction
        });
        if (existingSlug) {
            throw new Error(ERROR_MESSAGES.DUPLICATE_SLUG(variantData.slug));
        }
    }

    // Check barcode uniqueness
    if (variantData.barcode && variantData.barcode !== existingVariant.barcode) {
        const existingBarcode = await ProductVariant.findOne({
            where: { 
                barcode: variantData.barcode,
                id: { [Op.ne]: variantId }
            },
            transaction
        });
        if (existingBarcode) {
            throw new Error(ERROR_MESSAGES.DUPLICATE_BARCODE(variantData.barcode));
        }
    }

    // Validate prices
    const priceToCheck = variantData.price || existingVariant.price;
    if (variantData.discount_price !== undefined && variantData.discount_price >= priceToCheck) {
        throw new Error(ERROR_MESSAGES.INVALID_DISCOUNT);
    }
    if (variantData.purchase_price && variantData.purchase_price >= priceToCheck) {
        throw new Error("Purchase price must be less than selling price");
    }
};

const updateVariantAttributes = async (variantId, attributes, productId, updatedBy, transaction) => {
    if (!Array.isArray(attributes)) return;

    // Validate attributes
    for (const attr of attributes) {
        const isValidAttribute = await ProductAttributeTerm.findOne({
            where: {
                product_id: productId,
                attribute_id: attr.attribute_id,
                term_id: attr.term_id,
                used_in_variation: true
            },
            transaction
        });
        if (!isValidAttribute) {
            throw new Error("Invalid attribute combination for variant");
        }
    }

    // Update attributes
    await ProductVariantAttribute.destroy({
        where: { variant_id: variantId },
        transaction
    });

    if (attributes.length > 0) {
        const variantAttributeTerms = attributes.map(attr => ({
            variant_id: variantId,
            attribute_id: attr.attribute_id,
            term_id: attr.term_id,
            updated_by: updatedBy
        }));

        await ProductVariantAttribute.bulkCreate(variantAttributeTerms, { 
            transaction,
            updateOnDuplicate: ['attribute_id', 'term_id', 'updated_by']
        });
    }
};

// Refactored main function
module.exports.updateProductVariant = async (req, res) => {
    const transaction = await Product.sequelize.transaction({ timeout: 10000 });
    try {
        const { variant_id } = req.params;
        const variantData = req.body;
        const { id: updated_by } = req.user;

        const existingVariant = await validateVariantUpdate(variant_id, transaction);
        await validateUpdateData(variantData, existingVariant, variant_id, transaction);

        // Update basic info
        const updatedVariant = await existingVariant.update({
            ...variantData,
            updated_by
        }, { transaction });

        // Update attributes if provided
        if (variantData.attributes) {
            await updateVariantAttributes(variant_id, variantData.attributes, existingVariant.product_id, updated_by, transaction);
        }

        await transaction.commit();

        // Fetch updated variant with relations
        const updatedVariantWithRelations = await ProductVariant.findByPk(variant_id, {
            include: [
                { model: ProductVariantImage, as: "variantImages" },
                {
                    model: ProductVariantAttribute,
                    as: "variantAttributes",
                    include: [
                        { model: Attribute, as: "attribute" },
                        { model: AttributeTerm, as: "term" }
                    ]
                }
            ]
        });

        return successResponse(res, updatedVariantWithRelations, "Product variant updated successfully");
    } catch (error) {
        await transaction.rollback();
        logger.error('Update Product Variant Error:', {
            error: error.message,
            stack: error.stack,
            variantId: req.params.variant_id,
            userId: req.user.id
        });
        
        if (error.name === 'SequelizeUniqueConstraintError') {
            return errorResponse(res, error, 'Duplicate entry found', 409);
        }
        return errorResponse(res, error, error.message);
    }
};

// Remove product variant
module.exports.removeProductVariant = async (req, res) => {
    const transaction = await Product.sequelize.transaction();
    try {
        const { variant_id } = req.params;

        // Find the variant with its images
        const variant = await ProductVariant.findByPk(variant_id, {
            include: [
                { model: ProductVariantImage, as: 'variantImages' }
            ]
        });

        if (!variant) {
            return errorResponse(res, { message: ERROR_MESSAGES.VARIANT_NOT_FOUND }, ERROR_MESSAGES.VARIANT_NOT_FOUND, 404);
        }

        // Delete images from S3 if they exist
        if (variant.variantImages && variant.variantImages.length > 0) {
            await Promise.all(
                variant.variantImages.map(async (image) => {
                    const key = image.image_url.split('.com/')[1]; // Extract key from URL
                    const params = {
                        Bucket: process.env.AWS_S3_BUCKET,
                        Key: key
                    };
                    return deleteFile(params);
                })
            );
        }

        // Delete variant images from database
        await ProductVariantImage.destroy({
            where: { variant_id },
            transaction
        });

        // Delete variant attribute terms
        await ProductVariantAttribute.destroy({
            where: { variant_id },
            transaction
        });

        // Delete the variant itself
        await variant.destroy({ transaction });

        await transaction.commit();

        return successResponse(res, null, "Product variant removed successfully");
    } catch (error) {
        await transaction.rollback();
        logger.error('Remove Product Variant Error:', error);
        return errorResponse(res, error, error.message);
    }
};

// Upload product variant images
module.exports.uploadVariantImages = async (req, res) => {
    const transaction = await Product.sequelize.transaction();
    try {
        const { files } = req;
        const { variant_id } = req.params;
        const { id: updated_by } = req.user;

        // Validate if files are present
        if (!files || files.length === 0) {
            return errorResponse(res, { message: "No files uploaded" }, "No file uploaded", 400);
        }

        // Find the variant
        const variant = await ProductVariant.findByPk(variant_id, {
            include: [{ model: ProductVariantImage, as: 'variantImages' }]
        });

        if (!variant) {
            return errorResponse(res, { message: ERROR_MESSAGES.VARIANT_NOT_FOUND }, ERROR_MESSAGES.VARIANT_NOT_FOUND, 404);
        }

        // Check if the variant has a primary image
        const existingPrimaryImage = await ProductVariantImage.findOne({
            where: { variant_id, is_primary: true }
        });

        // Add file type validation
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedMimeTypes.includes(files[0].mimetype)) {
            return errorResponse(
                res, 
                { message: "Invalid file type. Only JPEG, PNG and WEBP are allowed" }, 
                "Invalid file type", 
                400
            );
        }

        // Upload files to AWS S3
        const uploadedImages = await Promise.all(
            files.map(async (image) => {
                const { originalname, mimetype, buffer } = image;
                const fileName = generateUniqueFileName(originalname);
                const params = {
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: `products/${variant.product_id}/variants/${variant_id}/${fileName}`,
                    Body: buffer,
                    ContentType: mimetype
                };

                return uploadFiletToS3(params);
            })
        );

        // Save uploaded images in ProductVariantImage table
        const imageRecords = uploadedImages.map(({ Location }, index) => ({
            variant_id,
            image_url: Location,
            is_primary: existingPrimaryImage ? false : index === 0, // First image is primary if no primary exists
            updated_by
        }));

        const savedImages = await ProductVariantImage.bulkCreate(imageRecords, { transaction });

        await transaction.commit();

        // Fetch variant with updated images
        const updatedVariant = await ProductVariant.findByPk(variant_id, {
            include: [{ 
                model: ProductVariantImage,
                as: 'variantImages',
                order: [['is_primary', 'DESC']] // Primary image first
            }]
        });

        return successResponse(res, {
            variant: updatedVariant,
            message: "Variant images uploaded successfully"
        });

    } catch (error) {
        await transaction.rollback();
        logger.error('Upload Variant Images Error:', error);
        return errorResponse(res, error, error.message);
    }
};

// Set variant image as primary
module.exports.setVariantPrimaryImage = async (req, res) => {
    const transaction = await Product.sequelize.transaction();
    try {
        const { variant_id, image_id } = req.params;
        const { id: updated_by } = req.user;

        // Find the variant and image
        const variant = await ProductVariant.findByPk(variant_id);
        if (!variant) {
            return errorResponse(res, { message: ERROR_MESSAGES.VARIANT_NOT_FOUND }, ERROR_MESSAGES.VARIANT_NOT_FOUND, 404);
        }

        const image = await ProductVariantImage.findOne({
            where: { id: image_id, variant_id }
        });
        if (!image) {
            return errorResponse(res, { message: "Image not found" }, "Image not found", 404);
        }

        // Remove primary status from all variant images
        await ProductVariantImage.update(
            { is_primary: false },
            { 
                where: { variant_id },
                transaction
            }
        );

        // Set the selected image as primary
        await image.update(
            { 
                is_primary: true,
                updated_by
            },
            { transaction }
        );

        await transaction.commit();

        // Fetch variant with updated images
        const updatedVariant = await ProductVariant.findByPk(variant_id, {
            include: [{ 
                model: ProductVariantImage,
                as: 'variantImages',
                order: [['is_primary', 'DESC']] // Primary image first
            }]
        });

        return successResponse(res, {
            variant: updatedVariant,
            message: "Primary image updated successfully"
        });

    } catch (error) {
        await transaction.rollback();
        logger.error('Set Variant Primary Image Error:', error);
        return errorResponse(res, error, error.message);
    }
};

// Delete variant image
module.exports.deleteVariantImage = async (req, res) => {
    const transaction = await Product.sequelize.transaction();
    try {
        const { variant_id, image_id } = req.params;

        // Find the variant and image
        const variant = await ProductVariant.findByPk(variant_id);
        if (!variant) {
            return errorResponse(res, { message: ERROR_MESSAGES.VARIANT_NOT_FOUND }, ERROR_MESSAGES.VARIANT_NOT_FOUND, 404);
        }

        const image = await ProductVariantImage.findOne({
            where: { id: image_id, variant_id }
        });
        if (!image) {
            return errorResponse(res, { message: "Image not found" }, "Image not found", 404);
        }

        // Delete image from S3
        const key = image.image_url.split('.com/')[1]; // Extract key from URL
        const params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: key
        };
        await deleteFile(params);

        // Delete image record
        await image.destroy({ transaction });

        // If deleted image was primary, set another image as primary
        if (image.is_primary) {
            const nextImage = await ProductVariantImage.findOne({
                where: { variant_id }
            });
            if (nextImage) {
                await nextImage.update({ is_primary: true }, { transaction });
            }
        }

        await transaction.commit();

        // Fetch variant with remaining images
        const updatedVariant = await ProductVariant.findByPk(variant_id, {
            include: [{ 
                model: ProductVariantImage,
                as: 'variantImages',
                order: [['is_primary', 'DESC']]
            }]
        });

        return successResponse(res, {
            variant: updatedVariant,
            message: "Image deleted successfully"
        });

    } catch (error) {
        await transaction.rollback();
        logger.error('Delete Variant Image Error:', error);
        return errorResponse(res, error, error.message);
    }
};


module.exports.getProductVariants = async (req, res) => {
    try {
        const { product_id } = req.params;

        // Validate product_id
        if (!product_id) {
            return res.status(400).json({ message: "Product ID is required" });
        }

        const variants = await ProductVariant.findAll({
            where: { product_id },
            include: [
                {
                    model: ProductVariantImage,
                    as: 'variantImages',
                    attributes: ["id", "variant_id", "image_url", "is_primary"] // Only include necessary fields
                },
                {
                    model: ProductVariantAttribute,
                    as: 'variantAttributes',
                    attributes: ["id", "variant_id", "attribute_id", "term_id", "is_visible", "used_in_variation"], // Only include necessary fields
                    include: [
                        {
                            model: AttributeTerm,
                            as: "term",
                            attributes: ["id", "name", "slug"] // Only include necessary fields
                        },
                        {
                            model: Attribute,
                            as: "attribute",
                            attributes: ["id", "name", "type"] // Only include necessary fields
                        }
                    ]
                }
            ]
        });

        // Check if variants were found
        if (!variants || variants.length === 0) {
            return res.status(404).json({ message: "No variants found for this product" });
        }

        return successResponse(res, variants, "Product variants retrieved successfully");
    } catch (error) {
        logger.error('Get Product Variants Error:', error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.getProductVariant = async (req, res) => {
    try {
        const { variant_id } = req.params;

        const variant = await ProductVariant.findByPk(variant_id, {
            include: [
                { model: ProductVariantImage, as: 'variantImages' },
                { model: ProductVariantAttribute, as: 'variantAttributes' }
            ]
        });

        return successResponse(res, variant, "Product variant retrieved successfully");
    } catch (error) {
        logger.error('Get Product Variant Error:', error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.listAllVariants = async (req, res) => {
    try {
        const {
            sort_by = 'id',
            order = 'ASC',
            limit = 10,
            offset = 0,
            keyword,
            price_range,
            stock_status,
            product_id
        } = req.query;

        const parsedLimit = parseInt(limit, 10);
        const parsedOffset = parseInt(offset, 10);
        const whereClause = { [Op.and]: [] };

        // Product ID filter
        if (product_id) {
            whereClause[Op.and].push({ product_id });
        }

        // Keyword search in slug or barcode
        if (keyword) {
            whereClause[Op.and].push({
                [Op.or]: [
                    { slug: { [Op.like]: `%${keyword}%` } },
                    { barcode: { [Op.like]: `%${keyword}%` } }
                ]
            });
        }

        // Price range filter
        if (price_range) {
            const [minPrice, maxPrice] = price_range.split('-').map(Number);
            whereClause[Op.and].push({
                price: {
                    [Op.between]: [minPrice || 0, maxPrice || Number.MAX_SAFE_INTEGER]
                }
            });
        }

        // Stock status filter
        if (stock_status) {
            switch (stock_status) {
                case 'in_stock':
                    whereClause[Op.and].push({
                        stock: { [Op.gt]: 0 }
                    });
                    break;
                case 'out_of_stock':
                    whereClause[Op.and].push({
                        stock: 0
                    });
                    break;
                case 'low_stock':
                    whereClause[Op.and].push(
                        Sequelize.literal('stock <= low_stock_threshold AND stock > 0')
                    );
                    break;
            }
        }

        // Define relationships to include
        const includeClause = [
            {
                model: Product,
                as: 'product',
                attributes: ['id', 'name', 'slug'],
                required: false
            },
            {
                model: ProductVariantAttribute,
                as: 'variantAttributes',
                include: [
                    { 
                        model: Attribute, 
                        as: 'attribute',
                        attributes: ['id', 'name']
                    },
                    { 
                        model: AttributeTerm, 
                        as: 'term',
                        attributes: ['id', 'name']
                    }
                ],
                required: false
            }
        ];

        // Fetch total variant count with filters
        const totalCount = await ProductVariant.count({
            where: whereClause,
            include: includeClause,
            distinct: true
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

        // Fetch paginated variant data
        const variants = await ProductVariant.findAll({
            where: whereClause,
            include: includeClause,
            order: [[sort_by, order]],
            limit: parsedLimit,
            offset: parsedOffset,
            attributes: {
                include: [
                    [
                        Sequelize.literal(`(
                            SELECT COUNT(*)
                            FROM product_variant_images
                            WHERE product_variant_images.variant_id = ProductVariant.id
                        )`),
                        'image_count'
                    ]
                ]
            }
        });

        return successResponse(res, { variants, pagination }, 'Variants retrieved successfully');
    } catch (error) {
        logger.error('List All Variants Error:', error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.getVariantById = async (req, res) => {
    try {
        const { variant_id } = req.params;

        const variant = await ProductVariant.findOne({
            where: { id: variant_id },
            attributes: [
                'id',
                'product_id',
                'slug',
                'price',
                'discount_price',
                'purchase_price',
                'stock',
                'low_stock_threshold',
                'weight',
                'length',
                'width',
                'height',
                'barcode',
                'status',
                'description',
                'created_at',
                'updated_at'
            ],
            include: [
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'slug'],
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
                        }
                    ]
                },
                {
                    model: ProductVariantAttribute,
                    as: 'variantAttributes',
                    include: [
                        {
                            model: Attribute,
                            as: 'attribute',
                            attributes: ['id', 'name']
                        },
                        {
                            model: AttributeTerm,
                            as: 'term',
                            attributes: ['id', 'name']
                        }
                    ]
                }
            ]
        });

        if (!variant) {
            return errorResponse(res, { message: 'Variant not found' }, 'Variant not found', 404);
        }

        return successResponse(res, variant, 'Variant retrieved successfully');
    } catch (error) {
        console.log(error);
        logger.error('Get Variant By ID Error:', error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.restoreProductVariant = async (req, res) => {
    const transaction = await Product.sequelize.transaction();
    try {
        const { variant_id } = req.params;
        const { id: updated_by } = req.user;

        // Find the soft-deleted variant
        const variant = await ProductVariant.findOne({
            where: { 
                id: variant_id,
                deletedAt: { [Op.ne]: null } // Check if it's actually deleted
            },
            paranoid: false // Include soft-deleted records in search
        });

        // If variant doesn't exist
        if (!variant) {
            return errorResponse(res, null, "Variant not found", 404);
        }

        // If variant is not deleted
        if (!variant.deletedAt) {
            return errorResponse(res, null, "Variant is not deleted", 400);
        }

        // Check for duplicate slug before restore
        const existingSlug = await ProductVariant.findOne({
            where: {
                slug: variant.slug,
                id: { [Op.ne]: variant_id }
            },
            transaction
        });

        if (existingSlug) {
            await transaction.rollback();
            return errorResponse(
                res,
                null,
                `Cannot restore: A variant with slug ${variant.slug} already exists`,
                409
            );
        }

        // Check for duplicate barcode before restore
        if (variant.barcode) {
            const existingBarcode = await ProductVariant.findOne({
                where: {
                    barcode: variant.barcode,
                    id: { [Op.ne]: variant_id }
                },
                transaction
            });

            if (existingBarcode) {
                await transaction.rollback();
                return errorResponse(
                    res,
                    null,
                    `Cannot restore: A variant with barcode ${variant.barcode} already exists`,
                    409
                );
            }
        }

        // Restore the variant
        await variant.restore({ transaction });

        // Update the updated_by field
        await variant.update({ updated_by }, { transaction });

        // Fetch the restored variant with all its associations
        const restoredVariant = await ProductVariant.findByPk(variant_id, {
            include: [
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'slug']
                },
                {
                    model: ProductVariantAttribute,
                    as: 'variantAttributes',
                    include: [
                        {
                            model: Attribute,
                            as: 'attribute',
                            attributes: ['id', 'name']
                        },
                        {
                            model: AttributeTerm,
                            as: 'term',
                            attributes: ['id', 'name']
                        }
                    ]
                }
            ],
            transaction
        });

        await transaction.commit();

        return successResponse(
            res,
            restoredVariant,
            "Product variant restored successfully"
        );
    } catch (error) {
        await transaction.rollback();
        logger.error('Restore Product Variant Error:', error);
        return errorResponse(res, error, error.message);
    }
};

// Remove product attribute term
module.exports.removeProductAttributeTerm = async (req, res) => {
    const transaction = await Product.sequelize.transaction();
    try {
        const { attribute_term_id } = req.params;
        const { id: updated_by } = req.user;

        // Find the attribute term to be removed
        const attributeTerm = await ProductAttributeTerm.findByPk(attribute_term_id);
        if (!attributeTerm) {
            return errorResponse(res, { message: ERROR_MESSAGES.ATTRIBUTE_TERM_NOT_FOUND }, ERROR_MESSAGES.ATTRIBUTE_TERM_NOT_FOUND, 404);  
        }

        // Check if the attribute term is associated with any variants of the same product
        const variants = await ProductVariant.findAll({
            where: { product_id: attributeTerm.product_id },
            include: [{
                model: ProductVariantAttribute,
                as: 'variantAttributes',
                where: { 
                    term_id: attributeTerm.term_id,
                    attribute_id: attributeTerm.attribute_id
                } 
            }],
            transaction
        });

        if (variants.length > 0) {
            return errorResponse(res, { message: ERROR_MESSAGES.ATTRIBUTE_TERM_IN_USE }, ERROR_MESSAGES.ATTRIBUTE_TERM_IN_USE, 400);
        }

        // Remove the attribute term
        await attributeTerm.destroy({ transaction });

        // Update the updated_by field
        await attributeTerm.update({ updated_by }, { transaction });

        await transaction.commit();

        return successResponse(res, null, "Product attribute term removed successfully");
    } catch (error) {
        await transaction.rollback();
        logger.error('Remove Product Attribute Term Error:', error);
        return errorResponse(res, error, error.message);
    }
};



// Add this helper function
const updateStockStatus = (stock, lowStockThreshold) => {
    if (stock === 0) return 'out_of_stock';
    if (stock <= lowStockThreshold) return 'low_stock';
    return 'in_stock';
};

