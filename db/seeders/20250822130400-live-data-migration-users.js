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
      
      // Step 1: Get total count of users to migrate (for progress tracking)
      console.log('📊 Checking total users in old database...');
      const [totalCountResult] = await crossServerMigration.queryOldDb(`
        SELECT COUNT(*) as total FROM vh_users
        WHERE user_email IS NOT NULL AND user_email != ''
      `);
      const totalUsers = totalCountResult[0].total;
      console.log(`📈 Total users to migrate: ${totalUsers}`);

      if (totalUsers === 0) {
        console.log('ℹ️ No new users to migrate');
        await crossServerMigration.closeOldDbConnection();
        await transaction.commit();
        return;
      }

      // Step 2: Temporarily disable foreign key checks and auto-increment
      await queryInterface.sequelize.query(`SET FOREIGN_KEY_CHECKS = 0`, { transaction });
      await queryInterface.sequelize.query(`ALTER TABLE users AUTO_INCREMENT = 1`, { transaction });

      // Step 3: Process users in batches to avoid memory issues
      const BATCH_SIZE = 1000;
      let totalProcessed = 0;
      let totalInserted = 0;
      let totalUpdated = 0;
      let totalErrors = 0;
      const errors = [];

      console.log(`💾 Processing users in batches of ${BATCH_SIZE}...`);

      await crossServerMigration.batchProcessFromOldDb(`
        SELECT 
          old_vh.ID,
          old_vh.display_name,
          old_vh.user_email,
          old_vh.user_status,
          old_vh.user_registered,
          MAX(CASE WHEN um.meta_key = 'first_name' THEN um.meta_value END) as meta_first_name,
          MAX(CASE WHEN um.meta_key = 'last_name' THEN um.meta_value END) as meta_last_name
        FROM vh_users old_vh
        LEFT JOIN vh_usermeta um ON old_vh.ID = um.user_id 
          AND um.meta_key IN ('first_name', 'last_name')
        WHERE old_vh.user_email IS NOT NULL
        AND old_vh.user_email != ''
        GROUP BY old_vh.ID, old_vh.display_name, old_vh.user_email, old_vh.user_status, old_vh.user_registered
        ORDER BY old_vh.ID
      `, BATCH_SIZE, async (batchUsers, offset) => {
        console.log(`\n📦 Processing batch: ${offset + 1} to ${offset + batchUsers.length} (${((offset + batchUsers.length) / totalUsers * 100).toFixed(1)}%)`);

        for (const user of batchUsers) {
          try {
            // Prefer first_name and last_name from vh_usermeta, fallback to splitting display_name
            let firstName = '';
            let lastName = '';
            
            if (user.meta_first_name && user.meta_first_name.trim() !== '') {
              // Use first_name from vh_usermeta
              firstName = user.meta_first_name.trim();
            } else if (user.display_name) {
              // Fallback to splitting display_name
              firstName = user.display_name.includes(' ') 
                ? user.display_name.substring(0, user.display_name.indexOf(' ')).trim()
                : user.display_name.trim();
            }
            
            if (user.meta_last_name && user.meta_last_name.trim() !== '') {
              // Use last_name from vh_usermeta
              lastName = user.meta_last_name.trim();
            } else if (user.display_name && user.display_name.includes(' ')) {
              // Fallback to splitting display_name
              lastName = user.display_name.substring(user.display_name.indexOf(' ') + 1).trim();
            }

            // Set roleId: 1 for super.admin@vapehub.com, 2 for all others
            const roleId = user.user_email === 'super.admin@vapehub.com' ? 1 : 2;

            // Map user_status to blocked: 0 = active (blocked = 0), non-zero = inactive (blocked = 1)
            const blocked = user.user_status !== 0 ? 1 : 0;

            // Insert or update user with correct roleId
            const [result] = await queryInterface.sequelize.query(`
              INSERT INTO users (
                id, first_name, last_name, email, email_verified_at, phone, password, profile_pic_url, 
                gender, dob, token, token_expiry, remember_token, int_field, 
                referral_code, loyalty_points, receive_promotions, blocked, 
                super_user, roleId, referred_by, referral_points, createdAt, updatedAt, deletedAt
              ) VALUES (
                ?, ?, ?, ?, NOW(), NULL, 'temp_password_reset_required', NULL, 
                NULL, NULL, NULL, NULL, NULL, 0, 
                NULL, 0, 0, ?, 
                0, ?, NULL, 0, ?, NOW(), 
                CASE WHEN ? != 0 THEN ? ELSE NULL END
              )
              ON DUPLICATE KEY UPDATE
                first_name = VALUES(first_name),
                last_name = VALUES(last_name),
                roleId = VALUES(roleId),
                blocked = VALUES(blocked),
                updatedAt = NOW()
            `, {
              replacements: [
                user.ID,
                firstName,
                lastName,
                user.user_email,
                blocked,
                roleId,
                user.user_registered || new Date(),
                user.user_status,
                user.user_registered || new Date()
              ],
              transaction
            });

            // Check if it was an insert or update
            if (result.affectedRows === 1 && result.insertId === user.ID) {
              totalInserted++;
            } else {
              totalUpdated++;
            }
            totalProcessed++;
          } catch (error) {
            totalErrors++;
            errors.push({
              userId: user.ID,
              email: user.user_email,
              error: error.message
            });
            console.error(`❌ Error processing user ID ${user.ID} (${user.user_email}):`, error.message);
          }
        }

        // Log progress every batch
        console.log(`   ✅ Processed: ${totalProcessed}/${totalUsers} | Inserted: ${totalInserted} | Updated: ${totalUpdated} | Errors: ${totalErrors}`);
      });

      // Step 4: Fix any remaining NULL roleId values
      console.log('🔧 Fixing NULL roleId values...');
      
      // Check how many users have NULL roleId before update
      const [nullCountBefore] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE roleId IS NULL
      `, { transaction });
      console.log(`   Users with NULL roleId before update: ${nullCountBefore[0].count}`);
      
      // Update NULL roleId to 2
      const [updateResult] = await queryInterface.sequelize.query(`
        UPDATE users 
        SET roleId = 2 
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

      const [activeUsersCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE blocked = 0
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

      // Check user_status distribution from migrated data
      const [statusDistribution] = await queryInterface.sequelize.query(`
        SELECT 
          blocked,
          COUNT(*) as count
        FROM users 
        WHERE password = 'temp_password_reset_required'
        GROUP BY blocked
        ORDER BY blocked
      `, { transaction });

      console.log('\n🎉 LIVE DATA MIGRATION: Users completed successfully!');
      console.log(`\n📊 Migration Summary:`);
      console.log(`   Total processed: ${totalProcessed}`);
      console.log(`   Successfully inserted: ${totalInserted}`);
      console.log(`   Updated (duplicates): ${totalUpdated}`);
      console.log(`   Errors: ${totalErrors}`);
      console.log(`\n📈 Final Database State:`);
      console.log(`   Total migrated users: ${usersCount[0].count}`);
      console.log(`   Active users (blocked = 0): ${activeUsersCount[0].count}`);
      console.log(`   Blocked users (blocked = 1): ${blockedUsersCount[0].count}`);
      
      console.log('\n📋 Status Distribution (from old database):');
      statusDistribution.forEach(status => {
        const statusName = status.blocked === 0 ? 'Active (status = 0)' : 'Inactive/Blocked (status ≠ 0)';
        console.log(`   ${statusName}: ${status.count} users`);
      });
      
      console.log('\n📋 Role Distribution:');
      roleDistribution.forEach(role => {
        console.log(`   roleId ${role.roleId || 'NULL'}: ${role.count} users`);
      });
      
      if (superAdmin.length > 0) {
        console.log(`\n👑 Super Admin: ${superAdmin[0].email} (roleId: ${superAdmin[0].roleId})`);
      } else {
        console.log(`\n⚠️  Super Admin not found`);
      }

      if (errors.length > 0) {
        console.log(`\n⚠️  Migration Errors (${errors.length}):`);
        errors.slice(0, 10).forEach(err => {
          console.log(`   User ID ${err.userId} (${err.email}): ${err.error}`);
        });
        if (errors.length > 10) {
          console.log(`   ... and ${errors.length - 10} more errors`);
        }
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
    
    // Update all users to roleId = 2 except super admin
    const [updateResult] = await queryInterface.sequelize.query(`
      UPDATE users 
      SET roleId = 2, updatedAt = NOW()
      WHERE email != 'super.admin@vapehub.com' AND (roleId IS NULL OR roleId != 2)
    `, { transaction });
    console.log(`   Updated ${updateResult.affectedRows} users to roleId = 2`);
    
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
                      row.roleId === 2 ? 'Regular Users' : 
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
