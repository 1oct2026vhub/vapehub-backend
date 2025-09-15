'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    
    try {
      // Check if users already exist - if so, just update their roles
      const [existingUsers] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE password = 'temp_password_reset_required'
      `, { transaction });
      
      if (existingUsers[0].count > 0) {
        console.log('🔄 Users already exist - updating roleId values only...');
        await this.updateExistingUserRoles(queryInterface, transaction);
        await transaction.commit();
        return;
      }
      
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

      // Step 3: Insert/Update users with preserved IDs and correct roleId
      console.log('💾 Inserting/Updating users with preserved IDs and correct roleId...');
      for (const user of users) {
        const firstName = user.display_name.includes(' ') 
          ? user.display_name.substring(0, user.display_name.indexOf(' '))
          : user.display_name;
        
        const lastName = user.display_name.includes(' ')
          ? user.display_name.substring(user.display_name.indexOf(' ') + 1)
          : '';

        // Set roleId: 1 for super.admin@vapehub.com, 0 for all others
        const roleId = user.user_email === 'super.admin@vapehub.com' ? 1 : 0;

        // Insert or update user with correct roleId
        await queryInterface.sequelize.query(`
          INSERT INTO users (
            id, first_name, last_name, email, phone, password, profile_pic_url, 
            gender, dob, token, token_expiry, remember_token, int_field, 
            referral_code, loyalty_points, receive_promotions, blocked, 
            super_user, roleId, referred_by, referral_points, createdAt, updatedAt, deletedAt
          ) VALUES (
            ?, ?, ?, ?, NULL, 'temp_password_reset_required', NULL, 
            NULL, NULL, NULL, NULL, NULL, 0, 
            NULL, 0, 0, ?, 
            0, ?, NULL, 0, ?, NOW(), 
            CASE WHEN ? != 0 THEN ? ELSE NULL END
          )
          ON DUPLICATE KEY UPDATE
            roleId = ?,
            updatedAt = NOW()
        `, {
          replacements: [
            user.ID,
            firstName,
            lastName,
            user.user_email,
            user.user_status !== 0 ? 1 : 0,
            roleId,
            user.user_registered,
            user.user_status,
            user.user_registered,
            roleId  // Additional roleId for ON DUPLICATE KEY UPDATE
          ],
          transaction
        });
      }

      // Step 4: Fix any remaining NULL roleId values
      console.log('🔧 Fixing NULL roleId values...');
      
      // Check how many users have NULL roleId before update
      const [nullCountBefore] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE roleId IS NULL
      `, { transaction });
      console.log(`   Users with NULL roleId before update: ${nullCountBefore[0].count}`);
      
      // Update NULL roleId to 0
      const [updateResult] = await queryInterface.sequelize.query(`
        UPDATE users 
        SET roleId = 0 
        WHERE roleId IS NULL AND email != 'super.admin@vapehub.com'
      `, { transaction });
      console.log(`   Update result: ${updateResult.affectedRows} rows affected`);
      
      // Check how many users have NULL roleId after update
      const [nullCountAfter] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE roleId IS NULL
      `, { transaction });
      console.log(`   Users with NULL roleId after update: ${nullCountAfter[0].count}`);

      // Step 5: Re-enable auto-increment and foreign key checks
      const [maxIdResult] = await queryInterface.sequelize.query(`SELECT MAX(id) as max_id FROM users`, { transaction });
      const maxId = maxIdResult[0].max_id || 1;
      await queryInterface.sequelize.query(`ALTER TABLE users AUTO_INCREMENT = ${maxId + 1}`, { transaction });
      await queryInterface.sequelize.query(`SET FOREIGN_KEY_CHECKS = 1`, { transaction });

      // Step 6: Verification queries
      const [usersCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE password = 'temp_password_reset_required'
      `, { transaction });

      const [blockedUsersCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE blocked = 1
      `, { transaction });

      // Check role distribution
      const [roleDistribution] = await queryInterface.sequelize.query(`
        SELECT 
          roleId,
          COUNT(*) as count
        FROM users 
        GROUP BY roleId
        ORDER BY roleId
      `, { transaction });

      // Check super admin
      const [superAdmin] = await queryInterface.sequelize.query(`
        SELECT email, roleId FROM users WHERE email = 'super.admin@vapehub.com'
      `, { transaction });

      console.log('🎉 LIVE DATA MIGRATION: Users completed successfully!');
      console.log(`📊 Users migrated: ${usersCount[0].count}`);
      console.log(`🚫 Blocked users: ${blockedUsersCount[0].count}`);
      console.log('\n📋 Role Distribution:');
      roleDistribution.forEach(role => {
        console.log(`   roleId ${role.roleId || 'NULL'}: ${role.count} users`);
      });
      
      if (superAdmin.length > 0) {
        console.log(`\n👑 Super Admin: ${superAdmin[0].email} (roleId: ${superAdmin[0].roleId})`);
      } else {
        console.log(`\n⚠️  Super Admin not found`);
      }

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

  async updateExistingUserRoles(queryInterface, transaction) {
    console.log('🔧 Updating existing user roles...');
    
    // Update all users to roleId = 0 except super admin
    const [updateResult] = await queryInterface.sequelize.query(`
      UPDATE users 
      SET roleId = 0, updatedAt = NOW()
      WHERE email != 'super.admin@vapehub.com' AND (roleId IS NULL OR roleId != 0)
    `, { transaction });
    console.log(`   Updated ${updateResult.affectedRows} users to roleId = 0`);
    
    // Ensure super admin has roleId = 1
    const [superAdminResult] = await queryInterface.sequelize.query(`
      UPDATE users 
      SET roleId = 1, updatedAt = NOW()
      WHERE email = 'super.admin@vapehub.com' AND (roleId IS NULL OR roleId != 1)
    `, { transaction });
    console.log(`   Updated ${superAdminResult.affectedRows} super admin to roleId = 1`);
    
    // Verification
    const [roleDistribution] = await queryInterface.sequelize.query(`
      SELECT roleId, COUNT(*) as count FROM users GROUP BY roleId ORDER BY roleId
    `, { transaction });
    
    console.log('\n📋 Updated Role Distribution:');
    roleDistribution.forEach(row => {
      const roleName = row.roleId === 1 ? 'Super Admin' : 
                      row.roleId === 0 ? 'Regular Users' : 
                      `Unknown (${row.roleId})`;
      console.log(`   ${roleName}: ${row.count} users`);
    });
    
    const [superAdmin] = await queryInterface.sequelize.query(`
      SELECT email, roleId FROM users WHERE email = 'super.admin@vapehub.com'
    `, { transaction });
    
    if (superAdmin.length > 0) {
      console.log(`\n👑 Super Admin: ${superAdmin[0].email} (roleId: ${superAdmin[0].roleId})`);
    } else {
      console.log('\n⚠️  Super Admin not found!');
    }
    
    console.log('✅ User role updates completed successfully!');
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
