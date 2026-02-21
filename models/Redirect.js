'use strict';
const { Model, Op } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Redirect extends Model {
    static associate(models) {
      // Optional: Define associations if needed
      // For example, you could add a belongsTo relation to SlugRelation
      // but since we're using slug as a string reference, it's not strictly necessary
    }

    /**
     * Determine entity type from URL prefix (for Rank Math redirect imports)
     * Mapping:
     * - product-tag/ -> deal
     * - product-category/ -> category
     * - brand/ -> brand
     * - blog/ -> blog
     * @param {string} url - The source URL or path
     * @returns {string|null} The entity type or null if no prefix match
     */
    static getEntityTypeFromPrefix(url) {
      if (!url) return null;
      const normalized = String(url).toLowerCase().trim();
      if (normalized.includes('/product-tag/')) return 'deal';
      if (normalized.includes('/product-category/')) return 'category';
      if (normalized.includes('/brand/')) return 'brand';
      if (normalized.includes('/blog/')) return 'blog';
      return null;
    }

    /**
     * Find an active redirect by source URL
     * @param {string} sourceUrl - The old URL to look up
     * @returns {Promise<Redirect|null>} The redirect if found and active, null otherwise
     */
    static async findBySourceUrl(sourceUrl) {
      return await this.findOne({
        where: {
          sources: sourceUrl,
          status: 'active',
          deletedAt: null
        }
      });
    }

    /**
     * Find all redirects for a specific entity type
     * @param {string} entityType - The entity type
     * @returns {Promise<Redirect[]>} Array of redirects
     */
    static async findByEntityType(entityType) {
      return await this.findAll({
        where: {
          entity_type: entityType,
          deletedAt: null
        },
        order: [['createdAt', 'DESC']]
      });
    }

    /**
     * Find all redirects by destination slug
     * @param {string} slug - The destination slug
     * @returns {Promise<Redirect[]>} Array of redirects
     */
    static async findBySlug(slug) {
      return await this.findAll({
        where: {
          slug: slug,
          deletedAt: null
        },
        order: [['createdAt', 'DESC']]
      });
    }

    /**
     * Find all redirects by source URL pattern
     * @param {string[]} sourceUrls - Array of source URLs to look up
     * @returns {Promise<Redirect[]>} Array of redirects
     */
    static async findBySources(sourceUrls) {
      return await this.findAll({
        where: {
          sources: { [Op.in]: sourceUrls },
          status: 'active',
          deletedAt: null
        }
      });
    }
  }

  Redirect.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      unique: true
    },
    sources: {
      type: DataTypes.STRING(500),
      allowNull: false,
      comment: 'Source URL/path that should redirect (e.g., /old-path or https://...)',
      validate: {
        notEmpty: true,
        len: [1, 500],
        isValidUrlOrPath(value) {
          if (!value || typeof value !== 'string') return;
          const v = value.trim();
          if (!v) return;
          if (/^https?:\/\//i.test(v)) {
            try {
              new URL(v);
            } catch (e) {
              throw new Error('sources must be a valid absolute URL (e.g. https://example.com/path)');
            }
            return;
          }
          if (!v.startsWith('/')) {
            throw new Error('sources must be a valid URL (https://...) or path starting with /');
          }
          if (/\s/.test(v) || /[<>"|?*]/.test(v)) {
            throw new Error('sources path contains invalid characters');
          }
        }
      }
    },
    url_to: {
      type: DataTypes.STRING(500),
      allowNull: false,
      comment: 'New destination URL/path (e.g., /ivg-pro-12-prefilled-pods/ or https://...)',
      validate: {
        notEmpty: true,
        len: [1, 500],
        isValidUrlOrPath(value) {
          if (!value || typeof value !== 'string') return;
          const v = value.trim();
          if (!v) return;
          // Absolute URL: must be valid http/https URL
          if (/^https?:\/\//i.test(v)) {
            try {
              new URL(v);
            } catch (e) {
              throw new Error('url_to must be a valid absolute URL (e.g. https://example.com/path)');
            }
            return;
          }
          // Relative path: must start with / and contain valid path characters
          if (!v.startsWith('/')) {
            throw new Error('url_to must be a valid URL (https://...) or path starting with /');
          }
          // Disallow spaces, control chars, or obviously invalid path segments
          if (/\s/.test(v) || /[<>"|?*]/.test(v)) {
            throw new Error('url_to path contains invalid characters');
          }
        }
      }
    },
    header_code: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      defaultValue: 301,
      comment: 'HTTP redirect code: 301 (permanent) or 302 (temporary)',
      validate: {
        isIn: [[301, 302]]
      }
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      allowNull: false,
      defaultValue: 'active',
      comment: 'Whether this redirect is active or inactive'
    },
    entity_type: {
      type: DataTypes.ENUM('brand', 'blog', 'blog_category', 'category', 'product', 'product_variant', 'attribute', 'attribute_term', 'deal'),
      allowNull: false,
      comment: 'Type of the destination entity (matches SlugRelation entity_type)',
      validate: {
        notEmpty: true,
        isIn: [['brand', 'blog', 'blog_category', 'category', 'product', 'product_variant', 'attribute', 'attribute_term', 'deal']]
      }
    },
    slug: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Canonical slug of the destination entity (matches SlugRelation.slug)',
      validate: {
        notEmpty: true,
        len: [1, 255]
      }
    },
    meta_data: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: 'Additional metadata (e.g., source, notes, created_by)'
    }
  }, {
    sequelize,
    modelName: 'Redirect',
    tableName: 'redirects',
    underscored: false,
    paranoid: true,
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['sources']
      },
      {
        fields: ['slug']
      },
      {
        fields: ['entity_type']
      },
      {
        fields: ['status']
      },
      {
        fields: ['deletedAt']
      }
    ],
    hooks: {
      beforeValidate: async (redirect) => {
        // Normalize sources and url_to (preserve prefixes like brand/, product-tag/, etc.)
        // Only normalize slashes: ensure leading slash for relative paths, remove trailing slash
        if (redirect.sources) {
          redirect.sources = redirect.sources.trim();
          // Skip normalization for absolute URLs
          const isAbsoluteUrl = /^https?:\/\//i.test(redirect.sources);
          if (!isAbsoluteUrl && !redirect.sources.startsWith('/')) {
            redirect.sources = '/' + redirect.sources;
          }
          // Remove trailing slash for consistency (except root path and absolute URLs)
          if (!isAbsoluteUrl) {
            redirect.sources = redirect.sources.replace(/\/$/, '') || '/';
            // Remove /amp/ suffix if present (normalize AMP URLs)
            redirect.sources = redirect.sources.replace(/\/amp\/?$/, '');
          }
        }
        
        if (redirect.url_to) {
          redirect.url_to = redirect.url_to.trim();
          // Skip normalization for absolute URLs
          const isAbsoluteUrl = /^https?:\/\//i.test(redirect.url_to);
          if (!isAbsoluteUrl && !redirect.url_to.startsWith('/')) {
            redirect.url_to = '/' + redirect.url_to;
          }
          // Remove trailing slash for consistency (except root path and absolute URLs)
          if (!isAbsoluteUrl) {
            redirect.url_to = redirect.url_to.replace(/\/$/, '') || '/';
          }
        }
      }
    }
  });

  return Redirect;
};
