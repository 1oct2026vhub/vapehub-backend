'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Testimonial extends Model {
        static associate(models) {
            this.belongsTo(models.User, { foreignKey: 'user_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
        }
    }

    Testimonial.init({
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
        }
    }, {
        sequelize,
        modelName: 'Testimonial',
        tableName: 'testimonials',
        paranoid: true,
        timestamps: true
    });

    return Testimonial;
};