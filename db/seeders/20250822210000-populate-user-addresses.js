'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🚀 Starting to populate user_addresses from old WooCommerce database...');
      
      // Initialize cross-server migration
      const crossServerMigration = new CrossServerMigration();
      await crossServerMigration.connectToOldDb();
      
      // Disable foreign key checks for bulk operations
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
      
      console.log('📋 Step 1: Creating temporary mapping tables...');
      
      // Create temporary mapping table for users
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE temp_user_mapping (
          old_user_id INT,
          new_user_id INT,
          INDEX idx_old_user (old_user_id),
          INDEX idx_new_user (new_user_id)
        )
      `);
      
      // Populate user mapping based on matching emails
      await queryInterface.sequelize.query(`
        INSERT INTO temp_user_mapping (old_user_id, new_user_id)
        SELECT 
          old_u.ID as old_user_id,
          u.id as new_user_id
        FROM ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_users old_u
        INNER JOIN users u ON u.email = old_u.user_email COLLATE utf8mb4_unicode_ci
        WHERE old_u.user_status = 0
      `);
      
      console.log('📊 Step 2: Fetching user address data from old database...');
      
      // Get user billing addresses from old database
      const billingAddressData = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          um.user_id,
          MAX(CASE WHEN um.meta_key = 'billing_first_name' THEN um.meta_value END) as first_name,
          MAX(CASE WHEN um.meta_key = 'billing_last_name' THEN um.meta_value END) as last_name,
          MAX(CASE WHEN um.meta_key = 'billing_company' THEN um.meta_value END) as company,
          MAX(CASE WHEN um.meta_key = 'billing_country' THEN um.meta_value END) as country,
          MAX(CASE WHEN um.meta_key = 'billing_address_1' THEN um.meta_value END) as address_1,
          MAX(CASE WHEN um.meta_key = 'billing_address_2' THEN um.meta_value END) as address_2,
          MAX(CASE WHEN um.meta_key = 'billing_city' THEN um.meta_value END) as city,
          MAX(CASE WHEN um.meta_key = 'billing_state' THEN um.meta_value END) as state,
          MAX(CASE WHEN um.meta_key = 'billing_postcode' THEN um.meta_value END) as postcode,
          MAX(CASE WHEN um.meta_key = 'billing_phone' THEN um.meta_value END) as phone
        FROM vh_usermeta um
        WHERE um.meta_key IN (
          'billing_first_name', 'billing_last_name', 'billing_company', 'billing_country',
          'billing_address_1', 'billing_address_2', 'billing_city', 'billing_state',
          'billing_postcode', 'billing_phone'
        )
        GROUP BY um.user_id
        HAVING first_name IS NOT NULL AND first_name != ''
        ORDER BY um.user_id
      `);
      
      console.log(`✅ Found ${billingAddressData.length} billing addresses in old database`);
      
      // Get user shipping addresses from old database
      const shippingAddressData = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          um.user_id,
          MAX(CASE WHEN um.meta_key = 'shipping_first_name' THEN um.meta_value END) as first_name,
          MAX(CASE WHEN um.meta_key = 'shipping_last_name' THEN um.meta_value END) as last_name,
          MAX(CASE WHEN um.meta_key = 'shipping_company' THEN um.meta_value END) as company,
          MAX(CASE WHEN um.meta_key = 'shipping_country' THEN um.meta_value END) as country,
          MAX(CASE WHEN um.meta_key = 'shipping_address_1' THEN um.meta_value END) as address_1,
          MAX(CASE WHEN um.meta_key = 'shipping_address_2' THEN um.meta_value END) as address_2,
          MAX(CASE WHEN um.meta_key = 'shipping_city' THEN um.meta_value END) as city,
          MAX(CASE WHEN um.meta_key = 'shipping_state' THEN um.meta_value END) as state,
          MAX(CASE WHEN um.meta_key = 'shipping_postcode' THEN um.meta_value END) as postcode,
          MAX(CASE WHEN um.meta_key = 'shipping_phone' THEN um.meta_value END) as phone
        FROM vh_usermeta um
        WHERE um.meta_key IN (
          'shipping_first_name', 'shipping_last_name', 'shipping_company', 'shipping_country',
          'shipping_address_1', 'shipping_address_2', 'shipping_city', 'shipping_state',
          'shipping_postcode', 'shipping_phone'
        )
        GROUP BY um.user_id
        HAVING first_name IS NOT NULL AND first_name != ''
        ORDER BY um.user_id
      `);
      
      console.log(`✅ Found ${shippingAddressData.length} shipping addresses in old database`);
      
      if (billingAddressData.length === 0 && shippingAddressData.length === 0) {
        console.log('⚠️ No address data found in old database');
        await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
        if (crossServerMigration.oldDbConnection) {
          await crossServerMigration.oldDbConnection.close();
        }
        return;
      }
      
      // Debug: Log the first few addresses
      if (billingAddressData.length > 0) {
        console.log('🔍 Sample billing address:', JSON.stringify(billingAddressData[0], null, 2));
      }
      if (shippingAddressData.length > 0) {
        console.log('🔍 Sample shipping address:', JSON.stringify(shippingAddressData[0], null, 2));
      }
      
      console.log('🔗 Step 3: Processing and inserting billing addresses...');
      
      // Process billing addresses in chunks
      const chunkSize = 500;
      let insertedBilling = 0;
      
      for (let i = 0; i < billingAddressData.length; i += chunkSize) {
        const chunk = billingAddressData.slice(i, i + chunkSize);
        
        // Prepare data for bulk insert
        const insertData = [];
        
        for (const address of chunk) {
          if (address.first_name && address.address_1) {
            insertData.push([
              address.user_id,           // old_user_id for mapping
              address.first_name || '',
              address.last_name || '',
              address.company || '',
              address.country || '',
              address.address_1 || '',
              address.address_2 || '',
              address.city || '',
              address.state || '',       // county/region
              address.state || '',       // region 
              address.postcode || '',
              address.phone || '',
              'billing-address',         // token to identify as billing
              new Date(),               // createdAt
              new Date()                // updatedAt
            ]);
          }
        }
        
        if (insertData.length > 0) {
          // Insert billing addresses with proper mapping
          for (const address of insertData) {
            const [old_user_id, first_name, last_name, company, country, address_1, address_2, city, state, region, postcode, phone, token] = address;
            
            await queryInterface.sequelize.query(`
              INSERT IGNORE INTO user_addresses 
              (user_id, name, last_name, company_name, country, street, apartment, town, county, region, post_code, phone, token, updated_by, createdAt, updatedAt)
              SELECT 
                tm.new_user_id,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW()
              FROM temp_user_mapping tm
              WHERE tm.old_user_id = ?
            `, {
              replacements: [first_name, last_name, company, country, address_1, address_2, city, state, region, postcode, phone, token, old_user_id]
            });
          }
          
          insertedBilling += insertData.length;
          console.log(`✅ Inserted billing chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(billingAddressData.length / chunkSize)} - ${insertData.length} addresses`);
        }
      }
      
      console.log('🔗 Step 4: Processing and inserting shipping addresses...');
      
      let insertedShipping = 0;
      
      for (let i = 0; i < shippingAddressData.length; i += chunkSize) {
        const chunk = shippingAddressData.slice(i, i + chunkSize);
        
        // Prepare data for bulk insert
        const insertData = [];
        
        for (const address of chunk) {
          if (address.first_name && address.address_1) {
            insertData.push([
              address.user_id,           // old_user_id for mapping
              address.first_name || '',
              address.last_name || '',
              address.company || '',
              address.country || '',
              address.address_1 || '',
              address.address_2 || '',
              address.city || '',
              address.state || '',       // county/region
              address.state || '',       // region 
              address.postcode || '',
              address.phone || '',
              'shipping-address',        // token to identify as shipping
              new Date(),               // createdAt
              new Date()                // updatedAt
            ]);
          }
        }
        
        if (insertData.length > 0) {
          // Insert shipping addresses with proper mapping
          for (const address of insertData) {
            const [old_user_id, first_name, last_name, company, country, address_1, address_2, city, state, region, postcode, phone, token] = address;
            
            await queryInterface.sequelize.query(`
              INSERT IGNORE INTO user_addresses 
              (user_id, name, last_name, company_name, country, street, apartment, town, county, region, post_code, phone, token, updated_by, createdAt, updatedAt)
              SELECT 
                tm.new_user_id,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW()
              FROM temp_user_mapping tm
              WHERE tm.old_user_id = ?
            `, {
              replacements: [first_name, last_name, company, country, address_1, address_2, city, state, region, postcode, phone, token, old_user_id]
            });
          }
          
          insertedShipping += insertData.length;
          console.log(`✅ Inserted shipping chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(shippingAddressData.length / chunkSize)} - ${insertData.length} addresses`);
        }
      }
      
      // Re-enable foreign key checks
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
      
      console.log('📊 Step 5: Verification and cleanup...');
      
      // Get final counts for verification
      const totalRecords = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM user_addresses
      `, { type: Sequelize.QueryTypes.SELECT });
      
      const uniqueUsers = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT user_id) as count FROM user_addresses
      `, { type: Sequelize.QueryTypes.SELECT });
      
      const billingCount = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM user_addresses WHERE token = 'billing-address'
      `, { type: Sequelize.QueryTypes.SELECT });
      
      const shippingCount = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM user_addresses WHERE token = 'shipping-address'
      `, { type: Sequelize.QueryTypes.SELECT });
      
      // Clean up temporary tables
      await queryInterface.sequelize.query('DROP TEMPORARY TABLE IF EXISTS temp_user_mapping');
      
      if (crossServerMigration.oldDbConnection) {
        await crossServerMigration.oldDbConnection.close();
      }
      
      console.log('🎉 User addresses population completed successfully!');
      console.log('📊 Migration Summary:');
      console.log(`   • Billing addresses processed: ${insertedBilling}`);
      console.log(`   • Shipping addresses processed: ${insertedShipping}`);
      console.log(`   • Total records in table: ${totalRecords[0].count}`);
      console.log(`   • Billing addresses: ${billingCount[0].count}`);
      console.log(`   • Shipping addresses: ${shippingCount[0].count}`);
      console.log(`   • Unique users with addresses: ${uniqueUsers[0].count}`);
      
      await transaction.commit();
      
    } catch (error) {
      console.error('❌ Error in user addresses migration:', error);
      
      try {
        await transaction.rollback();
        await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
        await queryInterface.sequelize.query('DROP TEMPORARY TABLE IF EXISTS temp_user_mapping');
        
        const crossServerMigration = new CrossServerMigration();
        if (crossServerMigration.oldDbConnection) {
          await crossServerMigration.oldDbConnection.close();
        }
      } catch (cleanupError) {
        console.error('❌ Error during cleanup:', cleanupError);
      }
      
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back user addresses migration...');
      
      // Delete all user address records
      await queryInterface.sequelize.query(`
        DELETE FROM user_addresses
      `);
      
      console.log('✅ User addresses rollback completed successfully!');
      
      await transaction.commit();
      
    } catch (error) {
      console.error('❌ Error during user addresses rollback:', error);
      await transaction.rollback();
      throw error;
    }
  }
};
