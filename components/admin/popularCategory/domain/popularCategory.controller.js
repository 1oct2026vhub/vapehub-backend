const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { PopularCategory, Category, sequelize } = require("../../../../models");
const { Op, Sequelize } = require("sequelize");

/**
 * Get the next available order number
 */
const getNextOrder = async () => {
    const maxOrder = await PopularCategory.max('order');
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
        const existing = await PopularCategory.findOne({ where: whereCondition });
        if (existing) {
            const error = new Error("Order already exists");
            error.statusCode = 400;
            throw error;
        }
    }
};

/**
 * Retrieves all popular categories with pagination, search, and sorting.
 */
module.exports.listPopularCategories = async (req, res, next) => {
    try {
        let { page = 1, limit = 10, search, deleted = "false", sortBy = "order", sortOrder = "ASC" } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        // Validate sort parameters
        const allowedSortFields = ["id", "title", "description", "status", "order", "createdAt", "updatedAt"];
        sortBy = allowedSortFields.includes(sortBy) ? sortBy : "order";
        sortOrder = ["ASC", "DESC"].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : "ASC";

        const whereCondition = {};
        
        if (search) {
            whereCondition[Op.or] = [
                { title: { [Op.like]: `%${search}%` } },
                { description: { [Op.like]: `%${search}%` } }
            ];
        }

        whereCondition.deletedAt = deleted === "true" ? { [Op.ne]: null } : null;

        const { count, rows: popularCategories } = await PopularCategory.findAndCountAll({
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
            popularCategories
        }, "Popular categories retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Retrieves a single popular category by ID.
 */
module.exports.getPopularCategoryById = async (req, res, next) => {
    try {
        const popularCategory = await PopularCategory.findByPk(req.params.id, {
            include: [{
                model: Category,
                as: 'category',
                attributes: ['id', 'name', 'slug', 'description', 'logo_url']
            }],
            paranoid: false
        });

        if (!popularCategory) {
            return errorResponse(res, { message: "Popular category not found" }, "Popular category not found", 404);
        }

        return successResponse(res, popularCategory, "Popular category retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Creates a new popular category.
 */
module.exports.createPopularCategory = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { category_id, title, description, status = true, order } = req.body;

        // Verify category exists
        const category = await Category.findByPk(category_id);
        if (!category) {
            await t.rollback();
            return errorResponse(res, { message: "Category not found" }, "Category not found", 404);
        }

        // Auto-assign order if not provided
        const finalOrder = order !== undefined ? parseInt(order) : await getNextOrder();

        const popularCategory = await PopularCategory.create({
            category_id,
            title: title.trim(),
            description: description?.trim() || null,
            status,
            order: finalOrder
        }, { transaction: t });

        await t.commit();

        // Fetch with category association
        const createdCategory = await PopularCategory.findByPk(popularCategory.id, {
            include: [{
                model: Category,
                as: 'category',
                attributes: ['id', 'name', 'slug', 'description', 'logo_url']
            }]
        });

        return successResponse(res, createdCategory, "Popular category created successfully", 201);
    } catch (error) {
        await t.rollback();
        return errorResponse(res, error, error.message);
    }
};

/**
 * Updates an existing popular category.
 */
module.exports.updatePopularCategory = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { category_id, title, description, status, order } = req.body;

        const popularCategory = await PopularCategory.findByPk(id, { paranoid: false });
        if (!popularCategory) {
            await t.rollback();
            return errorResponse(res, { message: "Popular category not found" }, "Popular category not found", 404);
        }

        // Verify category exists if category_id is being updated
        if (category_id && category_id !== popularCategory.category_id) {
            const category = await Category.findByPk(category_id);
            if (!category) {
                await t.rollback();
                return errorResponse(res, { message: "Category not found" }, "Category not found", 404);
            }
        }

        // Validate order if being updated
        if (order !== undefined && order !== popularCategory.order) {
            await validateOrder(order, popularCategory.order, id);
        }

        const updateData = {};
        if (category_id !== undefined) updateData.category_id = category_id;
        if (title !== undefined) updateData.title = title.trim();
        if (description !== undefined) updateData.description = description?.trim() || null;
        if (status !== undefined) updateData.status = status;
        if (order !== undefined) updateData.order = parseInt(order);

        await popularCategory.update(updateData, { transaction: t });
        await t.commit();

        // Fetch updated record with category
        const updatedCategory = await PopularCategory.findByPk(id, {
            include: [{
                model: Category,
                as: 'category',
                attributes: ['id', 'name', 'slug', 'description', 'logo_url']
            }]
        });

        return successResponse(res, updatedCategory, "Popular category updated successfully");
    } catch (error) {
        await t.rollback();
        return errorResponse(res, error, error.message);
    }
};

/**
 * Deletes a popular category (soft delete).
 */
module.exports.deletePopularCategory = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const popularCategory = await PopularCategory.findByPk(req.params.id);
        if (!popularCategory) {
            await t.rollback();
            return errorResponse(res, { message: "Popular category not found" }, "Popular category not found", 404);
        }

        // Update orders of items after the deleted item
        await PopularCategory.update(
            { 
                order: Sequelize.literal('`order` - 1')
            },
            { 
                where: {
                    order: { [Op.gt]: popularCategory.order }
                },
                transaction: t
            }
        );

        // Soft delete the popular category
        await popularCategory.destroy({ transaction: t });
        await t.commit();

        return successResponse(res, null, "Popular category deleted successfully");
    } catch (error) {
        await t.rollback();
        return errorResponse(res, error, error.message);
    }
};

/**
 * Restores a soft-deleted popular category.
 */
module.exports.restorePopularCategory = async (req, res, next) => {
    try {
        const popularCategory = await PopularCategory.findByPk(req.params.id, { paranoid: false });
        if (!popularCategory) {
            return errorResponse(res, { message: "Popular category not found" }, "Popular category not found", 404);
        }

        if (!popularCategory.deletedAt) {
            return errorResponse(res, { message: "Popular category is not deleted" }, "Popular category is not deleted", 400);
        }

        await popularCategory.restore();

        const restoredCategory = await PopularCategory.findByPk(req.params.id, {
            include: [{
                model: Category,
                as: 'category',
                attributes: ['id', 'name', 'slug', 'description', 'logo_url']
            }]
        });

        return successResponse(res, restoredCategory, "Popular category restored successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Shuffle/reorder popular category
 */
module.exports.shuffleOrder = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { new_order } = req.body;

        if (new_order === undefined) {
            await t.rollback();
            return errorResponse(res, { message: "new_order is required" }, "new_order is required", 400);
        }

        const currentPopularCategory = await PopularCategory.findByPk(id);
        if (!currentPopularCategory) {
            await t.rollback();
            return errorResponse(res, { message: "Popular category not found" }, "Popular category not found", 404);
        }

        if (currentPopularCategory.order < new_order) {
            // Moving down: Decrease order of items between old and new position
            await PopularCategory.update(
                { 
                    order: Sequelize.literal('`order` - 1')
                },
                { 
                    where: {
                        order: {
                            [Op.gt]: currentPopularCategory.order,
                            [Op.lte]: new_order
                        }
                    },
                    transaction: t
                }
            );
        } else if (currentPopularCategory.order > new_order) {
            // Moving up: Increase order of items between new and old position
            await PopularCategory.update(
                { 
                    order: Sequelize.literal('`order` + 1')
                },
                { 
                    where: {
                        order: {
                            [Op.gte]: new_order,
                            [Op.lt]: currentPopularCategory.order
                        }
                    },
                    transaction: t
                }
            );
        }

        // Update current popular category's order
        await currentPopularCategory.update(
            { 
                order: parseInt(new_order)
            },
            { transaction: t }
        );

        await t.commit();

        // Fetch updated record with category
        const updatedCategory = await PopularCategory.findByPk(id, {
            include: [{
                model: Category,
                as: 'category',
                attributes: ['id', 'name', 'slug', 'description', 'logo_url']
            }]
        });

        return successResponse(res, updatedCategory, "Order updated successfully");
    } catch (error) {
        await t.rollback();
        return errorResponse(res, error, error.message);
    }
};

/**
 * Bulk soft-deletes popular categories by IDs.
 */
module.exports.bulkDeletePopularCategories = async (req, res, next) => {
    try {
        const { ids } = req.body;

        const deletedPopularCategories = [];
        const notDeletedPopularCategories = [];

        // Fetch existing records for given ids ordered by current order
        const popularCategoriesToDelete = await PopularCategory.findAll({
            where: { id: { [Op.in]: ids } },
            order: [['order', 'ASC']]
        });

        for (const popularCategory of popularCategoriesToDelete) {
            const t = await sequelize.transaction();
            try {
                // Update orders of items after the deleted item
                await PopularCategory.update(
                    { 
                        order: Sequelize.literal('`order` - 1')
                    },
                    { 
                        where: {
                            order: { [Op.gt]: popularCategory.order }
                        },
                        transaction: t
                    }
                );

                // Soft delete the popular category
                await popularCategory.destroy({ transaction: t });
                await t.commit();

                deletedPopularCategories.push({
                    id: popularCategory.id,
                    title: popularCategory.title,
                    order: popularCategory.order
                });
            } catch (error) {
                await t.rollback();
                notDeletedPopularCategories.push({
                    id: popularCategory.id,
                    title: popularCategory.title,
                    reason: error.message || 'Failed to delete popular category'
                });
            }
        }

        // Handle IDs not found
        const foundIds = popularCategoriesToDelete.map(pc => pc.id);
        const notFoundIds = ids.filter(id => !foundIds.includes(Number(id)));
        notFoundIds.forEach(id => {
            notDeletedPopularCategories.push({
                id: Number(id),
                reason: 'Popular category not found'
            });
        });

        const summary = {
            total_requested: ids.length,
            deleted_count: deletedPopularCategories.length,
            not_deleted_count: notDeletedPopularCategories.length
        };

        if (deletedPopularCategories.length === 0) {
            return errorResponse(res, {
                deleted: deletedPopularCategories,
                not_deleted: notDeletedPopularCategories,
                summary
            }, 'No popular categories were deleted', 400);
        }

        return successResponse(res, {
            deleted: deletedPopularCategories,
            not_deleted: notDeletedPopularCategories,
            summary
        }, `Successfully deleted ${deletedPopularCategories.length} popular category(ies)`);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Bulk restores soft-deleted popular categories by IDs.
 */
module.exports.bulkRestorePopularCategories = async (req, res, next) => {
    try {
        const { ids } = req.body;

        const restoredPopularCategories = [];
        const notRestoredPopularCategories = [];

        for (const rawId of ids) {
            const id = Number(rawId);
            try {
                // Find including soft-deleted
                const popularCategory = await PopularCategory.findOne({
                    where: { id },
                    paranoid: false
                });

                if (!popularCategory) {
                    notRestoredPopularCategories.push({
                        id,
                        reason: 'Popular category not found'
                    });
                    continue;
                }

                // Already active
                if (!popularCategory.deletedAt) {
                    notRestoredPopularCategories.push({
                        id,
                        title: popularCategory.title,
                        reason: 'Popular category is already active (not deleted)'
                    });
                    continue;
                }

                // Restore
                await popularCategory.restore();

                // Assign to end of list
                const maxOrder = await PopularCategory.max('order');
                await popularCategory.update({ order: (maxOrder || 0) + 1 });

                restoredPopularCategories.push({
                    id: popularCategory.id,
                    title: popularCategory.title,
                    order: popularCategory.order
                });
            } catch (error) {
                notRestoredPopularCategories.push({
                    id,
                    reason: error.message || 'Failed to restore popular category'
                });
            }
        }

        const summary = {
            total_requested: ids.length,
            restored_count: restoredPopularCategories.length,
            not_restored_count: notRestoredPopularCategories.length
        };

        if (restoredPopularCategories.length === 0) {
            return errorResponse(res, {
                restored: restoredPopularCategories,
                not_restored: notRestoredPopularCategories,
                summary
            }, 'No popular categories were restored', 400);
        }

        return successResponse(res, {
            restored: restoredPopularCategories,
            not_restored: notRestoredPopularCategories,
            summary
        }, `Successfully restored ${restoredPopularCategories.length} popular category(ies)`);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

