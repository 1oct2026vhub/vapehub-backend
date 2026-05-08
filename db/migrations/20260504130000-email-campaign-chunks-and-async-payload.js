'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('email_campaigns', 'delivery_mode', {
      type: Sequelize.ENUM('sync', 'async_sqs'),
      allowNull: false,
      defaultValue: 'sync'
    });

    await queryInterface.addColumn('email_campaigns', 'payload_json', {
      type: Sequelize.TEXT('long'),
      allowNull: true
    });

    await queryInterface.addColumn('email_campaigns', 'chunks_total', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    await queryInterface.addColumn('email_campaigns', 'chunks_done', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    await queryInterface.createTable('email_campaign_chunks', {
      id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      email_campaign_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'email_campaigns', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      chunk_index: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      subscriber_ids: {
        type: Sequelize.JSON,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('pending', 'processing', 'done', 'failed'),
        allowNull: false,
        defaultValue: 'pending'
      },
      attempts: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      last_error: {
        type: Sequelize.TEXT,
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

    await queryInterface.addIndex('email_campaign_chunks', ['email_campaign_id', 'chunk_index'], {
      unique: true,
      name: 'uniq_email_campaign_chunks_campaign_index'
    });

    await queryInterface.addIndex('email_campaign_chunks', ['email_campaign_id', 'status'], {
      name: 'idx_email_campaign_chunks_campaign_status'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('email_campaign_chunks', 'idx_email_campaign_chunks_campaign_status');
    await queryInterface.removeIndex('email_campaign_chunks', 'uniq_email_campaign_chunks_campaign_index');
    await queryInterface.dropTable('email_campaign_chunks');

    await queryInterface.removeColumn('email_campaigns', 'chunks_done');
    await queryInterface.removeColumn('email_campaigns', 'chunks_total');
    await queryInterface.removeColumn('email_campaigns', 'payload_json');
    await queryInterface.removeColumn('email_campaigns', 'delivery_mode');
  }
};
