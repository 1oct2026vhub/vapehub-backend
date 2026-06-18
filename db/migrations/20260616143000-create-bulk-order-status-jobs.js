'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('bulk_order_status_jobs', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      job_key: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true
      },
      status: {
        type: Sequelize.ENUM('queued', 'processing', 'completed', 'partial_failed', 'failed', 'cancelled'),
        allowNull: false,
        defaultValue: 'queued'
      },
      target_status: {
        type: Sequelize.STRING(64),
        allowNull: false
      },
      total: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      successful: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      failed: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      skipped: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      initiated_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.createTable('bulk_order_status_job_items', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      job_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'bulk_order_status_jobs',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      order_unique_id: {
        type: Sequelize.STRING(64),
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('pending', 'processing', 'success', 'failed', 'skipped'),
        allowNull: false,
        defaultValue: 'pending'
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      shipstation_order_id: {
        type: Sequelize.BIGINT,
        allowNull: true
      },
      attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      processed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('bulk_order_status_job_items', ['job_id', 'status'], {
      name: 'bulk_order_status_job_items_job_id_status'
    });
    await queryInterface.addIndex('bulk_order_status_job_items', ['status', 'id'], {
      name: 'bulk_order_status_job_items_status_id'
    });
    await queryInterface.addIndex('bulk_order_status_job_items', ['job_id', 'order_id'], {
      name: 'bulk_order_status_job_items_job_id_order_id',
      unique: true
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('bulk_order_status_job_items');
    await queryInterface.dropTable('bulk_order_status_jobs');
  }
};
