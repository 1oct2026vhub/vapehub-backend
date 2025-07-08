'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if the column already exists
    const tableDescription = await queryInterface.describeTable('users');
    
    if (!tableDescription.loyalty_points) {
      await queryInterface.addColumn('users', 'loyalty_points', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total loyalty points earned by the user'
      });
    }

    // Check if the index already exists before adding it
    const indexes = await queryInterface.showIndex('users');
    const loyaltyPointsIndexExists = indexes.some(index => 
      index.fields.some(field => field.attribute === 'loyalty_points')
    );

    if (!loyaltyPointsIndexExists) {
      await queryInterface.addIndex('users', ['loyalty_points']);
    }
  },

  async down(queryInterface, Sequelize) {
    // Check if the column exists before removing it
    const tableDescription = await queryInterface.describeTable('users');
    
    if (tableDescription.loyalty_points) {
      await queryInterface.removeColumn('users', 'loyalty_points');
    }
  }
}; 