'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    const CHUNK_SIZE = 1000; // Process 1000 orders at a time
    
    try {
      console.log('🚀 Starting optimized orders migration with chunked processing...');
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();
      
      // Step 1: Extract product mapping data from old database
      console.log('📦 Fetching product mapping data from old database...');
      const productMapping = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          p.ID as old_product_id,
          p.post_name
        FROM vh_posts p
        WHERE p.post_type = 'product'
        AND p.post_status = 'publish'
      `);

      // Step 2: Create product mapping table
      console.log('🗺️ Creating product ID mapping...');
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE temp_product_mapping (
          old_product_id BIGINT,
          new_product_id INT
        )
      `);

      // Step 3: Populate product mapping table using bulk operations
      console.log(`🔗 Populating product mapping with ${productMapping.length} products...`);
      const mappingValues = productMapping.map(product => [product.old_product_id, product.post_name]);
      
      for (const [oldProductId, postName] of mappingValues) {
        await queryInterface.sequelize.query(`
          INSERT INTO temp_product_mapping (old_product_id, new_product_id)
          SELECT ?, p.id
          FROM products p
          WHERE p.slug = ?
        `, {
          replacements: [oldProductId, postName]
        });
      }

      // Step 4: Create variant mapping table
      console.log('🔧 Creating variant ID mapping...');
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE temp_variant_mapping (
          old_variant_id INT,
          new_variant_id INT
        )
      `);

      // Step 5: Extract orders from old database
      console.log('📋 Fetching orders from old database...');
      const orders = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          opl.order_id,
          opl.customer_id,
          opl.date_created,
          (SELECT SUM(product_net_revenue) 
           FROM vh_wc_order_product_lookup 
           WHERE order_id = opl.order_id) as total
        FROM vh_wc_order_product_lookup opl
        GROUP BY opl.order_id, opl.customer_id, opl.date_created
        ORDER BY opl.order_id
      `);

      console.log(`📊 Total orders to process: ${orders.length}`);

      // Step 6: Process orders in chunks
      console.log(`🔄 Processing orders in chunks of ${CHUNK_SIZE}...`);
      let processedOrders = 0;
      
      for (let i = 0; i < orders.length; i += CHUNK_SIZE) {
        const chunk = orders.slice(i, i + CHUNK_SIZE);
        const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
        const totalChunks = Math.ceil(orders.length / CHUNK_SIZE);
        
        console.log(`📦 Processing chunk ${chunkNumber}/${totalChunks} (${chunk.length} orders)...`);
        
        const transaction = await queryInterface.sequelize.transaction();
        
        try {
          // Temporarily disable foreign key checks for this chunk
          await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
          
          // Create orders for this chunk
          const orderValues = chunk.map(order => [
            order.customer_id,
            order.total || 0,
            order.date_created || new Date(),
            order.date_created || new Date(),
            `ORD-${order.order_id}-${new Date(order.date_created || new Date()).toISOString().slice(0, 10).replace(/-/g, '')}`,
            order.order_id.toString(),
            order.total || 0
          ]);

          await queryInterface.sequelize.query(`
            INSERT IGNORE INTO orders (
              user_id, total, createdAt, updatedAt, order_unique_id, order_code, sub_total
            ) VALUES ?
          `, {
            replacements: [orderValues],
            transaction
          });

          await transaction.commit();
          processedOrders += chunk.length;
          
          console.log(`✅ Chunk ${chunkNumber}/${totalChunks} completed. Progress: ${processedOrders}/${orders.length} (${Math.round(processedOrders/orders.length*100)}%)`);
          
        } catch (error) {
          await transaction.rollback();
          console.error(`❌ Error in chunk ${chunkNumber}:`, error);
          throw error;
        }
      }

      // Step 7: Extract order statistics from old database
      console.log('📈 Fetching order statistics from old database...');
      const orderStats = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          order_id,
          total_sales,
          net_total,
          shipping_total,
          tax_total,
          customer_id
        FROM vh_wc_order_stats
        ORDER BY order_id
      `);

      console.log(`📊 Total order statistics to process: ${orderStats.length}`);

      // Step 8: Update orders with statistics data in chunks
      console.log(`🔄 Updating orders with statistics in chunks of ${CHUNK_SIZE}...`);
      let processedStats = 0;
      
      for (let i = 0; i < orderStats.length; i += CHUNK_SIZE) {
        const chunk = orderStats.slice(i, i + CHUNK_SIZE);
        const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
        const totalChunks = Math.ceil(orderStats.length / CHUNK_SIZE);
        
        console.log(`📦 Processing statistics chunk ${chunkNumber}/${totalChunks} (${chunk.length} records)...`);
        
        const transaction = await queryInterface.sequelize.transaction();
        
                 try {
           // Drop any existing temporary table first
           await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_order_updates`, { transaction });
           
           // Create temporary table for this chunk
           await queryInterface.sequelize.query(`
             CREATE TEMPORARY TABLE temp_order_updates (
               order_code VARCHAR(255),
               total_sales DECIMAL(10,2),
               net_total DECIMAL(10,2),
               shipping_total DECIMAL(10,2),
               tax_total DECIMAL(10,2),
               customer_id INT
             )
           `, { transaction });

          // Bulk insert update data for this chunk
          const updateValues = chunk.map(stat => [
            stat.order_id.toString(),
            stat.total_sales,
            stat.net_total,
            stat.shipping_total,
            stat.tax_total,
            stat.customer_id
          ]);

          if (updateValues.length > 0) {
            await queryInterface.sequelize.query(`
              INSERT INTO temp_order_updates VALUES ?
            `, {
              replacements: [updateValues],
              transaction
            });

            // Bulk update orders for this chunk
            await queryInterface.sequelize.query(`
              UPDATE orders o
              INNER JOIN temp_order_updates tou ON o.order_code = tou.order_code
              SET 
                o.total = COALESCE(tou.total_sales, o.total),
                o.sub_total = COALESCE(tou.net_total, o.sub_total),
                o.shipping_cost = COALESCE(tou.shipping_total, o.shipping_cost),
                o.discount_price = COALESCE(tou.tax_total, o.discount_price),
                o.user_id = COALESCE(tou.customer_id, o.user_id),
                o.updatedAt = NOW()
            `, { transaction });
          }

                     // Clean up temporary table for this chunk
           await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_order_updates`, { transaction });
           
           await transaction.commit();
           processedStats += chunk.length;
           
           console.log(`✅ Statistics chunk ${chunkNumber}/${totalChunks} completed. Progress: ${processedStats}/${orderStats.length} (${Math.round(processedStats/orderStats.length*100)}%)`);
          
        } catch (error) {
          await transaction.rollback();
          console.error(`❌ Error in statistics chunk ${chunkNumber}:`, error);
          throw error;
        }
      }

      // Step 9: Extract order items from old database
      console.log('🛍️ Fetching order items from old database...');
      const orderItems = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          opl.order_id,
          opl.product_id,
          opl.variation_id,
          opl.product_qty,
          opl.product_net_revenue,
          opl.date_created
        FROM vh_wc_order_product_lookup opl
        ORDER BY opl.order_id
      `);

      console.log(`📊 Total order items to process: ${orderItems.length}`);

      // Step 10: Create order items in chunks
      console.log(`🔄 Creating order items in chunks of ${CHUNK_SIZE}...`);
      let processedItems = 0;
      
      for (let i = 0; i < orderItems.length; i += CHUNK_SIZE) {
        const chunk = orderItems.slice(i, i + CHUNK_SIZE);
        const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
        const totalChunks = Math.ceil(orderItems.length / CHUNK_SIZE);
        
        console.log(`📦 Processing order items chunk ${chunkNumber}/${totalChunks} (${chunk.length} items)...`);
        
        const transaction = await queryInterface.sequelize.transaction();
        
        try {
          const orderItemValues = chunk.map(item => [
            item.order_id.toString(),
            item.product_id,
            item.product_qty,
            item.product_net_revenue,
            item.date_created || new Date(),
            item.date_created || new Date()
          ]);

          await queryInterface.sequelize.query(`
            INSERT INTO order_items (
              order_id, product_id, variant_id, quantity, price, createdAt, updatedAt
            )
            SELECT 
              o.id as order_id,
              COALESCE(tpm.new_product_id, oi.product_id) as product_id,
              COALESCE(tvm.new_variant_id, oi.variant_id) as variant_id,
              oi.quantity,
              oi.price,
              oi.createdAt,
              oi.updatedAt
            FROM (VALUES ?) AS oi (order_code, product_id, variant_id, quantity, price, createdAt, updatedAt)
            JOIN orders o ON o.order_code = oi.order_code
            LEFT JOIN temp_product_mapping tpm ON oi.product_id = tpm.old_product_id
            LEFT JOIN temp_variant_mapping tvm ON oi.variant_id = tvm.old_variant_id
          `, {
            replacements: [orderItemValues],
            transaction
          });

          await transaction.commit();
          processedItems += chunk.length;
          
          console.log(`✅ Order items chunk ${chunkNumber}/${totalChunks} completed. Progress: ${processedItems}/${orderItems.length} (${Math.round(processedItems/orderItems.length*100)}%)`);
          
        } catch (error) {
          await transaction.rollback();
          console.error(`❌ Error in order items chunk ${chunkNumber}:`, error);
          throw error;
        }
      }

      // Step 11: Extract order addresses from old database
      console.log('📍 Fetching order addresses from old database...');
      const orderAddresses = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          p.ID as order_id,
          pm_billing_first.meta_value as billing_first_name,
          pm_billing_last.meta_value as billing_last_name,
          pm_billing_company.meta_value as billing_company,
          pm_billing_address_1.meta_value as billing_address_1,
          pm_billing_address_2.meta_value as billing_address_2,
          pm_billing_city.meta_value as billing_city,
          pm_billing_state.meta_value as billing_state,
          pm_billing_postcode.meta_value as billing_postcode,
          pm_billing_country.meta_value as billing_country,
          pm_billing_phone.meta_value as billing_phone,
          pm_billing_email.meta_value as billing_email,
          pm_shipping_first.meta_value as shipping_first_name,
          pm_shipping_last.meta_value as shipping_last_name,
          pm_shipping_company.meta_value as shipping_company,
          pm_shipping_address_1.meta_value as shipping_address_1,
          pm_shipping_address_2.meta_value as shipping_address_2,
          pm_shipping_city.meta_value as shipping_city,
          pm_shipping_state.meta_value as shipping_state,
          pm_shipping_postcode.meta_value as shipping_postcode,
          pm_shipping_country.meta_value as shipping_country
        FROM vh_posts p
        LEFT JOIN vh_postmeta pm_billing_first ON p.ID = pm_billing_first.post_id AND pm_billing_first.meta_key = '_billing_first_name'
        LEFT JOIN vh_postmeta pm_billing_last ON p.ID = pm_billing_last.post_id AND pm_billing_last.meta_key = '_billing_last_name'
        LEFT JOIN vh_postmeta pm_billing_company ON p.ID = pm_billing_company.post_id AND pm_billing_company.meta_key = '_billing_company'
        LEFT JOIN vh_postmeta pm_billing_address_1 ON p.ID = pm_billing_address_1.post_id AND pm_billing_address_1.meta_key = '_billing_address_1'
        LEFT JOIN vh_postmeta pm_billing_address_2 ON p.ID = pm_billing_address_2.post_id AND pm_billing_address_2.meta_key = '_billing_address_2'
        LEFT JOIN vh_postmeta pm_billing_city ON p.ID = pm_billing_city.post_id AND pm_billing_city.meta_key = '_billing_city'
        LEFT JOIN vh_postmeta pm_billing_state ON p.ID = pm_billing_state.post_id AND pm_billing_state.meta_key = '_billing_state'
        LEFT JOIN vh_postmeta pm_billing_postcode ON p.ID = pm_billing_postcode.post_id AND pm_billing_postcode.meta_key = '_billing_postcode'
        LEFT JOIN vh_postmeta pm_billing_country ON p.ID = pm_billing_country.post_id AND pm_billing_country.meta_key = '_billing_country'
        LEFT JOIN vh_postmeta pm_billing_phone ON p.ID = pm_billing_phone.post_id AND pm_billing_phone.meta_key = '_billing_phone'
        LEFT JOIN vh_postmeta pm_billing_email ON p.ID = pm_billing_email.post_id AND pm_billing_email.meta_key = '_billing_email'
        LEFT JOIN vh_postmeta pm_shipping_first ON p.ID = pm_shipping_first.post_id AND pm_shipping_first.meta_key = '_shipping_first_name'
        LEFT JOIN vh_postmeta pm_shipping_last ON p.ID = pm_shipping_last.post_id AND pm_shipping_last.meta_key = '_shipping_last_name'
        LEFT JOIN vh_postmeta pm_shipping_company ON p.ID = pm_shipping_company.post_id AND pm_shipping_company.meta_key = '_shipping_company'
        LEFT JOIN vh_postmeta pm_shipping_address_1 ON p.ID = pm_shipping_address_1.post_id AND pm_shipping_address_1.meta_key = '_shipping_address_1'
        LEFT JOIN vh_postmeta pm_shipping_address_2 ON p.ID = pm_shipping_address_2.post_id AND pm_shipping_address_2.meta_key = '_shipping_address_2'
        LEFT JOIN vh_postmeta pm_shipping_city ON p.ID = pm_shipping_city.post_id AND pm_shipping_city.meta_key = '_shipping_city'
        LEFT JOIN vh_postmeta pm_shipping_state ON p.ID = pm_shipping_state.post_id AND pm_shipping_state.meta_key = '_shipping_state'
        LEFT JOIN vh_postmeta pm_shipping_postcode ON p.ID = pm_shipping_postcode.post_id AND pm_shipping_postcode.meta_key = '_shipping_postcode'
        LEFT JOIN vh_postmeta pm_shipping_country ON p.ID = pm_shipping_country.post_id AND pm_shipping_country.meta_key = '_shipping_country'
        WHERE p.post_type = 'shop_order'
        AND p.post_status IN ('wc-completed', 'wc-processing', 'wc-on-hold', 'wc-pending')
      `);

      console.log(`📊 Total order addresses to process: ${orderAddresses.length}`);

      // Step 12: Create order addresses in chunks
      console.log(`🔄 Creating order addresses in chunks of ${CHUNK_SIZE}...`);
      let processedAddresses = 0;
      
      for (let i = 0; i < orderAddresses.length; i += CHUNK_SIZE) {
        const chunk = orderAddresses.slice(i, i + CHUNK_SIZE);
        const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
        const totalChunks = Math.ceil(orderAddresses.length / CHUNK_SIZE);
        
        console.log(`📦 Processing addresses chunk ${chunkNumber}/${totalChunks} (${chunk.length} addresses)...`);
        
        const transaction = await queryInterface.sequelize.transaction();
        
        try {
          await queryInterface.sequelize.query(`
            INSERT INTO order_addresses (
              order_id, address_type, first_name, last_name, company, address_line_1, address_line_2,
              city, state, postal_code, country, phone, email, createdAt, updatedAt
            )
            SELECT 
              o.id as order_id,
              'billing' as address_type,
              oa.billing_first_name,
              oa.billing_last_name,
              oa.billing_company,
              oa.billing_address_1,
              oa.billing_address_2,
              oa.billing_city,
              oa.billing_state,
              oa.billing_postcode,
              oa.billing_country,
              oa.billing_phone,
              oa.billing_email,
              NOW(),
              NOW()
            FROM (VALUES ?) AS oa (order_id, billing_first_name, billing_last_name, billing_company, billing_address_1, billing_address_2, billing_city, billing_state, billing_postcode, billing_country, billing_phone, billing_email, shipping_first_name, shipping_last_name, shipping_company, shipping_address_1, shipping_address_2, shipping_city, shipping_state, shipping_postcode, shipping_country)
            JOIN orders o ON o.order_code = oa.order_id
            WHERE oa.billing_first_name IS NOT NULL OR oa.billing_last_name IS NOT NULL
          `, {
            replacements: [chunk.map(addr => [
              addr.order_id, addr.billing_first_name, addr.billing_last_name, addr.billing_company,
              addr.billing_address_1, addr.billing_address_2, addr.billing_city, addr.billing_state,
              addr.billing_postcode, addr.billing_country, addr.billing_phone, addr.billing_email,
              addr.shipping_first_name, addr.shipping_last_name, addr.shipping_company,
              addr.shipping_address_1, addr.shipping_address_2, addr.shipping_city,
              addr.shipping_state, addr.shipping_postcode, addr.shipping_country
            ])],
            transaction
          });

          await transaction.commit();
          processedAddresses += chunk.length;
          
          console.log(`✅ Addresses chunk ${chunkNumber}/${totalChunks} completed. Progress: ${processedAddresses}/${orderAddresses.length} (${Math.round(processedAddresses/orderAddresses.length*100)}%)`);
          
        } catch (error) {
          await transaction.rollback();
          console.error(`❌ Error in addresses chunk ${chunkNumber}:`, error);
          throw error;
        }
      }

      // Step 13: Create order logs
      console.log('📝 Creating order logs...');
      await queryInterface.sequelize.query(`
        INSERT INTO order_logs (order_id, status, message, created_at, updated_at)
        SELECT 
          o.id as order_id,
          'created' as status,
          'Order imported from old database' as message,
          o.createdAt,
          o.updatedAt
        FROM orders o
      `);

      // Step 14: Clean up temporary tables
      console.log('🧹 Cleaning up temporary tables...');
      await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_product_mapping`);
      await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_variant_mapping`);

      // Step 15: Verification queries
      console.log('🔍 Running verification queries...');
      const [ordersCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM orders
      `);

      const [orderItemsCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM order_items
      `);

      const [orderAddressesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM order_addresses
      `);

      console.log('🎉 Orders migration completed successfully!');
      console.log(`📊 Orders migrated: ${ordersCount[0].count}`);
      console.log(`🛍️ Order items migrated: ${orderItemsCount[0].count}`);
      console.log(`📍 Order addresses migrated: ${orderAddressesCount[0].count}`);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

    } catch (error) {
      await crossServerMigration.closeOldDbConnection();
      console.error('❌ Orders migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      await queryInterface.sequelize.query(`DELETE FROM order_logs`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM order_addresses`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM order_items`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM orders`, { transaction });
      
      await transaction.commit();
      console.log('✅ Orders migration rolled back successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Orders migration rollback failed:', error);
      throw error;
    }
  }
};