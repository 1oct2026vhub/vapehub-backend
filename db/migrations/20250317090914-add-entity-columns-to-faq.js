'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('FAQs');

    // Add 'entity_type' only if it doesn't exist
    if (!tableInfo.entity_type) {
      await queryInterface.addColumn('FAQs', 'entity_type', {
        type: Sequelize.STRING,
        allowNull: true,
        after: 'id'
      });
    }

    // Add 'entity_id' only if it doesn't exist
    if (!tableInfo.entity_id) {
      await queryInterface.addColumn('FAQs', 'entity_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        after: 'entity_type'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('FAQs');

    // Remove 'entity_type' only if it exists
    if (tableInfo.entity_type) {
      await queryInterface.removeColumn('FAQs', 'entity_type');
    }

    // Remove 'entity_id' only if it exists
    if (tableInfo.entity_id) {
      await queryInterface.removeColumn('FAQs', 'entity_id');
    }
  }
};
