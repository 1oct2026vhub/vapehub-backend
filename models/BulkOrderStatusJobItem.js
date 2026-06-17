'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class BulkOrderStatusJobItem extends Model {
        static associate(models) {
            this.belongsTo(models.BulkOrderStatusJob, { foreignKey: 'job_id', as: 'job' });
            this.belongsTo(models.Order, { foreignKey: 'order_id', as: 'order' });
        }
    }

    BulkOrderStatusJobItem.init({
        id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false
        },
        job_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
            references: {
                model: 'bulk_order_status_jobs',
                key: 'id'
            }
        },
        order_id: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        order_unique_id: {
            type: DataTypes.STRING(64),
            allowNull: true
        },
        status: {
            type: DataTypes.ENUM('pending', 'processing', 'success', 'failed', 'skipped'),
            allowNull: false,
            defaultValue: 'pending'
        },
        error_message: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        shipstation_order_id: {
            type: DataTypes.BIGINT,
            allowNull: true
        },
        attempts: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        processed_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    }, {
        sequelize,
        modelName: 'BulkOrderStatusJobItem',
        tableName: 'bulk_order_status_job_items',
        timestamps: true,
        underscored: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });

    return BulkOrderStatusJobItem;
};
