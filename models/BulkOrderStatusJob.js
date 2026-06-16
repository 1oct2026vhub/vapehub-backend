'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class BulkOrderStatusJob extends Model {
        static associate(models) {
            this.belongsTo(models.User, { foreignKey: 'initiated_by', as: 'initiator' });
            this.hasMany(models.BulkOrderStatusJobItem, { foreignKey: 'job_id', as: 'items' });
        }
    }

    BulkOrderStatusJob.init({
        id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        job_key: {
            type: DataTypes.STRING(64),
            allowNull: false,
            unique: true
        },
        status: {
            type: DataTypes.ENUM('queued', 'processing', 'completed', 'partial_failed', 'failed', 'cancelled'),
            allowNull: false,
            defaultValue: 'queued'
        },
        target_status: {
            type: DataTypes.STRING(64),
            allowNull: false
        },
        total: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        successful: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        failed: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        skipped: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
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
        completed_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'BulkOrderStatusJob',
        tableName: 'bulk_order_status_jobs',
        timestamps: true
    });

    return BulkOrderStatusJob;
};
