const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { ShopByCategory, Category, sequelize } = require("../../../../models");
const { Op, Sequelize } = require("sequelize");
const { uploadFiletToS3 } = require("../../../../library/s3/s3Helper");
const path = require("path");

/**
 * Get the next available order number
 */
const getNextOrder = async () => {
    const maxOrder = await ShopByCategory.max('order');
    return (maxOrder || 0) + 1;
};

/**
 * Validate order doesn't conflict with existing records
 */
const validateOrder = async (order, currentOrder, excludeId = null) => {
    if (order !== undefined && order !== currentOrder) {
        const whereCondition = { order };
        if (excludeId) {
            whereCondition.id = { [Op.ne]: excludeId };
        }
        const existing = await ShopByCategory.findOne({ where: whereCondition });
        if (existing) {
            const error = new Error("Order already exists");
            error.statusCode = 400;
            throw error;
        }
    }
};

/**
 * Retrieves all shop by categories with pagination, search, and sorting.
 */
module.exports.listShopByCategories = async (req, res, next) => {
    try {
        let { page = 1, limit = 10, search, deleted = "false", sortBy = "order", sortOrder = "ASC" } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        // Validate sort parameters
        const allowedSortFields = ["id", "category_id", "image_url", "status", "order", "createdAt", "updatedAt"];
        sortBy = allowedSortFields.includes(sortBy) ? sortBy : "order";
        sortOrder = ["ASC", "DESC"].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : "ASC";

        const whereCondition = {};
        
        if (search) {
            whereCondition[Op.or] = [
                { image_url: { [Op.like]: `%${search}%` } }
            ];
        }

        whereCondition.deletedAt = deleted === "true" ? { [Op.ne]: null } : null;

        const { count, rows: shopByCategories } = await ShopByCategory.findAndCountAll({
            where: whereCondition,
            limit,
            offset,
            order: [[sortBy, sortOrder]],
            paranoid: false,
            include: [{
                model: Category,
                as: 'category',
                attributes: ['id', 'name', 'slug', 'description', 'logo_url']
            }]
        });

        return successResponse(res, {
            total: count,
            page,
            limit,
            sortBy,
            sortOrder,
            shopByCategories
        }, "Shop by categories retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Upload single image to S3 for Shop By Category (original only)
 */
const uploadShopByCategoryImage = async (file) => {
    if (!file || !file.buffer) {
        const error = new Error("Uploaded image is empty or corrupted");
        error.statusCode = 400;
        throw error;
    }

    const fileExtension = path.extname(file.originalname) || '.jpg';
    const baseFileName = path.basename(file.originalname, fileExtension);
    const s3Key = `shop-by-category/${baseFileName}-${Date.now()}${fileExtension}`;

    const imageUrl = await uploadFiletToS3({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype
    }).then(response => response.Location);

    return imageUrl;
};

/**
 * Retrieves a single shop by category by ID.
 */
module.exports.getShopByCategoryById = async (req, res, next) => {
    try {
        const shopByCategory = await ShopByCategory.findByPk(req.params.id, {
            include: [{
                model: Category,
                as: 'category',
                attributes: ['id', 'name', 'slug', 'description', 'logo_url']
            }],
            paranoid: false
        });

        if (!shopByCategory) {
            return errorResponse(res, { message: "Shop by category not found" }, "Shop by category not found", 404);
        }

        return successResponse(res, shopByCategory, "Shop by category retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Creates a new shop by category.
 */
module.exports.createShopByCategory = async (req, res, next) => {
    let t;
    try {
        const { category_id, status = true, order } = req.body;

        // Check if category_id already exists (unique constraint)
        const existing = await ShopByCategory.findOne({
            where: { category_id },
            paranoid: false
        });
        if (existing) {
            return errorResponse(res, { message: "Category ID already exists" }, "Category ID already exists", 400);
        }

        // Verify category exists
        const category = await Category.findByPk(category_id);
        if (!category) {
            return errorResponse(res, { message: "Category not found" }, "Category not found", 404);
        }

        // Require image file similar to banner flow
        if (!req.file) {
            const error = new Error("Image file is required (field name: image)");
            error.statusCode = 400;
            throw error;
        }

        // Upload image to S3
        const finalImageUrl = await uploadShopByCategoryImage(req.file);

        // Auto-assign order if not provided
        const finalOrder = order !== undefined ? parseInt(order) : await getNextOrder();

        // Start transaction after validations and upload
        t = await sequelize.transaction();
        const shopByCategory = await ShopByCategory.create({
            category_id,
            image_url: finalImageUrl,
            status,
            order: finalOrder
        }, { transaction: t });

        await t.commit();

        // Fetch with category association
        const createdCategory = await ShopByCategory.findByPk(shopByCategory.id, {
            include: [{
                model: Category,
                as: 'category',
                attributes: ['id', 'name', 'slug', 'description', 'logo_url']
            }]
        });

        return successResponse(res, createdCategory, "Shop by category created successfully", 201);
    } catch (error) {
        if (t && !t.finished) await t.rollback();
        // Handle unique constraint violation
        if (error.name === 'SequelizeUniqueConstraintError') {
            return errorResponse(res, { message: "Category ID already exists" }, "Category ID already exists", 400);
        }
        return errorResponse(res, error, error.message);
    }
};

/**
 * Updates an existing shop by category.
 */
module.exports.updateShopByCategory = async (req, res, next) => {
    let t;
    try {
        const { id } = req.params;
        const { category_id, image_url, status, order } = req.body;

        const shopByCategory = await ShopByCategory.findByPk(id, { paranoid: false });
        if (!shopByCategory) {
            return errorResponse(res, { message: "Shop by category not found" }, "Shop by category not found", 404);
        }

        // Check if category_id is being changed and if it already exists
        if (category_id && category_id !== shopByCategory.category_id) {
            const existing = await ShopByCategory.findOne({
                where: { 
                    category_id,
                    id: { [Op.ne]: id }
                },
                paranoid: false
            });
            if (existing) {
                return errorResponse(res, { message: "Category ID already exists" }, "Category ID already exists", 400);
            }

            // Verify category exists
            const category = await Category.findByPk(category_id);
            if (!category) {
                return errorResponse(res, { message: "Category not found" }, "Category not found", 404);
            }
        }

        // Validate order if being updated
        if (order !== undefined && order !== shopByCategory.order) {
            await validateOrder(order, shopByCategory.order, id);
        }

        const updateData = {};
        if (category_id !== undefined) updateData.category_id = category_id;
        if (req.file) {
            updateData.image_url = await uploadShopByCategoryImage(req.file);
        } else if (image_url !== undefined) {
            updateData.image_url = image_url.trim();
        }
        if (status !== undefined) updateData.status = status;
        if (order !== undefined) updateData.order = parseInt(order);

        // Start transaction for update
        t = await sequelize.transaction();
        await shopByCategory.update(updateData, { transaction: t });
        await t.commit();

        // Fetch updated record with category
        const updatedCategory = await ShopByCategory.findByPk(id, {
            include: [{
                model: Category,
                as: 'category',
                attributes: ['id', 'name', 'slug', 'description', 'logo_url']
            }]
        });

        return successResponse(res, updatedCategory, "Shop by category updated successfully");
    } catch (error) {
        if (t && !t.finished) await t.rollback();
        if (error.name === 'SequelizeUniqueConstraintError') {
            return errorResponse(res, { message: "Category ID already exists" }, "Category ID already exists", 400);
        }
        return errorResponse(res, error, error.message);
    }
};

/**
 * Deletes a shop by category (soft delete).
 */
module.exports.deleteShopByCategory = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const shopByCategory = await ShopByCategory.findByPk(req.params.id);
        if (!shopByCategory) {
            await t.rollback();
            return errorResponse(res, { message: "Shop by category not found" }, "Shop by category not found", 404);
        }

        // Update orders of items after the deleted item
        await ShopByCategory.update(
            { 
                order: Sequelize.literal('`order` - 1')
            },
            { 
                where: {
                    order: { [Op.gt]: shopByCategory.order }
                },
                transaction: t
            }
        );

        // Soft delete the shop by category
        await shopByCategory.destroy({ transaction: t });
        await t.commit();

        return successResponse(res, null, "Shop by category deleted successfully");
    } catch (error) {
        await t.rollback();
        return errorResponse(res, error, error.message);
    }
};

/**
 * Restores a soft-deleted shop by category.
 */
module.exports.restoreShopByCategory = async (req, res, next) => {
    try {
        const shopByCategory = await ShopByCategory.findByPk(req.params.id, { paranoid: false });
        if (!shopByCategory) {
            return errorResponse(res, { message: "Shop by category not found" }, "Shop by category not found", 404);
        }

        if (!shopByCategory.deletedAt) {
            return errorResponse(res, { message: "Shop by category is not deleted" }, "Shop by category is not deleted", 400);
        }

        await shopByCategory.restore();

        const restoredCategory = await ShopByCategory.findByPk(req.params.id, {
            include: [{
                model: Category,
                as: 'category',
                attributes: ['id', 'name', 'slug', 'description', 'logo_url']
            }]
        });

        return successResponse(res, restoredCategory, "Shop by category restored successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Bulk soft-deletes shop by categories by IDs.
 */
module.exports.bulkDeleteShopByCategories = async (req, res, next) => {
    try {
        const { ids } = req.body;

        const deletedShopByCategories = [];
        const notDeletedShopByCategories = [];

        // Fetch existing records for given ids ordered by current order
        const shopByCategoriesToDelete = await ShopByCategory.findAll({
            where: { id: { [Op.in]: ids } },
            order: [['order', 'ASC']]
        });

        for (const shopByCategory of shopByCategoriesToDelete) {
            const t = await sequelize.transaction();
            try {
                // Update orders of items after the deleted item
                await ShopByCategory.update(
                    { 
                        order: Sequelize.literal('`order` - 1')
                    },
                    { 
                        where: {
                            order: { [Op.gt]: shopByCategory.order }
                        },
                        transaction: t
                    }
                );

                // Soft delete the shop by category
                await shopByCategory.destroy({ transaction: t });
                await t.commit();

                deletedShopByCategories.push({
                    id: shopByCategory.id,
                    category_id: shopByCategory.category_id,
                    order: shopByCategory.order
                });
            } catch (error) {
                await t.rollback();
                notDeletedShopByCategories.push({
                    id: shopByCategory.id,
                    category_id: shopByCategory.category_id,
                    reason: error.message || 'Failed to delete shop by category'
                });
            }
        }

        // Handle IDs not found
        const foundIds = shopByCategoriesToDelete.map(sbc => sbc.id);
        const notFoundIds = ids.filter(id => !foundIds.includes(Number(id)));
        notFoundIds.forEach(id => {
            notDeletedShopByCategories.push({
                id: Number(id),
                reason: 'Shop by category not found'
            });
        });

        const summary = {
            total_requested: ids.length,
            deleted_count: deletedShopByCategories.length,
            not_deleted_count: notDeletedShopByCategories.length
        };

        if (deletedShopByCategories.length === 0) {
            return errorResponse(res, {
                deleted: deletedShopByCategories,
                not_deleted: notDeletedShopByCategories,
                summary
            }, 'No shop by categories were deleted', 400);
        }

        return successResponse(res, {
            deleted: deletedShopByCategories,
            not_deleted: notDeletedShopByCategories,
            summary
        }, `Successfully deleted ${deletedShopByCategories.length} shop by category(ies)`);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Bulk restores soft-deleted shop by categories by IDs.
 */
module.exports.bulkRestoreShopByCategories = async (req, res, next) => {
    try {
        const { ids } = req.body;

        const restoredShopByCategories = [];
        const notRestoredShopByCategories = [];

        for (const rawId of ids) {
            const id = Number(rawId);
            try {
                // Find including soft-deleted
                const shopByCategory = await ShopByCategory.findOne({
                    where: { id },
                    paranoid: false
                });

                if (!shopByCategory) {
                    notRestoredShopByCategories.push({
                        id,
                        reason: 'Shop by category not found'
                    });
                    continue;
                }

                // Already active
                if (!shopByCategory.deletedAt) {
                    notRestoredShopByCategories.push({
                        id,
                        category_id: shopByCategory.category_id,
                        reason: 'Shop by category is already active (not deleted)'
                    });
                    continue;
                }

                // Restore
                await shopByCategory.restore();

                // Assign to end of list
                const maxOrder = await ShopByCategory.max('order');
                await shopByCategory.update({ order: (maxOrder || 0) + 1 });

                restoredShopByCategories.push({
                    id: shopByCategory.id,
                    category_id: shopByCategory.category_id,
                    order: shopByCategory.order
                });
            } catch (error) {
                notRestoredShopByCategories.push({
                    id,
                    reason: error.message || 'Failed to restore shop by category'
                });
            }
        }

        const summary = {
            total_requested: ids.length,
            restored_count: restoredShopByCategories.length,
            not_restored_count: notRestoredShopByCategories.length
        };

        if (restoredShopByCategories.length === 0) {
            return errorResponse(res, {
                restored: restoredShopByCategories,
                not_restored: notRestoredShopByCategories,
                summary
            }, 'No shop by categories were restored', 400);
        }

        return successResponse(res, {
            restored: restoredShopByCategories,
            not_restored: notRestoredShopByCategories,
            summary
        }, `Successfully restored ${restoredShopByCategories.length} shop by category(ies)`);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

