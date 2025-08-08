'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'referral_methods' || table.tableName === 'ReferralMethods')
    );
    
    if (tableExists) {
      console.log('referral_methods table already exists, skipping creation');
      return;
    }
    
    console.log('Creating referral_methods table...');
    await queryInterface.createTable('referral_methods', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      referral_value_type: {
        type: Sequelize.STRING,
        allowNull: false
      },
      referral_value: {
        type: Sequelize.STRING,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive'),
        defaultValue: 'active',
        allowNull: false
      },
      primary: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('referral_methods');
  }
}; 