const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Product, Category, Brand, ProductImage, ProductAttributeTerm, Attribute, AttributeTerm, ProductVariant, ProductVariantImage, ProductVariantAttribute, SlugRelation } = require("../../../../models");
const { Sequelize, Op } = require("sequelize");
const logger = require("../../../../library/logger");
const AWS = require("aws-sdk");
const { uploadFiletToS3, generateUniqueFileName } = require("../../../../library/s3/s3Helper");
const ExcelJS = require("exceljs");
const SlugManager = require("../../../../utils/slugManager");

const slugManager = new SlugManager(SlugRelation);

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
        if (deleted !== undefined && (deleted === "true" || deleted === true)) {
            whereClause.deletedAt = { [Op.ne]: null }
        }
        console.log(whereClause);
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
            distinct: true,
            paranoid: deleted === "true" || deleted === true ? false : true // Include soft-deleted records if requested
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
            offset: parsedOffset,
            paranoid: !(deleted === "true" || deleted === true)
        });

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

        // Check if category and brand exist
        const categoryExists = await Category.findByPk(category_id);
        if (!categoryExists) {
            await transaction.rollback();
            return errorResponse(res, { message: "Invalid category ID" }, "Invalid category ID", 400);
        }

        const brandExists = await Brand.findByPk(brand_id);
        if (!brandExists) {
            await transaction.rollback();
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
                price: price ? parseFloat(price).toFixed(2) : null,
                discount_price: discount_price ? parseFloat(discount_price).toFixed(2) : null,
                stock_quantity,
                is_new,
                category_id,
                brand_id,
                updated_by
            },
            { transaction }
        );

        // Create slug relation
        await slugManager.createOrUpdateSlug(cleanSlug, 'product', product.id, transaction);

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
        await transaction.rollback();
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
            name, slug, description, price, discount_price, stock_quantity, is_new,
            category_id, brand_id, flavour_ids, product_images
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

        // Validate category if provided
        if (category_id) {
            const categoryExists = await Category.findByPk(category_id);
            if (!categoryExists) {
                await transaction.rollback();
                return errorResponse(res, { message: "Invalid category ID" }, "Invalid category ID", 400);
            }
        }

        // Validate brand if provided
        if (brand_id) {
            const brandExists = await Brand.findByPk(brand_id);
            if (!brandExists) {
                await transaction.rollback();
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
                await transaction.rollback();
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
                await transaction.rollback();
                return errorResponse(
                    res, 
                    { message: "Invalid discount price value" }, 
                    "Invalid discount price", 
                    400
                );
            }

            if (numericDiscountPrice !== null && numericDiscountPrice >= numericPrice) {
                await transaction.rollback();
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

        // Update slug if provided and changed
        if (cleanSlug && cleanSlug !== product.slug) {
            await slugManager.createOrUpdateSlug(cleanSlug, 'product', id, transaction);
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
        const promises = [];

        // Process Products Sheet
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
                    is_new,
                    brand_slug,
                    category_slug
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

                promises.push(processProductRow({
                    id, name, slug, description, is_new, 
                    brand_slug, category_slug, updated_by, 
                    results
                }));
            }
        }

        // Process Attributes Sheet
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

                promises.push(processAttributeRow({
                    product_slug,
                    attribute_slug,
                    term_slugs,
                    is_visible_page,
                    used_in_variation,
                    updated_by,
                    results
                }));
            }
        }

        // Wait for all promises to resolve
        await Promise.all(promises);

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
const processProductRow = async ({ id, name, slug, description, is_new, brand_slug, category_slug, updated_by, results }) => {
    try {
        // Find brand if brand_slug exists
        let brand = null;
        if (brand_slug) {
            brand = await Brand.findOne({ where: { slug: brand_slug } });
            if (!brand) throw new Error(`Brand with slug ${brand_slug} not found`);
        }

        // Find category if category_slug exists
        let category = null;
        if (category_slug) {
            category = await Category.findOne({ where: { slug: category_slug } });
            if (!category) throw new Error(`Category with slug ${category_slug} not found`);
        }

        const productData = {
            name: typeof name === 'string' ? name.trim() : name,
            slug: typeof slug === 'string' ? slug.trim() : slug,
            description: typeof description === 'string' ? description.trim() : description,
            is_new: is_new === 'true' || is_new === true,
            brand_id: brand?.id,
            category_id: category?.id,
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

        // Remove existing attribute terms for this product-attribute combination
        await ProductAttributeTerm.destroy({
            where: {
                product_id: product.id,
                attribute_id: attribute.id
            }
        });

        // Create new attribute terms
        await Promise.all(terms.map(term => 
            ProductAttributeTerm.create({
                product_id: product.id,
                attribute_id: attribute.id,
                term_id: term.id,
                is_visible_page: is_visible_page === 'true' || is_visible_page === true,
                used_in_variation: used_in_variation === 'true' || used_in_variation === true,
                updated_by
            })
        ));

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
            { header: 'Is New', key: 'is_new', width: 10 },
            { header: 'Brand Slug', key: 'brand_slug', width: 20 },
            { header: 'Category Slug', key: 'category_slug', width: 20 }
        ];

        // Add sample product data
        productSheet.addRow({
            id: '', // Empty for new product
            name: 'Sample Product',
            slug: 'sample-product',
            description: 'This is a sample product description',
            is_new: true,
            brand_slug: 'sample-brand',
            category_slug: 'sample-category'
        });

        productSheet.addRow({
            id: '1', // For updating existing product
            name: 'Existing Product',
            slug: 'existing-product',
            description: 'This is an existing product',
            is_new: false,
            brand_slug: 'existing-brand',
            category_slug: 'existing-category'
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



