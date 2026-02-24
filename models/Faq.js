'use strict';
const {
    Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
    class FAQ extends Model {
        static associate(models) {
            this.belongsTo(models.User, { foreignKey: 'updated_by', as: 'updatedBy' });
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
        question: DataTypes.TEXT('long'),
        answer: DataTypes.TEXT('long'),
        updated_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: { model: 'users', key: 'id' },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
            comment: 'User ID who last updated this FAQ'
        }
    }, {
        sequelize,
        modelName: 'FAQ',
        tableName: 'FAQs',
        paranoid: true,
        timestamps: true
    });
    return FAQ;
};