const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Blog, BlogCategory, BlogTag, User } = require("../../../models");
const { Op } = require("sequelize");
const { cacheOrFetch } = require("../../../library/cache");
const {
    AUTHOR_ATTRIBUTES,
    resolveRelatedBlogs,
    formatBlogDetailResponse
} = require("../helper/blogDetail.serializer");

module.exports.listAllBlogs = async (req, res, next) => {
    try {
        const { search, userId, categoryId, page = 1, limit = 10, sortBy = 'published_at', order = 'DESC' } = req.query;
        const validSortFields = ['published_at', 'created_at', 'title', 'id'];
        const validOrders = ['ASC', 'DESC'];

        const sortField = validSortFields.includes(sortBy) ? sortBy : 'published_at';
        const sortOrder = validOrders.includes(order.toUpperCase()) ? order.toUpperCase() : 'DESC';
        
        // Get current date for published date check
        const currentDate = new Date();
        
        let whereCondition = {
            status: 'published',
            published_at: { [Op.lte]: currentDate } // Only include blogs with published_at date in the past
        };
        if (search) {
            whereCondition = {
                ...whereCondition,
                [Op.or]: [
                    { title: { [Op.like]: `%${search.toLowerCase()}%` } },
                    // { content: { [Op.like]: `%${search.toLowerCase()}%` } }
                ]
            };
        }
        
        if (userId) {
            whereCondition.author_id = userId;
        }

        // Parse and validate pagination parameters
        const parsedPage = Math.max(1, parseInt(page));
        const parsedLimit = Math.max(1, parseInt(limit));

        // If categoryId is provided, find the category and its subcategories
        let categoryIds = [];
        if (categoryId) {
            categoryIds.push(categoryId);
            const subcategories = await BlogCategory.findAll({
                where: {
                    parent_id: categoryId,
                    status: 'active'
                },
                attributes: ['id']
            });
            
            if (subcategories && subcategories.length > 0) {
                subcategories.forEach(subcategory => {
                    categoryIds.push(subcategory.id);
                });
            }
        }
        // Get total count for pagination
        const totalCount = await Blog.count({
            where: whereCondition,
            include: [
                {
                    model: User,
                    as: 'author',
                    attributes: ['id', 'first_name', 'last_name', 'email', 'profile_pic_url']
                },
                ...(categoryIds.length > 0 ? [{
                    model: BlogCategory,
                    as: 'categories',
                    attributes: ['id', 'name', 'slug', 'parent_id'],
                    include: [
                        {
                            model: BlogCategory,
                            as: 'parent',
                            attributes: ['id', 'name', 'slug'],
                            required: false
                        }
                    ],
                    through: { attributes: [] },
                    where: {
                        id: {
                            [Op.in]: categoryIds
                        },
                        status: 'active'
                    }
                }] : [{
                    model: BlogCategory,
                    as: 'categories',
                    attributes: ['id', 'name', 'slug', 'parent_id'],
                    include: [
                        {
                            model: BlogCategory,
                            as: 'parent',
                            attributes: ['id', 'name', 'slug'],
                            required: false
                        }
                    ],
                    through: { attributes: [] },
                    required: false,
                    where: {
                        status: 'active'
                    }
                }])
            ],
            distinct: true
        });

        // Calculate pagination metadata
        const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / parsedLimit);
        const currentPage = totalCount === 0 ? 1 : Math.min(parsedPage, totalPages);
        // Fetch blogs with pagination
        const blogs = await Blog.findAll({
            where: whereCondition,
            include: [
                {
                    model: User,
                    as: 'author',
                    attributes: ['id', 'first_name', 'last_name', 'email', 'profile_pic_url']
                },
                ...(categoryIds.length > 0 ? [{
                    model: BlogCategory,
                    as: 'categories',
                    attributes: ['id', 'name', 'slug', 'parent_id'],
                    include: [
                        {
                            model: BlogCategory,
                            as: 'parent',
                            attributes: ['id', 'name', 'slug'],
                            required: false
                        }
                    ],
                    through: { attributes: [] },
                    where: {
                        id: {
                            [Op.in]: categoryIds
                        },
                        status: 'active'
                    }
                }] : [{
                    model: BlogCategory,
                    as: 'categories',
                    attributes: ['id', 'name', 'slug', 'parent_id'],
                    include: [
                        {
                            model: BlogCategory,
                            as: 'parent',
                            attributes: ['id', 'name', 'slug'],
                            required: false
                        }
                    ],
                    through: { attributes: [] },
                    required: false,
                    where: {
                        status: 'active'
                    }
                }])
            ],
            order: [[sortField, sortOrder]],
            limit: parsedLimit,
            offset: (currentPage - 1) * parsedLimit
        });
        successResponse(res, {
            blogs,
            pagination: {   
                total: totalCount,
                totalPages,
                currentPage,
                limit: parsedLimit,
                hasNextPage: totalCount > 0 && currentPage < totalPages,
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
        // Get current date for published date check
        const currentDate = new Date();
        
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
                    attributes: ['id', 'name', 'slug', 'parent_id'],
                    include: [
                        {
                            model: BlogCategory,
                            as: 'parent',
                            attributes: ['id', 'name', 'slug'],
                            required: false
                        }
                    ],
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
        
        // Check if blog exists, is published, and published_at date is in the past
        if (!blog || blog.status != 'published' || !blog.published_at || blog.published_at > currentDate) {
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
        const { order = 'DESC', show_home_page } = req.query;
        const sortOrder = ['ASC', 'DESC'].includes(order.toUpperCase()) ? order.toUpperCase() : 'DESC';
        const cacheKey = `blogs:categories:${sortOrder}:${show_home_page !== undefined ? String(show_home_page) : 'all'}`;

        const categoriesWithCount = await cacheOrFetch(cacheKey, async () => {
            // Build where clause
            const whereClause = {
                status: 'active',
                parent_id: null // Only get top-level categories
            };

            if (show_home_page !== undefined) {
                whereClause.show_home_page = show_home_page === 'true' || show_home_page === true;
            }

            const categories = await BlogCategory.findAll({
                where: whereClause,
                attributes: ['id', 'name', 'slug', 'description', 'image_url', 'alt_text', 'show_home_page'],
                include: [
                    {
                        model: Blog,
                        as: 'blogs',
                        attributes: ['id', 'published_at', 'status'],
                        through: { attributes: [] },
                        required: false
                    },
                    {
                        model: BlogCategory,
                        as: 'children',
                        attributes: ['id', 'name', 'slug', 'description', 'image_url', 'alt_text', 'parent_id','show_home_page'],
                        where: {
                            status: 'active',
                            ...(show_home_page !== undefined && {
                                show_home_page: show_home_page === 'true' || show_home_page === true
                            })
                        },
                        include: [
                            {
                                model: BlogCategory,
                                as: 'parent',
                                attributes: ['id', 'name', 'slug', 'description', 'image_url', 'alt_text', 'show_home_page'],
                                required: false
                            },
                            {
                                model: Blog,
                                as: 'blogs',
                                attributes: ['id', 'published_at', 'status'],
                                through: { attributes: [] },
                                required: false
                            }
                        ],
                        required: false
                    }
                ],
                order: [['created_at', sortOrder]]
            });

            const currentDate = new Date();

            return categories.map(category => {
                const categoryData = category.toJSON();

                categoryData.blogs = categoryData.blogs.filter(blog =>
                    blog.status === 'published' && new Date(blog.published_at) <= currentDate
                );
                categoryData.blog_count = categoryData.blogs.length;

                if (categoryData.children) {
                    categoryData.children = categoryData.children.map(child => {
                        child.blogs = child.blogs.filter(blog =>
                            blog.status === 'published' && new Date(blog.published_at) <= currentDate
                        );
                        child.blog_count = child.blogs.length;
                        delete child.blogs;
                        return child;
                    });
                }

                delete categoryData.blogs;
                return categoryData;
            });
        }, 300);

        successResponse(res, categoriesWithCount, 'Success');
    } catch (error) {
        console.log("module.exports.listAllCategories= ~ error:", error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.getCategoryBySlug = async (req, res, next) => {
    try {
        const category = await BlogCategory.findOne({
            where: { 
                slug: req.params.slug,
                status: 'active'
            },
            attributes: ['id', 'name', 'slug', 'description', 'image_url', 'alt_text', 'status', 'parent_id'],
            include: [
                {
                    model: BlogCategory,
                    as: 'parent',
                    attributes: ['id', 'name', 'slug', 'description', 'image_url', 'alt_text', 'status'],
                    required: false
                },
                {
                    model: Blog,
                    as: 'blogs',
                    attributes: ['id', 'title', 'slug', 'content', 'image_url', 'alt_text', 'published_at', 'created_at', 'status'],
                    include: [
                        {
                            model: User,
                            as: 'author',
                            attributes: ['id', 'first_name', 'last_name', 'email', 'profile_pic_url']
                        },
                        {
                            model: BlogTag,
                            as: 'tags',
                            attributes: ['id', 'name', 'slug'],
                            through: { attributes: [] },
                            required: false
                        }
                    ],
                    through: { attributes: [] },
                    order: [['published_at', 'ASC']],
                    where: {
                        status: 'published'
                    },
                    required: false
                },
                {
                    model: BlogCategory,
                    as: 'children',
                    attributes: ['id', 'name', 'slug', 'description', 'image_url', 'alt_text', 'status'],
                    where: {
                        status: 'active'
                    },
                    include: [{
                        model: Blog,
                        as: 'blogs',
                        attributes: ['id', 'title', 'slug', 'content', 'image_url', 'alt_text', 'published_at', 'created_at', 'status'],
                        include: [
                            {
                                model: User,
                                as: 'author',
                                attributes: ['id', 'first_name', 'last_name', 'email', 'profile_pic_url']
                            },
                            {
                                model: BlogTag,
                                as: 'tags',
                                attributes: ['id', 'name', 'slug'],
                                through: { attributes: [] },
                                required: false
                            }
                        ],
                        through: { attributes: [] },
                        order: [['published_at', 'ASC']],
                        where: {
                            status: 'published'
                        },
                        required: false
                    }],
                    required: false
                }
            ]
        });

        if (!category) {
            throw new Error('Category not found');
        }

        // Get current date for published date check
        const currentDate = new Date();

        // Filter blogs based on published_at date and calculate counts
        const categoryData = category.toJSON();
        
        // Create a Set to track unique blog IDs
        const uniqueBlogIds = new Set();
        
        // Filter parent category blogs
        categoryData.blogs = categoryData.blogs.filter(blog => {
            if (new Date(blog.published_at) <= currentDate) {
                uniqueBlogIds.add(blog.id);
                return true;
            }
            return false;
        });

        // Filter and combine child category blogs
        if (categoryData.children) {
            categoryData.children = categoryData.children.map(child => {
                // Filter child blogs
                child.blogs = child.blogs.filter(blog => {
                    if (new Date(blog.published_at) <= currentDate) {
                        // Only add to parent's blog list if not already present
                        if (!uniqueBlogIds.has(blog.id)) {
                            uniqueBlogIds.add(blog.id);
                            categoryData.blogs.push(blog);
                        }
                        return true;
                    }
                    return false;
                });
                child.blog_count = child.blogs.length;
                // Remove blogs array from child as it's no longer needed
                delete child.blogs;
                return child;
            });
        }

        // Sort all blogs by published_at date
        categoryData.blogs.sort((a, b) => new Date(a.published_at) - new Date(b.published_at));
        
        // Update total blog count
        categoryData.blog_count = categoryData.blogs.length;

        successResponse(res, categoryData, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.getBlogBySlug = async (req, res, next) => {
    try {
        const { slug } = req.params;
        
        // Get current date for published date check
        const currentDate = new Date();

        // First find the blog by slug
        const blog = await Blog.findOne({
            where: { 
                slug: slug,
                status: 'published',
                published_at: { [Op.lte]: currentDate } // Only include blogs with published_at date in the past
            },
            include: [
                {
                    model: User,
                    as: 'author',
                    attributes: AUTHOR_ATTRIBUTES
                },
                {
                    model: BlogCategory,
                    as: 'categories',
                    attributes: ['id', 'name', 'slug', 'parent_id'],
                    include: [
                        {
                            model: BlogCategory,
                            as: 'parent',
                            attributes: ['id', 'name', 'slug'],
                            required: false
                        }
                    ],
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

        const relatedBlogs = await resolveRelatedBlogs(blog, currentDate);
        const response = formatBlogDetailResponse(blog, relatedBlogs);

        return successResponse(res, response, "Success");
    } catch (error) {
        console.error("getBlogBySlug error:", error);
        return errorResponse(res, error, error.message, error.statusCode || 500);
    }
};