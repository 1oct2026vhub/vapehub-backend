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
                model: ProductVariant, 
                as: 'variants',
                required: false // LEFT JOIN - This ensures products without variants are included
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

        const { id: updated_by } = req.user; // Authenticated user ID

        // Check if product already exists (case-insensitive slug check)
        const existingProduct = await Product.findOne({ where: { slug: slug.toLowerCase() } });
        if (existingProduct) {
            await transaction.rollback(); // Ensure rollback before throwing error
            return errorResponse(res, { message: "Product already exists" }, "Product already exists", 400);
        }

        // Create the product record
        const product = await Product.create(
            {
                name, slug: slug.toLowerCase(), description, price, discount_price, stock_quantity, is_new,
                category_id, brand_id, updated_by
            },
            { transaction }
        );

        // Commit the transaction after all inserts succeed
        await transaction.commit();

        // Fetch and return the created product with related models
        const newProduct = await Product.findByPk(product.id, {
            include: [
                { model: Category, as: "Category" },
                { model: Brand, as: "Brand" },
                { model: ProductImage, as: "ProductImages" },
                {
                    model: Flavor,
                    as: "Flavors",
                    through: { model: ProductFlavor }
                }
            ]
        });

        return successResponse(res, newProduct, "Product created successfully", 201);
    } catch (error) {
        await transaction.rollback(); // Rollback transaction on failure
        logger.error(error);
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

        const { id: updated_by } = req.user; // Authenticated user ID

        // Find the existing product
        const product = await Product.findByPk(id, { transaction });
        if (!product) {
            await transaction.rollback();
            return errorResponse(res, { message: "Product not found" }, "Product not found", 404);
        }

        // Ensure slug uniqueness (case-insensitive check)
        if (slug && slug.toLowerCase() !== product.slug) {
            const existingProduct = await Product.findOne({
                where: { slug: slug.toLowerCase(), id: { [Op.ne]: id } }
            });
            if (existingProduct) {
                await transaction.rollback();
                return errorResponse(res, { message: "Product with this slug already exists" }, "Duplicate slug", 400);
            }
        }

        // Update product fields dynamically
        const updatedFields = {
            ...(name && { name }),
            ...(slug && { slug: slug.toLowerCase() }),
            ...(description && { description }),
            ...(price && { price }),
            ...(discount_price && { discount_price }),
            ...(stock_quantity && { stock_quantity }),
            ...(is_new !== undefined && { is_new }),
            ...(category_id && { category_id }),
            ...(brand_id && { brand_id }),
            updated_by
        };

        await product.update(updatedFields, { transaction });

        // Commit the transaction after all updates
        await transaction.commit();

        // Fetch the updated product with related models
        const updatedProduct = await Product.findByPk(id, {
            include: [
                { model: Category, as: "Category" },
                { model: Brand, as: "Brand" },
                { model: ProductImage, as: "ProductImages" },
                {
                    model: Flavor,
                    as: "Flavors",
                    through: { model: ProductFlavor }
                }
            ]
        });

        return successResponse(res, updatedProduct, "Product updated successfully");
    } catch (error) {
        await transaction.rollback(); // Rollback in case of failure
        logger.error(error);
        return errorResponse(res, error, error.message);
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



