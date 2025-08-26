'use strict';

// DISABLED: This migration has been converted to a seeder
// Use the seeder instead: 20250822130400-live-data-migration-users.js

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    return; // Exit early to prevent execution
    const transaction = await queryInterface.sequelize.transaction();
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    
    try {
      console.log('Starting users migration from live database (cross-server)...');
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();
      
      // Step 1: Temporarily disable foreign key checks to allow ID manipulation
      await queryInterface.sequelize.query(`SET FOREIGN_KEY_CHECKS = 0`, { transaction });

      // Step 2: Temporarily disable auto-increment to preserve original IDs
      await queryInterface.sequelize.query(`
        ALTER TABLE users MODIFY id int NOT NULL
      `, { transaction });

      // Step 3: Extract users from old database
      console.log('Fetching users from old database...');
      const users = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          ID,
          display_name,
          user_email,
          user_status,
          user_registered
        FROM vh_users
        WHERE user_status = 0
          AND user_email IS NOT NULL 
          AND user_email != ''
      `);

      // Step 4: Insert users with their original IDs
      console.log(`Inserting ${users.length} users...`);
      for (const user of users) {
        const firstName = user.display_name.includes(' ') 
          ? user.display_name.substring(0, user.display_name.indexOf(' '))
          : user.display_name;
        
        const lastName = user.display_name.includes(' ')
          ? user.display_name.substring(user.display_name.indexOf(' ') + 1)
          : '';

        await queryInterface.sequelize.query(`
          INSERT IGNORE INTO users (
            id,
            first_name,
            last_name,
            email,
            phone,
            password,
            profile_pic_url,
            gender,
            dob,
            token,
            token_expiry,
            remember_token,
            int_field,
            referral_code,
            loyalty_points,
            receive_promotions,
            blocked,
            super_user,
            roleId,
            referred_by,
            referral_points,
            createdAt,
            updatedAt,
            deletedAt
          )
          VALUES (?, ?, ?, ?, NULL, 'temp_password_reset_required', NULL, NULL, NULL, NULL, NULL, NULL, 0, NULL, 0, 0, ?, 0, NULL, NULL, 0, ?, NOW(), NULL)
        `, {
          replacements: [
            user.ID,
            firstName,
            lastName,
            user.user_email,
            user.user_status === 0 ? 0 : 1,
            user.user_registered
          ],
          transaction
        });
      }

      // Step 5: Re-enable auto-increment and set it to the next available ID
      await queryInterface.sequelize.query(`
        ALTER TABLE users MODIFY id int NOT NULL AUTO_INCREMENT
      `, { transaction });

      // Step 6: Update auto-increment to start after the highest imported ID
      const [maxIdResult] = await queryInterface.sequelize.query(`
        SELECT COALESCE(MAX(id), 0) as max_id FROM users
      `, { transaction });

      const maxId = maxIdResult[0].max_id;
      if (maxId > 0) {
        await queryInterface.sequelize.query(`
          ALTER TABLE users AUTO_INCREMENT = ${maxId + 1}
        `, { transaction });
      }

      // Step 7: Re-enable foreign key checks
      await queryInterface.sequelize.query(`SET FOREIGN_KEY_CHECKS = 1`, { transaction });

      // Step 8: Verification queries
      const [usersCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users
      `, { transaction });

      const [activeUsersCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE blocked = 0
      `, { transaction });

      console.log('Users migration completed successfully!');
      console.log(`Total users migrated: ${usersCount[0].count}`);
      console.log(`Active users: ${activeUsersCount[0].count}`);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      await transaction.commit();
    } catch (error) {
      await crossServerMigration.closeOldDbConnection();
      await transaction.rollback();
      console.error('Users migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      await queryInterface.sequelize.query(`DELETE FROM users`, { transaction });
      
      await transaction.commit();
      console.log('Users migration rolled back successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('Users migration rollback failed:', error);
      throw error;
    }
  }
};
