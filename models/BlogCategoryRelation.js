'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class BlogCategoryRelation extends Model {
        static associate(models) {
            this.belongsTo(models.Blog, {
                foreignKey: 'blog_id',
                as: 'blog',
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            });
            
            this.belongsTo(models.BlogCategory, {
                foreignKey: 'category_id',
                as: 'category',
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            });
        }
    }

    BlogCategoryRelation.init({
        blog_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            references: {
                model: 'blogs',
                key: 'id'
            }
        },
        category_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            references: {
                model: 'blog_categories',
                key: 'id'
            }
        }
    }, {
        sequelize,
        modelName: 'BlogCategoryRelation',
        tableName: 'blog_category_relations',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false, // Only created_at is needed
        indexes: [
            {
                unique: true,
                fields: ['blog_id', 'category_id']
            }
        ]
    });

    return BlogCategoryRelation;
}; 