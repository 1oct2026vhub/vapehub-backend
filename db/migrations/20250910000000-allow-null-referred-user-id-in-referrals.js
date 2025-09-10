'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('🔧 Allowing NULL values for referred_user_id in referrals table...');
      
      // First, drop the existing foreign key constraint
      try {
        await queryInterface.removeConstraint('referrals', 'referrals_ibfk_3');
        console.log('✅ Dropped existing foreign key constraint');
      } catch (error) {
        console.log('⚠️  Foreign key constraint might not exist or have different name:', error.message);
      }

      // Modify the referred_user_id column to allow NULL values
      await queryInterface.changeColumn('referrals', 'referred_user_id', {
        type: Sequelize.INTEGER,
        allowNull: true, // Allow NULL values
      });

      // Recreate the foreign key constraint with SET NULL on delete
      await queryInterface.addConstraint('referrals', {
        fields: ['referred_user_id'],
        type: 'foreign key',
        name: 'referrals_ibfk_3',
        references: {
          table: 'users',
          field: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });

      console.log('✅ referred_user_id column now allows NULL values with proper foreign key constraint');
    } catch (error) {
      console.error('❌ Failed to modify referred_user_id column:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      console.log('🔄 Reverting referred_user_id column to NOT NULL...');
      
      // First, drop the current foreign key constraint
      try {
        await queryInterface.removeConstraint('referrals', 'referrals_ibfk_3');
        console.log('✅ Dropped current foreign key constraint');
      } catch (error) {
        console.log('⚠️  Foreign key constraint might not exist:', error.message);
      }

      // Update any NULL values to prevent constraint violation
      await queryInterface.sequelize.query(
        'UPDATE referrals SET referred_user_id = 1 WHERE referred_user_id IS NULL',
        { type: Sequelize.QueryTypes.UPDATE }
      );
      console.log('✅ Updated NULL values to prevent constraint violation');

      // Revert the column to NOT NULL
      await queryInterface.changeColumn('referrals', 'referred_user_id', {
        type: Sequelize.INTEGER,
        allowNull: false, // Revert to NOT NULL
      });

      // Recreate the foreign key constraint with CASCADE on delete
      await queryInterface.addConstraint('referrals', {
        fields: ['referred_user_id'],
        type: 'foreign key',
        name: 'referrals_ibfk_3',
        references: {
          table: 'users',
          field: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      });

      console.log('✅ referred_user_id column reverted to NOT NULL with CASCADE constraint');
    } catch (error) {
      console.error('❌ Failed to revert referred_user_id column:', error);
      throw error;
    }
  }
};
