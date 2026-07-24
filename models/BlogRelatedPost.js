'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class BlogRelatedPost extends Model {
        static associate(models) {
            this.belongsTo(models.Blog, {
                foreignKey: 'blog_id',
                as: 'blog'
            });
            this.belongsTo(models.Blog, {
                foreignKey: 'related_blog_id',
                as: 'relatedBlog'
            });
        }
    }

    BlogRelatedPost.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true
        },
        blog_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        related_blog_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        sort_order: {
            type: DataTypes.TINYINT,
            allowNull: false,
            defaultValue: 0
        }
    }, {
        sequelize,
        modelName: 'BlogRelatedPost',
        tableName: 'blog_related_posts',
        paranoid: false,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return BlogRelatedPost;
};

