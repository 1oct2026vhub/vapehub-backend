'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class BlogCategory extends Model {
        static associate(models) {
            this.belongsTo(models.User, {
                as: 'updatedBy',
                foreignKey: 'updated_by',
                onDelete: 'SET NULL',
                onUpdate: 'CASCADE'
            });
            this.belongsToMany(models.Blog, {
                through: models.BlogCategoryRelation,
                foreignKey: 'category_id',
                otherKey: 'blog_id',
                as: 'blogs'
            });
            this.hasMany(models.BlogCategoryRelation, {
                foreignKey: 'category_id',
                as: 'blogRelations'
            });
        }
    }

    BlogCategory.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true
        },
        name: {
            type: DataTypes.STRING(100),
            allowNull: false,
            validate: {
                notEmpty: true
            }
        },
        slug: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
            validate: {
                notEmpty: true
            }
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        image_url: {
            type: DataTypes.STRING(500),
            allowNull: true,
            validate: {
                isUrl: true
            }
        },
        updated_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        }
    }, {
        sequelize,
        modelName: 'BlogCategory',
        tableName: 'blog_categories',
        paranoid: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at'
    });

    return BlogCategory;
}; 