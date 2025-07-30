const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Carousel, BannerImage, SlugRelation, FooterSection, FooterLink, FlashNews, User, Deal, Product, Category, Brand, DealProduct, ProductCategory, ProductBrand } = require("../../../models");
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

/**
 * Get deals for a specific entity (category or brand)
 * @param {string} entityType - The type of entity (category or brand)
 * @param {number} entityId - The ID of the entity
 * @returns {Object} Object containing deals array and deals text
 */
const getDealsForEntity = async (entityType, entityId) => {
    // Build deal filter
    const dealFilter = {
        is_active: true,
        is_deleted: false,
        valid_from: { [Op.lte]: new Date() },
        valid_to: { [Op.gte]: new Date() }
    };

    let deals = [];
    let categoryName = 'products';

    if (entityType === 'category') {
        // Step 1: Get category details
        const category = await Category.findByPk(entityId);
        if (!category) {
            return { deals: [], deals_text: '' };
        }
        categoryName = category.name;

        // Step 2: Get product IDs from ProductCategory using category ID
        const productCategories = await ProductCategory.findAll({
            where: { category_id: entityId },
            attributes: ['product_id']
        });

        if (productCategories.length === 0) {
            return { deals: [], deals_text: '' };
        }

        const productIds = productCategories.map(pc => pc.product_id);

        // Step 3: Get deal IDs from DealProduct using product IDs
        const dealProducts = await DealProduct.findAll({
            where: { product_id: { [Op.in]: productIds } },
            attributes: ['deal_id'],
            include: [
                {
                    model: Product,
                    as: 'product',
                    where: { status: 'published' },
                    attributes: ['id', 'name', 'slug']
                }
            ]
        });

        if (dealProducts.length === 0) {
            return { deals: [], deals_text: '' };
        }

        const dealIds = [...new Set(dealProducts.map(dp => dp.deal_id))];

        // Step 4: Get deal data from Deal using deal IDs
        deals = await Deal.findAll({
            where: {
                id: { [Op.in]: dealIds },
                ...dealFilter
            },
            attributes: [
                'id', 
                'name', 
                'slug', 
                'deal_type', 
                'required_qty', 
                'get_qty', 
                'fixed_price', 
                'discount_percent', 
                'tiered_qty_json',
                'bundle_product_ids_json',
                'valid_from',
                'valid_to',
                'image_url',
                'createdAt'
            ]
        });

        // Add product count to each deal
        deals = deals.map(deal => {
            const dealProductCount = dealProducts.filter(dp => dp.deal_id === deal.id).length;
            return {
                ...deal.toJSON(),
                product_count: dealProductCount
            };
        });

    } else if (entityType === 'brand') {
        // Step 1: Get brand details
        const brand = await Brand.findByPk(entityId);
        if (!brand) {
            return { deals: [], deals_text: '' };
        }
        categoryName = brand.name;

        // Step 2: Get product IDs from ProductBrand using brand ID
        const productBrands = await ProductBrand.findAll({
            where: { brand_id: entityId },
            attributes: ['product_id']
        });

        if (productBrands.length === 0) {
            return { deals: [], deals_text: '' };
        }

        const productIds = productBrands.map(pb => pb.product_id);

        // Step 3: Get deal IDs from DealProduct using product IDs
        const dealProducts = await DealProduct.findAll({
            where: { product_id: { [Op.in]: productIds } },
            attributes: ['deal_id'],
            include: [
                {
                    model: Product,
                    as: 'product',
                    where: { status: 'published' },
                    attributes: ['id', 'name', 'slug']
                }
            ]
        });

        if (dealProducts.length === 0) {
            return { deals: [], deals_text: '' };
        }

        const dealIds = [...new Set(dealProducts.map(dp => dp.deal_id))];

        // Step 4: Get deal data from Deal using deal IDs
        deals = await Deal.findAll({
            where: {
                id: { [Op.in]: dealIds },
                ...dealFilter
            },
            attributes: [
                'id', 
                'name', 
                'slug', 
                'deal_type', 
                'required_qty', 
                'get_qty', 
                'fixed_price', 
                'discount_percent', 
                'tiered_qty_json',
                'bundle_product_ids_json',
                'valid_from',
                'valid_to',
                'image_url',
                'createdAt'
            ]
        });

        // Add product count to each deal
        deals = deals.map(deal => {
            const dealProductCount = dealProducts.filter(dp => dp.deal_id === deal.id).length;
            return {
                ...deal.toJSON(),
                product_count: dealProductCount
            };
        });
    }

    // Generate deals text
    let dealsText = '';
    if (deals.length > 0) {
        const dealResults = deals.slice(0, 2); // Take first 2 deals

        if (dealResults.length === 1) {
            const deal = dealResults[0];
            if (deal.fixed_price) {
                dealsText = `Get the most for your money with our amazing ${deal.required_qty} for £${deal.fixed_price} deal on ${categoryName} vapes from leading brands! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
            } else if (deal.discount_percent) {
                dealsText = `Get the most for your money with our amazing ${deal.discount_percent}% off deal on ${categoryName} vapes from leading brands! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
            } else {
                dealsText = `Get the most for your money with our amazing deals on ${categoryName} vapes from leading brands! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
            }
        } else if (dealResults.length >= 2) {
            const deal1 = dealResults[0];
            const deal2 = dealResults[1];
            
            let deal1Text = '';
            let deal2Text = '';

            if (deal1.fixed_price) {
                deal1Text = `${deal1.required_qty} for £${deal1.fixed_price}`;
            } else if (deal1.discount_percent) {
                deal1Text = `${deal1.discount_percent}% off`;
            } else {
                deal1Text = 'amazing deal';
            }

            if (deal2.fixed_price) {
                deal2Text = `${deal2.required_qty} for £${deal2.fixed_price}`;
            } else if (deal2.discount_percent) {
                deal2Text = `${deal2.discount_percent}% off`;
            } else {
                deal2Text = 'amazing offer';
            }

            dealsText = `Get the most for your money with our amazing ${deal1Text} deal and ${deal2Text} offer on ${categoryName} vapes from leading brands! Mix & Match to find the perfect combination of devices, or just stock up on great deals. They're not our only multibuy deals, we have plenty more!`;
        }
    }

    return {
        deals,
        deals_text: dealsText
    };
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

            const response = {
                slug: slugRelations[0].slug,
                entity_type: slugRelations[0].entity_type,
                entity_id: slugRelations[0].entity_id,
                seo: seoData
            };

            // Include deals if entity is category or brand
            if (['category', 'brand'].includes(slugRelations[0].entity_type)) {
                const dealsData = await getDealsForEntity(
                    slugRelations[0].entity_type,
                    slugRelations[0].entity_id
                );
                response.deals = dealsData.deals;
                response.deals_text = dealsData.deals_text;
            }

            return successResponse(res, response, 'Success');
        }

        // Handle multiple slugs query
        const matchedSlugs = new Set(slugRelations.map(relation => relation.slug));
        const allSlugsMatched = slugArray.every(slug => matchedSlugs.has(slug));

        if (!allSlugsMatched) {
            const response = {
                message: 'Partial matches found, refine your query if needed',
                data: slugRelations.map(relation => ({
                    slug: relation.slug,
                    entity_type: relation.entity_type,
                    entity_id: relation.entity_id
                }))
            };

            // Include deals for each matched slug
            const dealsPromises = slugRelations
                .filter(relation => ['category', 'brand'].includes(relation.entity_type))
                .map(async (relation) => {
                    const dealsData = await getDealsForEntity(
                        relation.entity_type,
                        relation.entity_id
                    );
                    return {
                        slug: relation.slug,
                        deals: dealsData.deals,
                        deals_text: dealsData.deals_text
                    };
                });

            const dealsResults = await Promise.all(dealsPromises);
            if (dealsResults.length > 0) {
                response.deals_by_slug = dealsResults;
            }

            return successResponse(res, response, 'Success');
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

            const response = sortedRelations.map(relation => ({
                slug: relation.slug,
                entity_type: relation.entity_type,
                entity_id: relation.entity_id
            }));

            // Include deals for category/brand slugs
            const dealsPromises = sortedRelations
                .filter(relation => ['category', 'brand'].includes(relation.entity_type))
                .map(async (relation) => {
                    const dealsData = await getDealsForEntity(
                        relation.entity_type,
                        relation.entity_id
                    );
                    return {
                        slug: relation.slug,
                        deals: dealsData.deals,
                        deals_text: dealsData.deals_text
                    };
                });

            const dealsResults = await Promise.all(dealsPromises);
            if (dealsResults.length > 0) {
                return successResponse(res, {
                    relations: response,
                    deals_by_slug: dealsResults
                }, 'Success');
            }

            // If validation passes, return the pair
            return successResponse(res, response, 'Success');
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
 * Get Trustpilot product reviews
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
module.exports.getTrustpilotReviewSummaries = async (req, res, next) => {
    try {
        const { 
            page = 1, 
            per_page = 10
        } = req.query;
        
        // Get access token and business unit ID
        const accessToken = await getAccessToken();
        const businessUnitId = await findBusinessUnitId(accessToken);

        // Log the API request
        logger.logInfo({
            type: 'trustpilot_api_request',
            endpoint: 'getReviewSummaries',
            businessUnitId,
            requestDetails: {
                page,
                per_page,
                timestamp: new Date().toISOString()
            }
        });

        // Get review summaries from Trustpilot API
        const response = await axios.get(
            `https://api.trustpilot.com/v1/private/product-reviews/business-units/${businessUnitId}/summaries`,
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
        // Log the API response
        logger.logInfo({
            type: 'trustpilot_api_response',
            endpoint: 'getReviewSummaries',
            responseData: {
                totalSummaries: response.data.summaries?.length || 0,
                page,
                per_page,
                timestamp: new Date().toISOString()
            }
        });

        // If no summaries found, return empty response
        if (!response.data.summaries || response.data.summaries.length === 0) {
            return successResponse(res, {
                summaries: [],
                pagination: {
                    total: 0,
                    page: parseInt(page),
                    per_page: parseInt(per_page)
                }
            }, 'No review summaries found');
        }

        // Process review summaries
        const processedSummaries = response.data.summaries.map(summary => ({
            id: summary.id,
            name: summary.name,
            sku: summary.sku,
            brand: summary.brand,
            numberOfReviews: {
                total: summary.numberOfReviews?.total || 0,
                oneStar: summary.numberOfReviews?.oneStar || 0,
                twoStars: summary.numberOfReviews?.twoStars || 0,
                threeStars: summary.numberOfReviews?.threeStars || 0,
                fourStars: summary.numberOfReviews?.fourStars || 0,
                fiveStars: summary.numberOfReviews?.fiveStars || 0
            },
            score: {
                stars: summary.score?.stars || 0,
                trustScore: summary.score?.trustScore || 0
            }
        }));

        return successResponse(res, {
            summaries: processedSummaries,
            pagination: {
                total: response.data.total || 0,
                page: parseInt(page),
                per_page: parseInt(per_page)
            }
        }, 'Successfully retrieved review summaries');

    } catch (error) {
        // Log error
        logger.logError({
            type: 'trustpilot_api_error',
            endpoint: 'getReviewSummaries',
            error: error.message,
            stack: error.stack,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            timestamp: new Date().toISOString()
        });

        // Handle specific error cases
        if (error.response) {
            switch (error.response.status) {
                case 404:
                    return successResponse(res, {
                        summaries: [],
                        pagination: {
                            total: 0,
                            page: parseInt(req.query.page || 1),
                            per_page: parseInt(req.query.per_page || 10)
                        }
                    }, 'No review summaries found');
                case 401:
                    return errorResponse(res, { message: 'Invalid Trustpilot API credentials' }, 'Authentication failed', 401);
                case 403:
                    return errorResponse(res, { message: 'Access to review summaries is forbidden' }, 'Access forbidden', 403);
                case 400:
                    return errorResponse(res, error.response.data || { message: 'Bad request' }, 'Bad request', 400);
                default:
                    return errorResponse(res, error.response.data || error.message, 'Failed to fetch review summaries', error.response.status);
            }
        }

        return errorResponse(res, error, error.message || 'Failed to fetch review summaries');
    }
};

module.exports.getTrustpilotProductReviews = async (req, res, next) => {
    try {
        const { 
            page = 1, 
            per_page = 10,
            sku,
            productUrl,
            language,
            stars,
            locale,
            attributeIds,
            hasAttachments
        } = req.query;
        
        // Get access token and business unit ID
        const accessToken = await getAccessToken();
        const businessUnitId = await findBusinessUnitId(accessToken);

        // Log the API request
        logger.logInfo({
            type: 'trustpilot_api_request',
            endpoint: 'getProductReviews',
            businessUnitId,
            requestDetails: {
                page,
                per_page,
                sku,
                productUrl,
                language,
                stars,
                locale,
                attributeIds,
                hasAttachments,
                timestamp: new Date().toISOString()
            }
        });

        // Build query parameters
        const queryParams = {
            page,
            perPage: per_page
        };

        // Add optional parameters if provided
        if (sku) {
            try {
                const skuArray = JSON.parse(sku);
                // queryParams['sku[]'] = Array.isArray(skuArray) ? skuArray : [sku];
                queryParams['sku'] = sku;
            } catch (e) {
                // queryParams['sku[]'] = [sku];
                queryParams['sku'] = sku;
            }
        }
        // Get reviews from Trustpilot API
        const response = await axios.get(
            `https://api.trustpilot.com/v1/product-reviews/business-units/${businessUnitId}/reviews`,
            {
                params: queryParams,
                headers: {
                    'apikey': process.env.TRUSTPILOT_API_KEY,
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );
        
        // Check if we have productReviews in the response
        if (!response.data || !response.data.productReviews || !Array.isArray(response.data.productReviews)) {
            return successResponse(res, {
                reviews: [],
                pagination: {
                    total: 0,
                    page: parseInt(page),
                    per_page: parseInt(per_page)
                }
            }, 'No product reviews found');
        }


        // Process reviews
        const processedReviews = response.data.productReviews.map(review => ({
            id: review.id,
            stars: review.stars,
            title: review.title,
            text: review.content,
            createdAt: review.createdAt,
            consumer: {
                displayName: review.consumer?.displayName
            },
            language: review.language,
            locale: review.locale,
            hasAttachments: review.attachments?.length > 0,
            attributes: review.attributeRatings || []
        }));

        return successResponse(res, {
            reviews: processedReviews,
            pagination: {
                total: response.data.productReviews.length || 0,
                page: parseInt(page),
                per_page: parseInt(per_page)
            }
        }, 'Successfully retrieved product reviews');

    } catch (error) {
        // Log error
        logger.logError({
            type: 'trustpilot_api_error',
            endpoint: 'getProductReviews',
            error: error.message,
            stack: error.stack,
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            timestamp: new Date().toISOString()
        });

        // Handle specific error cases
        if (error.response) {
            switch (error.response.status) {
                case 404:
                    return successResponse(res, {
                        reviews: [],
                        pagination: {
                            total: 0,
                            page: parseInt(req.query.page || 1),
                            per_page: parseInt(req.query.per_page || 10)
                        }
                    }, 'No product reviews found');
                case 401:
                    return errorResponse(res, { message: 'Invalid Trustpilot API credentials' }, 'Authentication failed', 401);
                case 403:
                    return errorResponse(res, { message: 'Access to product reviews is forbidden' }, 'Access forbidden', 403);
                case 400:
                    return errorResponse(res, error.response.data || { message: 'Bad request' }, 'Bad request', 400);
                default:
                    return errorResponse(res, error.response.data || error.message, 'Failed to fetch product reviews', error.response.status);
            }
        }

        return errorResponse(res, error, error.message || 'Failed to fetch product reviews');
    }
};
