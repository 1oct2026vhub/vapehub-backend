'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class BlogTagRelation extends Model {
        static associate(models) {
            this.belongsTo(models.Blog, {
                foreignKey: 'blog_id',
                as: 'blog',
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            });
            
            this.belongsTo(models.BlogTag, {
                foreignKey: 'tag_id',
                as: 'tag',
                onDelete: 'CASCADE',
                onUpdate: 'CASCADE'
            });
        }
    }

    BlogTagRelation.init({
        blog_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            references: {
                model: 'blogs',
                key: 'id'
            }
        },
        tag_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            allowNull: false,
            references: {
                model: 'blog_tags',
                key: 'id'
            }
        }
    }, {
        sequelize,
        modelName: 'BlogTagRelation',
        tableName: 'blog_tag_relations',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false, // Only created_at is needed
        indexes: [
            {
                unique: true,
                fields: ['blog_id', 'tag_id']
            }
        ]
    });

    return BlogTagRelation;
}; 