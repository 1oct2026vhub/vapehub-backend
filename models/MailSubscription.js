'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class MailSubscription extends Model {
        static associate(models) {
            this.belongsTo(models.User, { foreignKey: 'user_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
        }
    }

    MailSubscription.init({
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            unique: true
        },
        user_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
        }
    }, {
        sequelize,
        modelName: 'MailSubscription',
        tableName: 'mail_subscription',
        paranoid: true,
        timestamps: true
    });

    return MailSubscription;
};