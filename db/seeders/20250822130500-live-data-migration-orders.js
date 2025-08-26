'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    const CHUNK_SIZE = 1000;
    
    try {
      console.log('🚀 Starting LIVE DATA MIGRATION: Orders from old database...');
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();
      
      // Step 1: Fetch user mapping data from old database
      console.log('📋 Creating user mapping table...');
      const userMapping = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          old_u.ID as old_user_id,
          old_u.user_email
        FROM vh_users old_u 
        WHERE old_u.user_status = 0
        AND old_u.user_email IS NOT NULL
        AND old_u.user_email != ''
      `);

      // Create temporary table in new database
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE temp_user_mapping (
          old_user_id BIGINT,
          new_user_id BIGINT
        )
      `);

      // Insert user mapping data
      for (const mapping of userMapping) {
        await queryInterface.sequelize.query(`
          INSERT INTO temp_user_mapping (old_user_id, new_user_id)
          SELECT ?, u.id
          FROM users u
          WHERE u.email = ?
        `, {
          replacements: [mapping.old_user_id, mapping.user_email]
        });
      }

      // Step 2: Get total count of orders to migrate
      console.log('📊 Counting orders to migrate...');
      const orderIds = userMapping.map(m => m.old_user_id);
      const [orderCountResult] = await crossServerMigration.fetchFromOldDb(`
        SELECT COUNT(*) as total_count
        FROM vh_wc_orders old_o
        WHERE old_o.customer_id IN (${orderIds.join(',')})
      `);
      
      const totalOrders = orderCountResult.total_count;
      const totalChunks = Math.ceil(totalOrders / CHUNK_SIZE);
      
      console.log(`📊 Total orders to migrate: ${totalOrders}`);
      console.log(`📊 Total chunks: ${totalChunks}`);

      if (totalOrders === 0) {
        console.log('ℹ️ No new orders to migrate');
        await crossServerMigration.closeOldDbConnection();
        return;
      }

      // Step 3: Process orders in chunks
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const offset = chunkIndex * CHUNK_SIZE;
        const transaction = await queryInterface.sequelize.transaction();
        
        try {
          console.log(`🔄 Processing chunk ${chunkIndex + 1}/${totalChunks} (offset: ${offset})`);
          
          // Clean up any existing temporary tables
          await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_orders_chunk`, { transaction });
          await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_order_mapping_chunk`, { transaction });
          
                     // Step 3a: Fetch orders for this chunk from old database
           const chunkOrders = await crossServerMigration.fetchFromOldDb(`
             SELECT 
               old_o.id,
               old_o.customer_id,
               COALESCE(old_o.total_amount, 0) as total,
               COALESCE(old_o.tax_amount, 0) as discount_price,
               old_o.status,
               COALESCE(old_o.date_created_gmt, NOW()) as date_created_gmt,
               COALESCE(old_o.date_updated_gmt, NOW()) as date_updated_gmt,
               old_o.billing_email,
               CONCAT('ORD-', old_o.id, '-', DATE_FORMAT(COALESCE(old_o.date_created_gmt, NOW()), '%Y%m%d')) as order_unique_id,
               CAST(old_o.id AS CHAR) as order_code,
               COALESCE(old_o.total_amount, 0) as sub_total
             FROM vh_wc_orders old_o
             WHERE old_o.customer_id IN (${orderIds.join(',')})
             LIMIT ${CHUNK_SIZE} OFFSET ${offset}
           `);

           // Create temporary table for this chunk in new database
           await queryInterface.sequelize.query(`
             CREATE TEMPORARY TABLE temp_orders_chunk (
               id BIGINT,
               customer_id BIGINT,
               user_id BIGINT,
               total DECIMAL(10,2),
               discount_price DECIMAL(10,2),
               status VARCHAR(50),
               date_created_gmt DATETIME,
               date_updated_gmt DATETIME,
               billing_email VARCHAR(255),
               order_unique_id VARCHAR(255),
               order_code VARCHAR(255),
               sub_total DECIMAL(10,2)
             )
           `, { transaction });

           // Insert chunk data with user mapping
           for (const order of chunkOrders) {
             await queryInterface.sequelize.query(`
               INSERT INTO temp_orders_chunk (
                 id, customer_id, user_id, total, discount_price, status, 
                 date_created_gmt, date_updated_gmt, billing_email, 
                 order_unique_id, order_code, sub_total
               )
               SELECT ?, ?, um.new_user_id, ?, ?, ?, ?, ?, ?, ?, ?, ?
               FROM temp_user_mapping um
               WHERE um.old_user_id = ?
             `, {
               replacements: [
                 order.id, order.customer_id, order.total, order.discount_price, 
                 order.status, order.date_created_gmt, order.date_updated_gmt, 
                 order.billing_email, order.order_unique_id, order.order_code, 
                 order.sub_total, order.customer_id
               ],
               transaction
             });
           }

          // Step 3b: Temporarily disable foreign key checks for this chunk
          await queryInterface.sequelize.query(`SET FOREIGN_KEY_CHECKS = 0`, { transaction });

          // Step 3c: Insert orders for this chunk
          await queryInterface.sequelize.query(`
            INSERT IGNORE INTO orders (
              user_id, coupon_id, total, discount_price, status, shipping_method_id,
              createdAt, updatedAt, deletedAt, shipping_address_id, billing_address_id,
              order_unique_id, deals_discount, applicable_deals, shipping_cost, order_code,
              email, phone, order_shipping_address_id, order_billing_address_id, referral_id,
              sub_total, discount_type, payment_method_id, shipstation_order_id, loyalty_flag,
              loyalty_discount, mailSubscription_discount, ordered
            )
            SELECT 
              user_id,
              NULL as coupon_id,
              total,
              discount_price,
              CASE 
                WHEN status = 'completed' THEN 'completed'
                WHEN status = 'processing' THEN 'processing'
                WHEN status = 'pending' THEN 'pending'
                WHEN status = 'cancelled' THEN 'cancel'
                WHEN status = 'failed' THEN 'fail'
                WHEN status = 'refunded' THEN 'refunded'
                WHEN status = 'on-hold' THEN 'pending'
                ELSE 'pending'
              END as status,
              1 as shipping_method_id,
              date_created_gmt as createdAt,
              date_updated_gmt as updatedAt,
              CASE WHEN status IN ('cancelled', 'failed') THEN date_updated_gmt ELSE NULL END as deletedAt,
              NULL as shipping_address_id,
              NULL as billing_address_id,
              order_unique_id,
              0.00 as deals_discount,
              NULL as applicable_deals,
              0.00 as shipping_cost,
              order_code,
              billing_email as email,
              NULL as phone,
              NULL as order_shipping_address_id,
              NULL as order_billing_address_id,
              NULL as referral_id,
              sub_total,
              NULL as discount_type,
              1 as payment_method_id,
              NULL as shipstation_order_id,
              0 as loyalty_flag,
              0.00 as loyalty_discount,
              0.00 as mailSubscription_discount,
              CASE WHEN status = 'completed' THEN 1 ELSE 0 END as ordered
            FROM temp_orders_chunk
          `, { transaction });

          // Step 3d: Create order mapping for this chunk
          await queryInterface.sequelize.query(`
            CREATE TEMPORARY TABLE temp_order_mapping_chunk AS
            SELECT old_o.id as old_order_id, new_o.id as new_order_id
            FROM temp_orders_chunk old_o
            INNER JOIN orders new_o ON new_o.order_code = old_o.order_code
          `, { transaction });

          // Step 3e: Insert order addresses for this chunk
          await queryInterface.sequelize.query(`
            INSERT INTO order_addresses (
              order_id, user_id, name, last_name, company_name, country, street,
              apartment, town, county, region, post_code, phone, token, created_at, updated_at, deleted_at
            )
            SELECT 
              om.new_order_id as order_id,
              om.new_order_id as user_id,
              COALESCE(SUBSTRING_INDEX(old_o.billing_email, '@', 1), 'Customer') as name,
              NULL as last_name,
              NULL as company_name,
              NULL as country,
              NULL as street,
              NULL as apartment,
              NULL as town,
              NULL as county,
              NULL as region,
              NULL as post_code,
              NULL as phone,
              NULL as token,
              old_o.date_created_gmt as created_at,
              old_o.date_updated_gmt as updated_at,
              CASE WHEN old_o.status IN ('cancelled', 'failed') THEN old_o.date_updated_gmt ELSE NULL END as deleted_at
            FROM temp_orders_chunk old_o
            INNER JOIN temp_order_mapping_chunk om ON old_o.id = om.old_order_id
          `, { transaction });

          // Step 3f: Update order address references
          await queryInterface.sequelize.query(`
            UPDATE orders o
            INNER JOIN temp_order_mapping_chunk om ON o.id = om.new_order_id
            INNER JOIN order_addresses oa ON oa.order_id = om.new_order_id
            SET o.order_billing_address_id = oa.id, o.order_shipping_address_id = oa.id
            WHERE oa.deleted_at IS NULL
          `, { transaction });

          // Step 3g: Insert order items for this chunk
          await queryInterface.sequelize.query(`
            INSERT INTO order_items (
              order_id, product_id, variant_id, unit, unit_price, quantity,
              discount_price, total, createdAt, updatedAt, deletedAt
            )
            SELECT 
              om.new_order_id as order_id,
              1 as product_id,
              NULL as variant_id,
              'piece' as unit,
              old_o.total as unit_price,
              1 as quantity,
              NULL as discount_price,
              old_o.total as total,
              old_o.date_created_gmt as createdAt,
              old_o.date_updated_gmt as updatedAt,
              CASE WHEN old_o.status IN ('cancelled', 'failed') THEN old_o.date_updated_gmt ELSE NULL END as deletedAt
            FROM temp_orders_chunk old_o
            INNER JOIN temp_order_mapping_chunk om ON old_o.id = om.old_order_id
          `, { transaction });

          // Step 3h: Insert order logs for this chunk
          await queryInterface.sequelize.query(`
            INSERT INTO order_logs (
              order_id, user_id, status, label, additional_info, createdAt, updatedAt
            )
            SELECT 
              om.new_order_id as order_id,
              o.user_id,
              o.status,
              CONCAT('Order ', o.status, ' from WooCommerce migration') as label,
              CONCAT('Migrated from WooCommerce order ID: ', om.old_order_id) as additional_info,
              o.createdAt,
              o.updatedAt
            FROM orders o
            INNER JOIN temp_order_mapping_chunk om ON o.id = om.new_order_id
          `, { transaction });

          // Step 3i: Re-enable foreign key checks
          await queryInterface.sequelize.query(`SET FOREIGN_KEY_CHECKS = 1`, { transaction });

          // Step 3j: Clean up temporary tables for this chunk
          await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_orders_chunk`, { transaction });
          await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_order_mapping_chunk`, { transaction });

          await transaction.commit();
          console.log(`✅ Chunk ${chunkIndex + 1}/${totalChunks} completed successfully`);
          
        } catch (error) {
          await transaction.rollback();
          console.error(`❌ Chunk ${chunkIndex + 1}/${totalChunks} failed:`, error);
          throw error;
        }
      }

      // Step 4: Clean up temporary tables
      await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_user_mapping`);

      // Step 5: Verification queries
      const [ordersCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM orders WHERE order_code IS NOT NULL
      `);

      const [orderItemsCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM order_items
      `);

      const [orderAddressesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM order_addresses
      `);

      const [orderLogsCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM order_logs
      `);

      console.log('🎉 LIVE DATA MIGRATION: Orders completed successfully!');
      console.log(`📊 Orders migrated: ${ordersCount[0].count}`);
      console.log(`📦 Order items migrated: ${orderItemsCount[0].count}`);
      console.log(`📍 Order addresses migrated: ${orderAddressesCount[0].count}`);
      console.log(`📝 Order logs migrated: ${orderLogsCount[0].count}`);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

    } catch (error) {
      await crossServerMigration.closeOldDbConnection();
      console.error('❌ LIVE DATA MIGRATION: Orders failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back LIVE DATA MIGRATION: Orders...');
      
      await queryInterface.sequelize.query(`DELETE FROM order_logs WHERE additional_info LIKE '%WooCommerce migration%'`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM order_items`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM order_addresses`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM orders WHERE order_code IS NOT NULL`, { transaction });
      
      await transaction.commit();
      console.log('✅ LIVE DATA MIGRATION: Orders rolled back successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ LIVE DATA MIGRATION: Orders rollback failed:', error);
      throw error;
    }
  }
};
