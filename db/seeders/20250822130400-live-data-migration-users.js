'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    
    try {
      console.log('🚀 Starting LIVE DATA MIGRATION: Users from old database...');
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();
      
      // Step 1: Extract users from old database
      console.log('📥 Fetching users from old database...');
      const users = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          old_vh.ID,
          old_vh.display_name,
          old_vh.user_email,
          old_vh.user_status,
          old_vh.user_registered
        FROM vh_users old_vh
        WHERE old_vh.user_status = 0
        AND old_vh.user_email IS NOT NULL
        AND old_vh.user_email != ''
      `);

      console.log(`✅ Found ${users.length} users to migrate`);

      if (users.length === 0) {
        console.log('ℹ️ No new users to migrate');
        await crossServerMigration.closeOldDbConnection();
        await transaction.commit();
        return;
      }

      // Step 2: Temporarily disable foreign key checks and auto-increment
      await queryInterface.sequelize.query(`SET FOREIGN_KEY_CHECKS = 0`, { transaction });
      await queryInterface.sequelize.query(`ALTER TABLE users AUTO_INCREMENT = 1`, { transaction });

      // Step 3: Insert users with preserved IDs
      console.log('💾 Inserting users with preserved IDs...');
      for (const user of users) {
        const firstName = user.display_name.includes(' ') 
          ? user.display_name.substring(0, user.display_name.indexOf(' '))
          : user.display_name;
        
        const lastName = user.display_name.includes(' ')
          ? user.display_name.substring(user.display_name.indexOf(' ') + 1)
          : '';

        await queryInterface.sequelize.query(`
          INSERT IGNORE INTO users (
            id, first_name, last_name, email, phone, password, profile_pic_url, 
            gender, dob, token, token_expiry, remember_token, int_field, 
            referral_code, loyalty_points, receive_promotions, blocked, 
            super_user, roleId, referred_by, referral_points, createdAt, updatedAt, deletedAt
          ) VALUES (
            ?, ?, ?, ?, NULL, 'temp_password_reset_required', NULL, 
            NULL, NULL, NULL, NULL, NULL, 0, 
            NULL, 0, 0, ?, 
            0, NULL, NULL, 0, ?, NOW(), 
            CASE WHEN ? != 0 THEN ? ELSE NULL END
          )
        `, {
          replacements: [
            user.ID,
            firstName,
            lastName,
            user.user_email,
            user.user_status !== 0 ? 1 : 0,
            user.user_registered,
            user.user_status,
            user.user_registered
          ],
          transaction
        });
      }

      // Step 4: Re-enable auto-increment and foreign key checks
      const [maxIdResult] = await queryInterface.sequelize.query(`SELECT MAX(id) as max_id FROM users`, { transaction });
      const maxId = maxIdResult[0].max_id || 1;
      await queryInterface.sequelize.query(`ALTER TABLE users AUTO_INCREMENT = ${maxId + 1}`, { transaction });
      await queryInterface.sequelize.query(`SET FOREIGN_KEY_CHECKS = 1`, { transaction });

      // Step 5: Verification queries
      const [usersCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE password = 'temp_password_reset_required'
      `, { transaction });

      const [blockedUsersCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE blocked = 1
      `, { transaction });

      console.log('🎉 LIVE DATA MIGRATION: Users completed successfully!');
      console.log(`📊 Users migrated: ${usersCount[0].count}`);
      console.log(`🚫 Blocked users: ${blockedUsersCount[0].count}`);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      await transaction.commit();
    } catch (error) {
      await crossServerMigration.closeOldDbConnection();
      await transaction.rollback();
      console.error('❌ LIVE DATA MIGRATION: Users failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back LIVE DATA MIGRATION: Users...');
      
      await queryInterface.sequelize.query(`DELETE FROM users WHERE password = 'temp_password_reset_required'`, { transaction });
      
      await transaction.commit();
      console.log('✅ LIVE DATA MIGRATION: Users rolled back successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ LIVE DATA MIGRATION: Users rollback failed:', error);
      throw error;
    }
  }
};
