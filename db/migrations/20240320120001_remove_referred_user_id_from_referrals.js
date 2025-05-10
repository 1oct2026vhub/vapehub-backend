'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Get table description to check if column exists
    const tableInfo = await queryInterface.describeTable('referrals');
    
    if (tableInfo.referred_user_id) {
      // First remove the foreign key constraint if it exists
      try {
        await queryInterface.removeConstraint('referrals', 'referrals_referred_user_id_fkey');
      } catch (error) {
        console.log('Foreign key constraint might not exist:', error.message);
      }
      
      // Then remove the column
      await queryInterface.removeColumn('referrals', 'referred_user_id');
    } else {
      console.log('Column referred_user_id does not exist in referrals table');
    }
  },

  async down(queryInterface, Sequelize) {
    // Get table description to check if column exists
    const tableInfo = await queryInterface.describeTable('referrals');
    
    if (!tableInfo.referred_user_id) {
      // Add the column back
      await queryInterface.addColumn('referrals', 'referred_user_id', {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        }
      });

      // Add back the foreign key constraint
      await queryInterface.addConstraint('referrals', {
        fields: ['referred_user_id'],
        type: 'foreign key',
        name: 'referrals_referred_user_id_fkey',
        references: {
          table: 'users',
          field: 'id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      });
    } else {
      console.log('Column referred_user_id already exists in referrals table');
    }
  }
}; 