'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('settings', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      content_key: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
        comment: 'Unique key for the setting (e.g., delivery_information, privacy_policy)'
      },
      content: {
        type: Sequelize.TEXT('long'),
        allowNull: false,
        comment: 'The content text for the setting'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether the setting is active'
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      },
      deleted_at: {
        allowNull: true,
        type: Sequelize.DATE,
        comment: 'Soft delete timestamp'
      }
    });

    // Add indexes for better performance
    await queryInterface.addIndex('settings', ['content_key'], {
      name: 'idx_settings_content_key',
      unique: true
    });

    await queryInterface.addIndex('settings', ['is_active'], {
      name: 'idx_settings_is_active'
    });

    await queryInterface.addIndex('settings', ['deleted_at'], {
      name: 'idx_settings_deleted_at'
    });

  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('settings');
  }
};
