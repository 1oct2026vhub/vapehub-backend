'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Testimonial extends Model {
        static associate(models) {
            this.belongsTo(models.User, { foreignKey: 'user_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
            this.belongsTo(models.Product, { foreignKey: 'product_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
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
        product_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: "products",
                key: 'id'
            }
        },
        rating: {
            type: DataTypes.INTEGER,
            allowNull: false,
            validate: {
                min: {
                    args: [1],
                    msg: "Rating must be at least 1"
                },
                max: {
                    args: [5],
                    msg: "Rating must be at most 5"
                }
            }
        },
        content: {
            type: DataTypes.TEXT('long'),
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