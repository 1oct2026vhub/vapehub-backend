const { Op } = require('sequelize');
const { SeoMeta, Product, ProductVariant, Category, Brand, BlogCategory, Blog, Deal } = require('../../../../models');
const logger = require('../../../../library/logger');
const { cacheOrFetch, invalidateCachePattern } = require('../../../../library/cache');
const { recacheEntityFireAndForget, recacheHomeFireAndForget } = require('../../../../library/prerender');

// SEO Health Status Constants
const SEO_HEALTH_STATUS = {
  GREEN: 'green',
  ORANGE: 'orange',
  RED: 'red'
};

// SEO Health Metrics Weights
const SEO_METRICS_WEIGHTS = {
  TITLELENGTH: 0.15,
  DESCRIPTIONLENGTH: 0.15,
  FOCUSKEYWORD: 0.15,
  NOINDEX: 0.15,
  SLUGOPTIMIZATION: 0.15,
  METATAGS: 0.15,
  CONTENTLENGTH: 0.10
};

class SeoService {
  constructor() {
    this.models = { SeoMeta, Product, ProductVariant, Category, Brand, BlogCategory, Blog, Deal };
    this.logger = logger;
  }

  /**
   * Get SEO metadata for a specific entity (cached)
   * @param {string} entityType - Type of entity (product, category, brand, blog_category, blog_post)
   * @param {string} slug - URL slug
   * @returns {Promise<Object|null>} SEO metadata as plain object, or null if not found
   */
  async getSeoMeta(entityType, slug) {
    try {
      const cacheKey = `seo:meta:${entityType}:${slug || ''}`;

      const data = await cacheOrFetch(cacheKey, async () => {
        // this.logger.info({ entityType, slug }, 'Getting SEO metadata');

        const seoMeta = await this.models.SeoMeta.findOne({
          where: { entityType, slug }
        });

        if (!seoMeta) {
          // this.logger.warn({ entityType, slug }, 'SEO metadata not found');
          return null;
        }

        // this.logger.info({ entityType, slug }, 'Successfully retrieved SEO metadata');
        return seoMeta.toJSON ? seoMeta.toJSON() : seoMeta;
      }, 300);

      return data;
    } catch (error) {
      this.logger.error({ error, entityType, slug }, 'Error getting SEO metadata');
      throw error;
    }
  }

  /**
   * Update noIndex value for a specific entity
   * @param {string} entityType - Type of entity (product, category, brand, blog_category, blog_post)
   * @param {string} entityId - ID of the entity
   * @param {boolean} noIndex - Value to set for noIndex
   * @returns {Promise<Object>} Updated SEO metadata
   */
  async updateNoIndex(entityType, entityId, noIndex) {
    try {
      this.logger.info({ entityType, entityId, noIndex }, 'Updating noIndex for entity'); 
      
      const seoMeta = await this.models.SeoMeta.findOne({
        where: { entityType, entityId }
      });

      if (!seoMeta) {
        this.logger.warn({ entityType, entityId }, 'SEO metadata not found');
        throw new Error('SEO metadata not found');
      }

      const updatedSeoMeta = await seoMeta.update({ noIndex });
      invalidateCachePattern('seo:*').catch(() => {});
      invalidateCachePattern('sitemap:*').catch(() => {});
      this.logger.info({ entityType, entityId, noIndex }, 'Successfully updated noIndex for entity');
      return { seoMeta: updatedSeoMeta };
    } catch (error) {
      this.logger.error({ error, entityType, entityId, noIndex }, 'Error updating noIndex for entity');
      // throw error;
    }
  }

  /**
   * Update noIndex for products based on status and variants
   * @param {string} productId - Product ID
   * @param {string} status - Product status
   * @returns {Promise<Object>} Updated SEO metadata
   */
  async updateProductNoIndex(productId, status) {
    try {
      this.logger.info({ productId, status }, 'Updating product noIndex');
      
      const product = await this.models.Product.findByPk(productId, {
        include: [{
          model: this.models.ProductVariant,
          as: 'variants',
          where: { status: 'active', deleted_at: null },
          required: false
        }]
      });

      if (!product) {
        this.logger.warn({ productId }, 'Product not found');
        throw new Error('Product not found');
      }

      const noIndex = status !== 'published' || !product.variants.length;
      const result = await this.updateNoIndex('product', productId, noIndex);
      this.logger.info({ productId, status, noIndex }, 'Successfully updated product noIndex');
      return result;
    } catch (error) {
      this.logger.error({ error, productId, status }, 'Error updating product noIndex');
      // throw error;
    }
  }

  /**
   * Update noIndex for categories based on status and products
   * @param {string} categoryId - Category ID
   * @returns {Promise<Object>} Updated SEO metadata
   */
  async updateCategoryNoIndex(categoryId) {
    try {
      this.logger.info({ categoryId }, 'Updating category noIndex');
      
      const category = await this.models.Category.findByPk(categoryId);

      if (!category) {
        this.logger.warn({ categoryId }, 'Category not found');
        return { success: false, message: 'Category not found' };
      }

      // Set noIndex to true if category is deleted, false otherwise
      const noIndex = category.deletedAt !== null;
      const result = await this.updateNoIndex('category', categoryId, noIndex);
      this.logger.info({ categoryId, noIndex }, 'Successfully updated category noIndex');
      return { success: true, ...result };
    } catch (error) {
      this.logger.error({ error, categoryId }, 'Error updating category noIndex');
      return { success: false, message: error.message || 'Error updating category noIndex' };
    }
  }

  /**
   * Update noIndex for brands based on status and products
   * @param {string} brandId - Brand ID
   * @returns {Promise<Object>} Updated SEO metadata
   */
  async updateBrandNoIndex(brandId) {
    try {
      this.logger.info({ brandId }, 'Updating brand noIndex');
      
      const brand = await this.models.Brand.findByPk(brandId);

      if (!brand) {
        this.logger.warn({ brandId }, 'Brand not found');
        return { success: false, message: 'Brand not found' };
      }

      // Set noIndex to true if brand is deleted, false otherwise
      const noIndex = brand.deletedAt !== null;
      const result = await this.updateNoIndex('brand', brandId, noIndex);
      this.logger.info({ brandId, noIndex }, 'Successfully updated brand noIndex');
      return { success: true, ...result };
    } catch (error) {
      this.logger.error({ error, brandId }, 'Error updating brand noIndex');
      return { success: false, message: error.message || 'Error updating brand noIndex' };
    }
  }

  /**
   * Update noIndex for blog categories based on deleted status
   * @param {string} categoryId - Blog category ID
   * @returns {Promise<Object>} Updated SEO metadata
   */
  async updateBlogCategoryNoIndex(categoryId) {
    try {
      this.logger.info({ categoryId }, 'Updating blog category noIndex');
      
      const category = await this.models.BlogCategory.findByPk(categoryId);

      if (!category) {
        this.logger.warn({ categoryId }, 'Blog category not found');
        return { success: false, message: 'Blog category not found' };
      }

      // Set noIndex to true if blog category is deleted, false otherwise
      const noIndex = category.deletedAt !== null;
      const result = await this.updateNoIndex('blog_category', categoryId, noIndex);
      this.logger.info({ categoryId, noIndex }, 'Successfully updated blog category noIndex');
      return { success: true, ...result };
    } catch (error) {
      this.logger.error({ error, categoryId }, 'Error updating blog category noIndex');
      return { success: false, message: error.message || 'Error updating blog category noIndex' };
    }
  }

  /**
   * Update noIndex for blog posts based on status and publication date
   * @param {string} blogId - Blog post ID
   * @param {string} status - Blog post status
   * @param {Date} publishedAt - Publication date
   * @returns {Promise<Object>} Updated SEO metadata
   */
  async updateBlogPostNoIndex(blogId, status, publishedAt) {
    try {
      this.logger.info({ blogId, status, publishedAt }, 'Updating blog post noIndex');
      
      const blog = await this.models.Blog.findByPk(blogId);

      if (!blog) {
        this.logger.warn({ blogId }, 'Blog post not found');
        throw new Error('Blog post not found');
      }

      const currentDate = new Date();
      const isPublished = status === 'published' && publishedAt && publishedAt <= currentDate;
      const noIndex = !isPublished;
      
      const result = await this.updateNoIndex('blog_post', blogId, noIndex);
      this.logger.info({ blogId, status, publishedAt, noIndex }, 'Successfully updated blog post noIndex');
      return result;
    } catch (error) {
      this.logger.error({ error, blogId, status, publishedAt }, 'Error updating blog post noIndex');
      // throw error;
    }
  }

  /**
   * Check SEO health for a specific entity
   * @param {string} entityType - Type of entity (product, category, brand, blog_category, blog_post)
   * @param {string} entityId - ID of the entity
   * @returns {Promise<Object>} SEO health status and details
   */
  async checkSeoHealth(entityType, entityId) {
    try {
      this.logger.info({ entityType, entityId }, 'Checking SEO health');

      let seoMeta;
      if (entityType === 'page') {
        seoMeta = await this.models.SeoMeta.findOne({
          where: { entityType, slug: entityId }
        });
      } else {
        seoMeta = await this.models.SeoMeta.findOne({
          where: { entityType, entityId }
        });
      }

      if (!seoMeta) {
        this.logger.warn({ entityType, entityId }, 'SEO metadata not found for health check');
        return {
          status: SEO_HEALTH_STATUS.RED,
          score: 0,
          details: {
            message: 'No SEO metadata found',
            issues: ['Missing SEO metadata']
          }
        };
      }

      // Calculate individual metrics scores
      const metrics = {
        titleLength: Number(this.checkTitleLength(seoMeta.title)) || 0,
        descriptionLength: Number(this.checkDescriptionLength(seoMeta.description)) || 0,
        focusKeyword: Number(this.checkFocusKeyword(seoMeta.focusKeyword)) || 0,
        noIndex: Number(this.checkNoIndex(seoMeta.noIndex)) || 0,
        slugOptimization: Number(this.checkSlugOptimization(seoMeta.slug)) || 0,
        metaTags: Number(this.checkMetaTags(seoMeta)) || 0,
        contentLength: Number(await this.checkContentLength(entityType, entityId)) || 0
      };

      // Calculate weighted score
      const score = this.calculateWeightedScore(metrics);

      // Determine overall status
      const status = this.determineHealthStatus(score);

      // Prepare detailed report
      const details = this.prepareHealthDetails(metrics, score);

      this.logger.info({ 
        entityType, 
        entityId, 
        score, 
        status 
      }, 'SEO health check completed');

      return {
        status,
        score,
        details
      };
    } catch (error) {
      this.logger.error({ error, entityType, entityId }, 'Error checking SEO health');
      return {
        status: SEO_HEALTH_STATUS.RED,
        score: 0,
        details: {
          message: 'Error checking SEO health',
          issues: ['Failed to perform SEO health check']
        }
      };
    }
  }

  /**
   * Check title length optimization
   * @param {string} title - SEO title
   * @returns {number} Score between 0 and 1
   */
  checkTitleLength(title) {
    if (!title) return 0;
    const length = title.length;
    if (length >= 50 && length <= 60) return 1;
    if (length >= 40 && length <= 70) return 0.8;
    if (length >= 30 && length <= 80) return 0.6;
    if (length >= 20 && length <= 90) return 0.4;
    if (length >= 10 && length <= 100) return 0.2;
    return 0.1; // Very low score for extremely short titles
  }

  /**
   * Check description length optimization
   * @param {string} description - Meta description
   * @returns {number} Score between 0 and 1
   */
  checkDescriptionLength(description) {
    if (!description) return 0;
    const length = description.length;
    if (length >= 150 && length <= 160) return 1;
    if (length >= 120 && length <= 180) return 0.8;
    if (length >= 100 && length <= 200) return 0.6;
    if (length >= 50 && length <= 250) return 0.4;
    if (length >= 20 && length <= 300) return 0.2;
    return 0.1; // Very low score for extremely short descriptions
  }

  /**
   * Check focus keyword optimization
   * @param {string} focusKeyword - Focus keyword
   * @returns {number} Score between 0 and 1
   */
  checkFocusKeyword(focusKeyword) {
    if (!focusKeyword) return 0;
    return 1;
  }

  /**
   * Check noIndex status
   * @param {boolean} noIndex - NoIndex flag
   * @returns {number} Score between 0 and 1
   */
  checkNoIndex(noIndex) {
    return noIndex ? 0 : 1;
  }

  /**
   * Check slug optimization
   * @param {string} slug - URL slug
   * @returns {number} Score between 0 and 1
   */
  checkSlugOptimization(slug) {
    if (!slug) return 0;
    // Check for special characters, spaces, etc.
    const hasSpecialChars = /[^a-z0-9-]/.test(slug);
    const hasSpaces = /\s/.test(slug);
    const isTooLong = slug.length > 100;
    return (hasSpecialChars || hasSpaces || isTooLong) ? 0.5 : 1;
  }

  /**
   * Check meta tags optimization
   * @param {Object} seoMeta - SEO metadata
   * @returns {number} Score between 0 and 1
   */
  checkMetaTags(seoMeta) {
    let score = 0;
    if (seoMeta.title) score += 0.3;
    if (seoMeta.description) score += 0.3;
    if (seoMeta.focusKeyword) score += 0.2;
    if (seoMeta.slug) score += 0.2;
    return score;
  }

  /**
   * Check content length based on entity type
   * @param {string} entityType - Entity type
   * @param {string} entityId - Entity ID or slug for pages
   * @returns {Promise<number>} Score between 0 and 1
   */
  async checkContentLength(entityType, entityId) {
    try {
      let content = '';
      let product, blog, category, deal, seoMeta;

      // Function to strip HTML tags and decode HTML entities
      const stripHtml = (html) => {
        if (!html) return '';
        // Replace HTML entities
        const decoded = html.replace(/&nbsp;/g, ' ')
                          .replace(/&amp;/g, '&')
                          .replace(/&lt;/g, '<')
                          .replace(/&gt;/g, '>')
                          .replace(/&quot;/g, '"')
                          .replace(/&#39;/g, "'");
        // Remove HTML tags
        return decoded.replace(/<[^>]*>/g, ' ').trim();
      };

      switch (entityType) {
        case 'product':
          product = await this.models.Product.findByPk(entityId);
          content = product ? stripHtml(product.description || '') : '';
          break;
        case 'blog_post':
          blog = await this.models.Blog.findByPk(entityId);
          content = blog ? stripHtml(blog.content || '') : '';
          break;
        case 'category':
          category = await this.models.Category.findByPk(entityId);
          content = category ? stripHtml(category.description || '') : '';
          break;
        case 'page':
          seoMeta = await this.models.SeoMeta.findOne({
            where: { 
              entityType: 'page',
              slug: entityId
            }
          });
          content = seoMeta ? stripHtml(seoMeta.description || '') : '';
          break;
        case 'deals':
          deal = await this.models.Deal.findByPk(entityId);
          content = deal ? stripHtml(deal.description || '') : '';
          break;
        default:
          return 0.5;
      }

      // Different content length requirements for different entity types
      const minLengths = {
        product: { min: 300, medium: 500, good: 1000 },
        blog_post: { min: 500, medium: 1000, good: 2000 },
        category: { min: 200, medium: 400, good: 800 },
        page: { min: 150, medium: 300, good: 500 }, // Lower requirements for pages since we're using meta description
        deals: { min: 200, medium: 400, good: 800 }
      };

      const lengths = minLengths[entityType] || { min: 300, medium: 500, good: 1000 };
      const length = content.length;

      if (length >= lengths.good) return 1;
      if (length >= lengths.medium) return 0.8;
      if (length >= lengths.min) return 0.6;
      return 0.3;
    } catch (error) {
      this.logger.error({ error, entityType, entityId }, 'Error checking content length');
      return 0;
    }
  }

  /**
   * Calculate weighted score from metrics
   * @param {Object} metrics - Individual metric scores
   * @returns {number} Weighted score between 0 and 1
   */
  calculateWeightedScore(metrics) {
    if (!metrics || typeof metrics !== 'object') {
      console.log('Invalid metrics input');
      return 0;
    }

    const result = Object.entries(metrics).reduce((total, [metric, score]) => {
      const weight = SEO_METRICS_WEIGHTS[metric.toUpperCase()];
      const weightedScore = score * weight;
      return total + weightedScore;
    }, 0);

    // Convert decimal to percentage and round to 2 decimal places
    return Math.round(result * 100);
  }

  /**
   * Determine health status based on score
   * @param {number} score - Weighted score
   * @returns {string} Health status
   */
  determineHealthStatus(score) {
    if (score >= 80) return SEO_HEALTH_STATUS.GREEN;
    if (score >= 50) return SEO_HEALTH_STATUS.ORANGE;
    return SEO_HEALTH_STATUS.RED;
  }

  /**
   * Prepare detailed health report
   * @param {Object} metrics - Individual metric scores
   * @param {number} score - Overall score
   * @returns {Object} Detailed health report
   */
  prepareHealthDetails(metrics, score) {
    const issues = [];
    const recommendations = [];

    // Title length check
    if (metrics.titleLength < 0.8) {
      issues.push('Title length needs optimization');
      recommendations.push('Optimize title length to be between 50-60 characters');
    }

    // Description length check
    if (metrics.descriptionLength < 0.8) {
      issues.push('Description length needs optimization');
      recommendations.push('Optimize description length to be between 150-160 characters');
    }

    // Focus keyword check
    if (metrics.focusKeyword === 0) {
      issues.push('Missing focus keyword');
      recommendations.push('Add a focus keyword for better SEO');
    }

    // NoIndex check
    if (metrics.noIndex === 0) {
      issues.push('Content is set to noIndex');
      recommendations.push('Consider removing noIndex if content should be searchable');
    }

    // Slug optimization check
    if (metrics.slugOptimization < 1) {
      issues.push('Slug needs optimization');
      recommendations.push('Use only lowercase letters, numbers, and hyphens in slug');
    }

    // Meta tags check
    if (metrics.metaTags < 0.8) {
      issues.push('Incomplete meta tags');
      recommendations.push('Fill in all meta tags for better SEO');
    }

    // Content length check
    if (metrics.contentLength < 0.8) {
      issues.push('Content length needs improvement');
      recommendations.push('Add more content to improve SEO value');
    }

    return {
      score,
      issues,
      recommendations,
      metrics: {
        titleLength: Math.round(metrics.titleLength * 100),
        descriptionLength: Math.round(metrics.descriptionLength * 100),
        focusKeyword: Math.round(metrics.focusKeyword * 100),
        noIndex: Math.round(metrics.noIndex * 100),
        slugOptimization: Math.round(metrics.slugOptimization * 100),
        metaTags: Math.round(metrics.metaTags * 100),
        contentLength: Math.round(metrics.contentLength * 100)
      }
    };
  }

  /**
   * Update only the slug in SEO metadata
   * @param {string} entityType - Type of entity (product, category, brand, blog_category, blog_post)
   * @param {string} entityId - ID of the entity
   * @param {string} newSlug - New slug to update
   * @returns {Promise<Object>} Updated SEO metadata
   */
  async updateSeoSlug(entityType, entityId, newSlug) {
    try {
      this.logger.info({ entityType, entityId, newSlug }, 'Updating SEO slug');
      
      const seoMeta = await this.models.SeoMeta.findOne({
        where: { entityType, entityId }
      });

      if (!seoMeta) {
        this.logger.warn({ entityType, entityId }, 'SEO metadata not found');
        throw new Error('SEO metadata not found');
      }

      const oldSlug = seoMeta.slug;

      // Update only the slug and canonical URL
      const updatedSeoMeta = await seoMeta.update({
        slug: newSlug,
        canonicalUrl: `${process.env.FRONTEND_URL}/${newSlug}`
      });

      invalidateCachePattern('seo:*').catch(() => {});
      invalidateCachePattern('sitemap:*').catch(() => {});
      recacheEntityFireAndForget(entityType, newSlug, oldSlug !== newSlug ? oldSlug : null, {
        source: 'updateSeoSlug',
        entityId
      });
      this.logger.info({ entityType, entityId, newSlug }, 'Successfully updated SEO slug');
      return { seoMeta: updatedSeoMeta };
    } catch (error) {
      this.logger.error({ error, entityType, entityId, newSlug }, 'Error updating SEO slug');
      // throw error;
    }
  }
}

module.exports = new SeoService(); 