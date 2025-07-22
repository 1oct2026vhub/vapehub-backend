const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SeoMeta = sequelize.define('SeoMeta', {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
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
      type: DataTypes.TEXT,
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
    tableName: 'seo_meta',
    indexes: [
      {
        unique: true,
        fields: ['entityType', 'entityId']
      }
    ]
  });

  SeoMeta.associate = (models) => {
    // Product association
    SeoMeta.belongsTo(models.Product, {
      foreignKey: 'entityId',
      as: 'product'
    });

    // Category association
    SeoMeta.belongsTo(models.Category, {
      foreignKey: 'entityId',
      as: 'category'
    });

    // Brand association
    SeoMeta.belongsTo(models.Brand, {
      foreignKey: 'entityId',
      as: 'brand'
    });

    // Blog Category association
    SeoMeta.belongsTo(models.BlogCategory, {
      foreignKey: 'entityId',
      as: 'blogCategory'
    });

    // Blog association
    SeoMeta.belongsTo(models.Blog, {
      foreignKey: 'entityId',
      as: 'blog'
    });
  };

  return SeoMeta;
}; 