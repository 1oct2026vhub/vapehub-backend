'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    const CHUNK_SIZE = 1000;
    
    try {
      // Step 0: Check existing data and resume from where it stopped
      const [existingOrdersCount] = await queryInterface.sequelize.query(`SELECT COUNT(*) as count FROM orders`);
      const [existingOrderItemsCount] = await queryInterface.sequelize.query(`SELECT COUNT(*) as count FROM order_items`);
      const [existingOrderAddressesCount] = await queryInterface.sequelize.query(`SELECT COUNT(*) as count FROM order_addresses`);
      const [existingOrderLogsCount] = await queryInterface.sequelize.query(`SELECT COUNT(*) as count FROM order_logs`);
      
      console.log(`📊 Existing data counts:`);
      console.log(`   Orders: ${existingOrdersCount[0].count}`);
      console.log(`   Order Items: ${existingOrderItemsCount[0].count}`);
      console.log(`   Order Addresses: ${existingOrderAddressesCount[0].count}`);
      console.log(`   Order Logs: ${existingOrderLogsCount[0].count}`);
      
      // Check if migration was already completed
      if (existingOrdersCount[0].count > 0) {
        console.log(`✅ Migration already started/completed. Found ${existingOrdersCount[0].count} existing orders.`);
        console.log(`🔄 Resuming migration from existing data...`);
      } else {
        console.log(`🚀 Starting fresh migration...`);
      }
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();

      // Optional: Run scripts/cleanup-orders.js before this seeder if you need a fresh import

      // Step 1: Fetch user mapping data from old database
      const userMapping = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          old_u.ID as old_user_id,
          old_u.user_email
        FROM vh_users old_u 
        WHERE old_u.user_status = 0
        AND old_u.user_email IS NOT NULL
        AND old_u.user_email != ''
      `);

      // Create regular table for user mapping (not temporary to avoid transaction scope issues)
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS temp_user_mapping`);
      await queryInterface.sequelize.query(`
        CREATE TABLE temp_user_mapping (
          old_user_id BIGINT,
          new_user_id BIGINT,
          INDEX idx_old_user_id (old_user_id)
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

      // Create product and variant mapping tables to map old IDs to new IDs
      await queryInterface.sequelize.query('DROP TABLE IF EXISTS temp_product_mapping');
      await queryInterface.sequelize.query('DROP TABLE IF EXISTS temp_variant_mapping');

      await queryInterface.sequelize.query(`
        CREATE TABLE temp_product_mapping (
          old_product_id BIGINT,
          new_product_id BIGINT,
          product_slug VARCHAR(255),
          INDEX idx_old_product (old_product_id),
          INDEX idx_new_product (new_product_id)
        ) ENGINE=MEMORY
      `);

      await queryInterface.sequelize.query(`
        INSERT INTO temp_product_mapping (old_product_id, new_product_id, product_slug)
        SELECT 
          old_p.ID as old_product_id,
          p.id as new_product_id,
          p.slug as product_slug
        FROM ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_posts old_p
        INNER JOIN products p ON p.slug = old_p.post_name COLLATE utf8mb4_unicode_ci
        WHERE old_p.post_type = 'product' 
          AND old_p.post_status IN ('publish', 'draft', 'private')
      `);

      // Add fallback mapping for products with similar names (case-insensitive)
      await queryInterface.sequelize.query(`
        INSERT IGNORE INTO temp_product_mapping (old_product_id, new_product_id, product_slug)
        SELECT 
          old_p.ID as old_product_id,
          p.id as new_product_id,
          p.slug as product_slug
        FROM ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_posts old_p
        INNER JOIN products p ON LOWER(p.slug COLLATE utf8mb4_unicode_ci) = LOWER(old_p.post_name COLLATE utf8mb4_unicode_ci)
        WHERE old_p.post_type = 'product' 
          AND old_p.post_status IN ('publish', 'draft', 'private')
          AND old_p.ID NOT IN (SELECT old_product_id FROM temp_product_mapping)
      `);

      // Add even more flexible mapping using LIKE for partial matches
      await queryInterface.sequelize.query(`
        INSERT IGNORE INTO temp_product_mapping (old_product_id, new_product_id, product_slug)
        SELECT 
          old_p.ID as old_product_id,
          p.id as new_product_id,
          p.slug as product_slug
        FROM ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_posts old_p
        INNER JOIN products p ON (
          p.slug COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', old_p.post_name COLLATE utf8mb4_unicode_ci, '%') 
          OR old_p.post_name COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', p.slug COLLATE utf8mb4_unicode_ci, '%')
        )
        WHERE old_p.post_type = 'product' 
          AND old_p.post_status IN ('publish', 'draft', 'private')
          AND old_p.ID NOT IN (SELECT old_product_id FROM temp_product_mapping)
      `);

      // Add mapping by product title/name similarity
      await queryInterface.sequelize.query(`
        INSERT IGNORE INTO temp_product_mapping (old_product_id, new_product_id, product_slug)
        SELECT 
          old_p.ID as old_product_id,
          p.id as new_product_id,
          p.slug as product_slug
        FROM ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_posts old_p
        INNER JOIN products p ON (
          p.name COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', old_p.post_title COLLATE utf8mb4_unicode_ci, '%') 
          OR old_p.post_title COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', p.name, '%')
        )
        WHERE old_p.post_type = 'product' 
          AND old_p.post_status IN ('publish', 'draft', 'private')
          AND old_p.ID NOT IN (SELECT old_product_id FROM temp_product_mapping)
      `);

      // Log mapping statistics
      const [productMappingCount] = await queryInterface.sequelize.query('SELECT COUNT(*) as count FROM temp_product_mapping');

      await queryInterface.sequelize.query(`
        CREATE TABLE temp_variant_mapping (
          old_variant_id BIGINT,
          new_variant_id BIGINT,
          product_id BIGINT,
          variant_slug VARCHAR(255),
          INDEX idx_old_variant (old_variant_id),
          INDEX idx_new_variant (new_variant_id)
        ) ENGINE=MEMORY
      `);

      await queryInterface.sequelize.query(`
        INSERT INTO temp_variant_mapping (old_variant_id, new_variant_id, product_id, variant_slug)
        SELECT 
          old_p.ID as old_variant_id,
          pv.id as new_variant_id,
          pv.product_id,
          pv.slug as variant_slug
        FROM ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_posts old_p
        INNER JOIN ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_posts parent_p ON old_p.post_parent = parent_p.ID
        INNER JOIN temp_product_mapping pm ON parent_p.ID = pm.old_product_id
        INNER JOIN product_variants pv ON pv.product_id = pm.new_product_id 
          AND pv.slug = old_p.post_name COLLATE utf8mb4_unicode_ci
        WHERE old_p.post_type = 'product_variation' 
          AND old_p.post_status IN ('publish', 'draft', 'private')
      `);

      // Add fallback variant mapping with more flexible matching
      await queryInterface.sequelize.query(`
        INSERT IGNORE INTO temp_variant_mapping (old_variant_id, new_variant_id, product_id, variant_slug)
        SELECT 
          old_p.ID as old_variant_id,
          pv.id as new_variant_id,
          pv.product_id,
          pv.slug as variant_slug
        FROM ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_posts old_p
        INNER JOIN ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_posts parent_p ON old_p.post_parent = parent_p.ID
        INNER JOIN temp_product_mapping pm ON parent_p.ID = pm.old_product_id
        INNER JOIN product_variants pv ON pv.product_id = pm.new_product_id 
          AND (
            pv.slug COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', old_p.post_name COLLATE utf8mb4_unicode_ci, '%') 
            OR old_p.post_name COLLATE utf8mb4_unicode_ci LIKE CONCAT('%', pv.slug COLLATE utf8mb4_unicode_ci, '%')
            OR LOWER(pv.slug COLLATE utf8mb4_unicode_ci) = LOWER(old_p.post_name COLLATE utf8mb4_unicode_ci)
          )
        WHERE old_p.post_type = 'product_variation' 
          AND old_p.post_status IN ('publish', 'draft', 'private')
          AND old_p.ID NOT IN (SELECT old_variant_id FROM temp_variant_mapping)
      `);

      // Log variant mapping statistics
      const [variantMappingCount] = await queryInterface.sequelize.query('SELECT COUNT(*) as count FROM temp_variant_mapping');

      // Step 2: Get total count of orders to migrate
      const orderIds = userMapping.map(m => m.old_user_id);
      const [orderCountResult] = await crossServerMigration.fetchFromOldDb(`
        SELECT COUNT(*) as total_count
        FROM vh_posts old_o
        WHERE old_o.post_type = 'shop_order'
        AND old_o.post_status IN ('wc-completed', 'wc-processing', 'wc-on-hold', 'wc-pending', 'wc-cancelled', 'wc-failed', 'wc-refunded')
      `);
      
      const totalOrders = orderCountResult.total_count;
      const totalChunks = Math.ceil(totalOrders / CHUNK_SIZE);

      if (totalOrders === 0) {
        await crossServerMigration.closeOldDbConnection();
        return;
      }

      // Step 2.5: Get list of already migrated order IDs from new database
      const [migratedOrderIds] = await queryInterface.sequelize.query(`
        SELECT DISTINCT SUBSTRING_INDEX(SUBSTRING_INDEX(order_code, '-', 2), '-', -1) as old_order_id
        FROM orders 
        WHERE order_code IS NOT NULL 
        AND order_code LIKE 'ORD-%'
      `);
      
      const migratedIds = migratedOrderIds.map(row => row.old_order_id);
      const migratedIdsList = migratedIds.length > 0 ? migratedIds.join(',') : '0';
      
      console.log(`📋 Found ${migratedIds.length} already migrated orders. Will skip these during migration.`);

      // Step 3: Process orders in chunks
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const offset = chunkIndex * CHUNK_SIZE;
        const transaction = await queryInterface.sequelize.transaction();
        
        try {
          console.log(`🔄 Processing chunk ${chunkIndex + 1}/${totalChunks} (offset: ${offset})`);
          
          // Clean up any existing temporary tables
          await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_orders_chunk`, { transaction });
          await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_order_mapping_chunk`, { transaction });
          
          // Step 3a: Fetch orders for this chunk from old database (skip already migrated)
          const chunkOrders = await crossServerMigration.fetchFromOldDb(`
            SELECT 
              old_o.ID as id,
              pm_customer.meta_value as customer_id,
              COALESCE(pm_total.meta_value, 0) as total,
              COALESCE(pm_tax.meta_value, 0) as discount_price,
              old_o.post_status as status,
              COALESCE(old_o.post_date, NOW()) as date_created_gmt,
              COALESCE(old_o.post_modified, NOW()) as date_updated_gmt,
              pm_email.meta_value as billing_email,
              CONCAT('ORD-', old_o.ID, '-', DATE_FORMAT(COALESCE(old_o.post_date, NOW()), '%Y%m%d')) as order_unique_id,
              CONCAT('ORD-', old_o.ID, '-', DATE_FORMAT(COALESCE(old_o.post_date, NOW()), '%Y%m%d')) as order_code,
              COALESCE(pm_total.meta_value, 0) as sub_total
            FROM vh_posts old_o
            LEFT JOIN vh_postmeta pm_customer ON old_o.ID = pm_customer.post_id AND pm_customer.meta_key = '_customer_user'
            LEFT JOIN vh_postmeta pm_total ON old_o.ID = pm_total.post_id AND pm_total.meta_key = '_order_total'
            LEFT JOIN vh_postmeta pm_tax ON old_o.ID = pm_tax.post_id AND pm_tax.meta_key = '_order_tax'
            LEFT JOIN vh_postmeta pm_email ON old_o.ID = pm_email.post_id AND pm_email.meta_key = '_billing_email'
            WHERE old_o.post_type = 'shop_order'
            AND old_o.post_status IN ('wc-completed', 'wc-processing', 'wc-on-hold', 'wc-pending', 'wc-cancelled', 'wc-failed', 'wc-refunded')
            AND old_o.ID NOT IN (${migratedIdsList})
            LIMIT ${CHUNK_SIZE} OFFSET ${offset}
          `);

           // Skip this chunk if no orders found
           if (chunkOrders.length === 0) {
             console.log(`   ⏭️  Chunk ${chunkIndex + 1}: No new orders to migrate (all already migrated)`);
             await transaction.commit();
             continue;
           }

           console.log(`   📦 Found ${chunkOrders.length} new orders to migrate in this chunk`);

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

           // Insert chunk data with user mapping (handle unmapped users)
           for (const order of chunkOrders) {
             // Get mapped user ID or NULL for guest orders (outside transaction)
             let mappedUserId = null;
             
             if (order.customer_id && order.customer_id !== '0') {
               try {
                 const [userMappingResult] = await queryInterface.sequelize.query(`
                   SELECT new_user_id FROM temp_user_mapping WHERE old_user_id = ?
                 `, {
                   replacements: [order.customer_id],
                   type: queryInterface.sequelize.QueryTypes.SELECT
                 });
                 
                 if (userMappingResult && userMappingResult.length > 0) {
                   mappedUserId = userMappingResult[0].new_user_id;
                 }
               } catch (error) {
                 console.log(`   ⚠️  Could not map user ID ${order.customer_id}, using NULL`);
                 mappedUserId = null;
               }
             }
             
             await queryInterface.sequelize.query(`
               INSERT INTO temp_orders_chunk (
                 id, customer_id, user_id, total, discount_price, status, 
                 date_created_gmt, date_updated_gmt, billing_email, 
                 order_unique_id, order_code, sub_total
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             `, {
               replacements: [
                 order.id, order.customer_id, mappedUserId, order.total, order.discount_price, 
                 order.status, order.date_created_gmt, order.date_updated_gmt, 
                 order.billing_email, order.order_unique_id, order.order_code, 
                 order.sub_total
               ],
               transaction
             });
           }

          // Step 3b: Temporarily disable foreign key checks for this chunk
          await queryInterface.sequelize.query(`SET FOREIGN_KEY_CHECKS = 0`, { transaction });

          // Step 3c: Insert orders for this chunk
          await queryInterface.sequelize.query(`
            INSERT IGNORE INTO orders (
              id, user_id, coupon_id, total, discount_price, status, shipping_method_id,
              createdAt, updatedAt, deletedAt, shipping_address_id, billing_address_id,
              order_unique_id, deals_discount, applicable_deals, shipping_cost, order_code,
              email, phone, order_shipping_address_id, order_billing_address_id, referral_id,
              sub_total, discount_type, payment_method_id, shipstation_order_id, loyalty_flag,
              loyalty_discount, mailSubscription_discount, ordered
            )
            SELECT 
              id,
              user_id,
              NULL as coupon_id,
              total,
              discount_price,
                             CASE 
                 WHEN status = 'wc-completed' THEN 'completed'
                 WHEN status = 'wc-processing' THEN 'processing'
                 WHEN status = 'wc-pending' THEN 'pending'
                 WHEN status = 'wc-cancelled' THEN 'cancel'
                 WHEN status = 'wc-failed' THEN 'fail'
                 WHEN status = 'wc-refunded' THEN 'refunded'
                 WHEN status = 'wc-on-hold' THEN 'pending'
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

          // Step 3c.1: Validate user mapping for this chunk
          const [userMappingValidation] = await queryInterface.sequelize.query(`
            SELECT 
              COUNT(*) as total_orders,
              COUNT(CASE WHEN user_id IS NULL THEN 1 END) as unmapped_users
            FROM temp_orders_chunk
          `, { transaction });
          
          if (userMappingValidation[0].unmapped_users > 0) {
            console.warn(`⚠️ Chunk ${chunkIndex + 1}: ${userMappingValidation[0].unmapped_users}/${userMappingValidation[0].total_orders} orders have unmapped users`);
          }

          // Step 3d: Create order mapping for this chunk
          await queryInterface.sequelize.query(`
            CREATE TEMPORARY TABLE temp_order_mapping_chunk AS
            SELECT old_o.id as old_order_id, new_o.id as new_order_id
            FROM temp_orders_chunk old_o
            INNER JOIN orders new_o ON new_o.order_code = old_o.order_code
          `, { transaction });

          // Step 3d.1: Set auto-increment to continue from the highest order ID
          const [maxOrderId] = await queryInterface.sequelize.query(`SELECT MAX(old_order_id) as max_id FROM temp_order_mapping_chunk`, { transaction });
          const nextOrderId = (maxOrderId[0]?.max_id || 0) + 1;
          await queryInterface.sequelize.query(`ALTER TABLE orders AUTO_INCREMENT = ${nextOrderId}`, { transaction });

          // Step 3e: Insert order addresses for this chunk (populate from WooCommerce billing meta)
          await queryInterface.sequelize.query(`
            INSERT INTO order_addresses (
              order_id, user_id, name, last_name, company_name, country, street,
              apartment, town, county, region, post_code, phone, token, created_at, updated_at, deleted_at
            )
            SELECT 
              om.new_order_id as order_id,
              o.user_id as user_id,
              COALESCE(pm_bfn.meta_value, SUBSTRING_INDEX(old_o.billing_email, '@', 1), 'Customer') as name,
              COALESCE(pm_bln.meta_value, NULL) as last_name,
              COALESCE(pm_bcompany.meta_value, NULL) as company_name,
              COALESCE(pm_bcountry.meta_value, NULL) as country,
              NULLIF(TRIM(CONCAT(COALESCE(pm_baddr1.meta_value, ''), ' ', COALESCE(pm_baddr2.meta_value, ''))), '') as street,
              NULL as apartment,
              COALESCE(pm_bcity.meta_value, NULL) as town,
              COALESCE(pm_bstate.meta_value, NULL) as county,
              NULL as region,
              COALESCE(pm_bpostcode.meta_value, NULL) as post_code,
              COALESCE(pm_bphone.meta_value, NULL) as phone,
              NULL as token,
              old_o.date_created_gmt as created_at,
              old_o.date_updated_gmt as updated_at,
              CASE WHEN old_o.status IN ('cancelled', 'failed') THEN old_o.date_updated_gmt ELSE NULL END as deleted_at
            FROM temp_orders_chunk old_o
            INNER JOIN temp_order_mapping_chunk om ON old_o.id = om.old_order_id
            INNER JOIN orders o ON o.id = om.new_order_id
            LEFT JOIN ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_postmeta pm_bfn ON pm_bfn.post_id = old_o.id AND pm_bfn.meta_key = '_billing_first_name'
            LEFT JOIN ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_postmeta pm_bln ON pm_bln.post_id = old_o.id AND pm_bln.meta_key = '_billing_last_name'
            LEFT JOIN ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_postmeta pm_bcompany ON pm_bcompany.post_id = old_o.id AND pm_bcompany.meta_key = '_billing_company'
            LEFT JOIN ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_postmeta pm_bcountry ON pm_bcountry.post_id = old_o.id AND pm_bcountry.meta_key = '_billing_country'
            LEFT JOIN ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_postmeta pm_baddr1 ON pm_baddr1.post_id = old_o.id AND pm_baddr1.meta_key = '_billing_address_1'
            LEFT JOIN ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_postmeta pm_baddr2 ON pm_baddr2.post_id = old_o.id AND pm_baddr2.meta_key = '_billing_address_2'
            LEFT JOIN ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_postmeta pm_bcity ON pm_bcity.post_id = old_o.id AND pm_bcity.meta_key = '_billing_city'
            LEFT JOIN ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_postmeta pm_bstate ON pm_bstate.post_id = old_o.id AND pm_bstate.meta_key = '_billing_state'
            LEFT JOIN ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_postmeta pm_bpostcode ON pm_bpostcode.post_id = old_o.id AND pm_bpostcode.meta_key = '_billing_postcode'
            LEFT JOIN ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_postmeta pm_bphone ON pm_bphone.post_id = old_o.id AND pm_bphone.meta_key = '_billing_phone'
          `, { transaction });

          // Step 3f: Update order address references
          await queryInterface.sequelize.query(`
            UPDATE orders o
            INNER JOIN temp_order_mapping_chunk om ON o.id = om.new_order_id
            INNER JOIN order_addresses oa ON oa.order_id = om.new_order_id
            SET o.order_billing_address_id = oa.id, o.order_shipping_address_id = oa.id
            WHERE oa.deleted_at IS NULL
          `, { transaction });

          // Step 3f.1: Validate address mapping for this chunk
          const [addressMappingValidation] = await queryInterface.sequelize.query(`
            SELECT 
              COUNT(*) as total_orders,
              COUNT(CASE WHEN o.order_billing_address_id IS NULL THEN 1 END) as unmapped_addresses
            FROM orders o
            INNER JOIN temp_order_mapping_chunk om ON o.id = om.new_order_id
          `, { transaction });
          
          if (addressMappingValidation[0].unmapped_addresses > 0) {
            console.warn(`⚠️ Chunk ${chunkIndex + 1}: ${addressMappingValidation[0].unmapped_addresses}/${addressMappingValidation[0].total_orders} orders have unmapped addresses`);
          }

          // Also set orders.phone from billing phone if available
          await queryInterface.sequelize.query(`
            UPDATE orders o
            INNER JOIN temp_order_mapping_chunk om ON o.id = om.new_order_id
            LEFT JOIN ${process.env.OLD_DB_NAME || 'vapehub_live'}.vh_postmeta pm_bphone ON pm_bphone.post_id = om.old_order_id AND pm_bphone.meta_key = '_billing_phone'
            SET o.phone = COALESCE(o.phone, pm_bphone.meta_value)
            WHERE pm_bphone.meta_value IS NOT NULL
          `, { transaction });

          // Attempt to set legacy order_address_id if the column exists (ignore error if not)
          try {
            await queryInterface.sequelize.query(`
              UPDATE orders o
              INNER JOIN temp_order_mapping_chunk om ON o.id = om.new_order_id
              INNER JOIN order_addresses oa ON oa.order_id = om.new_order_id
              SET o.order_address_id = oa.id
              WHERE oa.deleted_at IS NULL
            `, { transaction });
          } catch (_) {
            // Column may not exist; ignore
          }

          // Step 3g: Insert order items for this chunk - Extract from WooCommerce order tables
          let orderItemData = [];
          if (chunkOrders.length > 0) {
            orderItemData = await crossServerMigration.fetchFromOldDb(`
              SELECT 
                o.ID as order_id,
                oi.order_item_name,
                MAX(CASE WHEN oim.meta_key = '_product_id' THEN oim.meta_value END) as product_id,
                MAX(CASE WHEN oim.meta_key = '_variation_id' THEN oim.meta_value END) as variant_id,
                MAX(CASE WHEN oim.meta_key = '_qty' THEN oim.meta_value END) as quantity,
                MAX(CASE WHEN oim.meta_key = '_line_total' THEN oim.meta_value END) as total,
                MAX(CASE WHEN oim.meta_key = '_line_subtotal' THEN oim.meta_value END) as subtotal
              FROM vh_posts o
              INNER JOIN vh_woocommerce_order_items oi ON oi.order_id = o.ID
              INNER JOIN vh_woocommerce_order_itemmeta oim ON oim.order_item_id = oi.order_item_id
              WHERE o.post_type = 'shop_order'
                AND o.post_status IN ('wc-completed', 'wc-processing', 'wc-on-hold', 'wc-pending')
                AND oi.order_item_type = 'line_item'
                AND o.ID IN (${chunkOrders.map(o => o.id).join(',')})
              GROUP BY o.ID, oi.order_item_id, oi.order_item_name
            `);
          }

          // Insert order items with proper product/variant mapping
          let successfulItems = 0;
          let failedItems = 0;
          let skippedItems = 0;
          
          for (const item of orderItemData) {
            try {
              // First try to get the mapped product/variant IDs
              const [mappingResult] = await queryInterface.sequelize.query(`
                SELECT 
                  om.new_order_id as order_id,
                  COALESCE(pm.new_product_id, pvm.product_id) as product_id,
                  COALESCE(pvm.new_variant_id, pv.id) as variant_id
                FROM temp_orders_chunk old_o
                INNER JOIN temp_order_mapping_chunk om ON old_o.id = om.old_order_id
                LEFT JOIN temp_variant_mapping pvm ON pvm.old_variant_id = CAST(? AS UNSIGNED)
                LEFT JOIN temp_product_mapping pm ON pm.old_product_id = CAST(? AS UNSIGNED)
                LEFT JOIN product_variants pv ON pv.id = CAST(? AS UNSIGNED)
                WHERE old_o.id = ?
                  AND (pm.new_product_id IS NOT NULL OR pvm.product_id IS NOT NULL)
              `, {
                replacements: [
                  item.variant_id || null,
                  item.product_id || null,
                  item.variant_id || null,
                  item.order_id
                ],
                transaction
              });

              if (mappingResult.length > 0 && mappingResult[0].product_id) {
                // Insert order item with valid mapping
                await queryInterface.sequelize.query(`
                  INSERT INTO order_items (
                    order_id, product_id, variant_id, unit, unit_price, quantity,
                    discount_price, total, createdAt, updatedAt, deletedAt
                  )
                  VALUES (?, ?, ?, 'piece', ?, ?, ?, ?, ?, ?, ?)
                `, {
                  replacements: [
                    mappingResult[0].order_id,
                    mappingResult[0].product_id,
                    mappingResult[0].variant_id,
                    item.total || 0,
                    item.quantity || 1,
                    item.subtotal || null,
                    item.total || 0,
                    item.date_created_gmt || new Date(),
                    item.date_updated_gmt || new Date(),
                    item.status && ['cancelled', 'failed'].includes(item.status) ? item.date_updated_gmt : null
                  ],
                  transaction
                });
                successfulItems++;
              } else {
                // Try to find a product by name matching as fallback
                const [nameMatchResult] = await queryInterface.sequelize.query(`
                  SELECT 
                    om.new_order_id as order_id,
                    p.id as product_id,
                    NULL as variant_id
                  FROM temp_orders_chunk old_o
                  INNER JOIN temp_order_mapping_chunk om ON old_o.id = om.old_order_id
                  INNER JOIN products p ON p.name LIKE CONCAT('%', ?, '%')
                  WHERE old_o.id = ?
                  LIMIT 1
                `, {
                  replacements: [item.order_item_name || '', item.order_id],
                  transaction
                });

                if (nameMatchResult.length > 0) {
                  // Insert order item with name-matched product
                  await queryInterface.sequelize.query(`
                    INSERT INTO order_items (
                      order_id, product_id, variant_id, unit, unit_price, quantity,
                      discount_price, total, createdAt, updatedAt, deletedAt
                    )
                    VALUES (?, ?, ?, 'piece', ?, ?, ?, ?, ?, ?, ?)
                  `, {
                    replacements: [
                      nameMatchResult[0].order_id,
                      nameMatchResult[0].product_id,
                      nameMatchResult[0].variant_id,
                      item.total || 0,
                      item.quantity || 1,
                      item.subtotal || null,
                      item.total || 0,
                      item.date_created_gmt || new Date(),
                      item.date_updated_gmt || new Date(),
                      item.status && ['cancelled', 'failed'].includes(item.status) ? item.date_updated_gmt : null
                    ],
                    transaction
                  });
                  successfulItems++;
                } else {
                  // Create a placeholder order item for unmapped products
                  
                  // Get the new order ID for this item
                  const [orderMappingResult] = await queryInterface.sequelize.query(`
                    SELECT new_order_id 
                    FROM temp_order_mapping_chunk 
                    WHERE old_order_id = ?
                  `, {
                    replacements: [item.order_id],
                    transaction
                  });
                  
                  if (orderMappingResult.length > 0) {
                    // Insert placeholder order item
                    await queryInterface.sequelize.query(`
                      INSERT INTO order_items (
                        order_id, product_id, variant_id, unit, unit_price, quantity,
                        discount_price, total, createdAt, updatedAt, deletedAt
                      )
                      VALUES (?, NULL, NULL, 'piece', ?, ?, ?, ?, ?, ?, ?)
                    `, {
                      replacements: [
                        orderMappingResult[0].new_order_id,
                        item.total || 0,
                        item.quantity || 1,
                        item.subtotal || null,
                        item.total || 0,
                        item.date_created_gmt || new Date(),
                        item.date_updated_gmt || new Date(),
                        item.status && ['cancelled', 'failed'].includes(item.status) ? item.date_updated_gmt : null
                      ],
                      transaction
                    });
                    successfulItems++;
                  } else {
                    skippedItems++;
                  }
                }
              }
            } catch (error) {
              failedItems++;
              // Continue with next item instead of failing entire chunk
            }
          }
          
          // Log item mapping statistics for this chunk

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

          // Step 3i.1: Final data quality check for this chunk
          const [chunkQualityCheck] = await queryInterface.sequelize.query(`
            SELECT 
              COUNT(*) as total_orders,
              COUNT(CASE WHEN o.user_id IS NULL THEN 1 END) as unmapped_users,
              COUNT(CASE WHEN o.order_billing_address_id IS NULL THEN 1 END) as unmapped_addresses,
              COUNT(CASE WHEN oi.id IS NULL THEN 1 END) as orders_without_items
            FROM orders o
            INNER JOIN temp_order_mapping_chunk om ON o.id = om.new_order_id
            LEFT JOIN order_items oi ON oi.order_id = o.id
            GROUP BY o.id
          `, { transaction });
          
          const qualityIssues = [];
          if (chunkQualityCheck.some(row => row.unmapped_users > 0)) {
            qualityIssues.push('unmapped users');
          }
          if (chunkQualityCheck.some(row => row.unmapped_addresses > 0)) {
            qualityIssues.push('unmapped addresses');
          }
          if (chunkQualityCheck.some(row => row.orders_without_items > 0)) {
            qualityIssues.push('orders without items');
          }
          
          if (qualityIssues.length > 0) {
            // Quality issues detected but not logged
          }

          // Step 3j: Clean up temporary tables for this chunk
          await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_orders_chunk`, { transaction });
          await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_order_mapping_chunk`, { transaction });

          await transaction.commit();
          console.log(`✅ Chunk ${chunkIndex + 1}/${totalChunks} completed successfully`);
          
        } catch (error) {
          await transaction.rollback();
          throw error;
        }
      }

      // Step 4: Migration Summary
      const [finalOrdersCount] = await queryInterface.sequelize.query(`SELECT COUNT(*) as count FROM orders WHERE order_code IS NOT NULL`);
      const totalMigrated = finalOrdersCount[0].count - existingOrdersCount[0].count;
      
      console.log(`\n📊 Migration Summary:`);
      console.log(`   📈 Orders before migration: ${existingOrdersCount[0].count}`);
      console.log(`   📈 Orders after migration: ${finalOrdersCount[0].count}`);
      console.log(`   ✅ New orders migrated: ${totalMigrated}`);
      if (totalMigrated === 0) {
        console.log(`   🎉 All orders were already migrated! No new data processed.`);
      } else {
        console.log(`   🚀 Successfully migrated ${totalMigrated} new orders`);
      }

      // Step 5: Clean up temporary tables
      await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_user_mapping`);
      // Also drop mapping tables created for this seeder run
      await queryInterface.sequelize.query('DROP TABLE IF EXISTS temp_product_mapping');
      await queryInterface.sequelize.query('DROP TABLE IF EXISTS temp_variant_mapping');

      // Step 5: Comprehensive verification and data quality report
      
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

      // Data quality checks
      const [qualityReport] = await queryInterface.sequelize.query(`
        SELECT 
          COUNT(*) as total_orders,
          COUNT(CASE WHEN user_id IS NULL THEN 1 END) as orders_without_users,
          COUNT(CASE WHEN order_billing_address_id IS NULL THEN 1 END) as orders_without_addresses,
          COUNT(CASE WHEN oi.id IS NULL THEN 1 END) as orders_without_items,
          COUNT(CASE WHEN total <= 0 THEN 1 END) as orders_with_zero_total,
          COUNT(CASE WHEN email IS NULL OR email = '' THEN 1 END) as orders_without_email
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.order_code IS NOT NULL
      `);

      const [productMappingReport] = await queryInterface.sequelize.query(`
        SELECT 
          COUNT(*) as total_order_items,
          COUNT(CASE WHEN product_id IS NULL THEN 1 END) as items_without_products,
          COUNT(CASE WHEN product_id IS NOT NULL THEN 1 END) as items_with_products
        FROM order_items
      `);

      // Calculate success rates
      const userMappingRate = ((qualityReport[0].total_orders - qualityReport[0].orders_without_users) / qualityReport[0].total_orders * 100).toFixed(2);
      const addressMappingRate = ((qualityReport[0].total_orders - qualityReport[0].orders_without_addresses) / qualityReport[0].total_orders * 100).toFixed(2);
      const productMappingRate = ((productMappingReport[0].total_order_items - productMappingReport[0].items_without_products) / productMappingReport[0].total_order_items * 100).toFixed(2);

      // Clean up temporary tables
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS temp_user_mapping`);
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS temp_product_mapping`);
      await queryInterface.sequelize.query(`DROP TABLE IF EXISTS temp_variant_mapping`);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

    } catch (error) {
      await crossServerMigration.closeOldDbConnection();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      await queryInterface.sequelize.query(`DELETE FROM order_logs WHERE additional_info LIKE '%WooCommerce migration%'`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM order_items`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM order_addresses`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM orders WHERE order_code IS NOT NULL`, { transaction });
      
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
};
