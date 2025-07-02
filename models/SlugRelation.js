'use strict';
const { Model, Op } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class SlugRelation extends Model {
    static associate(models) {
      // Define associations here if needed
    }

    static async isSlugUnique(slug, entityType, entityId = null) {
      const existingSlug = await this.findOne({
        where: {
          slug,
          ...(entityId && { id: { [Op.ne]: entityId } })
        }
      });
      return !existingSlug;
    }
  }

  SlugRelation.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true
      }
    },
    entity_type: {
      type: DataTypes.ENUM('brand', 'blog', 'blog_category', 'category', 'product', 'product_variant', 'attribute', 'attribute_term', 'deal'),
      allowNull: false,
      validate: {
        notEmpty: true,
        isIn: [['brand', 'blog', 'blog_category', 'category', 'product', 'product_variant', 'attribute', 'attribute_term', 'deal']]
      }
    },
    entity_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'SlugRelation',
    tableName: 'slug_relations',
    underscored: true,
    hooks: {
      beforeValidate: async (slugRelation) => {
        if (!slugRelation.slug) return;
        
        // Convert to lowercase and replace spaces with hyphens
        slugRelation.slug = slugRelation.slug
          .toLowerCase()
          .trim()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');
      }
    }
  });

  return SlugRelation;
}; 