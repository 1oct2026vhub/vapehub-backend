const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Blog, BlogCategory, BlogTag, User } = require("../../../models");
const { Op } = require("sequelize");

module.exports.listAllBlogs = async (req, res, next) => {
    try {
        const { search, userId, blog_group } = req.query;
        let whereCondition = {};
        if (search) {
            whereCondition = {
                ...whereCondition,
                [Op.or]: [
                    { title: { [Op.iLike]: `%${search}%` } },
                    { content: { [Op.iLike]: `%${search}%` } },
                    { blog_group: { [Op.iLike]: `%${search}%` } }
                ]
            };
        }
        if (userId) {
            whereCondition.user_id = userId;
        }
        if (blog_group) {
            whereCondition.blog_group = blog_group;
        }
        const blogs = await Blog.findAll({
            where: whereCondition,
            include: {
                model: User,
                as: 'author',
                attributes: ['id', 'first_name', 'last_name', 'email']
            }
        });
        successResponse(res, blogs, 'Success');
    } catch (error) {
        console.log("module.exports.listAllblogs= ~ error:", error)
        return errorResponse(res, error, error.message);
    }
}

module.exports.getBlogByid = async (req, res, next) => {
    try {
        const blog = await Blog.findByPk(req.params.id, {
            include: {
                model: User,
                as: 'User',
                attributes: ['id', 'first_name', 'last_name', 'email']
            }
        });
        if (!blog) {
            throw new Error('Blog not found');
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
            include: [{
                model: Blog,
                as: 'blogs',
                include: [
                    {
                        model: User,
                        as: 'author',
                        attributes: ['id', 'first_name', 'last_name', 'email']
                    },
                    {
                        model: BlogTag,
                        as: 'tags',
                        through: { attributes: [] }
                    }
                ],
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
        const { categorySlug, blogSlug } = req.params;

        const blog = await Blog.findOne({
            where: { 
                slug: blogSlug,
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
                    where: { slug: categorySlug },
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
            throw new Error('Blog not found');
        }

        // Get related blogs from the same category
        const relatedBlogs = await Blog.findAll({
            where: {
                id: { [Op.ne]: blog.id },
                published_at: { [Op.ne]: null }
            },
            include: [{
                model: BlogCategory,
                as: 'categories',
                where: { slug: categorySlug },
                through: { attributes: [] }
            }],
            limit: 3,
            order: [['published_at', 'DESC']]
        });

        const response = {
            ...blog.toJSON(),
            related_blogs: relatedBlogs
        };

        return successResponse(res, response, "Success");
    } catch (error) {
        console.log("module.exports.getBlogBySlug= ~ error:", error);
        return errorResponse(res, error, error.message);
    }
};