'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Blog extends Model {
        static associate(models) {
            this.belongsTo(models.User, { foreignKey: 'user_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
        }
    }

    Blog.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        blog_group: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        title: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        content: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        slug: {
            type: DataTypes.TEXT,
            allowNull: false,
        }
    }, {
        sequelize,
        modelName: 'Blog',
        tableName: 'blogs',
        paranoid: true,
        timestamps: true
    });

    return Blog;
};