'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class BlogTag extends Model {
        static associate(models) {
            this.belongsTo(models.User, {
                as: 'updatedBy',
                foreignKey: 'updated_by',
                onDelete: 'SET NULL',
                onUpdate: 'CASCADE'
            });
            this.belongsToMany(models.Blog, {
                through: models.BlogTagRelation,
                foreignKey: 'tag_id',
                otherKey: 'blog_id',
                as: 'blogs'
            });
            this.hasMany(models.BlogTagRelation, {
                foreignKey: 'tag_id',
                as: 'blogRelations'
            });
        }
    }

    BlogTag.init({
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
        modelName: 'BlogTag',
        tableName: 'blog_tags',
        paranoid: false,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return BlogTag;
}; 