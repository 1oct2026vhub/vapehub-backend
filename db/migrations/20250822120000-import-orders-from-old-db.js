'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('Starting orders migration from alternative data sources...');
      
      // Temporarily disable foreign key checks
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
      
      // Step 1: Create orders from viva_com_smart_wc_checkout_orders (primary source)
      console.log('Creating orders from VivaWallet checkout orders...');
      await queryInterface.sequelize.query(`
        INSERT IGNORE INTO orders (
          user_id,
          coupon_id,
          total,
          discount_price,
          status,
          shipping_method_id,
          createdAt,
          updatedAt,
          deletedAt,
          shipping_address_id,
          billing_address_id,
          order_unique_id,
          deals_discount,
          applicable_deals,
          shipping_cost,
          order_code,
          email,
          phone,
          order_shipping_address_id,
          order_billing_address_id,
          referral_id,
          sub_total,
          discount_type,
          payment_method_id,
          shipstation_order_id,
          loyalty_flag,
          loyalty_discount,
          mailSubscription_discount,
          ordered
        )
        SELECT 
          -- Try to find user by email from order_stats or default to 1
          COALESCE(
            (SELECT customer_id FROM ${process.env.OLD_DB_NAME}.vh_wc_order_stats 
             WHERE order_id COLLATE utf8mb4_unicode_ci = vco.woocommerce_order_id COLLATE utf8mb4_unicode_ci LIMIT 1), 1
          ) as user_id,
          NULL as coupon_id,
          vco.amount as total,
          0.00 as discount_price,
          'completed' as status, -- Assume completed since payment was processed
          1 as shipping_method_id,
          COALESCE(vco.date_add, NOW()) as createdAt,
          COALESCE(vco.date_add, NOW()) as updatedAt,
          NULL as deletedAt,
          NULL as shipping_address_id,
          NULL as billing_address_id,
          CONCAT('ORD-', vco.woocommerce_order_id, '-', DATE_FORMAT(COALESCE(vco.date_add, NOW()), '%Y%m%d')) as order_unique_id,
          0.00 as deals_discount,
          NULL as applicable_deals,
          0.00 as shipping_cost,
          CAST(vco.woocommerce_order_id AS CHAR) as order_code,
          NULL as email, -- Will be updated later
          NULL as phone,
          NULL as order_shipping_address_id,
          NULL as order_billing_address_id,
          NULL as referral_id,
          vco.amount as sub_total,
          NULL as discount_type,
          (SELECT id FROM PaymentMethods WHERE payment_method = 'VivaWallet' LIMIT 1) as payment_method_id,
          NULL as shipstation_order_id,
          0 as loyalty_flag,
          0.00 as loyalty_discount,
          0.00 as mailSubscription_discount,
          1 as ordered
        FROM ${process.env.OLD_DB_NAME}.vh_viva_com_smart_wc_checkout_orders vco
        WHERE NOT EXISTS (
          SELECT 1 FROM orders new_o 
          WHERE new_o.order_code COLLATE utf8mb4_unicode_ci = CAST(vco.woocommerce_order_id AS CHAR) COLLATE utf8mb4_unicode_ci
        )
      `, { transaction });

      // Step 2: Update order totals and details from order_stats
      console.log('Updating orders with statistics data...');
      await queryInterface.sequelize.query(`
        UPDATE orders o
        INNER JOIN ${process.env.OLD_DB_NAME}.vh_wc_order_stats os ON os.order_id COLLATE utf8mb4_unicode_ci = CAST(o.order_code AS UNSIGNED) COLLATE utf8mb4_unicode_ci
        SET 
          o.total = COALESCE(os.total_sales, o.total),
          o.sub_total = COALESCE(os.net_total, o.sub_total),
          o.shipping_cost = COALESCE(os.shipping_total, o.shipping_cost),
          o.discount_price = COALESCE(os.tax_total, o.discount_price),
          o.user_id = COALESCE(os.customer_id, o.user_id),
          o.updatedAt = NOW()
        WHERE o.order_code IS NOT NULL
      `, { transaction });

      // Step 3: Create order items from vh_woocommerce_order_items
      console.log('Creating order items from WooCommerce order items...');
      await queryInterface.sequelize.query(`
        INSERT INTO order_items (
          order_id,
          product_id,
          variant_id,
          unit,
          unit_price,
          quantity,
          discount_price,
          total,
          createdAt,
          updatedAt,
          deletedAt
        )
        SELECT 
          o.id as order_id,
          -- Get product_id from order_itemmeta
          COALESCE(
            (SELECT CAST(meta_value AS UNSIGNED) 
             FROM ${process.env.OLD_DB_NAME}.vh_woocommerce_order_itemmeta 
             WHERE order_item_id = oi.order_item_id 
             AND meta_key = '_product_id' 
             LIMIT 1), 1
          ) as product_id,
          -- Get variation_id from order_itemmeta
          COALESCE(
            (SELECT CAST(meta_value AS UNSIGNED) 
             FROM ${process.env.OLD_DB_NAME}.vh_woocommerce_order_itemmeta 
             WHERE order_item_id = oi.order_item_id 
             AND meta_key = '_variation_id' 
             LIMIT 1), NULL
          ) as variant_id,
          'piece' as unit,
          -- Calculate unit price from line_total and qty
          CASE 
            WHEN COALESCE(
              (SELECT CAST(meta_value AS DECIMAL(10,2)) 
               FROM ${process.env.OLD_DB_NAME}.vh_woocommerce_order_itemmeta 
               WHERE order_item_id = oi.order_item_id 
               AND meta_key = '_qty' 
               LIMIT 1), 1
            ) > 0 
            THEN COALESCE(
              (SELECT CAST(meta_value AS DECIMAL(10,2)) 
               FROM ${process.env.OLD_DB_NAME}.vh_woocommerce_order_itemmeta 
               WHERE order_item_id = oi.order_item_id 
               AND meta_key = '_line_total' 
               LIMIT 1), 0
            ) / COALESCE(
              (SELECT CAST(meta_value AS DECIMAL(10,2)) 
               FROM ${process.env.OLD_DB_NAME}.vh_woocommerce_order_itemmeta 
               WHERE order_item_id = oi.order_item_id 
               AND meta_key = '_qty' 
               LIMIT 1), 1
            )
            ELSE 0
          END as unit_price,
          -- Get quantity from order_itemmeta
          COALESCE(
            (SELECT CAST(meta_value AS UNSIGNED) 
             FROM ${process.env.OLD_DB_NAME}.vh_woocommerce_order_itemmeta 
             WHERE order_item_id = oi.order_item_id 
             AND meta_key = '_qty' 
             LIMIT 1), 1
          ) as quantity,
          NULL as discount_price,
          -- Get line total from order_itemmeta
          COALESCE(
            (SELECT CAST(meta_value AS DECIMAL(10,2)) 
             FROM ${process.env.OLD_DB_NAME}.vh_woocommerce_order_itemmeta 
             WHERE order_item_id = oi.order_item_id 
             AND meta_key = '_line_total' 
             LIMIT 1), 0
          ) as total,
          NOW() as createdAt,
          NOW() as updatedAt,
          NULL as deletedAt
        FROM ${process.env.OLD_DB_NAME}.vh_woocommerce_order_items oi
        INNER JOIN orders o ON o.order_code COLLATE utf8mb4_unicode_ci = CAST(oi.order_id AS CHAR) COLLATE utf8mb4_unicode_ci
        WHERE oi.order_item_type = 'line_item'
        AND NOT EXISTS (
          SELECT 1 FROM order_items existing_oi 
          WHERE existing_oi.order_id = o.id 
          AND existing_oi.product_id = COALESCE(
            (SELECT CAST(meta_value AS UNSIGNED) 
             FROM ${process.env.OLD_DB_NAME}.vh_woocommerce_order_itemmeta 
             WHERE order_item_id = oi.order_item_id 
             AND meta_key = '_product_id' 
             LIMIT 1), 1
          )
        )
      `, { transaction });

      // Step 4: Create order addresses from order_addresses if available
      console.log('Creating order addresses...');
      await queryInterface.sequelize.query(`
        INSERT INTO order_addresses (
          order_id,
          user_id,
          name,
          last_name,
          company_name,
          country,
          street,
          apartment,
          town,
          county,
          region,
          post_code,
          phone,
          token,
          created_at,
          updated_at,
          deleted_at
        )
        SELECT 
          o.id as order_id,
          o.user_id,
          'Customer' as name,
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
          o.createdAt as created_at,
          o.updatedAt as updated_at,
          NULL as deleted_at
        FROM orders o
        WHERE o.order_code IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM order_addresses oa WHERE oa.order_id = o.id
        )
      `, { transaction });

      // Step 5: Update order address references
      console.log('Updating order address references...');
      await queryInterface.sequelize.query(`
        UPDATE orders o
        INNER JOIN order_addresses oa ON oa.order_id = o.id
        SET 
          o.order_billing_address_id = oa.id,
          o.order_shipping_address_id = oa.id
        WHERE o.order_code IS NOT NULL
        AND oa.deleted_at IS NULL
      `, { transaction });

      // Step 6: Update user emails from users table
      console.log('Updating user emails...');
      await queryInterface.sequelize.query(`
        UPDATE orders o
        INNER JOIN users u ON o.user_id = u.id
        SET o.email = u.email
        WHERE o.email IS NULL
        AND u.email IS NOT NULL
      `, { transaction });

      // Step 7: Create order logs
      console.log('Creating order logs...');
      await queryInterface.sequelize.query(`
        INSERT INTO order_logs (
          order_id,
          user_id,
          status,
          label,
          additional_info,
          createdAt,
          updatedAt
        )
        SELECT 
          o.id as order_id,
          o.user_id,
          o.status,
          CONCAT('Order ', o.status, ' from VivaWallet migration') as label,
          CONCAT('Migrated from VivaWallet order ID: ', o.order_code) as additional_info,
          o.createdAt,
          o.updatedAt
        FROM orders o
        WHERE o.order_code IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM order_logs ol WHERE ol.order_id = o.id
        )
      `, { transaction });

      // Step 8: Verification and reporting
      console.log('Running verification queries...');
      const [migratedOrdersCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM orders WHERE order_code IS NOT NULL
      `, { transaction });

      const [ordersWithItems] = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT o.id) as orders_with_items
        FROM orders o INNER JOIN order_items oi ON o.id = oi.order_id
      `, { transaction });

      const [totalAmount] = await queryInterface.sequelize.query(`
        SELECT SUM(total) as total_amount FROM orders WHERE order_code IS NOT NULL
      `, { transaction });

      const [ordersByStatus] = await queryInterface.sequelize.query(`
        SELECT status, COUNT(*) as count FROM orders WHERE order_code IS NOT NULL GROUP BY status
      `, { transaction });

      const [sampleOrders] = await queryInterface.sequelize.query(`
        SELECT 
          order_code,
          total,
          status,
          createdAt,
          email
        FROM orders 
        WHERE order_code IS NOT NULL
        ORDER BY createdAt DESC
        LIMIT 10
      `, { transaction });

      console.log('\n=== MIGRATION COMPLETED SUCCESSFULLY ===');
      console.log(`📊 Orders migrated: ${migratedOrdersCount[0].count}`);
      console.log(`�� Orders with items: ${ordersWithItems[0].orders_with_items}`);
      console.log(`�� Total revenue: £${totalAmount[0].total_amount || 0}`);
      
      console.log('\n📈 Orders by status:');
      ordersByStatus.forEach(status => {
        console.log(`   - ${status.status}: ${status.count} orders`);
      });

      console.log('\n📋 Sample migrated orders:');
      sampleOrders.forEach(order => {
        console.log(`   - Order ${order.order_code}: £${order.total} (${order.status}) - ${order.email || 'No email'}`);
      });

      // Re-enable foreign key checks
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
      
      await transaction.commit();
      console.log('\n✅ Migration committed successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Orders migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('Rolling back orders migration...');
      
      await queryInterface.sequelize.query(`
        DELETE FROM order_logs WHERE order_id IN (
          SELECT id FROM orders WHERE order_code IS NOT NULL
        )
      `, { transaction });

      await queryInterface.sequelize.query(`
        DELETE FROM order_addresses WHERE order_id IN (
          SELECT id FROM orders WHERE order_code IS NOT NULL
        )
      `, { transaction });

      await queryInterface.sequelize.query(`
        DELETE FROM order_items WHERE order_id IN (
          SELECT id FROM orders WHERE order_code IS NOT NULL
        )
      `, { transaction });

      await queryInterface.sequelize.query(`
        DELETE FROM orders WHERE order_code IS NOT NULL
      `, { transaction });

      await transaction.commit();
      console.log('✅ Orders migration rolled back successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Orders migration rollback failed:', error);
      throw error;
    }
  }
};