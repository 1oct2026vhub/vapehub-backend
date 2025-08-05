'use strict';

const { Op } = require('sequelize');

class SlugManager {
  constructor(SlugRelation) {
    this.SlugRelation = SlugRelation;
  }

  /**
   * Creates or updates a slug for an entity
   * @param {string} slug - The slug to create/update
   * @param {string} entityType - The type of entity ('brand', 'blog', 'category', 'product', 'product_variant')
   * @param {number} entityId - The ID of the entity
   * @param {Object} transaction - Optional Sequelize transaction
   * @returns {Promise<Object>} The created/updated slug relation
   * @throws {Error} If slug is already taken
   */
  async createOrUpdateSlug(slug, entityType, entityId, transaction = null) {
    const normalizedSlug = this.normalizeSlug(slug);
    
    const options = { transaction };
    
    // Check if slug already exists for a different entity
    const existingSlug = await this.SlugRelation.findOne({
      where: {
        slug: normalizedSlug,
        [Op.not]: {
          [Op.and]: [
            { entity_type: entityType },
            { entity_id: entityId }
          ]
        }
      },
      ...options
    });
    if (existingSlug) {
      throw new Error(`Slug '${normalizedSlug}' is already taken`);
    }

    // Find or create the slug relation
    const [slugRelation] = await this.SlugRelation.findOrCreate({
      where: {
        entity_type: entityType,
        entity_id: entityId
      },
      defaults: {
        slug: normalizedSlug
      },
      ...options
    });

    // Update slug if it has changed
    if (slugRelation.slug !== normalizedSlug) {
      await slugRelation.update({ slug: normalizedSlug }, options);
    }

    return slugRelation;
  }

  /**
   * Deletes a slug relation for an entity
   * @param {string} entityType - The type of entity
   * @param {number} entityId - The ID of the entity
   * @param {Object} transaction - Optional Sequelize transaction
   */
  async deleteSlug(entityType, entityId, transaction = null) {
    await this.SlugRelation.destroy({
      where: {
        entity_type: entityType,
        entity_id: entityId
      },
      transaction
    });
  }

  /**
   * Finds an entity by its slug
   * @param {string} slug - The slug to look up
   * @returns {Promise<Object>} The slug relation if found
   */
  async findBySlug(slug) {
    return await this.SlugRelation.findOne({
      where: { slug: this.normalizeSlug(slug) }
    });
  }

  /**
   * Normalizes a slug string
   * @param {string} slug - The slug to normalize
   * @returns {string} The normalized slug
   */
  normalizeSlug(slug) {
    return slug
      .toLowerCase()
      .trim()
      // Replace spaces and multiple special chars with single hyphen
      .replace(/[\s_]+/g, '-')
      // Allow alphanumeric, hyphens, underscores, and periods
      // Remove any other special characters
      .replace(/[^a-z0-9\-_.]/g, '')
      // Replace multiple consecutive hyphens with a single hyphen
      .replace(/-+/g, '-')
      // Replace multiple consecutive periods with a single period
      .replace(/\.+/g, '.')
      // Remove leading and trailing hyphens and periods
      .replace(/^[-_.]+|[-_.]+$/g, '');
  }
}

module.exports = SlugManager; 