const { Op } = require('sequelize');
const db = require('../../../models');
const { createError } = require('../../../utils/errorHandler');

const seoController = {
  // Get SEO metadata by entity type and optional entity ID
  async getSeoMeta(req, res, next) {
    try {
      const { entityType, entityId } = req.params;
      const { slug } = req.query;
      
      let whereClause = { entityType };
      
      if (entityType !== 'page') {
        if (entityId) {
          whereClause.entityId = entityId;
        } else if (slug) {
          whereClause.slug = slug;
        } else {
          return next(createError(400, 'Either entityId or slug is required for non-page entities'));
        }
      }

      const seoMeta = await db.SeoMeta.findOne({ where: whereClause });
      
      if (!seoMeta) {
        return res.status(404).json({ message: 'SEO metadata not found' });
      }

      res.json(seoMeta);
    } catch (error) {
      next(createError(500, error.message));
    }
  },

  // Create or update SEO metadata
  async upsertSeoMeta(req, res, next) {
    try {
      const { entityType, entityId } = req.params;
      const seoData = req.body;

      // Validate entityId for non-page entities
      if (entityType !== 'page' && !entityId) {
        return next(createError(400, 'entityId is required for non-page entities'));
      }

      // Check for existing slug
      const existingSlug = await db.SeoMeta.findOne({
        where: {
          slug: seoData.slug,
          [Op.not]: {
            [Op.and]: [
              { entityType },
              { entityId: entityId || null }
            ]
          }
        }
      });

      if (existingSlug) {
        return next(createError(400, 'Slug must be unique'));
      }

      const [seoMeta, created] = await db.SeoMeta.upsert({
        entityType,
        entityId: entityType === 'page' ? null : entityId,
        ...seoData
      }, {
        returning: true
      });

      res.status(created ? 201 : 200).json(seoMeta);
    } catch (error) {
      next(createError(500, error.message));
    }
  }
};

module.exports = seoController; 