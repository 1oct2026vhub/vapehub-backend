const { Op } = require('sequelize');
const { SeoMeta, Product, Category, Brand, BlogCategory, Blog, Deal } = require('../../../../models');
const { errorResponse, successResponse } = require('../../../../utils/responseUtils');
const logger = require('../../../../library/logger');
const seoService = require('./seo.service');
const { invalidateCachePattern } = require('../../../../library/cache');
const { recacheEntityFireAndForget, recacheHomeFireAndForget, recacheUrlsFireAndForget } = require('../../../../library/prerender');

const seoController = {
  // Get SEO metadata by entity type and optional entity ID
  async getSeoMeta(req, res) {
    try {
      const { entityType, entityId } = req.params;
      const { slug } = req.query;

      if (entityType !== 'page' && !entityId && !slug) {
        return errorResponse(res, { message: 'Either entityId or slug is required for non-page entities' }, 'Bad Request', 400);
      }

      let whereClause = { entityType };
      if (entityType !== 'page') {
        if (entityId) whereClause.entityId = entityId;
        else if (slug) whereClause.slug = slug;
      } else if (slug) {
        whereClause.slug = slug;
      }

      const seoMeta = await SeoMeta.findOne({ where: whereClause });
      if (!seoMeta) {
        return errorResponse(res, { message: 'SEO metadata not found' }, 'Not Found', 404);
      }

      let health = null;
      try {
        const identifier = entityType === 'page' ? seoMeta.slug : (entityId ?? seoMeta.entityId);
        health = await seoService.checkSeoHealth(entityType, identifier);
      } catch (err) {
        logger.error({ error: err, entityType, entityId: entityType === 'page' ? seoMeta.slug : entityId }, 'Error getting SEO health check');
      }

      let entityName = null;
      let entityData = null;
      switch (entityType) {
        case 'product':
          entityData = await Product.findByPk(seoMeta.entityId, { attributes: ['id', 'name', 'slug'] });
          entityName = entityData?.name;
          break;
        case 'category':
          entityData = await Category.findByPk(seoMeta.entityId, { attributes: ['id', 'name', 'slug'] });
          entityName = entityData?.name;
          break;
        case 'brand':
          entityData = await Brand.findByPk(seoMeta.entityId, { attributes: ['id', 'name', 'slug'] });
          entityName = entityData?.name;
          break;
        case 'blog_category':
          entityData = await BlogCategory.findByPk(seoMeta.entityId, { attributes: ['id', 'name', 'slug'] });
          entityName = entityData?.name;
          break;
        case 'blog_post':
          entityData = await Blog.findByPk(seoMeta.entityId, { attributes: ['id', 'title', 'slug'] });
          entityName = entityData?.title;
          break;
        case 'deals':
          entityData = await Deal.findByPk(seoMeta.entityId, { attributes: ['id', 'name', 'slug'] });
          entityName = entityData?.name;
          break;
        case 'page':
          entityName = seoMeta.slug;
          break;
      }

      const data = {
        seoMeta: seoMeta.toJSON ? seoMeta.toJSON() : seoMeta,
        health,
        entityName
      };

      return successResponse(res, data, 'SEO metadata retrieved successfully');
    } catch (error) {
      logger.error('Error getting SEO metadata:', error);
      return errorResponse(res, error);
    }
  },

  // Create or update SEO metadata
  async upsertSeoMeta(req, res) {
    try {
      const { entityType, entityId, ...seoData } = req.body;

      // Validate entityId for non-page entities
      if (entityType !== 'page' && !entityId) {
        return errorResponse(res, { message: 'entityId is required for non-page entities' }, 'Bad Request', 400);
      }

      // Check if entity exists for non-page types
      if (entityType !== 'page') {
        let EntityModel;
        switch (entityType) {
          case 'product':
            EntityModel = Product;
            break;
          case 'category':
            EntityModel = Category;
            break;
          case 'brand':
            EntityModel = Brand;
            break;
          case 'blog_category':
            EntityModel = BlogCategory;
            break;
          case 'blog_post':
            EntityModel = Blog;
            break;
          case 'deals':
            EntityModel = Deal;
            break;
          default:
            return errorResponse(res, { message: `Invalid entity type: ${entityType}` }, 'Bad Request', 400);
        }

        const entity = await EntityModel.findByPk(entityId);
        if (!entity) {
          return errorResponse(res, { message: `${entityType} with id ${entityId} not found` }, 'Not Found', 404);
        }
      }
      // Check for existing slug
      const existingSlug = await SeoMeta.findOne({
        where: {
          slug: seoData.slug,
          [Op.not]: {
            [Op.and]: [
              { entityType },
              { entityId: entityType === 'page' ? null : entityId }
            ]
          }
        }
      });
      if (existingSlug) {
        return errorResponse(res, { message: 'Slug must be unique' }, 'Bad Request', 400);
      }

      const updatedBy = req.user?.id ?? null;

      const existingSeoMeta = await SeoMeta.findOne({
        where: {
          entityType,
          entityId: entityType === 'page' ? null : entityId
        }
      });
      const oldSlug = existingSeoMeta?.slug;

      // Brands/deals: keep canonical aligned with public route even if admin UI omits the field
      if (entityType === 'brand' || entityType === 'deals') {
        const slugForCanonical = seoData.slug || existingSeoMeta?.slug;
        const built = seoService.buildCanonicalUrl(entityType, slugForCanonical);
        if (built) {
          seoData.canonicalUrl = built;
        }
      }

      // Create or update SEO metadata
      const [seoMeta, created] = await SeoMeta.upsert({
        entityType,
        entityId: entityType === 'page' ? null : entityId,
        ...seoData,
        ...(updatedBy != null && { updatedBy })
      }, {
        returning: true
      });

      invalidateCachePattern('seo:*').catch(() => {});
      invalidateCachePattern('sitemap:*').catch(() => {});
      recacheEntityFireAndForget(entityType, seoData.slug, oldSlug && oldSlug !== seoData.slug ? oldSlug : null, {
        source: 'upsertSeoMeta',
        entityId: entityType === 'page' ? null : entityId
      });
      return successResponse(res, { seoMeta }, `SEO metadata ${created ? 'created' : 'updated'} successfully`);
    } catch (error) {
      console.log(error);
      logger.error('Error upserting SEO metadata:', error);
      return errorResponse(res, error);
    }
  },

  // List SEO metadata with filtering and pagination
  async listSeoMeta(req, res) {
    try {
      const {
        entityType,
        entityId,
        keyword,
        noIndex,
        page = 1,
        limit = 10
      } = req.query;

      const whereClause = {};

      // Entity Type Filter
      if (entityType) {
        whereClause.entityType = entityType;
      }

      // Entity ID Filter
      if (entityId) {
        whereClause.entityId = parseInt(entityId);
      }

      // NoIndex Filter
      if (noIndex !== undefined) {
        whereClause.noIndex = noIndex === 'true';
      }

      // Keyword Search
      if (keyword) {
        whereClause[Op.or] = [
          { title: { [Op.like]: `%${keyword.toLowerCase()}%` } },
          { description: { [Op.like]: `%${keyword.toLowerCase()}%` } },
          { description_text: { [Op.like]: `%${keyword.toLowerCase()}%` } },
          { focusKeyword: { [Op.like]: `%${keyword.toLowerCase()}%` } },
          { slug: { [Op.like]: `%${keyword.toLowerCase()}%` } }
        ];
      }

      // Pagination
      const offset = (parseInt(page) - 1) * parseInt(limit);

      // First get the count and basic data
      const { count, rows } = await SeoMeta.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: offset,
        order: [['updatedAt', 'DESC']]
      });

      // Now fetch entity data for each row based on entityType
      const rowsWithEntities = await Promise.all(rows.map(async (seoMeta) => {
        let entityData = null;
        
        switch (seoMeta.entityType) {
          case 'product':
            entityData = await Product.findByPk(seoMeta.entityId, {
              attributes: ['id', 'name', 'slug']
            });
            break;
          case 'category':
            entityData = await Category.findByPk(seoMeta.entityId, {
              attributes: ['id', 'name', 'slug']
            });
            break;
          case 'brand':
            entityData = await Brand.findByPk(seoMeta.entityId, {
              attributes: ['id', 'name', 'slug']
            });
            break;
          case 'blog_category':
            entityData = await BlogCategory.findByPk(seoMeta.entityId, {
              attributes: ['id', 'name', 'slug']
            });
            break;
          case 'blog_post':
            entityData = await Blog.findByPk(seoMeta.entityId, {
              attributes: ['id', 'title', 'slug']
            });
            break;
          case 'deals':
            entityData = await Deal.findByPk(seoMeta.entityId, {
              attributes: ['id', 'name', 'slug']
            });
            break;
        }

        return {
          ...seoMeta.toJSON(),
          [seoMeta.entityType === 'blog_post' ? 'blog' : seoMeta.entityType === 'blog_category' ? 'blogCategory' : seoMeta.entityType]: entityData
        };
      }));

      // Add health check and entity name for each item
      const itemsWithHealth = await Promise.all(rowsWithEntities.map(async (item) => {
        try {
          const identifier = item.entityType === 'page' ? item.slug : item.entityId;
          const health = await seoService.checkSeoHealth(item.entityType, identifier);
          
          // Get entity name based on entity type
          let entityName = null;
          switch (item.entityType) {
            case 'product':
              entityName = item.product?.name;
              break;
            case 'category':
              entityName = item.category?.name;
              break;
            case 'brand':
              entityName = item.brand?.name;
              break;
            case 'blog_category':
              entityName = item.blogCategory?.name;
              break;
            case 'blog_post':
              entityName = item.blog?.title;
              break;
            case 'deals':
              entityName = item.deals?.name;
              break;
            case 'page':
              entityName = item.slug; // For pages, use slug as name
              break;
          }
          
          return { 
            ...item, 
            health,
            entityName
          };
        } catch (error) {
          logger.error({ error, item }, 'Error getting health check for item');
          return { ...item, health: null, entityName: null };
        }
      }));

      return successResponse(res, {
        data: itemsWithHealth,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      }, 'SEO metadata listed successfully');
    } catch (error) {
      logger.error('Error listing SEO metadata:', error);
      return errorResponse(res, error);
    }
  },

  async manualRecache(req, res) {
    try {
      const { url, urls, entityType, slug, oldSlug, recacheHome } = req.body;

      if (recacheHome) {
        recacheHomeFireAndForget({ source: 'manualRecache' });
      } else if (url) {
        recacheUrlsFireAndForget([url], { source: 'manualRecache' });
      } else if (urls?.length) {
        recacheUrlsFireAndForget(urls, { source: 'manualRecache' });
      } else if (entityType && slug) {
        recacheEntityFireAndForget(entityType, slug, oldSlug, { source: 'manualRecache' });
      } else {
        return errorResponse(
          res,
          { message: 'Provide url, urls, entityType+slug, or recacheHome: true' },
          'Bad Request',
          400
        );
      }

      return successResponse(res, { queued: true }, 'Recache queued');
    } catch (error) {
      logger.error('Error queueing manual recache:', error);
      return errorResponse(res, error);
    }
  }
};

module.exports = seoController; 