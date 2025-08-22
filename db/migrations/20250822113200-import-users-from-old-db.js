'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('Starting users migration from live database...');
      
      // Step 1: Temporarily disable foreign key checks to allow ID manipulation
      await queryInterface.sequelize.query(`SET FOREIGN_KEY_CHECKS = 0`, { transaction });

      // Step 2: Temporarily disable auto-increment to preserve original IDs
      await queryInterface.sequelize.query(`
        ALTER TABLE users MODIFY id int NOT NULL
      `, { transaction });

      // Step 3: Insert users with their original IDs
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
                 SELECT 
           old_vh.ID as id,
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
        WHERE old_vh.user_status = 0
          AND old_vh.user_email IS NOT NULL 
          AND old_vh.user_email != ''
          AND NOT EXISTS (
            SELECT 1 FROM users existing_u 
            WHERE existing_u.id = old_vh.ID
          )
      `, { transaction });

      // Step 4: Re-enable auto-increment and set it to the next available ID
      await queryInterface.sequelize.query(`
        ALTER TABLE users MODIFY id int NOT NULL AUTO_INCREMENT
      `, { transaction });

      // Step 5: Update auto-increment to start after the highest imported ID
      const [maxIdResult] = await queryInterface.sequelize.query(`
        SELECT MAX(id) as max_id FROM users
      `, { transaction });

      const maxId = maxIdResult[0].max_id || 1;
      await queryInterface.sequelize.query(`
        ALTER TABLE users AUTO_INCREMENT = ${maxId + 1}
      `, { transaction });

      // Step 6: Re-enable foreign key checks
      await queryInterface.sequelize.query(`SET FOREIGN_KEY_CHECKS = 1`, { transaction });

      // Step 7: Verification
      const [migratedUsersCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE password = 'temp_password_reset_required'
      `, { transaction });

      const [totalUsersCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users
      `, { transaction });

      const [sampleUsers] = await queryInterface.sequelize.query(`
        SELECT id, email, first_name, last_name, createdAt
        FROM users 
        WHERE password = 'temp_password_reset_required'
        ORDER BY id ASC 
        LIMIT 10
      `, { transaction });

      console.log('Users migration completed successfully!');
      console.log(`Total users in new database: ${totalUsersCount[0].count}`);
      console.log(`Users migrated: ${migratedUsersCount[0].count}`);
      console.log(`Original user IDs preserved!`);
      
      console.log('\nSample migrated users:');
      sampleUsers.forEach(user => {
        console.log(`- ID: ${user.id}, Email: ${user.email}, Name: ${user.first_name} ${user.last_name}`);
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
      await queryInterface.sequelize.query(`
        DELETE FROM users WHERE password = 'temp_password_reset_required'
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
