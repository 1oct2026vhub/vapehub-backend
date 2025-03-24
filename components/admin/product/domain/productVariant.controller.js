const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Product, ProductAttributeTerm, Attribute, AttributeTerm, ProductVariant, ProductVariantImage, ProductVariantAttribute, Category, Brand, SlugRelation } = require("../../../../models");
const { Sequelize, Op } = require("sequelize");
const logger = require("../../../../library/logger");
const AWS = require("aws-sdk");
const { uploadFiletToS3, generateUniqueFileName, deleteFile } = require("../../../../library/s3/s3Helper");
const ExcelJS = require("exceljs");
const SlugManager = require("../../../../utils/slugManager");

const slugManager = new SlugManager(SlugRelation);

const ERROR_MESSAGES = {
    VARIANT_NOT_FOUND: "Variant not found",
    PRODUCT_NOT_FOUND: "Product not found",
    DUPLICATE_SLUG: (slug) => `Slug ${slug} already exists`,
    DUPLICATE_BARCODE: (barcode) => `Barcode ${barcode} already exists`,
    INVALID_DISCOUNT: "Discount price must be less than regular price",
    ATTRIBUTE_TERM_NOT_FOUND: "Attribute term not found",
    ATTRIBUTE_TERM_IN_USE: "Cannot remove attribute term as it is associated with existing product variants",
    ATTRIBUTE_TERM_COMBINATION_EXISTS: "Attribute term combination already exists for this product",
    ATTRIBUTE_TERM_COMBINATION_EXISTS_FOR_ANOTHER_BRAND: "Attribute term combination already exists for another brand",
    INVALID_ATTRIBUTE_COMBINATION: "Invalid attribute combination for variant",
    INVALID_ATTRIBUTE_RELATION: "The attribute and term relationship is invalid or has been deleted",
    NO_TERMS_FOUND_FOR_ATTRIBUTE: "No terms found for the given attribute",
    INVALID_TERM_ID: "Invalid term ID",
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

        // Validate attributes and terms
        if (Array.isArray(attributes) && attributes.length > 0) {
            // Flatten the attributes array to handle multiple terms per attribute
            const flattenedAttributes = attributes.flatMap(attr => {
                // Handle both single term_id and multiple term_ids
                const termIds = Array.isArray(attr.term_ids) ? attr.term_ids : 
                              attr.term_id ? [attr.term_id] : [];
                
                if (termIds.length === 0) {
                    throw new Error(`No term IDs provided for attribute ${attr.attribute_id}`);
                }

                return termIds.map(termId => ({
                    attribute_id: attr.attribute_id,
                    term_id: termId,
                    is_visible_page: attr.is_visible_page ?? true,
                    used_in_variation: attr.used_in_variation ?? false
                }));
            });

            // Validate all attributes and terms
            await validateAttributesAndTerms(flattenedAttributes);

            // Check for existing combinations
            const existingCombinations = await ProductAttributeTerm.findAll({
                where: {
                    product_id,
                    [Op.or]: flattenedAttributes.map(attr => ({
                        [Op.and]: {
                            attribute_id: attr.attribute_id,
                            term_id: attr.term_id
                        }
                    }))
                }
            });

            // Filter out existing combinations
            const newAttributes = flattenedAttributes.filter(attr => 
                !existingCombinations.some(existing => 
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
                    { model: Attribute, as: "attribute" },
                    { model: AttributeTerm, as: "term" }
                ]
            }]
        });

        return successResponse(res, updatedProduct, "Product attributes added successfully");
    } catch (error) {
        await transaction.rollback();
        logger.error('Add Product Attributes Error:', error);
        
        // Handle unique constraint violation specifically
        if (error.name === 'SequelizeUniqueConstraintError') {
            return errorResponse(res, error, 'This attribute combination already exists for this product', 409);
        }
        
        return errorResponse(res, error, error.message);
    }
};

// Helper function to validate attributes and terms
const validateAttributesAndTerms = async (attributes) => {
    // Extract unique attribute IDs and term IDs
    const attributeIds = [...new Set(attributes.map(attr => attr.attribute_id))];
    const termIds = [...new Set(attributes.map(attr => attr.term_id))];

    // Check if all attributes exist
    const existingAttributes = await Attribute.findAll({
        where: { id: attributeIds }
    });

    if (existingAttributes.length !== attributeIds.length) {
        throw new Error("One or more attribute IDs are invalid.");
    }

    // Check if all terms exist
    const existingTerms = await AttributeTerm.findAll({
        where: { id: termIds }
    });

    if (existingTerms.length !== termIds.length) {
        throw new Error("One or more term IDs are invalid.");
    }

    // Get all valid attribute-term relationships
    const attributeTermRelations = await AttributeTerm.findAll({
        where: { 
            attribute_id: attributeIds,
            id: termIds
        }
    });

    // Create a map for quick lookup of valid attribute-term relationships
    const validRelationships = new Map(
        attributeTermRelations.map(relation => 
            [`${relation.attribute_id}-${relation.id}`, true]
        )
    );

    // Check each attribute-term combination
    const invalidTerms = attributes.filter(attr => 
        !validRelationships.has(`${attr.attribute_id}-${attr.term_id}`)
    );

    if (invalidTerms.length > 0) {
        throw new Error(ERROR_MESSAGES.INVALID_ATTRIBUTE_RELATION);
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
            // Flatten the attributes array to handle multiple terms per attribute
            const flattenedAttributes = attributes.flatMap(attr => {
                const termIds = Array.isArray(attr.term_ids) ? attr.term_ids : [attr.term_id];
                return termIds.map(termId => ({
                    attribute_id: attr.attribute_id,
                    term_id: termId,
                    is_visible_page: attr.is_visible_page ?? true,
                    used_in_variation: attr.used_in_variation ?? false
                }));
            });

            // Validate all attributes and terms
            await validateAttributesAndTerms(flattenedAttributes);

            // Get existing attribute terms for this product
            const existingAttributeTerms = await ProductAttributeTerm.findAll({
                where: {
                    product_id,
                    attribute_id: [...new Set(flattenedAttributes.map(attr => attr.attribute_id))]
                }
            });

            // Create a map of existing terms for quick lookup
            const existingTermsMap = new Map(
                existingAttributeTerms.map(term => 
                    [`${term.attribute_id}-${term.term_id}`, term]
                )
            );

            // Identify terms to add, update, and remove
            const termsToAdd = [];
            const termsToUpdate = [];
            const termsToRemove = [];

            // Check each incoming attribute-term combination
            for (const attr of flattenedAttributes) {
                const key = `${attr.attribute_id}-${attr.term_id}`;
                const existingTerm = existingTermsMap.get(key);

                if (existingTerm) {
                    // Check if visibility or variation settings have changed
                    if (existingTerm.is_visible_page !== attr.is_visible_page || 
                        existingTerm.used_in_variation !== attr.used_in_variation) {
                        termsToUpdate.push({
                            id: existingTerm.id,
                            is_visible_page: attr.is_visible_page,
                            used_in_variation: attr.used_in_variation,
                            updated_by
                        });
                    }
                } else {
                    termsToAdd.push({
                        product_id,
                        attribute_id: attr.attribute_id,
                        term_id: attr.term_id,
                        is_visible_page: attr.is_visible_page,
                        used_in_variation: attr.used_in_variation,
                        updated_by
                    });
                }
            }

            // Identify terms to remove (terms that exist but not in the new set)
            for (const [key, term] of existingTermsMap) {
                const [attributeId, termId] = key.split('-');
                if (!flattenedAttributes.some(attr => 
                    attr.attribute_id === parseInt(attributeId) && 
                    attr.term_id === parseInt(termId)
                )) {
                    termsToRemove.push(term.id);
                }
            }

            // Check if any terms to be removed are used in variants
            if (termsToRemove.length > 0) {
                const usedTerms = await ProductVariantAttribute.findAll({
                    include: [{
                        model: ProductVariant,
                        as: 'variant',
                        where: { product_id },
                        required: true
                    }],
                    where: {
                        attribute_id: [...new Set(termsToRemove.map(id => 
                            existingAttributeTerms.find(term => term.id === id).attribute_id
                        ))],
                        term_id: termsToRemove.map(id => 
                            existingAttributeTerms.find(term => term.id === id).term_id
                        )
                    }
                });

                if (usedTerms.length > 0) {
                    throw new Error(ERROR_MESSAGES.ATTRIBUTE_TERM_IN_USE);
                }
            }

            // Perform the updates
            if (termsToRemove.length > 0) {
                await ProductAttributeTerm.destroy({
                    where: { id: termsToRemove },
                    transaction
                });
            }

            if (termsToUpdate.length > 0) {
                await Promise.all(termsToUpdate.map(term => 
                    ProductAttributeTerm.update(
                        {
                            is_visible_page: term.is_visible_page,
                            used_in_variation: term.used_in_variation,
                            updated_by: term.updated_by
                        },
                        {
                            where: { id: term.id },
                            transaction
                        }
                    )
                ));
            }

            if (termsToAdd.length > 0) {
                await ProductAttributeTerm.bulkCreate(termsToAdd, { 
                    transaction,
                    validate: true
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
                    { model: Attribute, as: "attribute" },
                    { model: AttributeTerm, as: "term" }
                ]
            }]
        });

        return successResponse(res, updatedProduct, "Product attributes updated successfully");
    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        logger.error('Update Product Attributes Error:', error);
        
        // Handle specific error cases
        if (error.message === ERROR_MESSAGES.ATTRIBUTE_TERM_IN_USE) {
            return errorResponse(res, error, error.message, 409);
        }
        
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

        // Handle variants data
        const variantsData = parseVariantsData(req.body.variants);
        if (!Array.isArray(variantsData)) {
            return errorResponse(res, { message: "Variants must be an array" }, "Invalid variants format", 400);
        }

        const product = await validateProduct(product_id, transaction);
        const hasVariationAttributes = await validateVariationAttributes(product_id, transaction);

        const createdVariants = await Promise.all(variantsData.map(async (variant) => {
            await validateVariantData(variant, product_id, transaction);
            return await createVariantAndAttributes(variant, product_id, updated_by, transaction);
        }));

        await transaction.commit();
        const newVariants = await fetchCreatedVariants(createdVariants);
        return successResponse(res, newVariants, "Product variants created successfully", 201);
    } catch (error) {
        await transaction.rollback();
        logger.error('Create Product Variants Error:', error);
        return errorResponse(res, error, error.message);
    }
};

// Helper function to parse variants data
const parseVariantsData = (variants) => {
    try {
        return typeof variants === 'string' ? JSON.parse(variants) : variants || [];
    } catch {
        throw new Error("Invalid variants data format");
    }
};

// Helper function to validate product existence
const validateProduct = async (product_id, transaction) => {
    const product = await Product.findByPk(product_id);
    if (!product) {
        throw new Error(ERROR_MESSAGES.PRODUCT_NOT_FOUND);
    }
    return product;
};

// Helper function to validate variation attributes
const validateVariationAttributes = async (product_id, transaction) => {
    const hasVariationAttributes = await ProductAttributeTerm.findOne({
        where: { product_id, used_in_variation: true }
    });
    if (!hasVariationAttributes) {
        throw new Error("Product must have at least one attribute marked for variation");
    }
    return hasVariationAttributes;
};

// Helper function to validate variant data
const validateVariantData = async (variant, product_id, transaction) => {
    await validateVariantSlug(variant.slug, transaction);
    await validateVariantBarcode(variant.barcode, transaction);
    await validateVariantAttributes(variant.attributes, product_id, transaction);
    await checkExistingCombinations(variant.attributes, product_id, transaction);
};

// Helper function to check existing combinations
const checkExistingCombinations = async (attributes, product_id, transaction) => {
    const existingCombinations = await ProductVariantAttribute.findAll({
        include: [
            {
                model: ProductVariant,
                as: "variant", // Specify the alias here
                where: { product_id: product_id }, // Ensure we only check for the current product
            }
        ],
        where: {
            attribute_id: attributes.map(attr => attr.attribute_id),
            term_id: attributes.map(attr => attr.term_id),
        },
        transaction // Include the transaction in the query
    });
    if (existingCombinations.length > 0) {
        throw new Error("Attribute-term combination conflict detected for the current variant.");
    }
};

// Helper function to create variant and its attributes
const createVariantAndAttributes = async (variant, product_id, updated_by, transaction) => {
    const productVariant = await createVariantRecord(variant, product_id, updated_by, transaction);
    
    // Create slug relation
    await slugManager.createOrUpdateSlug(variant.slug, 'product_variant', productVariant.id, transaction);
    
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
    return productVariant.id;
};

// Helper function to fetch created variants
const fetchCreatedVariants = async (createdVariants) => {
    return await ProductVariant.findAll({
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
        transaction,
        force: true // Force delete instead of soft delete
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

module.exports.updateProductVariant = async (req, res) => {
    const transaction = await Product.sequelize.transaction({ timeout: 10000 });
    try {
        const { variant_id } = req.params;
        const { product_id } = req.params;
        const variantData = req.body;
        const { id: updated_by } = req.user;

        // Fetch the existing variant
        const existingVariant = await ProductVariant.findByPk(variant_id, { transaction });
        if (!existingVariant) {
            return errorResponse(res, { message: ERROR_MESSAGES.VARIANT_NOT_FOUND }, ERROR_MESSAGES.VARIANT_NOT_FOUND, 404);
        }

        // Validate the product associated with the variant
        const existingProduct = await Product.findByPk(existingVariant.product_id);
        if (!existingProduct) {
            return errorResponse(res, { message: ERROR_MESSAGES.PRODUCT_NOT_FOUND }, ERROR_MESSAGES.PRODUCT_NOT_FOUND, 404);
        }

        // Validate update data
        await validateUpdateData(variantData, existingVariant, variant_id, transaction);

        // Update slug if provided and changed
        if (variantData.slug && variantData.slug !== existingVariant.slug) {
            await slugManager.createOrUpdateSlug(variantData.slug, 'product_variant', variant_id, transaction);
        }

        const existingAttributes = await ProductVariantAttribute.findAll({
            where: {
                variant_id: {
                    [Op.ne]: variant_id // Exclude the current variant
                },
                attribute_id: Array.isArray(variantData.attributes) ? variantData.attributes.map(attr => attr.attribute_id) : [],
                term_id: Array.isArray(variantData.attributes) ? variantData.attributes.map(attr => attr.term_id) : [],
            },
            include: [
                {
                    model: ProductVariant,
                    as: "variant", // Ensure to use the correct alias here
                    where: { product_id: product_id } 
                }
            ],
            transaction
        });

        if (existingAttributes.length > 0) {
            throw new Error("Attribute combination already exists for another variant of the same brand");
        }

        // Update basic info
        await existingVariant.update({
            ...variantData,
            updated_by
        }, { transaction });

        // Update attributes if provided
        if (Array.isArray(variantData.attributes)) {
            await updateVariantAttributes(variant_id, variantData.attributes, existingVariant.product_id, updated_by, transaction);
        }

        await transaction.commit();

        // Fetch updated variant with relations
        const updatedVariantWithRelations = await ProductVariant.findByPk(variant_id, {
            include: [
                { model: ProductVariantImage, as: "variantImages" },
                {
                    model: ProductVariantAttribute,
                    as: "variantAttributes", // Ensure to use the correct alias here
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

        // Delete slug relation first
        await slugManager.deleteSlug('product_variant', variant_id, transaction);

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
                    // paranoid: false, // Include soft-deleted records
                    include: [
                        {
                            model: Attribute,
                            as: 'attribute',
                            attributes: ['id', 'name', 'type']
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

        if (!variant) {
            return errorResponse(res, { message: 'Variant not found' }, 'Variant not found', 404);
        }

        return successResponse(res, variant, 'Variant retrieved successfully');
    } catch (error) {
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

        // Recreate slug relation
        await slugManager.createOrUpdateSlug(variant.slug, 'product_variant', variant.id, transaction);

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

module.exports.bulkUpdateVariants = async (req, res, next) => {
    const transaction = await ProductVariant.sequelize.transaction();   
    try {
        const { file } = req;
        const { id: updated_by } = req.user;

        if (!file) {
            return errorResponse(res, { message: "No file uploaded" }, "No file uploaded", 400);
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(file.buffer);
        const worksheet = workbook.worksheets[0];

        // Check the header row
        const headerRow = worksheet.getRow(1).values;
        const isFirstHeaderEmpty = !headerRow[0] || headerRow[0] !== 'ID';

        const results = [];
        const promises = [];

        // Convert worksheet rows to array and skip header
        const rows = worksheet.getRows(2, worksheet.rowCount - 1) || [];

        // Process each row
        for (const row of rows) {
            // Skip empty rows
            if (!row.values || row.values.length === 0) continue;

            const rowValues = isFirstHeaderEmpty ? row.values.slice(1) : row.values;
            const [
                id,
                product_slug,
                slug,
                price,
                discount_price,
                purchase_price,
                weight,
                length,
                width,
                height,
                description,
                barcode,
                stock,
                low_stock_threshold,
                stock_status,
                status,
                attributes
            ] = rowValues;

            // Skip if required fields are missing
            if (!product_slug || !slug) {
                results.push({
                    id: id || 'N/A',
                    slug: slug || 'Missing slug',
                    status: 'Skipped',
                    message: 'Missing required fields (product_slug or slug)'
                });
                continue;
            }

            // Create a promise for processing each row
            const processRowPromise = async () => {
                try {
                    // Find product by slug
                    const product = await Product.findOne({ where: { slug: product_slug } });
                    if (!product) throw new Error(`Product with slug ${product_slug} not found`);

                    // Create variant data object
                    const variantData = {
                        slug: slug.trim(),
                        price: parseFloat(price) || 0,
                        discount_price: parseFloat(discount_price) || null,
                        purchase_price: parseFloat(purchase_price) || 0,
                        weight: parseFloat(weight) || 0,
                        length: parseFloat(length) || 0,
                        width: parseFloat(width) || 0,
                        height: parseFloat(height) || 0,
                        description: description?.trim() || null,
                        barcode: barcode?.trim() || null,
                        stock: parseInt(stock) || 0,
                        low_stock_threshold: parseInt(low_stock_threshold) || 0,
                        stock_status: stock_status?.trim() || 'in_stock',
                        status: status?.trim() || 'active',
                        product_id: product.id,
                        updated_by
                    };

                    let variant;
                    let action;

                    // If ID exists, try to find and update the variant
                    if (id) {
                        variant = await ProductVariant.findByPk(id);
                        if (!variant) throw new Error(`Variant with ID ${id} not found`);

                        // Check for duplicate slug if it's being changed
                        if (variant.slug !== variantData.slug) {
                            const existingVariantWithSlug = await ProductVariant.findOne({
                                where: { slug: variantData.slug, id: { [Op.ne]: id } }
                            });
                            if (existingVariantWithSlug) throw new Error(`Duplicate slug: ${variantData.slug} already exists`);
                        }

                        // Check for duplicate barcode if it's being changed and is not empty
                        if (variantData.barcode && variant.barcode !== variantData.barcode) {
                            const existingVariantWithBarcode = await ProductVariant.findOne({
                                where: { barcode: variantData.barcode, id: { [Op.ne]: id } }
                            });
                            if (existingVariantWithBarcode) throw new Error(`Duplicate barcode: ${variantData.barcode} already exists`);
                        }

                        await variant.update(variantData);
                        action = 'Updated';
                    } else {
                        // Check for duplicate slug before creating
                        const existingVariant = await ProductVariant.findOne({ where: { slug: variantData.slug } });
                        if (existingVariant) throw new Error(`Duplicate slug: ${variantData.slug} already exists`);

                        // Check for duplicate barcode before creating if barcode is provided
                        if (variantData.barcode) {
                            const existingVariantWithBarcode = await ProductVariant.findOne({ where: { barcode: variantData.barcode } });
                            if (existingVariantWithBarcode) throw new Error(`Duplicate barcode: ${variantData.barcode} already exists`);
                        }

                        // Create new variant
                        variant = await ProductVariant.create(variantData);
                        action = 'Created';
                    }

                    // Process variant attributes
                    if (attributes) {
                        try {
                            // Validate attributes format
                            if (typeof attributes !== 'string') {
                                throw new Error('Attributes must be a string');
                            }

                            const attributePairs = attributes.split(',').map(pair => pair.trim());
                            
                            // First validate all pairs before making any changes
                            for (const pair of attributePairs) {
                                try {
                                    const parts = pair.split(':');
                                    if (parts.length !== 2) {
                                        throw new Error(`Invalid attribute format: ${pair}. Use format: attribute_slug:term_slug`);
                                    }

                                    const [attributeSlug, termSlug] = parts.map(s => s?.trim());
                                    
                                    if (!attributeSlug || !termSlug) {
                                        throw new Error(`Invalid attribute format: ${pair}. Both attribute and term slugs are required`);
                                    }

                                    // Validate attribute exists
                                    const attribute = await Attribute.findOne({ 
                                        where: { slug: attributeSlug },
                                        transaction 
                                    });
                                    if (!attribute) {
                                        throw new Error(`Attribute "${attributeSlug}" not found`);
                                    }

                                    // Validate term exists and belongs to attribute
                                    const term = await AttributeTerm.findOne({ 
                                        where: { 
                                            slug: termSlug, 
                                            attribute_id: attribute.id 
                                        },
                                        transaction 
                                    });
                                    if (!term) {
                                        throw new Error(`Term "${termSlug}" not found for attribute "${attributeSlug}"`);
                                    }

                                    // Validate attribute-term is defined for product
                                    const productAttributeTerm = await ProductAttributeTerm.findOne({
                                        where: { 
                                            product_id: product.id, 
                                            attribute_id: attribute.id, 
                                            term_id: term.id 
                                        },
                                        transaction
                                    });
                                    if (!productAttributeTerm) {
                                        throw new Error(`Attribute "${attributeSlug}" with term "${termSlug}" is not defined for product "${product_slug}"`);
                                    }

                                    // Check if this combination already exists
                                    const existingVariantAttribute = await ProductVariantAttribute.findOne({
                                        where: { 
                                            variant_id: variant.id, 
                                            attribute_id: attribute.id, 
                                            term_id: term.id 
                                        },
                                        transaction
                                    });

                                    // Only create if it doesn't exist
                                    if (!existingVariantAttribute) {
                                        try {
                                            await ProductVariantAttribute.create({
                                                variant_id: variant.id,
                                                attribute_id: attribute.id,
                                                term_id: term.id,
                                                updated_by
                                            }, { transaction });
                                        } catch (createError) {
                                            console.error('Create Error:', createError);
                                            throw new Error(`Failed to create variant attribute: ${createError.message}`);
                                        }
                                    }
                                } catch (pairError) {
                                    console.error('Pair Error:', pairError);
                                    throw new Error(`Error processing attribute pair "${pair}": ${pairError.message}`);
                                }
                            }
                        } catch (error) {
                            console.error('Attribute Processing Error:', error);
                            throw new Error(`Error processing attributes: ${error.message}`);
                        }
                    }

                    results.push({
                        id: variant.id,
                        slug: variant.slug,
                        status: action,
                        message: `Variant successfully ${action.toLowerCase()}`
                    });

                } catch (error) {
                    results.push({
                        id: id || 'N/A',
                        slug: slug || 'Unknown',
                        status: 'Error',
                        message: error.message
                    });
                    logger.error(`Error processing variant ${id ? `with ID ${id}` : `with slug ${slug}`}:`, error);
                }
            };

            promises.push(processRowPromise());
        }

        // Wait for all promises to resolve
        await Promise.all(promises);

        // Sort results by status
        results.sort((a, b) => {
            const statusOrder = { 'Created': 1, 'Updated': 2, 'Error': 3, 'Skipped': 4 };
            return statusOrder[a.status] - statusOrder[b.status];
        });

        // Return response with summary
        const summary = {
            total: results.length,
            created: results.filter(r => r.status === 'Created').length,
            updated: results.filter(r => r.status === 'Updated').length,
            errors: results.filter(r => r.status === 'Error').length,
            skipped: results.filter(r => r.status === 'Skipped').length,
        };

        return successResponse(res, { summary, results }, "Product variants processed successfully");

    } catch (error) {
        logger.error('Error during bulk update:', error);
        return errorResponse(res, error, "Error processing product variants");
    } finally {
        await transaction.rollback();
    }
};

module.exports.downloadVariantSampleExcel = async (req, res, next) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Product Variants');

        // Add column headers
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Product Slug', key: 'product_slug', width: 30 },
            { header: 'Slug', key: 'slug', width: 30 },
            { header: 'Price', key: 'price', width: 15 },
            { header: 'Discount Price', key: 'discount_price', width: 15 },
            { header: 'Purchase Price', key: 'purchase_price', width: 15 },
            { header: 'Weight', key: 'weight', width: 10 },
            { header: 'Length', key: 'length', width: 10 },
            { header: 'Width', key: 'width', width: 10 },
            { header: 'Height', key: 'height', width: 10 },
            { header: 'Description', key: 'description', width: 50 },
            { header: 'Barcode', key: 'barcode', width: 20 },
            { header: 'Stock', key: 'stock', width: 10 },
            { header: 'Low Stock Threshold', key: 'low_stock_threshold', width: 15 },
            { header: 'Stock Status', key: 'stock_status', width: 15 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Attributes (attribute_slug:term_slug)', key: 'attributes', width: 100 }
        ];

        // Sample data with attributes
        worksheet.addRow({
            id: '', // Empty for new variant
            product_slug: 'sample-vape-device',
            slug: 'sample-vape-device-black',
            price: 99.99,
            discount_price: 89.99,
            purchase_price: 79.99,
            weight: 0.5,
            length: 10,
            width: 5,
            height: 2,
            description: 'Black variant of the sample vape device',
            barcode: 'VD-001-BLK',
            stock: 100,
            low_stock_threshold: 10,
            stock_status: 'in_stock',
            status: 'active',
            attributes: 'color:black,size:standard,nicotine:0mg,flavor:mint'
        });

        worksheet.addRow({
            id: '1',
            product_slug: 'premium-e-liquid',
            slug: 'premium-e-liquid-30ml',
            price: 29.99,
            discount_price: 24.99,
            purchase_price: 19.99,
            weight: 0.1,
            length: 5,
            width: 3,
            height: 1,
            description: '30ml bottle of premium e-liquid',
            barcode: 'EL-001-30ML',
            stock: 200,
            low_stock_threshold: 20,
            stock_status: 'in_stock',
            status: 'active',
            attributes: 'color:red,size:30ml,nicotine:6mg,flavor:strawberry'
        });

        // Add notes about attribute format
        worksheet.addRow({
            id: 'NOTE:',
            product_slug: 'Format: attribute_slug:term_slug',
            description: 'Multiple attributes should be comma-separated. Visibility and variation settings are inherited from product attributes.'
        });

        worksheet.addRow({
            id: 'IMPORTANT:',
            product_slug: 'The attributes must be already defined in the product',
            description: 'The visibility and variation settings are taken from the product attribute settings'
        });

        // Set the response headers
        res.setHeader('Content-Disposition', 'attachment; filename=SampleProductVariants.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        // Write the workbook to the response
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

