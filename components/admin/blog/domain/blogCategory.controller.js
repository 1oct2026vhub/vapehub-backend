const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { BlogCategory, SlugRelation, sequelize, Redirect } = require("../../../../models");
const { Op } = require("sequelize");
const { uploadFiletToS3, generateUniqueFileName } = require("../../../../library/s3/s3Helper");
const { invalidateCachePattern } = require("../../../../library/cache");
const SlugManager = require("../../../../utils/slugManager");
const seoService = require('../../seo/domain/seo.service');

const slugManager = new SlugManager(SlugRelation);

/**
 * Retrieves all blog categories with pagination and optional search.
 */
module.exports.listAllBlogCategories = async (req, res, next) => {
    try {
        let { page = 1, limit = 10, search, deleted = "false" } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        const whereCondition = {};
        if (search) {
            whereCondition[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { slug: { [Op.like]: `%${search}%` } },
                // { description: { [Op.like]: `%${search}%` } }
            ];
        }

        // Add deleted condition for soft delete filtering
        whereCondition.deleted_at = deleted === "true" ? { [Op.ne]: null } : null;

        const { count, rows: categories } = await BlogCategory.findAndCountAll({
            where: whereCondition,
            include: [
                {
                    model: BlogCategory,
                    as: 'parent',
                    attributes: ['id', 'name', 'slug']
                },
                {
                    model: BlogCategory,
                    as: 'children',
                    attributes: ['id', 'name', 'slug']
                }
            ],
            limit,
            offset,
            order: [["updated_at", "DESC"]],
            paranoid: false
        });

        return successResponse(res, {
            total: count,
            page,
            limit,
            categories,
        }, "Blog categories retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Retrieves a single blog category by ID (includes soft-deleted; adds redirect details when deleted).
 */
module.exports.getBlogCategoryById = async (req, res, next) => {
    try {
        const category = await BlogCategory.findByPk(req.params.id, {
            paranoid: false,
            include: [
                {
                    model: BlogCategory,
                    as: 'parent',
                    attributes: ['id', 'name', 'slug']
                },
                {
                    model: BlogCategory,
                    as: 'children',
                    attributes: ['id', 'name', 'slug']
                }
            ]
        });
        if (!category) {
            return errorResponse(res, { message: "Blog category not found" }, "Blog category not found", 404);
        }
        let responseData = category;
        if (category.deletedAt) {
            const redirect = await Redirect.findOne({
                where: { entity_type: 'blog_category', slug: category.slug, status: 'active' },
                attributes: ['sources', 'url_to', 'header_code', 'status']
            });
            if (redirect) {
                responseData = {
                    ...(category.toJSON ? category.toJSON() : category),
                    redirect: {
                        redirect_url: redirect.url_to,
                        old_path: redirect.sources,
                        header_code: redirect.header_code,
                        status: redirect.status
                    }
                };
            }
        }
        return successResponse(res, responseData, "Blog category retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Creates a new blog category.
 */
module.exports.createBlogCategory = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { name, description, status, parent_id: initialParentId, slug, show_home_page, alt_text } = req.body;
        let parent_id = initialParentId;
        const { file } = req;

        // Check if category with same name exists
        const existingCategory = await BlogCategory.findOne({
            where: { name }
        });

        if (existingCategory) {
            await t.rollback();
            return errorResponse(res, { message: "A category with this name already exists" }, "Validation error", 400);
        }

        // If parent_id is provided, verify it exists
        if (parent_id) {
            const parentCategory = await BlogCategory.findByPk(parent_id, { transaction: t });
            if (!parentCategory) {
                await t.rollback();
                return errorResponse(res, { message: "Parent category not found" }, "Validation error", 400);
            }
        }

        let image_url = null;
        if (file) {
            const { originalname, mimetype, buffer } = file;
            const { getUniqueFileNameWithPrefix } = require("../../../../library/s3/s3Helper");
            const fileName = await getUniqueFileNameWithPrefix(originalname, 'blog-categories');
            const params = {
                Bucket: process.env.AWS_S3_BUCKET,
                Key: `blog-categories/${fileName}`,
                Body: buffer,
                ContentType: mimetype
            };

            const uploadedImage = await uploadFiletToS3(params);
            if (!uploadedImage?.Location) throw new Error("File upload failed");
            image_url = uploadedImage.Location;
        }

        // Create the category
        const categoryData = {
            name,
            slug,
            description,
            image_url,
            alt_text,
            status,
            show_home_page: typeof show_home_page === "boolean" ? show_home_page : false,
            updated_by: req.user.id
        };

        // Only add parent_id if it's not null
        if (parent_id !== null) {
            categoryData.parent_id = parent_id;
        }

        const category = await BlogCategory.create(categoryData, { transaction: t });

        // Create slug relation
        await slugManager.createOrUpdateSlug(category.slug, 'blog_category', category.id, t);

        await t.commit();
        invalidateCachePattern('blogs:*').catch(() => {});
        return successResponse(res, category, "Blog category created successfully", 201);
    } catch (error) {
        await t.rollback();
        return errorResponse(res, error, error.message);
    }
};

/**
 * Updates an existing blog category.
 */
module.exports.updateBlogCategory = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { name, description, status, parent_id: initialParentId, slug, show_home_page, alt_text, redirect_url } = req.body;
        let parent_id = initialParentId;
        const { file } = req;

        const category = await BlogCategory.findByPk(id, { transaction: t, paranoid: false });
        if (!category) {
            await t.rollback();
            return errorResponse(res, { message: "Category not found" }, "Not found", 404);
        }

        // Check if name is being changed and if it's already taken
        if (name && name !== category.name) {
            const existingCategory = await BlogCategory.findOne({
                where: { name }
            });

            if (existingCategory) {
                await t.rollback();
                return errorResponse(res, { message: "A category with this name already exists" }, "Validation error", 400);
            }
        }

        // If parent_id is being changed, verify it exists and check for circular reference
        if (parent_id !== undefined && parent_id !== category.parent_id) {
            if (parent_id === id) {
                await t.rollback();
                return errorResponse(res, { message: "A category cannot be its own parent" }, "Validation error", 400);
            }

            if (parent_id) {
                const parentCategory = await BlogCategory.findByPk(parent_id, { transaction: t });
                if (!parentCategory) {
                    await t.rollback();
                    return errorResponse(res, { message: "Parent category not found" }, "Validation error", 400);
                }
            }
        }
        else {
            parent_id = category.parent_id || null;
        }

        // Update slug if name has changed
        if (slug) {
            await slugManager.createOrUpdateSlug(slug, 'blog_category', category.id, t);
        }

        let image_url = category.image_url;
        if (file) {
            const { originalname, mimetype, buffer } = file;
            const { getUniqueFileNameWithPrefix } = require("../../../../library/s3/s3Helper");
            const fileName = await getUniqueFileNameWithPrefix(originalname, 'blog-categories');
            const params = {
                Bucket: process.env.AWS_S3_BUCKET,
                Key: `blog-categories/${fileName}`,
                Body: buffer,
                ContentType: mimetype
            };

            const uploadedImage = await uploadFiletToS3(params);
            if (!uploadedImage?.Location) throw new Error("File upload failed");
            image_url = uploadedImage.Location;
        }

        // Update the category
        const updateData = {
            name,
            slug,
            description,
            image_url,
            ...(alt_text !== undefined && { alt_text }),
            status,
            show_home_page: typeof show_home_page === "boolean" ? show_home_page : category.show_home_page,
            updated_by: req.user.id
        };

        // Always update parent_id if it's provided (even if null, to remove parent)
        if (parent_id !== undefined) {
            updateData.parent_id = parent_id;
        }
 
        // Update SEO slug if slug has changed
        if (slug && category.slug !== slug) {
            await seoService.updateSeoSlug('blog_category', id, slug);
        }
        const slugForRedirect = category.slug;
        await category.update(updateData, { transaction: t });

        // Update SEO noIndex based on category status
        await seoService.updateBlogCategoryNoIndex(id, status);

        // If entity is deleted: create/update redirect when redirect_url has value, or remove when empty (find with paranoid: false to restore soft-deleted)
        const categoryIsDeleted = category.deletedAt != null || category.deleted_at != null;
        if (categoryIsDeleted) {
            const trimmedUrl = redirect_url != null && redirect_url !== '' ? String(redirect_url).trim() : '';
            if (trimmedUrl) {
                const oldPath = `/blogs/category/${slugForRedirect}`;
                const redirect = await Redirect.findOne({
                    where: { entity_type: 'blog_category', slug: slugForRedirect },
                    transaction: t,
                    paranoid: false
                });
                if (redirect) {
                    // Restore redirect when redirect_url is updated: set deletedAt to null so the record is no longer soft-deleted
                    await redirect.update({ url_to: trimmedUrl, deletedAt: null, updated_by: req.user?.id ?? null }, { transaction: t });
                } else {
                    await Redirect.create({
                        sources: oldPath,
                        url_to: trimmedUrl,
                        entity_type: 'blog_category',
                        slug: slugForRedirect,
                        header_code: 301,
                        status: 'active',
                        deletedAt: null,
                        meta_data: { source: 'put_api', created_by: req.user?.id || null },
                        updated_by: req.user?.id ?? null
                    }, { transaction: t });
                }
            } else {
                await Redirect.destroy({
                    where: { entity_type: 'blog_category', slug: slugForRedirect },
                    force: true,
                    transaction: t
                });
            }
        }

        await t.commit();
        invalidateCachePattern('blogs:*').catch(() => {});

        let responseData = category;
        if (categoryIsDeleted) {
            const redirect = await Redirect.findOne({
                where: { entity_type: 'blog_category', slug: slugForRedirect, status: 'active' },
                attributes: ['sources', 'url_to', 'header_code', 'status']
            });
            if (redirect) {
                responseData = {
                    ...(category.toJSON ? category.toJSON() : category),
                    redirect: {
                        redirect_url: redirect.url_to,
                        old_path: redirect.sources,
                        header_code: redirect.header_code,
                        status: redirect.status
                    }
                };
            }
        }

        return successResponse(res, responseData, "Blog category updated successfully");
    } catch (error) {
        await t.rollback();
        return errorResponse(res, error, error.message);
    }
};

/**
 * Deletes a blog category (soft delete).
 */
module.exports.deleteBlogCategory = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { redirect_url } = req.body || {};

        const category = await BlogCategory.findByPk(id);
        if (!category) {
            await t.rollback();
            return errorResponse(res, { message: "Category not found" }, "Not found", 404);
        }

        // Create or restore redirect when redirect_url provided (find with paranoid: false to reuse soft-deleted row)
        if (redirect_url != null && redirect_url !== '') {
            const oldPath = `/blogs/category/${category.slug}`;
            const redirect = await Redirect.findOne({
                where: { entity_type: 'blog_category', slug: category.slug },
                transaction: t,
                paranoid: false
            });
            if (redirect) {
                // Restore redirect when redirect_url is updated: set deletedAt to null so the record is no longer soft-deleted
                await redirect.update({ url_to: redirect_url.trim(), deletedAt: null, updated_by: req.user?.id ?? null }, { transaction: t });
            } else {
                await Redirect.create({
                    sources: oldPath,
                    url_to: redirect_url.trim(),
                    entity_type: 'blog_category',
                    slug: category.slug,
                    header_code: 301,
                    status: 'active',
                    deletedAt: null,
                    meta_data: {
                        source: 'delete_api',
                        created_by: req.user?.id || null
                    },
                    updated_by: req.user?.id ?? null
                }, { transaction: t });
            }
        }

        // Delete slug relation first
        await slugManager.deleteSlug('blog_category', id, t);

        // Soft delete the category
        await category.destroy({ transaction: t });

        // Update SEO noIndex based on category status
        await seoService.updateNoIndex('blog_category', id, true);

        await t.commit();
        invalidateCachePattern('blogs:*').catch(() => {});
        return successResponse(res, null, "Blog category deleted successfully");
    } catch (error) {
        await t.rollback();
        return errorResponse(res, error, error.message);
    }
};

/**
 * Restores a soft-deleted blog category.
 */
module.exports.restoreBlogCategory = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;

        const category = await BlogCategory.findOne({
            where: { id },
            paranoid: false
        });

        if (!category) {
            await t.rollback();
            return errorResponse(res, { message: "Category not found" }, "Not found", 404);
        }

        // Restore the category
        await category.restore({ transaction: t });

        // Remove redirect for this category so old URL no longer redirects
        await Redirect.destroy({
            where: { entity_type: 'blog_category', slug: category.slug },
            force: true,
            transaction: t
        });

        // Recreate slug relation
        await slugManager.createOrUpdateSlug(category.slug, 'blog_category', category.id, t);

        // Update SEO noIndex based on category status
        await seoService.updateBlogCategoryNoIndex(id, category.status);

        await t.commit();
        invalidateCachePattern('blogs:*').catch(() => {});
        return successResponse(res, category, "Blog category restored successfully");
    } catch (error) {
        await t.rollback();
        return errorResponse(res, error, error.message);
    }
};

module.exports.bulkDeleteBlogCategories = async (req, res, next) => {
    try {
        const { ids, redirect_url } = req.body;

        const deletedCategories = [];
        const notDeletedCategories = [];

        for (const rawId of ids) {
            const id = Number(rawId);
            const t = await sequelize.transaction();
            try {
                const category = await BlogCategory.findByPk(id, { transaction: t });
                if (!category) {
                    await t.rollback();
                    notDeletedCategories.push({ id, reason: 'Category not found' });
                    continue;
                }

                // Create or restore redirect when redirect_url provided (find with paranoid: false to reuse soft-deleted row)
                if (redirect_url != null && redirect_url !== '') {
                    const oldPath = `/blogs/category/${category.slug}`;
                    const redirect = await Redirect.findOne({
                        where: { entity_type: 'blog_category', slug: category.slug },
                        transaction: t,
                        paranoid: false
                    });
                    if (redirect) {
                        // Restore redirect when redirect_url is updated: set deletedAt to null so the record is no longer soft-deleted
                        await redirect.update({ url_to: redirect_url.trim(), deletedAt: null, updated_by: req.user?.id ?? null }, { transaction: t });
                    } else {
                        await Redirect.create({
                            sources: oldPath,
                            url_to: redirect_url.trim(),
                            entity_type: 'blog_category',
                            slug: category.slug,
                            header_code: 301,
                            status: 'active',
                            deletedAt: null,
                            meta_data: {
                                source: 'bulk_delete_api',
                                created_by: req.user?.id || null
                            },
                            updated_by: req.user?.id ?? null
                        }, { transaction: t });
                    }
                }

                // Delete slug relation first
                await slugManager.deleteSlug('blog_category', id, t);

                // Soft delete the category
                await category.destroy({ transaction: t });

                // Update SEO noIndex
                await seoService.updateNoIndex('blog_category', id, true);

                await t.commit();

                deletedCategories.push({
                    id: category.id,
                    name: category.name,
                    slug: category.slug
                });
            } catch (error) {
                await t.rollback();
                notDeletedCategories.push({
                    id,
                    reason: error.message || 'Failed to delete category'
                });
            }
        }

        const summary = {
            total_requested: ids.length,
            deleted_count: deletedCategories.length,
            not_deleted_count: notDeletedCategories.length
        };

        if (deletedCategories.length === 0) {
            return errorResponse(res, {
                deleted: deletedCategories,
                not_deleted: notDeletedCategories,
                summary
            }, 'No categories were deleted', 400);
        }
        invalidateCachePattern('blogs:*').catch(() => {});
        return successResponse(res, {
            deleted: deletedCategories,
            not_deleted: notDeletedCategories,
            summary
        }, `Successfully deleted ${deletedCategories.length} categor${deletedCategories.length === 1 ? 'y' : 'ies'}`);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.bulkRestoreBlogCategories = async (req, res, next) => {
    try {
        const { ids } = req.body;

        const restoredCategories = [];
        const notRestoredCategories = [];

        for (const rawId of ids) {
            const id = Number(rawId);
            const t = await sequelize.transaction();
            try {
                // Find category including soft-deleted ones
                const category = await BlogCategory.findOne({
                    where: { id },
                    paranoid: false,
                    transaction: t
                });

                if (!category) {
                    await t.rollback();
                    notRestoredCategories.push({
                        id,
                        reason: 'Category not found'
                    });
                    continue;
                }

                // Check if category is already active (not deleted)
                if (!category.deletedAt) {
                    await t.rollback();
                    notRestoredCategories.push({
                        id,
                        name: category.name,
                        reason: 'Category is already active (not deleted)'
                    });
                    continue;
                }

                // Restore the category
                await category.restore({ transaction: t });

                // Recreate slug relation
                await slugManager.createOrUpdateSlug(category.slug, 'blog_category', category.id, t);

                await t.commit();

                // Update SEO noIndex based on category status (outside transaction)
                await seoService.updateBlogCategoryNoIndex(id, category.status);

                restoredCategories.push({
                    id: category.id,
                    name: category.name,
                    slug: category.slug
                });
            } catch (error) {
                await t.rollback();
                notRestoredCategories.push({
                    id,
                    reason: error.message || 'Failed to restore category'
                });
            }
        }

        const summary = {
            total_requested: ids.length,
            restored_count: restoredCategories.length,
            not_restored_count: notRestoredCategories.length
        };

        if (restoredCategories.length === 0) {
            return errorResponse(res, {
                restored: restoredCategories,
                not_restored: notRestoredCategories,
                summary
            }, 'No categories were restored', 400);
        }
        invalidateCachePattern('blogs:*').catch(() => {});
        return successResponse(res, {
            restored: restoredCategories,
            not_restored: notRestoredCategories,
            summary
        }, `Successfully restored ${restoredCategories.length} categor${restoredCategories.length === 1 ? 'y' : 'ies'}`);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}; 