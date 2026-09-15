'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Author extends Model {
        static associate(models) {
            this.belongsTo(models.User, {
                foreignKey: 'user_id',
                as: 'user'
            });
            this.belongsTo(models.User, {
                foreignKey: 'updated_by',
                as: 'updatedBy',
                onDelete: 'SET NULL',
                onUpdate: 'CASCADE'
            });
            this.hasMany(models.Blog, {
                foreignKey: 'author_id',
                as: 'blogs'
            });
        }
    }

    Author.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            unique: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        first_name: {
            type: DataTypes.STRING(255),
            allowNull: false,
            validate: {
                notEmpty: true
            }
        },
        last_name: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        role: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        bio: {
            type: DataTypes.TEXT('long'),
            allowNull: true
        },
        slug: {
            type: DataTypes.STRING(100),
            allowNull: false,
            unique: true,
            validate: {
                notEmpty: true
            }
        },
        avatar_url: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        archive_url: {
            type: DataTypes.STRING(500),
            allowNull: true
        },
        team_url: {
            type: DataTypes.STRING(500),
            allowNull: true
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
        modelName: 'Author',
        tableName: 'authors',
        paranoid: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        deletedAt: 'deleted_at',
        defaultScope: {
            attributes: { exclude: ['deleted_at'] }
        }
    });

    return Author;
};
