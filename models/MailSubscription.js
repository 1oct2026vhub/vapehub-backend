'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class MailSubscription extends Model {
        static associate(models) {
            this.belongsTo(models.User, { foreignKey: 'user_id', onDelete: 'CASCADE', onUpdate: 'CASCADE' });
            this.belongsToMany(models.NewsletterGroup, {
                through: models.NewsletterGroupUser,
                foreignKey: 'subscriber_id',
                otherKey: 'group_id',
                as: 'newsletterGroups',
            });
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
        },
        subscribed: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            comment: 'Flag to indicate if the user is currently subscribed'
        },
        isDiscountUsed: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: false,
            comment: 'Flag to indicate if any discount (coupon, referral, loyalty) was used by this subscriber'
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