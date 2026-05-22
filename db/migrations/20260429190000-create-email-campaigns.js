'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('email_campaigns', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      campaign_key: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true
      },
      type: {
        type: Sequelize.ENUM('promotional_newsletter'),
        allowNull: false,
        defaultValue: 'promotional_newsletter'
      },
      status: {
        type: Sequelize.ENUM('queued', 'sending', 'completed', 'partial_failed', 'failed'),
        allowNull: false,
        defaultValue: 'queued'
      },
      subject: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      template_id: {
        type: Sequelize.STRING(128),
        allowNull: true
      },
      audience_type: {
        type: Sequelize.ENUM('all', 'group', 'selected'),
        allowNull: false
      },
      audience_meta: {
        type: Sequelize.JSON,
        allowNull: true
      },
      total_recipients: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      sent_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      failed_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      failed_emails_sample: {
        type: Sequelize.JSON,
        allowNull: true
      },
      error_summary: {
        type: Sequelize.JSON,
        allowNull: true
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
      finished_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('email_campaigns', ['status'], {
      name: 'idx_email_campaigns_status'
    });
    await queryInterface.addIndex('email_campaigns', ['createdAt'], {
      name: 'idx_email_campaigns_created_at'
    });
    await queryInterface.addIndex('email_campaigns', ['initiated_by'], {
      name: 'idx_email_campaigns_initiated_by'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('email_campaigns', 'idx_email_campaigns_status');
    await queryInterface.removeIndex('email_campaigns', 'idx_email_campaigns_created_at');
    await queryInterface.removeIndex('email_campaigns', 'idx_email_campaigns_initiated_by');
    await queryInterface.dropTable('email_campaigns');
  }
};
