'use strict';
const {
    Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
    class FAQ extends Model {
        static associate(models) {
            // define association here
        }
    }
    FAQ.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true
        },
        entity_type: {
            type: DataTypes.STRING,
            allowNull: true,
            comment: 'Type of entity (e.g., product, category, brand, variant, common)'
        },
        entity_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            comment: 'ID of the related entity'
        },
        question: DataTypes.TEXT,
        answer: DataTypes.TEXT
    }, {
        sequelize,
        modelName: 'FAQ',
        tableName: 'FAQs',
        paranoid: true,
        timestamps: true
    });
    return FAQ;
};