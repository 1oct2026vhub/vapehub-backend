'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class EmailCampaignChunk extends Model {
        static associate(models) {
            this.belongsTo(models.EmailCampaign, { foreignKey: 'email_campaign_id', as: 'emailCampaign' });
        }
    }

    EmailCampaignChunk.init({
        id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        email_campaign_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
            references: {
                model: 'email_campaigns',
                key: 'id'
            }
        },
        chunk_index: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        subscriber_ids: {
            type: DataTypes.JSON,
            allowNull: false
        },
        status: {
            type: DataTypes.ENUM('pending', 'processing', 'done', 'failed'),
            allowNull: false,
            defaultValue: 'pending'
        },
        attempts: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        last_error: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'EmailCampaignChunk',
        tableName: 'email_campaign_chunks',
        timestamps: true
    });

    return EmailCampaignChunk;
};
