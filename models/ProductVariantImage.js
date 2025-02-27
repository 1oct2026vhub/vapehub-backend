'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ProductVariantImage extends Model {
    static associate(models) {
      // Define associations
      this.belongsTo(models.ProductVariant, {
        foreignKey: 'variant_id',
        as: 'variant'
      });

      this.belongsTo(models.User, {
        foreignKey: 'updated_by',
        as: 'updatedByUser'
      });
    }

    // Static method to set primary image
    static async setPrimaryImage(variantId, imageId, transaction = null) {
      const options = transaction ? { transaction } : {};
      
      // Reset all images for this variant to non-primary
      await this.update(
        { is_primary: false },
        { 
          where: { variant_id: variantId },
          ...options
        }
      );

      // Set the selected image as primary
      await this.update(
        { is_primary: true },
        { 
          where: { id: imageId, variant_id: variantId },
          ...options
        }
      );
    }

    // Static method to reorder images
    static async reorderImages(variantId, imageIds, transaction = null) {
      const options = transaction ? { transaction } : {};
      
      for (let index = 0; index < imageIds.length; index++) {
        await this.update(
          { sort_order: index },
          { 
            where: { id: imageIds[index], variant_id: variantId },
            ...options
          }
        );
      }
    }
  }

  ProductVariantImage.init({
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    variant_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: {
        model: 'product_variants',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    image_url: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        isUrl: true
      }
    },
    alt_text: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    sort_order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    is_primary: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    updated_by: {
      type: DataTypes.INTEGER,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'SET NULL'
    }
  }, {
    sequelize,
    modelName: 'ProductVariantImage',
    tableName: 'product_variant_images',
    underscored: true,
    timestamps: true,
    hooks: {
      beforeCreate: async (image, options) => {
        // If this is the first image for the variant, make it primary
        const count = await ProductVariantImage.count({
          where: { variant_id: image.variant_id }
        });
        if (count === 0) {
          image.is_primary = true;
        }
      },
      afterDestroy: async (image, options) => {
        // If the deleted image was primary, set another image as primary
        if (image.is_primary) {
          const nextImage = await ProductVariantImage.findOne({
            where: { variant_id: image.variant_id }
          });
          if (nextImage) {
            await nextImage.update({ is_primary: true }, options);
          }
        }
      }
    }
  });

  return ProductVariantImage;
}; 