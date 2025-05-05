const axios = require('axios');
const logger = require('../../../library/logger');
const reviewHelper = require('../helper/review.helper');
const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Review, User, Order, Product, Media, sequelize } = require("../../../models");
const { Op } = require("sequelize");

const apiKey = process.env.TRUSTPILOT_API_KEY;
const apiSecret = process.env.TRUSTPILOT_API_SECRET;
const businessUnitId = process.env.TRUSTPILOT_BUSINESS_UNIT_ID;
const baseUrl = 'https://invitations-api.trustpilot.com/v1/private/business-units';
const authUrl = 'https://api.trustpilot.com/v1/oauth/oauth-business-users-for-applications/accesstoken';



const createReview = async (req, res, next) => {
    try {
        const { Review} = require("../../../models");   //, Media, User, Order, Product, sequelize 

        const { order_id, product_id, company_name, rating, comment } = req.body;
        const user_id = req.user.id;
        // Check if user has already reviewed this product in this order
        const existingReview = await Review.findOne({
            where: {
                user_id,
                order_id,
                product_id
            }
        });

        if (existingReview) {
            throw {
                message: "You have already reviewed this product for this order",
                statusCode: 400
            };
        }

        // Create review
        const review = await Review.create({
            user_id,
            order_id,
            product_id,
            company_name,
            rating,
            comment,
            is_visible: true
        });

        // Handle media upload if exists
        if (req.files && req.files.media) {
            const mediaUrl = await reviewHelper.handleMediaUpload(req.files.media);
            if (mediaUrl) {
                await Media.create({
                    review_id: review.id,
                    user_id,
                    media_url: mediaUrl,
                    media_type: req.files.media.mimetype
                });
            }
        }

        return successResponse(res, review, "Review created successfully");
    } catch (error) {
        return errorResponse(res, error);
    }
};

const getReviews = async (req, res, next) => {
    try {
        const { product_id, user_id, is_visible, page = 1, limit = 10 } = req.query;
        const where = {};

        if (product_id) where.product_id = product_id;
        if (user_id) where.user_id = user_id;
        if(is_visible && (is_visible === "true" || is_visible === 1 || is_visible === true)){
            where.is_visible = true;
        }
        else{
            where.is_visible = false;
        }
        const offset = (parseInt(page) - 1) * parseInt(limit);

        const reviews = await Review.findAndCountAll({
            where,
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'profile_pic_url']
                },
                {
                    model: Order,
                    as: 'order',
                    attributes: ['id', 'order_unique_id']
                },
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'slug']
                },
                {
                    model: Media,
                    as: 'media',
                    attributes: ['id', 'media_url', 'media_type']
                }
            ],
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: offset
        });

        return successResponse(res, {
            rows: reviews.rows,
            pagination: {
                total: reviews.count,
                currentPage: parseInt(page),
                totalPages: Math.ceil(reviews.count / parseInt(limit))
            }
        }, "Success");
    } catch (error) {
        return errorResponse(res, error);
    }
};

const getReviewById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const review = await Review.findByPk(id, {
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'profile_pic_url']
                },
                {
                    model: Order,
                    as: 'order',
                    attributes: ['id', 'order_unique_id']
                },
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'slug']
                },
                {
                    model: Media,
                    as: 'media',
                    attributes: ['id', 'media_url', 'media_type']
                }
            ]
        });

        if (!review) {
            throw {
                message: "Review not found",
                statusCode: 404
            };
        }

        return successResponse(res, review);
    } catch (error) {
        return errorResponse(res, error);
    }
};

const updateReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { company_name, rating, comment, is_visible } = req.body;
        const user_id = req.user.id;

        const review = await Review.findByPk(id);
        if (!review) {
            throw {
                message: "Review not found",
                statusCode: 404
            };
        }

        // Check if user owns the review
        if (review.user_id !== user_id) {
            throw {
                message: "You are not authorized to update this review",
                statusCode: 403
            };
        }

        // Update review
        await review.update({
            company_name,
            rating,
            comment,
            is_visible
        });

        // Handle media upload if exists
        if (req.files && req.files.media) {
            const mediaUrl = await reviewHelper.handleMediaUpload(req.files.media);
            if (mediaUrl) {
                // Delete old media if exists
                if (review.media_id) {
                    await Media.destroy({ where: { id: review.media_id } });
                }

                const media = await Media.create({
                    review_id: review.id,
                    user_id,
                    media_url: mediaUrl,
                    media_type: req.files.media.mimetype
                });
                review.media_id = media.id;
                await review.save();
            }
        }

        return successResponse(res, review, "Review updated successfully");
    } catch (error) {
        return errorResponse(res, error);
    }
};

const deleteReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        const user_id = req.user.id;

        const review = await Review.findByPk(id);
        if (!review) {
            throw {
                message: "Review not found",
                statusCode: 404
            };
        }

        // Check if user owns the review
        if (review.user_id !== user_id) {
            throw {
                message: "You are not authorized to delete this review",
                statusCode: 403
            };
        }

        // Delete associated media if exists
        if (review.media_id) {
            await Media.destroy({ where: { id: review.media_id } });
        }

        await review.destroy();
        return successResponse(res, null, "Review deleted successfully");
    } catch (error) {
        return errorResponse(res, error);
    }
};

const getReviewsByProductId = async (req, res, next) => {
    try {
        const { product_id } = req.params;
        let { page = 1, limit = 10, rating, is_visible } = req.query;

        // Validate product_id
        if (!product_id) {
            throw {
                message: "Product ID is required",
                statusCode: 400
            };
        }
        if(is_visible && (is_visible === "true" || is_visible === 1 || is_visible === true)){
            is_visible = true;
        }
        else{
            is_visible = false;
        }

        // Build where clause
        const where = {
            product_id,
            is_visible
        };

        // Add rating filter if provided
        if (rating) {
            where.rating = rating;
        }

        // Calculate pagination
        const offset = (page - 1) * limit;

        // Get total count for pagination
        const total = await Review.count({ where });
        // Get reviews with pagination and includes
        const reviews = await Review.findAll({
            where,
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'profile_pic_url']
                },
                {
                    model: Order,
                    as: 'order',
                    attributes: ['id', 'order_unique_id']
                },
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'slug']
                },
                {
                    model: Media,
                    as: 'media',
                    attributes: ['id', 'media_url', 'media_type']
                }
            ],
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
        // Calculate average rating
        const averageRating = await Review.findOne({
            where: { product_id, is_visible: true },
            attributes: [
                [sequelize.fn('AVG', sequelize.col('rating')), 'average_rating'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'total_reviews']
            ],
            raw: true
        });

        return successResponse(res, {
            reviews,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            },
            average_rating: parseFloat(averageRating?.average_rating || 0).toFixed(1),
            total_reviews: parseInt(averageRating?.total_reviews || 0)
        });
    } catch (error) {
        return errorResponse(res, error);
    }
};

const getReviewsByCompanyName = async (req, res, next) => {
    try {
        const { company_name } = req.params;
        let { page = 1, limit = 10, rating, is_visible = true } = req.query;

        // Validate company_name
        if (!company_name) {
            throw {
                message: "Company name is required",
                statusCode: 400
            };
        }
        if(is_visible && (is_visible === "true" || is_visible === 1 || is_visible === true)){
            is_visible = true;
        }
        else{
            is_visible = false;
        }
        // Build where clause
        const where = {
            company_name: {
                [Op.like]: `%${company_name}%` // Case-insensitive search
            },
            is_visible
        };

        // Add rating filter if provided
        if (rating) {
            where.rating = rating;
        }

        // Calculate pagination
        const offset = (page - 1) * limit;

        // Get total count for pagination
        const total = await Review.count({ where });

        // Get reviews with pagination and includes
        const reviews = await Review.findAll({
            where,
            include: [
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'first_name', 'last_name', 'profile_pic_url']
                },
                {
                    model: Order,
                    as: 'order',
                    attributes: ['id', 'order_unique_id']
                },
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'slug']
                },
                {
                    model: Media,
                    as: 'media',
                    attributes: ['id', 'media_url', 'media_type']
                }
            ],
            order: [['created_at', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        // Calculate average rating
        const averageRating = await Review.findOne({
            where: { 
                company_name: {
                    [Op.like]: `%${company_name}%`
                },
                is_visible: true 
            },
            attributes: [
                [sequelize.fn('AVG', sequelize.col('rating')), 'average_rating'],
                [sequelize.fn('COUNT', sequelize.col('id')), 'total_reviews']
            ],
            raw: true
        });

        return successResponse(res, {
            reviews,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(total / limit)
            },
            average_rating: parseFloat(averageRating?.average_rating || 0).toFixed(1),
            total_reviews: parseInt(averageRating?.total_reviews || 0)
        });
    } catch (error) {
        return errorResponse(res, error);
    }
};

module.exports = {
    createReview,
    getReviews,
    getReviewById,
    updateReview,
    deleteReview,
    getReviewsByProductId,
    getReviewsByCompanyName
}; 