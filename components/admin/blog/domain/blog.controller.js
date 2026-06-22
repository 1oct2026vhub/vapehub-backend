const { Op, Sequelize } = require("sequelize");
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Blog, User, BlogCategory, BlogTag, Menu, SlugRelation, sequelize, Redirect } = require("../../../../models");
const { uploadFiletToS3, generateUniqueFileName } = require("../../../../library/s3/s3Helper");
const { invalidateCachePattern } = require("../../../../library/cache");
const SlugManager = require("../../../../utils/slugManager");
const slugManager = new SlugManager(SlugRelation);
const seoService = require('../../seo/domain/seo.service');

const { updateBlogCategories, updateBlogTags, updateBlogRelatedPosts, getBlogRelatedPosts } = require("../helper/blogRelations.helper");
const { replaceInlineBase64ImagesWithS3Urls } = require("../helper/blogContent.helper");
const {
    AUTHOR_ATTRIBUTES,
    parseSourcesField,
    parseRelatedBlogIdsField,
    resolveAuthorId,
    attachRelatedBlogFields
} = require("../helper/blogPayload.helper");

module.exports.listAllBlogs = async (req, res) => {
    try {
        const { page = 1, limit = 10, search, sort = 'created_at', order = 'DESC', deleted, category_id, tag_id, status } = req.query;
        const offset = (page - 1) * limit;

        let whereCondition = {};
        if (search) {
            whereCondition = {
                [Op.or]: [
                    { id: { [Op.like]: `%${search}%` } },
                    { title: { [Op.like]: `%${search}%` } },
                    { slug: { [Op.like]: `%${search}%` } },
                    // { content: { [Op.like]: `%${search}%` } }
                ]
            };
        }

        // Add status filter if provided
        if (status) {
            whereCondition.status = status;
        }

        // Handle deleted filter - use literal SQL to avoid Sequelize column mapping issues
        let paranoid = true; // Default: exclude soft-deleted records
        if (deleted === 'true') {
            paranoid = false; // Include soft-deleted records
            // Add condition using literal SQL to reference the actual database column
            const deletedCondition = Sequelize.literal('`Blog`.`deleted_at` IS NOT NULL');
            // Merge with existing conditions
            const existingConditions = Object.keys(whereCondition).length > 0 ? [whereCondition] : [];
            whereCondition = {
                [Op.and]: [...existingConditions, deletedCondition]
            };
        } else if (deleted === 'false') {
            paranoid = false; // Need to include soft-deleted to filter them out
            const deletedCondition = Sequelize.literal('`Blog`.`deleted_at` IS NULL');
            // Merge with existing conditions
            const existingConditions = Object.keys(whereCondition).length > 0 ? [whereCondition] : [];
            whereCondition = {
                [Op.and]: [...existingConditions, deletedCondition]
            };
        }

        // Parse category_id and tag_id for filtering blogs
        const categoryIds = category_id ? 
            category_id.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : [];
        const tagIds = tag_id ? 
            tag_id.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : [];

        // Base include conditions - always include all relations
        let includeConditions = [
            {
                model: User,
                as: 'author',
                attributes: AUTHOR_ATTRIBUTES,
                required: false
            },
            {
                model: BlogCategory,
                as: 'categories',
                through: { attributes: [] },
                required: categoryIds.length > 0, // Required when filtering by category
                ...(categoryIds.length > 0 && {
                    where: {
                        id: { [Op.in]: categoryIds }
                    }
                })
            },
            {
                model: BlogTag,
                as: 'tags',
                through: { attributes: [] },
                required: tagIds.length > 0, // Required when filtering by tag
                ...(tagIds.length > 0 && {
                    where: {
                        id: { [Op.in]: tagIds }
                    }
                })
            }
        ];

        // First, get the total count with the same filters
        const totalCount = await Blog.count({
            where: whereCondition,
            include: includeConditions,
            paranoid: paranoid,
            distinct: true
        });

        // Then get the paginated results
        const { rows: blogs } = await Blog.findAndCountAll({
            where: whereCondition,
            include: includeConditions,
            order: [[sort, order]],
            limit: parseInt(limit),
            offset: parseInt(offset),
            paranoid: paranoid,
            distinct: true,
            group: ['Blog.id']
        });

        // Process blogs to remove published_at for draft or archived status
        const processedBlogs = blogs.map(blog => {
            const blogData = blog.toJSON();
            if (blogData.status === 'draft' || blogData.status === 'archived') {
                blogData.published_at = null;
            }
            
            // Add empty arrays for relations if they don't exist
            blogData.categoryRelations = [];
            blogData.tagRelations = [];
            
            return blogData;
        });

        successResponse(res, {
            blogs: processedBlogs,
            pagination: {
                total: totalCount,
                page: parseInt(page),
                limit: parseInt(limit),
                total_pages: Math.ceil(totalCount / parseInt(limit))
            } 
        });
    } catch (error) {
        errorResponse(res, error);
    }
};

module.exports.getBlogById = async (req, res) => {
    try {
        const blog = await Blog.findByPk(req.params.id, {
            paranoid: false,
            include: [
                {
                    model: User,
                    as: 'author',
                    attributes: AUTHOR_ATTRIBUTES
                },
                {
                    model: BlogCategory,
                    as: 'categories',
                    through: { attributes: [] }
                },
                {
                    model: BlogTag,
                    as: 'tags',
                    through: { attributes: [] }
                }
            ]
        });

        if (!blog) {
            return errorResponse(res, { message: "Blog post not found" }, "Blog post not found", 404);
        }

        // Process blog to remove published_at for draft or archived status
        let blogData = blog.toJSON ? blog.toJSON() : blog;
        if (blogData.status === 'draft' || blogData.status === 'archived') {
            blogData.published_at = null;
        }

        // Include redirect details whenever an active redirect exists for this blog (by slug)
        const redirect = await Redirect.findOne({
            where: {
                entity_type: 'blog',
                slug: blog.slug,
                status: 'active',
                deletedAt: null
            },
            attributes: ['sources', 'url_to', 'header_code', 'status']
        });
        if (redirect) {
            blogData = {
                ...blogData,
                redirect: {
                    redirect_url: redirect.url_to,
                    old_path: redirect.sources,
                    header_code: redirect.header_code,
                    status: redirect.status
                }
            };
        }

        const relatedPosts = await getBlogRelatedPosts(blog.id);
        blogData = attachRelatedBlogFields(blogData, relatedPosts);

        successResponse(res, blogData);
    } catch (error) {
        errorResponse(res, error);
    }
};

const parseArrayField = (field) => {
    try {
        if (!field) return [];
        if (Array.isArray(field)) return field;
        return JSON.parse(field);
    } catch (error) {
        throw new Error(`Invalid format for ${field}. Expected JSON array`);
    }
};

const formatAdminBlogResponse = async (blogInstance) => {
    const blogData = blogInstance.toJSON ? blogInstance.toJSON() : blogInstance;
    if (blogData.status === 'draft' || blogData.status === 'archived') {
        blogData.published_at = null;
    }

    const relatedPosts = await getBlogRelatedPosts(blogData.id);
    return attachRelatedBlogFields(blogData, relatedPosts);
};

module.exports.createBlog = async (req, res) => {
    let transaction;
    
    try {
        transaction = await sequelize.transaction({
            timeout: 30000
        });

        const { title, slug, published_at, alt_text } = req.body;
        const content = await replaceInlineBase64ImagesWithS3Urls(req.body.content);
        const categories = req.body.categories ? 
            req.body.categories.split(',').map(id => parseInt(id.trim())) : [];
        const tags = req.body.tags ? 
            req.body.tags.split(',').map(id => parseInt(id.trim())) : [];
        const author_id = await resolveAuthorId(req.body.author_id, req.user.id);
        const sources = req.body.sources !== undefined
            ? parseSourcesField(req.body.sources)
            : [];
        const relatedBlogIds = req.body.related_blog_ids !== undefined
            ? parseRelatedBlogIdsField(req.body.related_blog_ids)
            : [];
        const status = req.body.status || 'draft';

        let image_url = null;
        if (req.file) {
            image_url = await handleImageUpload(req.file);
        }

        // Create blog post
        const blog = await Blog.create({
            title,
            content,
            slug,
            image_url,
            alt_text,
            author_id,
            sources,
            // Only set published_at if status is not 'archived' or 'draft'
            ...(status !== 'archived' && status !== 'draft' && { published_at }),
            status,
            updated_by: req.user.id
        }, { transaction });

        // Create slug relation using static method
        await slugManager.createOrUpdateSlug(slug, 'blog', blog.id, transaction);

        // Update relations with error handling
        try {
            await Promise.all([
                categories.length > 0 ? updateBlogCategories(blog.id, transaction, categories) : Promise.resolve(),
                tags.length > 0 ? updateBlogTags(blog.id, transaction, tags) : Promise.resolve(),
                relatedBlogIds.length > 0 ? updateBlogRelatedPosts(blog.id, transaction, relatedBlogIds) : Promise.resolve()
            ]);
        } catch (error) {
            console.error('Error updating relations:', error);
            throw new Error('Failed to update blog relations');
        }

        // Fetch complete blog data
        const createdBlog = await Blog.findByPk(blog.id, {
            include: [
                {
                    model: User,
                    as: 'author',
                    attributes: AUTHOR_ATTRIBUTES
                },
                {
                    model: BlogCategory,
                    as: 'categories',
                    through: { attributes: [] }
                },
                {
                    model: BlogTag,
                    as: 'tags',
                    through: { attributes: [] }
                }
            ],
            transaction
        });

        await transaction.commit();
        invalidateCachePattern('blogs:*').catch(() => {});
        const responseData = await formatAdminBlogResponse(createdBlog);
        successResponse(res, responseData, 'Blog post created successfully', 201);
    } catch (error) {
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error('Rollback error:', rollbackError);
            }
        }
        console.error('Blog creation error:', error);
        errorResponse(res, error, 
            error.message || 'Failed to create blog post', 
            error.name === 'SequelizeDeadlockError' ? 409 : 500
        );
    }
};

// Helper functions to break down complexity
const handleImageUpload = async (file) => {
    if (!file) return null;
    try {
        const { originalname, mimetype, buffer } = file;
        const { getUniqueFileNameWithPrefix } = require("../../../../library/s3/s3Helper");
        const fileName = await getUniqueFileNameWithPrefix(originalname, 'blog');
        const params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: `blog/${fileName}`,
            Body: buffer,
            ContentType: mimetype
        };
        const uploadedImage = await uploadFiletToS3(params);
        return uploadedImage?.Location;
    } catch (error) {
        throw new Error("File upload failed");
    }
};

const updateBlogRelations = async (blogId, { categories, tags, relatedBlogIds }, transaction) => {
    const updates = [];
    if (categories) {
        updates.push(updateBlogCategories(blogId, transaction, categories));
    }
    if (tags) {
        updates.push(updateBlogTags(blogId, transaction, tags));
    }
    if (relatedBlogIds !== undefined) {
        updates.push(updateBlogRelatedPosts(blogId, transaction, relatedBlogIds));
    }
    await Promise.all(updates);
};

module.exports.updateBlog = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { title, slug, categories, tags, published_at, alt_text, redirect_url } = req.body;
        const content = req.body.content
            ? await replaceInlineBase64ImagesWithS3Urls(req.body.content)
            : undefined;
        const { id: updated_by } = req.user;
        const status = req.body.status;
        const parsedSources = req.body.sources !== undefined
            ? parseSourcesField(req.body.sources)
            : undefined;
        const parsedRelatedBlogIds = req.body.related_blog_ids !== undefined
            ? parseRelatedBlogIdsField(req.body.related_blog_ids, id)
            : undefined;
        const parsedAuthorId = req.body.author_id !== undefined
            ? await resolveAuthorId(req.body.author_id, updated_by)
            : undefined;
        const blog = await Blog.findByPk(id, { transaction, paranoid: false });
        if (!blog) {
            await transaction.rollback();
            return errorResponse(res, { message: "Blog post not found" }, "Blog post not found", 404);
        }
        // Use slug before update for redirect lookup (redirect was created at delete time with this slug)
        const slugForRedirect = blog.slug;

        const image_url = await handleImageUpload(req.file) || blog.image_url;

        // Update slug using static method
        if (slug && slug !== blog.slug) {
            await slugManager.createOrUpdateSlug(slug, 'blog', id, transaction);
        }
        // Update SEO slug if slug has changed
        if (slug && blog.slug !== slug) {
            await seoService.updateSeoSlug('blog', id, slug);
        }
        
        // Prepare update data
        const updateData = {
            ...(title && { title }),
            ...(content && { content }),
            ...(slug && { slug }),
            ...(image_url && { image_url }),
            ...(alt_text !== undefined && { alt_text }),
            ...(status && { status }),
            ...(parsedSources !== undefined && { sources: parsedSources }),
            ...(parsedAuthorId !== undefined && { author_id: parsedAuthorId }),
            updated_by
        };

        // Only include published_at if status is not 'archived' or 'draft'
        if (published_at && status !== 'archived' && status !== 'draft') {
            updateData.published_at = published_at;
        } else if (status === 'archived' || status === 'draft') {
            // Clear published_at if status is 'archived' or 'draft'
            updateData.published_at = null;
        }

        // Update blog
        await blog.update(updateData, { transaction });
        const menu = await Menu.findOne({ where: { entity_id: id} });
        if (menu) {
            await Menu.update({
                original: `/${slug?.trim()}`,
                // name: name?.trim() || menu.name,
                // slug: slug?.trim() || menu.slug

            }, { where: { entity_id: id } }, { transaction });
        }
        // Parse categories and tags
        const parsedCategories = categories ? 
            categories.split(',').map(id => parseInt(id.trim())) : [];
        const parsedTags = tags ? 
            tags.split(',').map(id => parseInt(id.trim())) : [];

        // Update relations
        await updateBlogRelations(id, {
            categories: parsedCategories,
            tags: parsedTags,
            relatedBlogIds: parsedRelatedBlogIds
        }, transaction);

        // Update SEO noIndex based on blog post status and publication date
        await seoService.updateBlogPostNoIndex(id, status, published_at);

        // If entity is deleted: create/update redirect when redirect_url has a value, or remove when empty
        // Find with paranoid: false so a soft-deleted redirect is found; then update url_to and set deletedAt: null to restore it
        const blogIsDeleted = blog.deletedAt != null || blog.deleted_at != null;
        if (blogIsDeleted) {
            const trimmedUrl = redirect_url != null ? String(redirect_url).trim() : '';
            if (trimmedUrl) {
                const oldPath = `/blog/${slugForRedirect}`;
                const redirect = await Redirect.findOne({
                    where: { entity_type: 'blog', slug: slugForRedirect },
                    paranoid: false,
                    transaction
                });
                if (redirect) {
                    // Restore redirect when redirect_url is updated: set deletedAt to null so the record is no longer soft-deleted
                    await redirect.update({ url_to: trimmedUrl, deletedAt: null, updated_by: req.user?.id ?? null }, { transaction });
                } else {
                    await Redirect.create({
                        sources: oldPath,
                        url_to: trimmedUrl,
                        entity_type: 'blog',
                        slug: slugForRedirect,
                        header_code: 301,
                        status: 'active',
                        deletedAt: null,
                        meta_data: { source: 'put_api', created_by: req.user?.id || null },
                        updated_by: req.user?.id ?? null
                    }, { transaction });
                }
            } else {
                await Redirect.destroy({
                    where: { entity_type: 'blog', slug: slugForRedirect },
                    force: true,
                    paranoid: false,
                    transaction
                });
            }
        }

        // Fetch updated blog
        const updatedBlog = await Blog.findByPk(id, {
            paranoid: false,
            include: [
                { model: User, as: 'author', attributes: AUTHOR_ATTRIBUTES },
                { model: BlogCategory, as: 'categories', through: { attributes: [] } },
                { model: BlogTag, as: 'tags', through: { attributes: [] } }
            ],
            transaction
        });

        await transaction.commit();
        invalidateCachePattern('blogs:*').catch(() => {});

        let responseData = await formatAdminBlogResponse(updatedBlog);
        const updatedBlogIsDeleted = updatedBlog && (updatedBlog.deletedAt != null || updatedBlog.deleted_at != null);
        if (updatedBlogIsDeleted) {
            const redirect = await Redirect.findOne({
                where: { entity_type: 'blog', slug: slugForRedirect, status: 'active' },
                attributes: ['sources', 'url_to', 'header_code', 'status']
            });
            if (redirect) {
                responseData = {
                    ...responseData,
                    redirect: {
                        redirect_url: redirect.url_to,
                        old_path: redirect.sources,
                        header_code: redirect.header_code,
                        status: redirect.status
                    }
                };
            }
        }
        return successResponse(res, responseData, "Blog post updated successfully");
    } catch (error) {
        console.error('Blog update error:', error);
        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error('Blog update rollback error:', rollbackError);
            }
        }
        const statusCode = error.name === 'SequelizeUniqueConstraintError' ? 409 : 500;
        return errorResponse(res, error, error.message || 'Failed to update blog post', statusCode);
    }
};

module.exports.deleteBlog = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        const { redirect_url } = req.body || {};
        const blog = await Blog.findByPk(req.params.id, { transaction });
        if (!blog) {
            throw new Error('Blog post not found');
        }

        // Create redirect record if redirect_url is provided (sources = old path, url_to = redirect_url)
        if (redirect_url != null && redirect_url !== '') {
            const oldPath = `/blog/${blog.slug}`;
            await Redirect.create({
                sources: oldPath,
                url_to: redirect_url.trim(),
                entity_type: 'blog',
                slug: blog.slug,
                header_code: 301,
                status: 'active',
                meta_data: {
                    source: 'delete_api',
                    created_by: req.user?.id || null
                },
                updated_by: req.user?.id ?? null
            }, { transaction });
        }

        // Delete slug using static method
        await slugManager.deleteSlug('blog', req.params.id, transaction);

        // Soft delete: set deleted_at (paranoid). Fallback explicit update if destroy() doesn't set it.
        await blog.destroy({ transaction });
        const reloaded = await Blog.findByPk(blog.id, { transaction, paranoid: false });
        if (reloaded && !reloaded.deletedAt) {
            await Blog.update(
                { deletedAt: new Date() },
                { where: { id: blog.id }, transaction }
            );
        }

        // Update SEO noIndex to true before deletion
        await seoService.updateNoIndex('blog', req.params.id, true);

        await transaction.commit();
        invalidateCachePattern('blogs:*').catch(() => {});
        successResponse(res, null, 'Blog post deleted successfully');
    } catch (error) {
        await transaction.rollback();
        errorResponse(res, error);
    }
};

module.exports.restoreBlog = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const blog = await Blog.findOne({
            where: { id: req.params.id },
            paranoid: false
        });

        if (!blog) {
            throw new Error('Blog post not found');
        }

        // Blog model maps to column deleted_at; check both possible property names
        const isDeleted = blog.deletedAt != null || blog.deleted_at != null;
        if (!isDeleted) {
            throw new Error('Blog post is not deleted');
        }

        await blog.restore();

        // Remove redirect records associated with this blog (hard delete; paranoid: false so soft-deleted rows are also removed)
        await Redirect.destroy({
            where: {
                slug: blog.slug,
                entity_type: 'blog'
            },
            force: true,
            paranoid: false,
            transaction
        });

        // Update SEO noIndex based on blog status
        await seoService.updateBlogPostNoIndex(blog.id, blog.status, blog.published_at);
        
        // Recreate slug using static method
        await slugManager.createOrUpdateSlug(blog.slug, 'blog', blog.id, transaction);

        await transaction.commit();
        invalidateCachePattern('blogs:*').catch(() => {});
        successResponse(res, blog, 'Blog post restored successfully');
    } catch (error) {
        await transaction.rollback();
        errorResponse(res, error);
    }
};

module.exports.bulkDeleteBlogs = async (req, res) => {
    try {
        const { ids, redirect_url } = req.body;

        const deletedBlogs = [];
        const notDeletedBlogs = [];

        for (const rawId of ids) {
            const id = Number(rawId);
            const t = await sequelize.transaction();
            try {
                const blog = await Blog.findByPk(id, { transaction: t });
                if (!blog) {
                    await t.rollback();
                    notDeletedBlogs.push({ id, reason: 'Blog post not found' });
                    continue;
                }

                // Create redirect record if redirect_url is provided (sources = old path, url_to = redirect_url)
                if (redirect_url != null && redirect_url !== '') {
                    const oldPath = `/blog/${blog.slug}`;
                    await Redirect.create({
                        sources: oldPath,
                        url_to: redirect_url.trim(),
                        entity_type: 'blog',
                        slug: blog.slug,
                        header_code: 301,
                        status: 'active',
                        meta_data: {
                            source: 'bulk_delete_api',
                            created_by: req.user?.id || null
                        },
                        updated_by: req.user?.id ?? null
                    }, { transaction: t });
                }

                // Delete slug using static method
                await slugManager.deleteSlug('blog', id, t);

                // Soft delete the blog; fallback explicit update if destroy() doesn't set deleted_at
                await blog.destroy({ transaction: t });
                const reloaded = await Blog.findByPk(blog.id, { transaction: t, paranoid: false });
                if (reloaded && !reloaded.deletedAt) {
                    await Blog.update(
                        { deletedAt: new Date() },
                        { where: { id: blog.id }, transaction: t }
                    );
                }

                // Update SEO noIndex to true before deletion
                await seoService.updateNoIndex('blog', id, true);

                await t.commit();

                deletedBlogs.push({
                    id: blog.id,
                    title: blog.title,
                    slug: blog.slug
                });
            } catch (error) {
                await t.rollback();
                notDeletedBlogs.push({
                    id,
                    reason: error.message || 'Failed to delete blog post'
                });
            }
        }

        const summary = {
            total_requested: ids.length,
            deleted_count: deletedBlogs.length,
            not_deleted_count: notDeletedBlogs.length
        };

        if (deletedBlogs.length === 0) {
            return errorResponse(res, {
                deleted: deletedBlogs,
                not_deleted: notDeletedBlogs,
                summary
            }, 'No blog posts were deleted', 400);
        }

        successResponse(res, {
            deleted: deletedBlogs,
            not_deleted: notDeletedBlogs,
            summary
        }, `Successfully deleted ${deletedBlogs.length} blog post(s)`);
    } catch (error) {
        errorResponse(res, error, error.message);
    }
};

module.exports.bulkRestoreBlogs = async (req, res) => {
    try {
        const { ids } = req.body;

        const restoredBlogs = [];
        const notRestoredBlogs = [];

        for (const rawId of ids) {
            const id = Number(rawId);
            const t = await sequelize.transaction();
            try {
                // Find blog including soft-deleted ones
                const blog = await Blog.findOne({
                    where: { id },
                    paranoid: false,
                    transaction: t
                });

                if (!blog) {
                    await t.rollback();
                    notRestoredBlogs.push({
                        id,
                        reason: 'Blog post not found'
                    });
                    continue;
                }

                // Check if blog is already active (not deleted). Blog model uses column deleted_at.
                const isDeleted = blog.deletedAt != null || blog.deleted_at != null;
                if (!isDeleted) {
                    await t.rollback();
                    notRestoredBlogs.push({
                        id,
                        title: blog.title,
                        reason: 'Blog post is already active (not deleted)'
                    });
                    continue;
                }

                // Restore the blog
                await blog.restore({ transaction: t });

                // Remove redirect records associated with this blog (hard delete; paranoid: false so soft-deleted rows are also removed)
                await Redirect.destroy({
                    where: {
                        slug: blog.slug,
                        entity_type: 'blog'
                    },
                    force: true,
                    paranoid: false,
                    transaction: t
                });

                // Recreate slug using static method
                await slugManager.createOrUpdateSlug(blog.slug, 'blog', blog.id, t);

                await t.commit();

                // Update SEO noIndex based on blog status (outside transaction)
                await seoService.updateBlogPostNoIndex(blog.id, blog.status, blog.published_at);

                restoredBlogs.push({
                    id: blog.id,
                    title: blog.title,
                    slug: blog.slug
                });
            } catch (error) {
                await t.rollback();
                notRestoredBlogs.push({
                    id,
                    reason: error.message || 'Failed to restore blog post'
                });
            }
        }

        const summary = {
            total_requested: ids.length,
            restored_count: restoredBlogs.length,
            not_restored_count: notRestoredBlogs.length
        };

        if (restoredBlogs.length === 0) {
            return errorResponse(res, {
                restored: restoredBlogs,
                not_restored: notRestoredBlogs,
                summary
            }, 'No blog posts were restored', 400);
        }

        successResponse(res, {
            restored: restoredBlogs,
            not_restored: notRestoredBlogs,
            summary
        }, `Successfully restored ${restoredBlogs.length} blog post(s)`);
    } catch (error) {
        errorResponse(res, error, error.message);
    }
};