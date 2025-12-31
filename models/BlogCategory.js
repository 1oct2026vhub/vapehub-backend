'use strict';
const { Model, DataTypes } = require('sequelize');
const SlugManager = require('../utils/slugManager');

module.exports = (sequelize) => {
    class BlogCategory extends Model {
        static associate(models) {
            // Self-referential association for parent-child relationship
            this.belongsTo(models.BlogCategory, {
                as: 'parent',
                foreignKey: 'parent_id',
                allowNull: true
            });
            this.hasMany(models.BlogCategory, {
                as: 'children',
                foreignKey: 'parent_id'
            });

            // Existing associations
            this.belongsTo(models.User, { as: 'updatedByUser', foreignKey: 'updated_by' });
            this.belongsToMany(models.Blog, {
                through: 'blog_category_relations',
                foreignKey: 'category_id',
                otherKey: 'blog_id',
                as: 'blogs'
            });
        }
    }

    BlogCategory.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        slug: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        description: {
            type: DataTypes.TEXT('long'),
            allowNull: true
        },
        image_url: {
            type: DataTypes.STRING,
            allowNull: true
        },
        alt_text: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        parent_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'blog_categories',
                key: 'id'
            }
        },
        status: {
            type: DataTypes.ENUM('active', 'inactive'),
            defaultValue: 'active'
        },
        show_home_page: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        updated_by: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            }
        }
    }, {
        sequelize,
        modelName: 'BlogCategory',
        tableName: 'blog_categories',
        timestamps: true,
        paranoid: true,
        underscored: true,
        hooks: {
            beforeValidate: async (instance) => {
                if (instance.changed('name') && !instance.changed('slug')) {
                    const slugManager = new SlugManager(sequelize.models.SlugRelation);
                    instance.slug = slugManager.normalizeSlug(instance.name);
                }
            }
        }
    });

    return BlogCategory;
}; 