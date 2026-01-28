'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('🔄 Starting seeder to generate referral codes for users without them...');
      
      // Find all users without referral codes
      const usersWithoutCodes = await queryInterface.sequelize.query(
        `SELECT id FROM users WHERE referral_code IS NULL OR referral_code = ''`,
        { type: Sequelize.QueryTypes.SELECT }
      );

      console.log(`📊 Found ${usersWithoutCodes.length} users without referral codes`);

      if (usersWithoutCodes.length === 0) {
        console.log('✅ No users need referral codes. Seeder completed.');
        return;
      }

      let updatedCount = 0;
      let failedCount = 0;

      // Process users in batches to avoid memory issues
      const batchSize = 1000;
      for (let i = 0; i < usersWithoutCodes.length; i += batchSize) {
        const batch = usersWithoutCodes.slice(i, i + batchSize);
        
        for (const user of batch) {
          let isUnique = false;
          let referralCode;
          let attempts = 0;
          const maxAttempts = 10;

          // Generate unique referral code using same format as User model
          while (!isUnique && attempts < maxAttempts) {
            attempts++;
            // Generate a random string of 6 characters (base36)
            const randomString = Math.random().toString(36).substring(2, 8).toUpperCase();
            // Combine user ID with random string (format: ${user.id}${randomString})
            referralCode = `${user.id}${randomString}`;

            // Check if the code already exists
            const [existingUsers] = await queryInterface.sequelize.query(
              `SELECT id FROM users WHERE referral_code = :code AND id != :userId LIMIT 1`,
              {
                replacements: { code: referralCode, userId: user.id },
                type: Sequelize.QueryTypes.SELECT
              }
            );

            if (!existingUsers || existingUsers.length === 0) {
              isUnique = true;
            }
          }

          if (isUnique && referralCode) {
            try {
              // Update user with referral code
              await queryInterface.sequelize.query(
                `UPDATE users SET referral_code = :code WHERE id = :userId`,
                {
                  replacements: { code: referralCode, userId: user.id },
                  type: Sequelize.QueryTypes.UPDATE
                }
              );
              updatedCount++;
            } catch (updateError) {
              console.error(`❌ Failed to update user ${user.id}:`, updateError.message);
              failedCount++;
            }
          } else {
            console.error(`❌ Failed to generate unique referral code for user ${user.id} after ${maxAttempts} attempts`);
            failedCount++;
          }
        }

        // Log progress for large batches
        if (usersWithoutCodes.length > batchSize) {
          console.log(`📈 Processed ${Math.min(i + batchSize, usersWithoutCodes.length)}/${usersWithoutCodes.length} users...`);
        }
      }

      console.log('\n📊 SEEDER SUMMARY:');
      console.log(`   • Users updated: ${updatedCount}`);
      console.log(`   • Users failed: ${failedCount}`);
      console.log(`   • Total processed: ${usersWithoutCodes.length}`);
      console.log('\n✅ Referral code seeder completed successfully!');
    } catch (error) {
      console.error('❌ Seeder Error:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    // Rollback: Set referral_code to NULL for users that were updated in this seeder
    // Note: This is a destructive operation and should be used with caution
    // In production, you might want to backup referral codes before running down
    try {
      console.log('🔄 Rolling back referral code updates...');
      console.warn('⚠️  WARNING: This will set referral_code to NULL for affected users');
      
      // This is a simple rollback - in production you might want to track
      // which users were updated to only rollback those specific ones
      // For now, we'll leave it as a warning since we can't easily track
      // which users were updated by this seeder
      
      console.log('⏭️  Rollback skipped - manual intervention may be required');
      console.log('💡 If you need to rollback, you can manually set referral_code to NULL for specific users');
    } catch (error) {
      console.error('❌ Seeder Rollback Error:', error);
      throw error;
    }
  }
};
