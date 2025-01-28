'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
    class Flavor extends Model {
        static associate(models) {
            Flavor.belongsToMany(models.Product, { through: 'ProductFlavor', foreignKey: 'flavor_id' });
        }
    }
    Flavor.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true
        },
        name: DataTypes.STRING,
        description: DataTypes.TEXT,
    }, {
        sequelize,
        modelName: 'Flavor',
        timestamps: false
    });
    return Flavor;
};