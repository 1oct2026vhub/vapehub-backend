const { Op } = require("sequelize");
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Blog, User, BlogCategory, BlogTag, SlugRelation, sequelize } = require("../../../../models");
const { uploadFiletToS3, generateUniqueFileName } = require("../../../../library/s3/s3Helper");
const SlugManager = require("../../../../utils/slugManager");
const slugManager = new SlugManager(SlugRelation);  
const seoService = require('../../seo/domain/seo.service');

const { updateBlogCategories, updateBlogTags } = require("../helper/blogRelations.helper");

module.exports.listAllBlogs = async (req, res) => {
    try {
        const { page = 1, limit = 10, search, sort = 'created_at', order = 'DESC', deleted = false, category_id, tag_id, status } = req.query;
        const offset = (page - 1) * limit;

        let whereCondition = {};
        if (search) {
            whereCondition = {
                [Op.or]: [
                    { id: { [Op.like]: `%${search}%` } },
                    { title: { [Op.like]: `%${search}%` } },
                    { content: { [Op.like]: `%${search}%` } }
                ]
            };
        }

        // Add status filter if provided
        if (status) {
            whereCondition.status = status;
        }

        // Parse category_id and tag_id for filtering blogs
        const categoryIds = category_id ? 
            category_id.split(',').map(id => parseInt(id.trim())) : [];
        const tagIds = tag_id ? 
            tag_id.split(',').map(id => parseInt(id.trim())) : [];

        // Base include conditions - always include all relations
        let includeConditions = [
            {
                model: User,
                as: 'author',
                attributes: ['id', 'first_name', 'last_name', 'email', 'profile_pic_url'],
                required: false
            },
            {
                model: BlogCategory,
                as: 'categories',
                through: { attributes: [] },
                required: false
            },
            {
                model: BlogTag,
                as: 'tags',
                through: { attributes: [] },
                required: false
            }
        ];

        // Convert deleted string to boolean
        const showDeleted = deleted === 'true' || deleted === true;

        // First, get the total count with the same filters
        const totalCount = await Blog.count({
            where: whereCondition,
            include: includeConditions,
            paranoid: !showDeleted,
            distinct: true
        });

        // Then get the paginated results
        const { rows: blogs } = await Blog.findAndCountAll({
            where: whereCondition,
            include: includeConditions,
            order: [[sort, order]],
            limit: parseInt(limit),
            offset: parseInt(offset),
            paranoid: !showDeleted,
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

        // Filter blogs by category_id and tag_id if provided
        let filteredBlogs = processedBlogs;
        // if (categoryIds.length > 0 || tagIds.length > 0) {
        //     filteredBlogs = processedBlogs.filter(blog => {
        //         // Check if blog has any of the requested categories
        //         const hasMatchingCategory = categoryIds.length === 0 || 
        //             blog.categories.some(category => categoryIds.includes(category.id));
                
        //         // Check if blog has any of the requested tags
        //         const hasMatchingTag = tagIds.length === 0 || 
        //             blog.tags.some(tag => tagIds.includes(tag.id));
                
        //         // Return true if blog matches both category and tag filters
        //         return hasMatchingCategory && hasMatchingTag;
        //     });
        // }

        successResponse(res, {
            blogs: filteredBlogs,
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
            include: [
                {
                    model: User,
                    as: 'author',
                    attributes: ['id', 'first_name', 'last_name', 'email', 'profile_pic_url']
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
            throw new Error('Blog post not found');
        }

        // Process blog to remove published_at for draft or archived status
        const blogData = blog.toJSON();
        if (blogData.status === 'draft' || blogData.status === 'archived') {
            blogData.published_at = null;
        }

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

module.exports.createBlog = async (req, res) => {
    let transaction;
    
    try {
        transaction = await sequelize.transaction({
            timeout: 30000
        });

        const { title, content, slug, published_at } = req.body;
        const categories = req.body.categories ? 
            req.body.categories.split(',').map(id => parseInt(id.trim())) : [];
        const tags = req.body.tags ? 
            req.body.tags.split(',').map(id => parseInt(id.trim())) : [];
        const { id: author_id } = req.user;
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
            author_id,
            // Only set published_at if status is not 'archived' or 'draft'
            ...(status !== 'archived' && status !== 'draft' && { published_at }),
            status,
            updated_by: author_id
        }, { transaction });

        // Create slug relation using static method
        await slugManager.createOrUpdateSlug(slug, 'blog', blog.id, transaction);

        // Update relations with error handling
        try {
            await Promise.all([
                categories.length > 0 ? updateBlogCategories(blog.id, transaction, categories) : Promise.resolve(),
                tags.length > 0 ? updateBlogTags(blog.id, transaction, tags) : Promise.resolve()
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
                    attributes: ['id', 'first_name', 'last_name', 'email', 'profile_pic_url']
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
        successResponse(res, createdBlog, 'Blog post created successfully', 201);
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
        const fileName = generateUniqueFileName(originalname);
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

const updateBlogRelations = async (blogId, { categories, tags }, transaction) => {
    const updates = [];
    if (categories) {
        updates.push(updateBlogCategories(blogId, transaction, categories));
    }
    if (tags) {
        updates.push(updateBlogTags(blogId, transaction, tags));
    }
    await Promise.all(updates);
};

module.exports.updateBlog = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { title, content, slug, categories, tags, published_at } = req.body;
        const { id: updated_by } = req.user;
        const status = req.body.status;

        const blog = await Blog.findByPk(id, { transaction });
        if (!blog) {
            await transaction.rollback();
            return errorResponse(res, { message: "Blog post not found" }, "Blog post not found", 404);
        }

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
            ...(status && { status }),
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

        // Parse categories and tags
        const parsedCategories = categories ? 
            categories.split(',').map(id => parseInt(id.trim())) : [];
        const parsedTags = tags ? 
            tags.split(',').map(id => parseInt(id.trim())) : [];

        // Update relations
        await updateBlogRelations(id, { categories: parsedCategories, tags: parsedTags }, transaction);

        // Update SEO noIndex based on blog post status and publication date
        await seoService.updateBlogPostNoIndex(id, status, published_at);


        // Fetch updated blog
        const updatedBlog = await Blog.findByPk(id, {
            include: [
                { model: User, as: 'author', attributes: ['id', 'first_name', 'last_name', 'email', 'profile_pic_url'] },
                { model: BlogCategory, as: 'categories', through: { attributes: [] } },
                { model: BlogTag, as: 'tags', through: { attributes: [] } }
            ],
            transaction
        });

        await transaction.commit();
        return successResponse(res, updatedBlog, "Blog post updated successfully");
    } catch (error) {
        await transaction.rollback();
        return errorResponse(res, error, error.message);
    }
};

module.exports.deleteBlog = async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
        const blog = await Blog.findByPk(req.params.id, { transaction });
        if (!blog) {
            throw new Error('Blog post not found');
        }

        // Delete slug using static method
        await slugManager.deleteSlug('blog', req.params.id, transaction);

        // This will cascade delete relations due to model associations
        await blog.destroy({ transaction });

        // Update SEO noIndex to true before deletion
        await seoService.updateNoIndex('blog', req.params.id, true);

        await transaction.commit();
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

        if (!blog.deleted_at) {
            throw new Error('Blog post is not deleted');
        }

        await blog.restore();

        // Update SEO noIndex based on blog status
        await seoService.updateBlogPostNoIndex(blog.id, blog.status, blog.published_at);
        
        // Recreate slug using static method
        await slugManager.createOrUpdateSlug(blog.slug, 'blog', blog.id, transaction);

        await transaction.commit();
        successResponse(res, blog, 'Blog post restored successfully');
    } catch (error) {
        await transaction.rollback();
        errorResponse(res, error);
    }
};
