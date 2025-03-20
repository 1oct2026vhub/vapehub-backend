const { Op } = require("sequelize");
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Blog, User, BlogCategory, BlogTag, SlugRelation, sequelize } = require("../../../../models");
const { uploadFiletToS3, generateUniqueFileName } = require("../../../../library/s3/s3Helper");
const SlugManager = require("../../../../utils/slugManager");
const slugManager = new SlugManager(SlugRelation);  

const { updateBlogCategories, updateBlogTags } = require("../helper/blogRelations.helper");

module.exports.listAllBlogs = async (req, res) => {
    try {
        const { page = 1, limit = 10, search, sort = 'created_at', order = 'DESC', deleted = false } = req.query;
        const offset = (page - 1) * limit;

        let whereCondition = {};
        if (search) {
            whereCondition = {
                [Op.or]: [
                    { title: { [Op.iLike]: `%${search}%` } },
                    { content: { [Op.iLike]: `%${search}%` } }
                ]
            };
        }

        const { count, rows: blogs } = await Blog.findAndCountAll({
            where: whereCondition,
            include: [
                {
                    model: User,
                    as: 'author',
                    attributes: ['id', 'first_name', 'last_name']
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
            order: [[sort, order]],
            limit: parseInt(limit),
            offset: parseInt(offset),
            paranoid: !deleted
        });

        successResponse(res, {
            blogs,
            pagination: {
                total: count,
                page: parseInt(page),
                limit: parseInt(limit)
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
                    attributes: ['id', 'first_name', 'last_name']
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

        successResponse(res, blog);
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
            published_at,
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
                    attributes: ['id', 'first_name', 'last_name']
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

        const blog = await Blog.findByPk(id, { transaction });
        if (!blog) {
            throw new Error('Blog post not found');
        }

        const image_url = await handleImageUpload(req.file) || blog.image_url;

        // Update slug using static method
        if (slug && slug !== blog.slug) {
            await slugManager.createOrUpdateSlug(slug, 'blog', id, transaction);
        }

        // Update blog
        await blog.update({
            ...(title && { title }),
            ...(content && { content }),
            ...(slug && { slug }),
            ...(image_url && { image_url }),
            ...(published_at && { published_at }),
            updated_by
        }, { transaction });

        // Parse categories and tags
        const parsedCategories = categories ? 
            categories.split(',').map(id => parseInt(id.trim())) : [];
        const parsedTags = tags ? 
            tags.split(',').map(id => parseInt(id.trim())) : [];

        // Update relations
        await updateBlogRelations(id, { categories: parsedCategories, tags: parsedTags }, transaction);

        // Fetch updated blog
        const updatedBlog = await Blog.findByPk(id, {
            include: [
                { model: User, as: 'author', attributes: ['id', 'first_name', 'last_name'] },
                { model: BlogCategory, as: 'categories', through: { attributes: [] } },
                { model: BlogTag, as: 'tags', through: { attributes: [] } }
            ],
            transaction
        });

        await transaction.commit();
        successResponse(res, updatedBlog, 'Blog post updated successfully');
    } catch (error) {
        await transaction.rollback();
        errorResponse(res, error);
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
        
        // Recreate slug using static method
        await slugManager.createOrUpdateSlug(blog.slug, 'blog', blog.id, transaction);

        await transaction.commit();
        successResponse(res, blog, 'Blog post restored successfully');
    } catch (error) {
        await transaction.rollback();
        errorResponse(res, error);
    }
};
