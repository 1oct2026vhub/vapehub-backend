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