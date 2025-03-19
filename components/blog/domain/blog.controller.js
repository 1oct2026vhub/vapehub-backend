const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Blog, BlogCategory, BlogTag, User } = require("../../../models");
const { Op } = require("sequelize");

module.exports.listAllBlogs = async (req, res, next) => {
    try {
        const { search, userId, categoryId, page = 1, limit = 10 } = req.query;
        let whereCondition = {};
        
        if (search) {
            whereCondition = {
                ...whereCondition,
                [Op.or]: [
                    { title: { [Op.iLike]: `%${search}%` } },
                    { content: { [Op.iLike]: `%${search}%` } }
                ]
            };
        }
        
        if (userId) {
            whereCondition.author_id = userId;
        }

        // Calculate offset
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const parsedLimit = parseInt(limit);

        // Get total count for pagination
        const totalCount = await Blog.count({
            where: whereCondition,
            include: categoryId ? [{
                model: BlogCategory,
                as: 'categories',
                where: {
                    id: categoryId
                }
            }] : []
        });

        const blogs = await Blog.findAll({
            where: whereCondition,
            include: [
                {
                    model: User,
                    as: 'author',
                    attributes: ['id', 'first_name', 'last_name', 'email']
                },
                ...(categoryId ? [{
                    model: BlogCategory,
                    as: 'categories',
                    attributes: ['id', 'name', 'slug'],
                    through: { attributes: [] },
                    where: {
                        id: categoryId
                    }
                }] : [{
                    model: BlogCategory,
                    as: 'categories',
                    attributes: ['id', 'name', 'slug'],
                    through: { attributes: [] }
                }])
            ],
            order: [['published_at', 'DESC']],
            limit: parsedLimit,
            offset: offset
        });

        // Calculate pagination metadata
        const totalPages = Math.ceil(totalCount / parsedLimit);
        const currentPage = parseInt(page);

        successResponse(res, {
            blogs,
            pagination: {
                total: totalCount,
                totalPages,
                currentPage,
                limit: parsedLimit,
                hasNextPage: currentPage < totalPages,
                hasPreviousPage: currentPage > 1
            }
        }, 'Success');
    } catch (error) {
        console.error("listAllBlogs error:", error);
        return errorResponse(res, error, error.message);
    }
}

module.exports.getBlogById = async (req, res, next) => {
    try {
        const blog = await Blog.findByPk(req.params.id, {
            include: [
                {
                    model: User,
                    as: 'author',
                    attributes: ['id', 'first_name', 'last_name', 'email']
                },
                {
                    model: BlogCategory,
                    as: 'categories',
                    attributes: ['id', 'name', 'slug'],
                    through: { attributes: [] }
                },
                {
                    model: BlogTag,
                    as: 'tags',
                    attributes: ['id', 'name', 'slug'],
                    through: { attributes: [] }
                }
            ]
        });
        if (!blog) {
            const error = new Error('Blog not found');
            error.statusCode = 404;
            throw error;
        }
        successResponse(res, blog, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

module.exports.deleteBlog = async (req, res, next) => {
    try {
        const { id } = req.params;
        const blog = await Blog.findByPk(id);
        if (!blog) {
            throw new Error('Blog not found');
        }
        await blog.destroy({ force: true });
        successResponse(res, { message: 'Blog deleted successfully' }, "Success", 200);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

module.exports.listAllCategories = async (req, res, next) => {
    try {
        const categories = await BlogCategory.findAll({
            attributes: ['id', 'name', 'slug', 'description', 'image_url'],
            include: [{
                model: Blog,
                as: 'blogs',
                attributes: ['id'],
                through: { attributes: [] }
            }],
            order: [['name', 'ASC']]
        });

        // Add blog count to each category
        const categoriesWithCount = categories.map(category => ({
            ...category.toJSON(),
            blog_count: category.blogs.length
        }));

        successResponse(res, categoriesWithCount, 'Success');
    } catch (error) {
        console.log("module.exports.listAllCategories= ~ error:", error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.getCategoryBySlug = async (req, res, next) => {
    try {
        const category = await BlogCategory.findOne({
            where: { slug: req.params.slug },
            attributes: ['id', 'name', 'slug', 'description', 'image_url', 'status'],
            include: [{
                model: Blog,
                as: 'blogs',
                attributes: ['id', 'title', 'slug', 'content', 'image_url', 'published_at', 'created_at'],
                include: [
                    {
                        model: User,
                        as: 'author',
                        attributes: ['id', 'first_name', 'last_name', 'email']
                    },
                    {
                        model: BlogTag,
                        as: 'tags',
                        attributes: ['id', 'name', 'slug'],
                        through: { attributes: [] }
                    }
                ],
                through: { attributes: [] },
                order: [['published_at', 'DESC']]
            }]
        });

        if (!category) {
            throw new Error('Category not found');
        }

        successResponse(res, category, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.getBlogBySlug = async (req, res, next) => {
    try {
        const { slug } = req.params;

        // First find the blog by slug
        const blog = await Blog.findOne({
            where: { 
                slug: slug,
            },
            include: [
                {
                    model: User,
                    as: 'author',
                    attributes: ['id', 'first_name', 'last_name', 'email']
                },
                {
                    model: BlogCategory,
                    as: 'categories',
                    attributes: ['id', 'name', 'slug'],
                    through: { attributes: [] }
                },
                {
                    model: BlogTag,
                    as: 'tags',
                    attributes: ['id', 'name', 'slug'],
                    through: { attributes: [] }
                }
            ]
        });

        if (!blog) {
            const error = new Error('Blog not found');
            error.statusCode = 404;
            throw error;
        }

        // Get related blogs from the same categories
        const relatedBlogs = await Blog.findAll({
            where: {
                id: { [Op.ne]: blog.id },
                published_at: { [Op.ne]: null }
            },
            include: [{
                model: BlogCategory,
                as: 'categories',
                where: {
                    id: {
                        [Op.in]: blog.categories.map(cat => cat.id)
                    }
                },
                through: { attributes: [] }
            }],
            limit: 3,
            order: [['published_at', 'DESC']],
            attributes: ['id', 'title', 'slug', 'image_url', 'published_at']
        });

        const response = {
            ...blog.toJSON(),
            related_blogs: relatedBlogs
        };

        return successResponse(res, response, "Success");
    } catch (error) {
        console.error("getBlogBySlug error:", error);
        return errorResponse(res, error, error.message, error.statusCode || 500);
    }
};