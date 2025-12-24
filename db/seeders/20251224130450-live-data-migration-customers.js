'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    
    try {
      // Check if customers already exist - if so, just update their roles
      const [existingCustomers] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE password = 'temp_password_reset_required'
      `, { transaction });
      
      if (existingCustomers[0].count > 0) {
        console.log('🔄 Customers already exist - skipping migration...');
        await transaction.commit();
        return;
      }
      
      console.log('🚀 Starting LIVE DATA MIGRATION: Customers from vh_wc_customer_lookup...');
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();
      
      // Step 1: Get total count of customers to migrate (for progress tracking)
      console.log('📊 Checking total customers in vh_wc_customer_lookup...');
      const [totalCountResult] = await crossServerMigration.queryOldDb(`
        SELECT COUNT(*) as total 
        FROM ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_wc_customer_lookup
        WHERE email IS NOT NULL AND email != ''
      `);
      const totalCustomers = totalCountResult[0].total;
      console.log(`📈 Total customers to migrate: ${totalCustomers}`);

      if (totalCustomers === 0) {
        console.log('ℹ️ No customers to migrate');
        await crossServerMigration.closeOldDbConnection();
        await transaction.commit();
        return;
      }

      // Step 2: Temporarily disable foreign key checks and auto-increment
      await queryInterface.sequelize.query(`SET FOREIGN_KEY_CHECKS = 0`, { transaction });
      await queryInterface.sequelize.query(`ALTER TABLE users AUTO_INCREMENT = 1`, { transaction });

      // Step 3: Process customers in batches to avoid memory issues
      const BATCH_SIZE = 1000;
      let totalProcessed = 0;
      let totalInserted = 0;
      let totalUpdated = 0;
      let totalErrors = 0;
      const errors = [];

      console.log(`💾 Processing customers in batches of ${BATCH_SIZE}...`);

      await crossServerMigration.batchProcessFromOldDb(`
        SELECT 
          COALESCE(user_id, customer_id) as id,
          first_name,
          last_name,
          email,
          username,
          date_registered,
          date_last_active,
          city,
          state,
          postcode,
          country
        FROM ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_wc_customer_lookup
        WHERE email IS NOT NULL 
          AND email != ''
        ORDER BY COALESCE(user_id, customer_id)
      `, BATCH_SIZE, async (batchCustomers, offset) => {
        console.log(`\n📦 Processing batch: ${offset + 1} to ${offset + batchCustomers.length} (${((offset + batchCustomers.length) / totalCustomers * 100).toFixed(1)}%)`);

        for (const customer of batchCustomers) {
          try {
            // Clean and validate data
            const firstName = customer.first_name ? customer.first_name.trim() : '';
            const lastName = customer.last_name ? customer.last_name.trim() : '';
            const email = customer.email ? customer.email.trim().toLowerCase() : '';
            const userId = customer.id || null;

            // Skip if no email or no ID
            if (!email || !userId) {
              console.log(`⚠️ Skipping customer: missing email or ID (ID: ${userId}, Email: ${email})`);
              continue;
            }

            // Set roleId: 1 for super.admin@vapehub.com, 0 for all others
            const roleId = email === 'super.admin@vapehub.com' ? 1 : 0;

            // Set blocked to 0 (active) by default for customers
            const blocked = 0;

            // Use date_registered for createdAt, or current date if not available
            const createdAt = customer.date_registered || new Date();

            // Insert or update customer with correct roleId
            const [result] = await queryInterface.sequelize.query(`
              INSERT INTO users (
                id, first_name, last_name, email, phone, password, profile_pic_url, 
                gender, dob, token, token_expiry, remember_token, int_field, 
                referral_code, loyalty_points, receive_promotions, blocked, 
                super_user, roleId, referred_by, referral_points, createdAt, updatedAt, deletedAt
              ) VALUES (
                ?, ?, ?, ?, NULL, 'temp_password_reset_required', NULL, 
                NULL, NULL, NULL, NULL, NULL, 0, 
                NULL, 0, 0, ?, 
                0, ?, NULL, 0, ?, NOW(), NULL
              )
              ON DUPLICATE KEY UPDATE
                first_name = VALUES(first_name),
                last_name = VALUES(last_name),
                email = VALUES(email),
                roleId = VALUES(roleId),
                blocked = VALUES(blocked),
                updatedAt = NOW()
            `, {
              replacements: [
                userId,
                firstName,
                lastName,
                email,
                blocked,
                roleId,
                createdAt
              ],
              transaction
            });

            // Check if it was an insert or update
            if (result.affectedRows === 1 && result.insertId === userId) {
              totalInserted++;
            } else {
              totalUpdated++;
            }
            totalProcessed++;
          } catch (error) {
            totalErrors++;
            errors.push({
              customerId: customer.id,
              email: customer.email,
              error: error.message
            });
            console.error(`❌ Error processing customer ID ${customer.id} (${customer.email}):`, error.message);
          }
        }

        // Log progress every batch
        console.log(`   ✅ Processed: ${totalProcessed}/${totalCustomers} | Inserted: ${totalInserted} | Updated: ${totalUpdated} | Errors: ${totalErrors}`);
      });

      // Step 4: Fix any remaining NULL roleId values
      console.log('🔧 Fixing NULL roleId values...');
      
      // Check how many customers have NULL roleId before update
      const [nullCountBefore] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE roleId IS NULL
      `, { transaction });
      console.log(`   Customers with NULL roleId before update: ${nullCountBefore[0].count}`);
      
      // Update NULL roleId to 0
      const [updateResult] = await queryInterface.sequelize.query(`
        UPDATE users 
        SET roleId = 0 
        WHERE roleId IS NULL AND email != 'super.admin@vapehub.com'
      `, { transaction });
      console.log(`   Update result: ${updateResult.affectedRows} rows affected`);
      
      // Check how many customers have NULL roleId after update
      const [nullCountAfter] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE roleId IS NULL
      `, { transaction });
      console.log(`   Customers with NULL roleId after update: ${nullCountAfter[0].count}`);

      // Step 5: Re-enable auto-increment and foreign key checks
      const [maxIdResult] = await queryInterface.sequelize.query(`SELECT MAX(id) as max_id FROM users`, { transaction });
      const maxId = maxIdResult[0].max_id || 1;
      await queryInterface.sequelize.query(`ALTER TABLE users AUTO_INCREMENT = ${maxId + 1}`, { transaction });
      await queryInterface.sequelize.query(`SET FOREIGN_KEY_CHECKS = 1`, { transaction });

      // Step 6: Verification queries
      const [customersCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE password = 'temp_password_reset_required'
      `, { transaction });

      const [blockedCustomersCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE blocked = 1
      `, { transaction });

      const [activeCustomersCount] = await queryInterface.sequelize.query(`
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

      console.log('\n🎉 LIVE DATA MIGRATION: Customers completed successfully!');
      console.log(`\n📊 Migration Summary:`);
      console.log(`   Total processed: ${totalProcessed}`);
      console.log(`   Successfully inserted: ${totalInserted}`);
      console.log(`   Updated (duplicates): ${totalUpdated}`);
      console.log(`   Errors: ${totalErrors}`);
      console.log(`\n📈 Final Database State:`);
      console.log(`   Total migrated customers: ${customersCount[0].count}`);
      console.log(`   Active customers (blocked = 0): ${activeCustomersCount[0].count}`);
      console.log(`   Blocked customers (blocked = 1): ${blockedCustomersCount[0].count}`);
      
      console.log('\n📋 Role Distribution:');
      roleDistribution.forEach(role => {
        console.log(`   roleId ${role.roleId || 'NULL'}: ${role.count} customers`);
      });
      
      if (superAdmin.length > 0) {
        console.log(`\n👑 Super Admin: ${superAdmin[0].email} (roleId: ${superAdmin[0].roleId})`);
      } else {
        console.log(`\n⚠️  Super Admin not found`);
      }

      if (errors.length > 0) {
        console.log(`\n⚠️  Migration Errors (${errors.length}):`);
        errors.slice(0, 10).forEach(err => {
          console.log(`   Customer ID ${err.customerId} (${err.email}): ${err.error}`);
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
      console.error('❌ LIVE DATA MIGRATION: Customers failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back LIVE DATA MIGRATION: Customers...');
      
      await queryInterface.sequelize.query(`DELETE FROM users WHERE password = 'temp_password_reset_required'`, { transaction });
      
      await transaction.commit();
      console.log('✅ LIVE DATA MIGRATION: Customers rolled back successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ LIVE DATA MIGRATION: Customers rollback failed:', error);
      throw error;
    }
  }
};

