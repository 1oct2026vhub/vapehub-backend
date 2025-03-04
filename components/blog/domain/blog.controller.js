const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Blog, User } = require("../../../models");

module.exports.listAllblogs = async (req, res, next) => {
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
                as: 'User',
                attributes: ['id', 'first_name', 'last_name', 'email']
            }
        });
        successResponse(res, blogs, 'Success');
    } catch (error) {
        console.log("🚀 ~ module.exports.listAllblogs= ~ error:", error)
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
            throw {
                message: "Blog not found",
                statusCode: 400,
            }
        }
        successResponse(res, blog, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.createBlog = async (req, res, next) => {
    try {
        const { title, content, blog_group, slug } = req.body;
        const { id: user_id } = req.user
        // find existing blog
        const existingBlog = await Blog.findOne({ where: { slug } });
        if (existingBlog) {
            throw {
                message: "Blog slug already exists",
                statusCode: 400,
            }
        }
        // create blog
        const blog = await Blog.create({ title, content, blog_group, user_id, slug });
        successResponse(res, blog, 'Blog created successfully', 201);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}
module.exports.updateBlog = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { title, content, blog_group, slug } = req.body;
        const { id: user_id } = req.user

        const blog = await Blog.findByPk(id);
        if (!blog) {
            throw {
                statusCode: 404,
                message: 'Blog not found'
            }
        }
        if (blog?.slug != slug) {
            const existingBlog = await Blog.findOne({ where: { slug } });
            if (existingBlog && existingBlog.id != id) {
                throw {
                    message: "Blog slug already exists",
                    statusCode: 400,
                }
            }
        }

        await blog.update({
            ...(title && { title }),
            ...(content && { content }),
            ...(blog_group && { blog_group }),
            ...(user_id && { user_id }),
            ...(slug && { slug }),
        });
        successResponse(res, blog, 'Blog updated successfully',);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.deleteBlog = async (req, res, next) => {
    try {
        const { id } = req.params;
        const blog = await Blog.findByPk(id);
        if (!blog) {
            throw {
                statusCode: 404,
                message: 'Blog not found'
            }
        }
        await blog.destroy({ force: true });
        successResponse(res, { message: 'Blog deleted successfully' }, "Success", 200);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

module.exports.getBlogBySlug = async (req, res, next) => {
    try {
        const blog = await Blog.findOne({
            where: { slug: req.params.slug }, include: {
                model: User,
                as: 'User',
                attributes: ['id', 'first_name', 'last_name', 'email']
            }
        });

        if (!blog) {
            throw {
                message: "Blog not found",
                statusCode: 400,
            };
        }
        return successResponse(res, blog, "Success");
    } catch (error) {
        console.log("🚀 ~ module.exports.getBlogBySlug= ~ error:", error)
        return errorResponse(res, error, error.message);
    }
}