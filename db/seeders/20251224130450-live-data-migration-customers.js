'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    const CHUNK_SIZE = 1000;
    const BATCH_INTERVAL = 1000; // 1 second interval between batches
    
    try {
      // Step 0: Check existing data and resume from where it stopped
      const [existingCustomersCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE password = 'temp_password_reset_required'
      `);
      
      console.log(`📊 Existing customers count: ${existingCustomersCount[0].count}`);
      
      if (existingCustomersCount[0].count > 0) {
        console.log(`✅ Migration already started/completed. Found ${existingCustomersCount[0].count} existing customers.`);
        console.log(`🔄 Resuming migration from existing data...`);
      } else {
        console.log(`🚀 Starting fresh migration...`);
      }
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();

      // Step 1: Get total count of customers to migrate
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
        return;
      }

      // Step 2: Get list of already migrated customer IDs from new database
      const [migratedCustomerIds] = await queryInterface.sequelize.query(`
        SELECT DISTINCT id as customer_id
        FROM users 
        WHERE password = 'temp_password_reset_required'
      `);
      
      const migratedIds = migratedCustomerIds.map(row => row.customer_id);
      const migratedIdsList = migratedIds.length > 0 ? migratedIds.join(',') : '0';
      
      console.log(`📋 Found ${migratedIds.length} already migrated customers. Will skip these during migration.`);

      // Step 3: Process customers in chunks with timeout protection
      const CHUNK_TIMEOUT = 180000; // 3 minutes per chunk
      const startTime = Date.now();
      let lastId = 0;
      const totalChunks = Math.ceil(totalCustomers / CHUNK_SIZE);
      let totalProcessed = 0;
      let totalInserted = 0;
      let totalUpdated = 0;
      let totalErrors = 0;
      let totalSkippedDuplicates = 0;
      let totalSkippedExistingEmail = 0;
      let totalSkippedMissingData = 0;
      const errors = [];

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const offset = chunkIndex * CHUNK_SIZE;
        const transaction = await queryInterface.sequelize.transaction();
        const chunkStartTime = Date.now();
        
        try {
          console.log(`🔄 Processing chunk ${chunkIndex + 1}/${totalChunks} (offset: ${offset})**********************************************************`);
          
          // Check if we're taking too long overall (6 hour timeout)
          const elapsedTime = Date.now() - startTime;
          const timeoutMs = 6 * 3600000; // 6 hours
          const elapsedHours = (elapsedTime / 3600000).toFixed(2);
          const remainingHours = ((timeoutMs - elapsedTime) / 3600000).toFixed(2);
          
          console.log(`⏰ Time tracking: ${elapsedHours}h elapsed, ${remainingHours}h remaining`);
          
          if (elapsedTime > timeoutMs) {
            console.log(`⏰ Migration timeout reached (6 hours). Stopping migration.`);
            await transaction.rollback();
            break;
          }
          
          // Clean up any existing temporary tables
          await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_customers_chunk`, { transaction });
          
          // Step 3a: Fetch customers for this chunk from old database (skip already migrated)
          console.log(`🔍 Fetching customers from old database for chunk ${chunkIndex + 1}...`);
          const fetchStartTime = Date.now();
          const chunkCustomers = await crossServerMigration.fetchFromOldDb(`
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
              AND COALESCE(user_id, customer_id) > ${lastId}
              AND COALESCE(user_id, customer_id) NOT IN (${migratedIdsList})
            ORDER BY COALESCE(user_id, customer_id) ASC
            LIMIT ${CHUNK_SIZE}
          `);

          const fetchTime = Date.now() - fetchStartTime;
          console.log(`✅ Fetched ${chunkCustomers.length} customers in ${fetchTime}ms`);

          // Skip this chunk if no customers found
          if (chunkCustomers.length === 0) {
            console.log(`   ⏭️  Chunk ${chunkIndex + 1}: No new customers to migrate (all already migrated)`);
            await transaction.commit();
            continue;
          }

          // Calculate lastId from fetched records for pagination
          lastId = Math.max(...chunkCustomers.map(c => c.id));
          console.log('Last id = ' + lastId);

          console.log(`   📦 Found ${chunkCustomers.length} customers to migrate in this chunk`);

          // Step 3b: Create temporary table for this chunk
          await queryInterface.sequelize.query(`
            CREATE TEMPORARY TABLE temp_customers_chunk (
              id BIGINT,
              first_name VARCHAR(255),
              last_name VARCHAR(255),
              email VARCHAR(255),
              username VARCHAR(255),
              date_registered DATETIME,
              roleId INT,
              blocked TINYINT,
              createdAt DATETIME
            )
          `, { transaction });

          // Step 3c: Insert chunk data into temporary table with data cleaning
          console.log(`💾 Preparing customer data for chunk ${chunkIndex + 1}...`);
          const prepareStartTime = Date.now();
          
          // Get list of existing emails for current chunk only (more efficient)
          const chunkEmails = chunkCustomers
            .map(c => c.email ? c.email.trim().toLowerCase() : '')
            .filter(email => email !== '');
          
          let existingEmailSet = new Set();
          if (chunkEmails.length > 0) {
            const emailPlaceholders = chunkEmails.map(() => '?').join(',');
            const [existingEmails] = await queryInterface.sequelize.query(`
              SELECT LOWER(email) as email FROM users 
              WHERE LOWER(email) IN (${emailPlaceholders})
            `, { 
              replacements: chunkEmails,
              transaction 
            });
            existingEmailSet = new Set(existingEmails.map(row => row.email));
          }
          
          for (const customer of chunkCustomers) {
            try {
              // Clean and validate data
              const firstName = customer.first_name ? customer.first_name.trim() : '';
              const lastName = customer.last_name ? customer.last_name.trim() : '';
              const email = customer.email ? customer.email.trim().toLowerCase() : '';
              const userId = customer.id || null;

              // Skip if no email or no ID
              if (!email || !userId) {
                totalSkippedMissingData++;
                console.log(`⚠️ Skipping customer: missing email or ID (ID: ${userId}, Email: ${email})`);
                continue;
              }

              // Skip if email already exists in users table
              if (existingEmailSet.has(email)) {
                totalSkippedExistingEmail++;
                console.log(`⚠️ Skipping customer: email already exists (ID: ${userId}, Email: ${email})`);
                continue;
              }

              // Set roleId: 1 for super.admin@vapehub.com, 0 for all others
              const roleId = email === 'super.admin@vapehub.com' ? 1 : 0;

              // Set blocked to 0 (active) by default for customers
              const blocked = 0;

              // Use date_registered for createdAt, or current date if not available
              const createdAt = customer.date_registered || new Date();

              await queryInterface.sequelize.query(`
                INSERT INTO temp_customers_chunk (
                  id, first_name, last_name, email, username, date_registered, roleId, blocked, createdAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, {
                replacements: [
                  userId,
                  firstName,
                  lastName,
                  email,
                  customer.username || null,
                  createdAt,
                  roleId,
                  blocked,
                  createdAt
                ],
                transaction
              });
            } catch (error) {
              totalErrors++;
              errors.push({
                customerId: customer.id,
                email: customer.email,
                error: error.message
              });
              console.error(`❌ Error preparing customer ID ${customer.id} (${customer.email}):`, error.message);
            }
          }

          const prepareTime = Date.now() - prepareStartTime;
          console.log(`✅ Prepared ${chunkCustomers.length} customers in ${prepareTime}ms`);

          // Step 3d: Temporarily disable foreign key checks for this chunk
          console.log(`🔧 Disabling foreign key checks for chunk ${chunkIndex + 1}...`);
          await queryInterface.sequelize.query(`SET FOREIGN_KEY_CHECKS = 0`, { transaction });
          console.log(`✅ Foreign key checks disabled`);

          // Step 3e: Bulk insert customers using INSERT ... SELECT (BULK INSERT)
          console.log(`💾 Bulk inserting ${chunkCustomers.length} customers into database...`);
          const insertStartTime = Date.now();
          
          const [insertResult] = await queryInterface.sequelize.query(`
            INSERT INTO users (
              id, first_name, last_name, email, email_verified_at, phone, password, profile_pic_url, 
              gender, dob, token, token_expiry, remember_token, int_field, 
              referral_code, loyalty_points, receive_promotions, blocked, 
              super_user, roleId, referred_by, referral_points, createdAt, updatedAt, deletedAt
            )
            SELECT 
              MAX(id) as id,
              MAX(first_name) as first_name,
              MAX(last_name) as last_name,
              email,
              NOW() as email_verified_at,
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
              MAX(blocked) as blocked,
              0 as super_user,
              MAX(roleId) as roleId,
              NULL as referred_by,
              0 as referral_points,
              MAX(createdAt) as createdAt,
              NOW() as updatedAt,
              NULL as deletedAt
            FROM temp_customers_chunk
            GROUP BY email
            ON DUPLICATE KEY UPDATE
              first_name = VALUES(first_name),
              last_name = VALUES(last_name),
              email = VALUES(email),
              roleId = VALUES(roleId),
              blocked = VALUES(blocked),
              updatedAt = NOW()
          `, { transaction });

          const insertTime = Date.now() - insertStartTime;
          const affectedRows = insertResult.affectedRows || 0;
          
          // Calculate duplicates: records in temp table vs distinct emails inserted
          // GROUP BY email in the bulk insert handles duplicates, so we track the difference
          const [tempTableCount] = await queryInterface.sequelize.query(`
            SELECT COUNT(*) as count FROM temp_customers_chunk
          `, { transaction });
          
          const [distinctEmailsCount] = await queryInterface.sequelize.query(`
            SELECT COUNT(DISTINCT email) as count FROM temp_customers_chunk
          `, { transaction });
          
          const recordsInTemp = tempTableCount[0].count;
          const distinctEmailsInTemp = distinctEmailsCount[0].count;
          const duplicatesInChunk = Math.max(0, recordsInTemp - distinctEmailsInTemp);
          totalSkippedDuplicates += duplicatesInChunk;
          
          console.log(`✅ Bulk inserted customers in ${insertTime}ms (${affectedRows} rows affected)`);
          if (duplicatesInChunk > 0) {
            console.log(`   🔍 ${duplicatesInChunk} duplicate emails handled by GROUP BY in this chunk`);
          }

          // Count inserts vs updates
          const [insertCount] = await queryInterface.sequelize.query(`
            SELECT COUNT(*) as count FROM users 
            WHERE id IN (SELECT id FROM temp_customers_chunk)
            AND password = 'temp_password_reset_required'
          `, { transaction });
          
          totalInserted += insertCount[0].count;
          totalUpdated += (chunkCustomers.length - insertCount[0].count);
          totalProcessed += chunkCustomers.length;

          // Step 3f: Re-enable foreign key checks
          console.log(`🔧 Re-enabling foreign key checks...`);
          await queryInterface.sequelize.query(`SET FOREIGN_KEY_CHECKS = 1`, { transaction });
          console.log(`✅ Foreign key checks re-enabled`);

          // Step 3g: Clean up temporary tables for this chunk
          console.log(`🧹 Cleaning up temporary tables for chunk ${chunkIndex + 1}...`);
          await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_customers_chunk`, { transaction });
          console.log(`✅ Temporary tables cleaned up`);

          console.log(`💾 Committing transaction for chunk ${chunkIndex + 1}...`);
          await transaction.commit();
          console.log(`✅ Transaction committed successfully`);
          
          const chunkElapsedTime = Date.now() - chunkStartTime;
          const progressPercentage = (((chunkIndex + 1) / totalChunks) * 100).toFixed(1);
          console.log(`✅ Chunk ${chunkIndex + 1}/${totalChunks} completed successfully (${Math.round(chunkElapsedTime/1000)}s) - ${progressPercentage}% complete`);
          console.log(`   ✅ Processed: ${totalProcessed}/${totalCustomers} | Inserted: ${totalInserted} | Updated: ${totalUpdated} | Errors: ${totalErrors}`);
          console.log(`   ⏭️  Skipped: Duplicates: ${totalSkippedDuplicates} | Existing: ${totalSkippedExistingEmail} | Missing: ${totalSkippedMissingData}`);
          
          // Add interval between batches to reduce database load
          if (BATCH_INTERVAL > 0 && chunkIndex < totalChunks - 1) {
            console.log(`⏳ Waiting ${BATCH_INTERVAL/1000}s before next batch...`);
            await new Promise(resolve => setTimeout(resolve, BATCH_INTERVAL));
          }
          
        } catch (error) {
          await transaction.rollback();
          const chunkElapsedTime = Date.now() - chunkStartTime;
          console.error(`❌ Chunk ${chunkIndex + 1}/${totalChunks} failed after ${Math.round(chunkElapsedTime/1000)}s:`);
          console.error(`   Error: ${error.message}`);
          console.error(`   Stack: ${error.stack}`);
          console.error(`   Chunk offset: ${offset}, Chunk size: ${CHUNK_SIZE}`);
          
          // If it's a timeout, connection, lock issue, or duplicate key error, continue with next chunk
          if (error.message.includes('timeout') || 
              error.message.includes('connection') || 
              error.message.includes('ECONNRESET') ||
              error.message.includes('Lock wait timeout') ||
              error.message.includes('lock wait timeout') ||
              error.name === 'SequelizeUniqueConstraintError' ||
              error.message.includes('Duplicate entry') ||
              error.message.includes('ER_DUP_ENTRY')) {
            console.log(`🔄 Continuing with next chunk due to connection/timeout/lock/duplicate issue...`);
            if (error.name === 'SequelizeUniqueConstraintError' || error.message.includes('Duplicate entry')) {
              console.log(`   ⚠️  Duplicate email detected, skipping this chunk and continuing...`);
            }
            continue;
          }
          
          // For other errors, re-throw to stop migration
          throw error;
        }
      }

      // Step 4: Fix any remaining NULL roleId values
      console.log('🔧 Fixing NULL roleId values...');
      const fixRoleStartTime = Date.now();
      
      const [nullCountBefore] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE roleId IS NULL
      `);
      console.log(`   Customers with NULL roleId before update: ${nullCountBefore[0].count}`);
      
      const [updateResult] = await queryInterface.sequelize.query(`
        UPDATE users 
        SET roleId = 0 
        WHERE roleId IS NULL AND email != 'super.admin@vapehub.com'
      `);
      console.log(`   Update result: ${updateResult.affectedRows} rows affected`);
      
      const [nullCountAfter] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE roleId IS NULL
      `);
      console.log(`   Customers with NULL roleId after update: ${nullCountAfter[0].count}`);
      
      const fixRoleTime = Date.now() - fixRoleStartTime;
      console.log(`✅ Fixed NULL roleId values in ${fixRoleTime}ms`);

      // Step 5: Re-enable auto-increment and foreign key checks
      const [maxIdResult] = await queryInterface.sequelize.query(`SELECT MAX(id) as max_id FROM users`);
      const maxId = maxIdResult[0].max_id || 1;
      await queryInterface.sequelize.query(`ALTER TABLE users AUTO_INCREMENT = ${maxId + 1}`);
      await queryInterface.sequelize.query(`SET FOREIGN_KEY_CHECKS = 1`);

      // Step 6: Verification queries
      const [customersCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE password = 'temp_password_reset_required'
      `);

      const [blockedCustomersCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE blocked = 1
      `);

      const [activeCustomersCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM users WHERE blocked = 0
      `);

      // Check role distribution
      const [roleDistribution] = await queryInterface.sequelize.query(`
        SELECT 
          roleId,
          COUNT(*) as count
        FROM users 
        GROUP BY roleId
        ORDER BY roleId
      `);

      // Check super admin
      const [superAdmin] = await queryInterface.sequelize.query(`
        SELECT email, roleId FROM users WHERE email = 'super.admin@vapehub.com'
      `);

      console.log('\n🎉 LIVE DATA MIGRATION: Customers completed successfully!');
      console.log(`\n📊 Migration Summary:`);
      console.log(`   Total processed: ${totalProcessed}`);
      console.log(`   Successfully inserted: ${totalInserted}`);
      console.log(`   Updated (duplicates): ${totalUpdated}`);
      console.log(`   Errors: ${totalErrors}`);
      console.log(`\n📋 Skipped Records:`);
      console.log(`   Skipped due to duplicate emails: ${totalSkippedDuplicates}`);
      console.log(`   Skipped due to existing emails: ${totalSkippedExistingEmail}`);
      console.log(`   Skipped due to missing data: ${totalSkippedMissingData}`);
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

    } catch (error) {
      await crossServerMigration.closeOldDbConnection();
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
