'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Connects', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false
      },
      send_us_a_message: {
        type: Sequelize.TEXT('long'),
        allowNull: true
      },
      call_us: {
        type: Sequelize.TEXT('long'),
        allowNull: true
      },
      social_media: {
        type: Sequelize.TEXT('long'),
        allowNull: true
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW')
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Connects');
  }
}; 