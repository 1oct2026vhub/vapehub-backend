const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Product, Category, Brand, Flavor, ProductImage, ProductFlavor, ProductAttributeTerm, Attribute, AttributeTerm, ProductVariant, ProductVariantImage, ProductVariantAttribute } = require("../../../../models");
const { Sequelize, Op } = require("sequelize");
const logger = require("../../../../library/logger");
const AWS = require("aws-sdk");
const { uploadFiletToS3, generateUniqueFileName } = require("../../../../library/s3/s3Helper");

module.exports.listAllProducts = async (req, res, next) => {
    try {
        const {
            sort_by = 'id', order = 'ASC', limit = 10, offset = 0, keyword, price_range,
            categories, brands, deleted, is_new, variant_attributes
        } = req.query;

        const parsedLimit = parseInt(limit, 10);
        const parsedOffset = parseInt(offset, 10);
        const whereClause = { [Op.and]: [] };

        // Keyword search
        if (keyword) {
            whereClause[Op.and].push({ name: { [Op.like]: `%${keyword}%` } });
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
            whereClause[Op.and].push({ brand_id: { [Op.in]: brandIds } });
        }

        // Category filter
        if (categories) {
            const categoryIds = categories.split(',').map(Number);
            whereClause[Op.and].push({ category_id: { [Op.in]: categoryIds } });
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
        if (deleted !== undefined) {
            whereClause.deletedAt = deleted === "true" || deleted === true ? { [Op.ne]: null } : null;
        }

        // Define relationships to include with LEFT JOIN
        const includeClause = [
            { 
                model: Category, 
                as: 'Category',
                required: false // LEFT JOIN
            },
            { 
                model: Brand, 
                as: 'Brand',
                required: false // LEFT JOIN
            },
            { 
                model: ProductImage, 
                as: 'ProductImages',
                required: false // LEFT JOIN
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

        // Fetch total product count with filters
        const totalCount = await Product.count({
            where: whereClause,
            include: includeClause.map(include => ({
                ...include,
                attributes: [] // Don't need attributes for counting
            })),
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

        // Fetch paginated product data
        const products = await Product.findAll({
            where: whereClause,
            include: includeClause,
            order: [[sort_by, order]],
            limit: parsedLimit,
            offset: parsedOffset
        });

        return successResponse(res, { products, pagination }, 'Success');
    } catch (error) {
        logger.error(error)
        return errorResponse(res, error, error.message);
    }
}

module.exports.getProductById = async (req, res, next) => {
    try {
        const { id } = req.params; 

        // Fetch the product by ID along with related data (Category, Brand, Images, Flavors, Variants, and Attributes)
        const product = await Product.findByPk(id, {
            include: [
                {
                    model: Category,
                    as: "Category"
                },
                {
                    model: Brand,
                    as: "Brand"
                },
                {
                    model: ProductImage,
                    as: "ProductImages"
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

        // Return success response with the retrieved product data
        return successResponse(res, product, "Product retrieved successfully");
    } catch (error) {
        // Handle any unexpected errors and return an appropriate error response
        return errorResponse(res, error, error.message);
    }
};

module.exports.createProduct = async (req, res, next) => {
    const transaction = await Product.sequelize.transaction();
    try {
        const {
            name, slug, description, price, discount_price, stock_quantity, is_new,
            category_id, brand_id
        } = req.body;

        const { id: updated_by } = req.user;

        // Validate required fields
        if (!name || !slug) {
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

        // Check if category and brand exist
        const categoryExists = await Category.findByPk(category_id);
        if (!categoryExists) {
            return errorResponse(res, { message: "Invalid category ID" }, "Invalid category ID", 400);
        }

        const brandExists = await Brand.findByPk(brand_id);
        if (!brandExists) {
            return errorResponse(res, { message: "Invalid brand ID" }, "Invalid brand ID", 400);
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

        // Check for duplicate slug (case-insensitive)
        const existingProductSlug = await Product.findOne({
            where: {
                slug: cleanSlug
            }
        });

        if (existingProductSlug) {
            return errorResponse(
                res, 
                { 
                    message: "Product with this slug already exists",
                    existing_product: {
                        id: existingProductSlug.id,
                        slug: existingProductSlug.slug
                    }
                }, 
                "Duplicate product slug", 
                400
            );
        }

        // Validate price and discount_price
        const numericPrice = price ? parseFloat(price) : null;
        const numericDiscountPrice = discount_price ? parseFloat(discount_price) : null;

        if (numericPrice && numericPrice !== null && (isNaN(numericPrice) || numericPrice <= 0)) {
            return errorResponse(
                res, 
                { message: "Invalid price value" }, 
                "Invalid price", 
                400
            );
        }

        if (numericDiscountPrice && numericDiscountPrice !== null) {
            if (isNaN(numericDiscountPrice) || numericDiscountPrice <= 0) {
                return errorResponse(
                    res, 
                    { message: "Invalid discount price value" }, 
                    "Invalid discount price", 
                    400
                );
            }

            if (numericPrice !== null && numericDiscountPrice >= numericPrice) {
                return errorResponse(
                    res, 
                    { message: "Discount price must be less than regular price" }, 
                    "Invalid discount price", 
                    400
                );
            }
        }

        // Create the product record
        const product = await Product.create(
            {
                name: cleanName,
                slug: cleanSlug,
                description,
                price: numericPrice ? numericPrice.toFixed(2) : null,
                discount_price: numericDiscountPrice ? numericDiscountPrice.toFixed(2) : null,
                stock_quantity,
                is_new,
                category_id,
                brand_id,
                updated_by
            },
            { transaction }
        );

        await transaction.commit();

        // Fetch and return the created product with related models
        const newProduct = await Product.findByPk(product.id, {
            include: [
                { 
                    model: Category, 
                    as: "Category",
                    attributes: ['id', 'name', 'slug']
                },
                { 
                    model: Brand, 
                    as: "Brand",
                    attributes: ['id', 'name', 'slug']
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
        console.log(error);
        await transaction.rollback();
        logger.error('Create Product Error:', {
            error: error.message,
            stack: error.stack,
            body: req.body
        });
        return errorResponse(res, error, "Error creating product");
    }
};

module.exports.updateProduct = async (req, res, next) => {
    const transaction = await Product.sequelize.transaction();
    try {
        const { id } = req.params;
        const {
            name, slug, description, price, discount_price, stock_quantity, is_new,
            category_id, brand_id, flavour_ids, product_images
        } = req.body;

        const { id: updated_by } = req.user;

        // Find the existing product
        const product = await Product.findByPk(id, { transaction });
        if (!product) {
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

        // Check for duplicate slug if slug is being updated
        if (cleanSlug && cleanSlug !== product.slug) {
            const existingProductSlug = await Product.findOne({
                where: {
                    slug: cleanSlug,
                    id: { [Op.ne]: id }
                },
                transaction
            });

            if (existingProductSlug) {
                return errorResponse(
                    res, 
                    { 
                        message: "Product with this slug already exists",
                        existing_product: {
                            id: existingProductSlug.id,
                            slug: existingProductSlug.slug
                        }
                    }, 
                    "Duplicate product slug", 
                    400
                );
            }
        }

        // Validate category if provided
        if (category_id) {
            const categoryExists = await Category.findByPk(category_id);
            if (!categoryExists) {
                return errorResponse(res, { message: "Invalid category ID" }, "Invalid category ID", 400);
            }
        }

        // Validate brand if provided
        if (brand_id) {
            const brandExists = await Brand.findByPk(brand_id);
            if (!brandExists) {
                return errorResponse(res, { message: "Invalid brand ID" }, "Invalid brand ID", 400);
            }
        }

        // Validate and parse prices if provided
        let numericPrice = price !== undefined ? parseFloat(price) : product.price;
        let numericDiscountPrice = discount_price !== undefined ? 
            (discount_price ? parseFloat(discount_price) : null) : 
            product.discount_price;

        // Validate price only if provided
        if (price && price !== undefined) {
            if (isNaN(numericPrice) || numericPrice < 0) {
                return errorResponse(
                    res, 
                    { message: "Invalid price value" }, 
                    "Invalid price", 
                    400
                );
            }
        }

        // Validate discount price only if provided
        if (discount_price && discount_price !== undefined) {
            if (numericDiscountPrice !== null && (isNaN(numericDiscountPrice) || numericDiscountPrice < 0)) {
                return errorResponse(
                    res, 
                    { message: "Invalid discount price value" }, 
                    "Invalid discount price", 
                    400
                );
            }

            if (numericDiscountPrice !== null && numericDiscountPrice >= numericPrice) {
                return errorResponse(
                    res, 
                    { message: "Discount price must be less than regular price" }, 
                    "Invalid discount price", 
                    400
                );
            }
        }

        // Prepare update fields
        const updatedFields = {
            ...(cleanName && { name: cleanName }),
            ...(cleanSlug && { slug: cleanSlug }),
            ...(description && { description: description.trim() }),
            ...(price !== undefined && { price: numericPrice.toFixed(2) }),
            ...(discount_price !== undefined && { discount_price: numericDiscountPrice ? numericDiscountPrice.toFixed(2) : null }),
            ...(stock_quantity !== undefined && { stock_quantity }),
            ...(is_new !== undefined && { is_new }),
            ...(category_id && { category_id }),
            ...(brand_id && { brand_id }),
            updated_by
        };

        // Update only if there are changes
        if (Object.keys(updatedFields).length > 0) {
            await product.update(updatedFields, { transaction });
        }

        // Fetch the updated product with related models
        const updatedProduct = await Product.findByPk(id, {
            include: [
                { 
                    model: Category, 
                    as: "Category",
                    attributes: ['id', 'name', 'slug']
                },
                { 
                    model: Brand, 
                    as: "Brand",
                    attributes: ['id', 'name', 'slug']
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
    try {
        const { id } = req.params;

        // Find the product by ID
        const product = await Product.findByPk(id);

        // Check if the product exists
        if (!product) {
            return errorResponse(res, { message: "Product not found" }, "Product not found", 404);
        }

        // Perform a soft delete (if soft delete is enabled in the model)
        await product.destroy();

        logger.info(`Product ID ${id} deleted successfully`);

        return successResponse(res, { message: "Product deleted successfully" });
    } catch (error) {
        logger.error(error);

        return errorResponse(res, error, error.message);
    }
};

module.exports.restoreProduct = async (req, res, next) => {
    try {
        const { id } = req.params;

        // Find the product, including soft-deleted ones
        const product = await Product.findOne({
            where: { id },
            paranoid: false 
        });

        // Check if the product exists
        if (!product) {
            return errorResponse(res, { message: "Product not found" }, "Product not found", 404);
        }

        // Check if the product is already active
        if (!product.deletedAt) {
            return errorResponse(res, { message: "Product is not deleted" }, "Product is not deleted", 400);
        }

        await product.restore();

        logger.info(`Product ID ${id} restored successfully`);

        return successResponse(res, { message: "Product restored successfully" });
    } catch (error) {
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

        await ProductImage.bulkCreate(imageRecords, { transaction });

        await transaction.commit();

        return successResponse(res, {
            message: "Images uploaded and associated successfully",
            images: uploadedImages.map(({ Location, Key }) => ({
                url: Location,
                key: Key
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



