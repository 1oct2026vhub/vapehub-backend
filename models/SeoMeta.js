const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SeoMeta = sequelize.define('SeoMeta', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    entityType: {
      type: DataTypes.ENUM('page', 'product', 'category', 'brand', 'blog_category', 'blog_post'),
      allowNull: false
    },
    entityId: {
      type: DataTypes.UUID,
      allowNull: true,
      validate: {
        notNullIfNotPage(value) {
          if (this.entityType !== 'page' && !value) {
            throw new Error('entityId is required for non-page entities');
          }
        }
      }
    },
    title: {
      type: DataTypes.STRING,
      allowNull: true
    },
    description: {
      type: DataTypes.STRING,
      allowNull: true
    },
    focusKeyword: {
      type: DataTypes.STRING,
      allowNull: true
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true
      }
    },
    canonicalUrl: {
      type: DataTypes.STRING,
      allowNull: true
    },
    ogImage: {
      type: DataTypes.STRING,
      allowNull: true
    },
    noIndex: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['entityType', 'entityId']
      }
    ]
  });

  return SeoMeta;
}; 