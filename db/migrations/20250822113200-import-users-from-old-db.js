'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    // Debug: Check environment variable
    console.log('OLD_DB_NAME environment variable:', process.env.OLD_DB_NAME);
    
    try {
      // Step 1: Import active users from old database to new database
      await queryInterface.sequelize.query(`
        INSERT IGNORE INTO users (
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
        SELECT 
          CASE 
            WHEN INSTR(old_vh.display_name, ' ') > 0 
            THEN SUBSTRING(old_vh.display_name, 1, INSTR(old_vh.display_name, ' ') - 1)
            ELSE old_vh.display_name
          END as first_name,
          
          CASE 
            WHEN INSTR(old_vh.display_name, ' ') > 0 
            THEN SUBSTRING(old_vh.display_name, INSTR(old_vh.display_name, ' ') + 1)
            ELSE ''
          END as last_name,
          
          old_vh.user_email as email,
          NULL as phone,
          'temp_password_reset_required' as password,
          NULL as profile_pic_url,
          NULL as gender,
          NULL as dob,
          NULL as token,
          NULL as token_expiry,
          NULL as remember_token,
          0 as int_field,
          NULL as referral_code,
          0 as loyalty_points,
          0 as receive_promotions,
          CASE 
            WHEN old_vh.user_status = 0 THEN 0
            ELSE 1
          END as blocked,
          0 as super_user,
          NULL as roleId,
          NULL as referred_by,
          0 as referral_points,
          old_vh.user_registered as createdAt,
          NOW() as updatedAt,
          CASE 
            WHEN old_vh.user_status != 0 THEN old_vh.user_registered
            ELSE NULL
          END as deletedAt

        FROM ${process.env.OLD_DB_NAME}.vh_users old_vh
        WHERE 
          old_vh.user_status = 0
          AND old_vh.user_email IS NOT NULL 
          AND old_vh.user_email != ''
      `, { transaction });

      // Step 2: Verify the migration
      const [migratedUsersCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE createdAt >= NOW() - INTERVAL 1 HOUR
      `, { transaction });

      const [duplicateEmails] = await queryInterface.sequelize.query(`
        SELECT email, COUNT(*) as count 
        FROM users 
        GROUP BY email 
        HAVING COUNT(*) > 1
      `, { transaction });

      const [userStatusCount] = await queryInterface.sequelize.query(`
        SELECT 
          blocked,
          COUNT(*) as user_count
        FROM users 
        GROUP BY blocked
      `, { transaction });

      const [sampleUsers] = await queryInterface.sequelize.query(`
        SELECT 
          first_name,
          last_name,
          email,
          blocked,
          createdAt
        FROM users 
        WHERE createdAt >= NOW() - INTERVAL 1 HOUR
        ORDER BY createdAt DESC
        LIMIT 10
      `, { transaction });

      console.log('Users migration completed successfully!');
      console.log(`Users migrated: ${migratedUsersCount[0].count}`);
      
      if (duplicateEmails.length > 0) {
        console.log('\n⚠️  Warning: Duplicate emails found:');
        duplicateEmails.forEach(dup => {
          console.log(`- ${dup.email}: ${dup.count} occurrences`);
        });
      } else {
        console.log('\n✅ No duplicate emails found');
      }

      console.log('\nUser status breakdown:');
      userStatusCount.forEach(status => {
        const statusText = status.blocked === 0 ? 'Active' : 'Blocked';
        console.log(`- ${statusText}: ${status.user_count} users`);
      });

      console.log('\nSample migrated users:');
      sampleUsers.forEach(user => {
        const statusText = user.blocked === 0 ? 'Active' : 'Blocked';
        console.log(`- ${user.first_name} ${user.last_name} (${user.email}): ${statusText}`);
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error('Users migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Remove all imported users (those with NULL passwords)
      await queryInterface.sequelize.query(`
        DELETE FROM users WHERE createdAt >= NOW() - INTERVAL 1 HOUR
      `, { transaction });

      await transaction.commit();
      console.log('Users migration rolled back successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('Users migration rollback failed:', error);
      throw error;
    }
  }
};
