'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class EmailCampaign extends Model {
        static associate(models) {
            this.belongsTo(models.User, { foreignKey: 'initiated_by', as: 'initiator' });
            this.hasMany(models.EmailCampaignChunk, { foreignKey: 'email_campaign_id', as: 'chunks' });
        }
    }

    EmailCampaign.init({
        id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        campaign_key: {
            type: DataTypes.STRING(64),
            allowNull: false,
            unique: true
        },
        type: {
            type: DataTypes.ENUM('promotional_newsletter'),
            allowNull: false,
            defaultValue: 'promotional_newsletter'
        },
        status: {
            type: DataTypes.ENUM('queued', 'sending', 'completed', 'partial_failed', 'failed'),
            allowNull: false,
            defaultValue: 'queued'
        },
        subject: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        template_id: {
            type: DataTypes.STRING(128),
            allowNull: true
        },
        audience_type: {
            type: DataTypes.ENUM('all', 'group', 'selected'),
            allowNull: false
        },
        audience_meta: {
            type: DataTypes.JSON,
            allowNull: true
        },
        total_recipients: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        sent_count: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        failed_count: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        failed_emails_sample: {
            type: DataTypes.JSON,
            allowNull: true
        },
        error_summary: {
            type: DataTypes.JSON,
            allowNull: true
        },
        initiated_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'users',
                key: 'id'
            }
        },
        started_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        finished_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        delivery_mode: {
            type: DataTypes.ENUM('sync', 'async_sqs'),
            allowNull: false,
            defaultValue: 'sync'
        },
        payload_json: {
            type: DataTypes.TEXT('long'),
            allowNull: true
        },
        chunks_total: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        chunks_done: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        }
    }, {
        sequelize,
        modelName: 'EmailCampaign',
        tableName: 'email_campaigns',
        timestamps: true
    });

    return EmailCampaign;
};
