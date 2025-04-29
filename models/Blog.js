'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Blog extends Model {
        static associate(models) {
            this.belongsTo(models.User, {
                foreignKey: 'author_id',
                as: 'author'
            });
            this.belongsTo(models.User, {
                foreignKey: 'updated_by',
                as: 'updatedBy'
            });
            this.belongsToMany(models.BlogCategory, {
                through: models.BlogCategoryRelation,
                foreignKey: 'blog_id',
                otherKey: 'category_id',
                as: 'categories'
            });
            this.belongsToMany(models.BlogTag, {
                through: models.BlogTagRelation,
                foreignKey: 'blog_id',
                otherKey: 'tag_id',
                as: 'tags'
            });
            this.hasMany(models.BlogCategoryRelation, {
                foreignKey: 'blog_id',
                as: 'categoryRelations'
            });
            this.hasMany(models.BlogTagRelation, {
                foreignKey: 'blog_id',
                as: 'tagRelations'
            });
        }
    }

    Blog.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true
        },
        title: {
            type: DataTypes.STRING(255),
            allowNull: false,
            validate: {
                notEmpty: true
            }
        },
        slug: {
            type: DataTypes.STRING(255),
            allowNull: false,
            unique: true,
            validate: {
                notEmpty: true
            }
        },
        content: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        image_url: {
            type: DataTypes.STRING(500),
            allowNull: true,
            validate: {
                isUrl: true
            }
        },
        author_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        published_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        updated_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        status: {
            type: DataTypes.ENUM('draft', 'published', 'archived'),
            allowNull: false,
            defaultValue: 'draft'
        }
    }, {
        sequelize,
        modelName: 'Blog',
        tableName: 'blogs',
        paranoid: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at'
    });

    return Blog;
};