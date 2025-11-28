'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Starting migration to set password null for tophia@ateamsoftsolutions.com...');
      
      // First, check if password column allows null
      const tableDescription = await queryInterface.describeTable('users');
      const passwordColumn = tableDescription.password;
      
      // If password column doesn't allow null, modify it to allow null
      if (!passwordColumn.allowNull) {
        console.log('📝 Modifying password column to allow null...');
        await queryInterface.changeColumn('users', 'password', {
          type: Sequelize.STRING,
          allowNull: true
        }, { transaction });
        console.log('✅ Password column now allows null');
      } else {
        console.log('ℹ️  Password column already allows null, skipping column modification...');
      }
      
      // Update the specific user's password to null
      const [affectedRows] = await queryInterface.sequelize.query(
        `UPDATE users SET password = NULL WHERE email = :email`,
        {
          replacements: { email: 'tophia@ateamsoftsolutions.com' },
          transaction
        }
      );
      
      console.log(`✅ Updated password to null for user: tophia@ateamsoftsolutions.com`);
      console.log(`   Affected rows: ${affectedRows.affectedRows || affectedRows}`);
      
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
      console.log('🔄 Rolling back password null update...');
      
      // Note: We cannot restore the original password, but we can set a default
      // or leave it as null. For safety, we'll just log a warning.
      console.log('⚠️  Warning: Cannot restore original password. User will need to reset password.');
      
      // Optionally, you could set a temporary password here:
      // await queryInterface.sequelize.query(
      //   `UPDATE users SET password = :tempPassword WHERE email = :email`,
      //   {
      //     replacements: { 
      //       email: 'tophia@ateamsoftsolutions.com',
      //       tempPassword: 'temp_password_reset_required'
      //     },
      //     transaction
      //   }
      // );
      
      await transaction.commit();
      console.log('✅ Rollback completed (password remains null)');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
};

