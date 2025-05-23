const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Carousel, BannerImage, SlugRelation, FooterSection, FooterLink, FlashNews, User } = require("../../../models");
const { uploadFiletToS3 } = require("../../../library/s3/s3Helper");
const { Op } = require('sequelize');
const { Sequelize } = require('sequelize');
const seoService = require("../../../components/admin/seo/domain/seo.service");
const axios = require('axios');
const { getAccessToken, findBusinessUnitId } = require('../../review/helper/review.helper');
const logger = require("../../../utils/logger");
// Priority order for entity types when multiple matches are found
const ENTITY_TYPE_PRIORITY = {
  category: 1,
  brand: 2,
  product: 3,
  product_variant: 4,
  blog: 5
};

const getEntityType = (type) => {
  if (type === 'blog') return 'blog_post';
  if (type === 'blog_category') return 'blog_category';
  if (type === 'product_variant') return 'product';
  return type;
};

module.exports.getHomeCarousel = async (req, res, next) => {
    try {
        const carousels = await Carousel.findAll({
            order: [
                ["display_order", "ASC"]
            ]
        });
        successResponse(res, carousels, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

module.exports.createHomeCarousel = async (req, res, next) => {
    try {
        const user_id = req?.user?.id;
        const { display_order, image_url, image_url_mid, image_url_low, title, description } = req.body;
        const existing = await Carousel.findAll({ where: { display_order } })
        if (existing.length > 0) {
            const error = new Error("display_order already exists");
            error.statusCode = 400;
            throw error;
        }
        const carousel = await Carousel.create({ display_order, image_url, image_url_mid, image_url_low, title, description, updated_by: user_id })
        successResponse(res, carousel, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}
module.exports.uploadBannerImage = async (req, res, next) => {
    try {
        if (!req.file) {
            return errorResponse(res, { message: "No file uploaded" }, "No file uploaded", 400);
        }
        const user_id = req?.user?.id;
        const file = req.file;
        const { originalname, mimetype, buffer } = file;
        const fileName = `public-images/${user_id}_${Date.now()}_${originalname}`;
        const params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: fileName,
            Body: buffer,
            ContentType: mimetype
        }

        // Upload image to S3 (or any cloud storage)
        const imageUrl = await uploadFiletToS3(params);

        return successResponse(res, imageUrl, "Image uploaded successfully");
    } catch (error) {
        return errorResponse(res, error, error.message || "Failed to upload image", 500);
    }
};

module.exports.addBannerImage = async (req, res, next) => {
    try {
        const user_id = req?.user?.id;
        const { display_order, image_url, image_url_mid, image_url_low, title, description } = req.body;
        const existing = await BannerImage.findAll({ where: { display_order } })
        if (existing.length > 0) {
            const error = new Error("display_order already exists");
            error.statusCode = 400;
            throw error;
        }
        const banner = await BannerImage.create({ display_order, image_url, image_url_mid, image_url_low, title, description, updated_by: user_id })
        successResponse(res, banner, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.getBannerImages = async (req, res, next) => {
    try {
        const banners = await BannerImage.findAll({
            order: [
                ["display_order", "ASC"]
            ]
        });
        successResponse(res, banners, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

/**
 * Get slug relations based on provided slugs
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
module.exports.getSlugRelations = async (req, res, next) => {
    try {
        const { slugs } = req.query;

        // Validate input
        if (!slugs) {
            return errorResponse(res, { message: "Slugs parameter is required" }, "Slugs parameter is required", 400);
        }

        // Parse slugs from query string
        const slugArray = slugs.split(',').map(slug => slug.trim());

        // Query slug relations
        const slugRelations = await SlugRelation.findAll({
            where: {
                slug: {
                    [Op.in]: slugArray
                }
            },
            order: [
                // Order by entity type priority
                [Sequelize.literal(`FIELD(entity_type, ${Object.keys(ENTITY_TYPE_PRIORITY)
                    .map(type => `'${type}'`)
                    .join(',')})`)]
            ]
        });

        // Handle no matches
        if (!slugRelations.length) {
            return errorResponse(res, { message: "No matching slugs found" }, "No matching slugs found", 404);
        }

        // Handle single slug query - no validation needed
        if (slugArray.length === 1) {
            const seoData = await seoService.getSeoMeta(
                getEntityType(slugRelations[0].entity_type),
                slugRelations[0].slug
            );
            return successResponse(res, {
                slug: slugRelations[0].slug,
                entity_type: slugRelations[0].entity_type,
                entity_id: slugRelations[0].entity_id,
                seo: seoData
            }, 'Success');
        }

        // Handle multiple slugs query
        const matchedSlugs = new Set(slugRelations.map(relation => relation.slug));
        const allSlugsMatched = slugArray.every(slug => matchedSlugs.has(slug));

        if (!allSlugsMatched) {
            return successResponse(res, {
                message: 'Partial matches found, refine your query if needed',
                data: slugRelations.map(relation => ({
                    slug: relation.slug,
                    entity_type: relation.entity_type,
                    entity_id: relation.entity_id
                }))
            }, 'Success');
        }

        // For pairs, validate hierarchical relationships
        if (slugArray.length === 2) {
            // Sort relations by priority to ensure parent comes first
            const sortedRelations = slugRelations.sort((a, b) => 
                ENTITY_TYPE_PRIORITY[a.entity_type] - ENTITY_TYPE_PRIORITY[b.entity_type]
            );

            const [parent, child] = sortedRelations;

            // Define valid hierarchical relationships
            const validHierarchy = {
                category: {
                    validChildTypes: ['subcategory', 'product'],
                    errorMessage: 'A category slug can only be followed by a subcategory or product slug'
                },
                brand: {
                    validChildTypes: ['subbrand', 'product'],
                    errorMessage: 'A brand slug can only be followed by a sub-brand or product slug'
                },
                product: {
                    validChildTypes: ['product_variant'],
                    errorMessage: 'A product slug can only be followed by a product variant slug'
                },
                blog_category: {
                    validChildTypes: ['blog_variant'],
                    errorMessage: 'A blog category slug can only be followed by a blog variant slug'
                },
                deal: {
                    validChildTypes: ['deal_variant'],
                    errorMessage: 'A deal slug can only be followed by a deal variant slug'
                }
            };

            // Validate hierarchy
            const parentRules = validHierarchy[parent.entity_type];
            if (!parentRules) {
                return errorResponse(res, {
                    message: "Invalid parent slug type",
                    details: `Only category, brand, product, and blog_category can be parent slugs`,
                    allowedParents: Object.keys(validHierarchy),
                    received: parent.entity_type
                }, "Invalid hierarchy", 400);
            }

            if (!parentRules.validChildTypes.includes(child.entity_type)) {
                return errorResponse(res, {
                    message: "Invalid slug hierarchy",
                    details: parentRules.errorMessage,
                    parent: {
                        slug: parent.slug,
                        type: parent.entity_type
                    },
                    child: {
                        slug: child.slug,
                        type: child.entity_type
                    },
                    allowedChildTypes: parentRules.validChildTypes
                }, "Invalid hierarchy", 400);
            }

            // If validation passes, return the pair
            return successResponse(res, sortedRelations.map(relation => ({
                slug: relation.slug,
                entity_type: relation.entity_type,
                entity_id: relation.entity_id
            })), 'Success');
        }

        // If more than 2 slugs, return error
        return errorResponse(res, {
            message: "Invalid number of slugs",
            details: "Only single slugs or pairs are supported"
        }, "Invalid request", 400);

    } catch (error) {
        console.log(error);
        return errorResponse(res, error, error.message);
    }
};

// Get all active sections with their links (public)
module.exports.getFooterSections = async (req, res) => {
    try {
      const sections = await FooterSection.findAll({
        where: {
          is_active: true,
          deleted_at: null
        },
        order: [['order', 'ASC']],
        include: [{
          model: FooterLink,
          as: 'links',
          where: {
            is_active: true,
            deleted_at: null
          },
          order: [['order', 'ASC']]
        }]
      });
      res.json({
        success: true,
        data: sections
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch footer sections'
      });
    }
};

/**
 * Get active flash news
 * Get Trustpilot reviews with star rating categorization
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
module.exports.getFlashNews = async (req, res, next) => {
    try {
        const { status } = req.query;
        
        // Build where clause
        const whereClause = {};
        if (status !== undefined) {
            whereClause.status = status === 'true';
        }

        // Get flash news with ordering
        const flashNews = await FlashNews.findAll({
            where: whereClause,
            order: [
                ['created_at', 'DESC']
            ],
            attributes: ['id', 'label', 'url', 'status', 'created_at'],
            include: [{
                model: User,
                as: 'updatedBy',
                attributes: ['id', 'first_name', 'last_name', 'email']
            }]
        });

        return successResponse(res, flashNews, 'Flash news retrieved successfully');
    } catch (error) {
        console.log(error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Get Trustpilot reviews with star rating categorization
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
module.exports.getTrustpilotReviews = async (req, res, next) => {
    try {
        const { page = 1, per_page = 10, stars } = req.query;
        
        // Get access token and business unit ID
        const accessToken = await getAccessToken();
        const businessUnitId = await findBusinessUnitId(accessToken);
        // console.log("businessUnitId>>>>",businessUnitId);

        // Build query parameters
        const queryParams = {
            page,
            perPage: per_page,
            stars: stars || undefined
        };

        // Get reviews from Trustpilot API
        const response = await axios.get(
            `https://api.trustpilot.com/v1/business-units/${businessUnitId}/reviews`,
            {
                params: queryParams,
                headers: {
                    'apikey': process.env.TRUSTPILOT_API_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );

        // Get business unit details for overall stats
        const businessUnitResponse = await axios.get(
            `https://api.trustpilot.com/v1/business-units/${businessUnitId}`,
            {
                headers: {
                    'apikey': process.env.TRUSTPILOT_API_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );
        const businessUnit = businessUnitResponse.data;
        const reviews = response.data.reviews;

        // Get score stars from business unit
        const scoreStars = businessUnit.score.stars;
        const trustScore = businessUnit.score.trustScore;

        // Process reviews with rating categorization
        const processedReviews = reviews.map(review => {
            let ratingCategory;
            const stars = review.stars;

            if (stars < 2) {
                ratingCategory = 'poor';
            } else if (stars >= 2 && stars < 4) {
                ratingCategory = 'good';
            } else if (stars >= 4 && stars < 5) {
                ratingCategory = 'excellent';
            } else if (stars === 5) {
                ratingCategory = 'outstanding';
            }

            return {
                id: review.id,
                stars: review.stars,
                title: review.title,
                text: review.text,
                createdAt: review.createdAt,
                consumer: {
                    displayName: review.consumer.displayName
                },
                ratingCategory
            };
        });

        // Calculate star distribution percentages
        const totalReviews = businessUnit.numberOfReviews.total;
        const starDistribution = {
            oneStar: {
                count: businessUnit.numberOfReviews.oneStar,
                percentage: ((businessUnit.numberOfReviews.oneStar / totalReviews) * 100).toFixed(1)
            },
            twoStars: {
                count: businessUnit.numberOfReviews.twoStars,
                percentage: ((businessUnit.numberOfReviews.twoStars / totalReviews) * 100).toFixed(1)
            },
            threeStars: {
                count: businessUnit.numberOfReviews.threeStars,
                percentage: ((businessUnit.numberOfReviews.threeStars / totalReviews) * 100).toFixed(1)
            },
            fourStars: {
                count: businessUnit.numberOfReviews.fourStars,
                percentage: ((businessUnit.numberOfReviews.fourStars / totalReviews) * 100).toFixed(1)
            },
            fiveStars: {
                count: businessUnit.numberOfReviews.fiveStars,
                percentage: ((businessUnit.numberOfReviews.fiveStars / totalReviews) * 100).toFixed(1)
            }
        };

        // Prepare response data
        const responseData = {
            reviews: processedReviews,
            pagination: {
                total: response.data.total,
                page: parseInt(page),
                per_page: parseInt(per_page)
            },
            overallStats: {
                averageRating: scoreStars,
                trustScore: trustScore,
                totalReviews: totalReviews,
                ratingDistribution: starDistribution,
                scoreBreakdown: {
                    stars: scoreStars,
                    trustScore: trustScore,
                    ratingCategory: scoreStars < 2 ? 'poor' : 
                                  scoreStars >= 2 && scoreStars < 4 ? 'Good' :
                                  scoreStars >= 4 && scoreStars < 5 ? 'Excellent' : 'Outstanding',
                    showRatingBanner: scoreStars >= 2.5
                }
            },
            showRatingBanner: scoreStars >= 2.5
        };

        return successResponse(res, responseData, 'Successfully retrieved reviews');
    } catch (error) {
        console.error('Error fetching Trustpilot reviews:', error);
        return errorResponse(res, error, error.message || 'Failed to fetch reviews');
    }
};

/**
 * Get all Trustpilot reviews using private API endpoint
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
module.exports.getAllTrustpilotReviews = async (req, res, next) => {
    try {
        const { page = 1, per_page = 100 } = req.query;
        
        // Get access token
        const accessToken = await getAccessToken();
        
        // Get business unit ID
        const businessUnitId = await findBusinessUnitId(accessToken);

        // Log the API request
        logger.logInfo({
            type: 'trustpilot_api_request',
            endpoint: 'getAllReviews',
            businessUnitId,
            page,
            per_page,
            timestamp: new Date().toISOString()
        });

        // Make API request to get all reviews using private endpoint
        const response = await axios.get(
            `https://api.trustpilot.com/v1/private/business-units/${businessUnitId}/reviews`,
            {
                params: {
                    page,
                    perPage: per_page
                },
                headers: {
                    'apikey': process.env.TRUSTPILOT_API_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );

        // Process and format the reviews
        const reviews = response.data.reviews.map(review => ({
            id: review.id,
            stars: review.stars,
            title: review.title,
            text: review.text,
            createdAt: review.createdAt,
            consumer: {
                displayName: review.consumer.displayName,
                email: review.consumer.email,
                id: review.consumer.id
            },
            reply: review.reply ? {
                message: review.reply.message,
                createdAt: review.reply.createdAt
            } : null,
            status: review.status,
            language: review.language,
            ratingCategory: review.stars < 2 ? 'poor' : 
                          review.stars >= 2 && review.stars < 4 ? 'good' :
                          review.stars >= 4 && review.stars < 5 ? 'excellent' : 'outstanding'
        }));

        // Log successful response
        logger.logInfo({
            type: 'trustpilot_api_response',
            endpoint: 'getAllReviews',
            totalReviews: response.data.total,
            page,
            per_page,
            timestamp: new Date().toISOString()
        });

        return successResponse(res, {
            reviews,
            pagination: {
                total: response.data.total,
                page: parseInt(page),
                per_page: parseInt(per_page)
            }
        }, 'Successfully retrieved all reviews');

    } catch (error) {
        // Log error
        logger.logError({
            type: 'trustpilot_api_error',
            endpoint: 'getAllReviews',
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        return errorResponse(res, error, error.message || 'Failed to fetch reviews');
    }
};
