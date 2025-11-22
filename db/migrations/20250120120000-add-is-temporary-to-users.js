'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Starting migration to add is_temporary field to users table...');
      
      // Add is_temporary column
      await queryInterface.addColumn('users', 'is_temporary', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Flag to identify temporary guest users'
      }, { transaction });

      console.log('✅ Added is_temporary column to users table');

      // Add index for efficient cleanup queries
      await queryInterface.addIndex('users', ['is_temporary', 'created_at'], {
        name: 'idx_users_temporary_created',
        transaction
      });

      console.log('✅ Added index on (is_temporary, created_at)');
      
      await transaction.commit();
      console.log('🎉 Migration completed successfully!');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back is_temporary field...');
      
      // Remove index first
      await queryInterface.removeIndex('users', 'idx_users_temporary_created', { transaction });
      console.log('✅ Removed index');

      // Remove column
      await queryInterface.removeColumn('users', 'is_temporary', { transaction });
      console.log('✅ Removed is_temporary column');
      
      await transaction.commit();
      console.log('✅ Rollback completed successfully!');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
};

