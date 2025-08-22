'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('Starting order migration from live database...');
      // Step 1: Create temporary mapping table for user IDs
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE temp_user_mapping AS
        SELECT 
            old_u.ID as old_user_id,
            new_u.id as new_user_id
        FROM ${process.env.OLD_DB_NAME}.vh_users old_u
        INNER JOIN users new_u ON old_u.user_email COLLATE utf8mb4_unicode_ci = new_u.email COLLATE utf8mb4_unicode_ci
        WHERE old_u.user_status = 0
      `, { transaction });

      console.log('User mapping table created');

      // Step 2: Migrate Orders from vh_wc_orders
      await queryInterface.sequelize.query(`
        INSERT INTO orders (
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
          um.new_user_id as user_id,
          NULL as coupon_id,
          COALESCE(old_o.total_amount, 0) as total,
          COALESCE(old_o.tax_amount, 0) as discount_price,
          CASE 
            WHEN old_o.status = 'completed' THEN 'completed'
            WHEN old_o.status = 'processing' THEN 'processing'
            WHEN old_o.status = 'pending' THEN 'pending'
            WHEN old_o.status = 'cancelled' THEN 'cancel'
            WHEN old_o.status = 'failed' THEN 'fail'
            WHEN old_o.status = 'refunded' THEN 'refunded'
            WHEN old_o.status = 'on-hold' THEN 'pending'
            ELSE 'pending'
          END as status,
          1 as shipping_method_id,
          COALESCE(old_o.date_created_gmt, NOW()) as createdAt,
          COALESCE(old_o.date_updated_gmt, NOW()) as updatedAt,
          CASE 
            WHEN old_o.status IN ('cancelled', 'failed') THEN COALESCE(old_o.date_updated_gmt, NOW())
            ELSE NULL
          END as deletedAt,
          NULL as shipping_address_id,
          NULL as billing_address_id,
          CONCAT('ORD-', old_o.id, '-', DATE_FORMAT(COALESCE(old_o.date_created_gmt, NOW()), '%Y%m%d')) as order_unique_id,
          0.00 as deals_discount,
          NULL as applicable_deals,
          0.00 as shipping_cost,
          CAST(old_o.id AS CHAR) as order_code,
          old_o.billing_email as email,
          NULL as phone,
          NULL as order_shipping_address_id,
          NULL as order_billing_address_id,
          NULL as referral_id,
          COALESCE(old_o.total_amount, 0) as sub_total,
          NULL as discount_type,
          1 as payment_method_id,
          NULL as shipstation_order_id,
          0 as loyalty_flag,
          0.00 as loyalty_discount,
          0.00 as mailSubscription_discount,
          CASE 
            WHEN old_o.status = 'completed' THEN 1
            ELSE 0
          END as ordered
        FROM ${process.env.OLD_DB_NAME}.vh_wc_orders old_o
        INNER JOIN temp_user_mapping um ON old_o.customer_id = um.old_user_id
        WHERE 
          um.new_user_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM orders new_o 
            WHERE new_o.order_code COLLATE utf8mb4_unicode_ci = CAST(old_o.id AS CHAR) COLLATE utf8mb4_unicode_ci
          )
      `, { transaction });

      console.log('Orders migrated from vh_wc_orders');

      // Step 3: Create temporary mapping table for order IDs
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE temp_order_mapping AS
        SELECT 
          old_o.id as old_order_id,
          new_o.id as new_order_id
        FROM ${process.env.OLD_DB_NAME}.vh_wc_orders old_o
        INNER JOIN orders new_o ON new_o.order_code COLLATE utf8mb4_unicode_ci = CAST(old_o.id AS CHAR) COLLATE utf8mb4_unicode_ci
      `, { transaction });

      console.log('Order mapping table created');

      // Step 4: Migrate Order Items from vh_woocommerce_order_items
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
          om.new_order_id as order_id,
          -- Use product_id from order_product_lookup if available, otherwise default to 1
          COALESCE(opl.product_id, 1) as product_id,
          COALESCE(opl.variation_id, NULL) as variant_id,
          'piece' as unit,
          -- Calculate unit price from order stats or use total
          COALESCE(os.total_sales / NULLIF(os.num_items_sold, 0), old_oi.order_item_name, 0) as unit_price,
          COALESCE(opl.product_qty, 1) as quantity,
          NULL as discount_price,
          COALESCE(opl.product_net_revenue, 0) as total,
          COALESCE(old_o.date_created_gmt, NOW()) as createdAt,
          COALESCE(old_o.date_updated_gmt, NOW()) as updatedAt,
          CASE 
            WHEN old_o.status IN ('cancelled', 'failed') THEN COALESCE(old_o.date_updated_gmt, NOW())
            ELSE NULL
          END as deletedAt
        FROM ${process.env.OLD_DB_NAME}.vh_woocommerce_order_items old_oi
        INNER JOIN temp_order_mapping om ON old_oi.order_id = om.old_order_id
        INNER JOIN ${process.env.OLD_DB_NAME}.vh_wc_orders old_o ON old_o.id = om.old_order_id
        LEFT JOIN ${process.env.OLD_DB_NAME}.vh_wc_order_product_lookup opl ON opl.order_id = old_oi.order_id
        LEFT JOIN ${process.env.OLD_DB_NAME}.vh_wc_order_stats os ON os.order_id = old_oi.order_id
        WHERE old_oi.order_item_type = 'line_item'
      `, { transaction });

      console.log('Order items migrated from vh_woocommerce_order_items');

      // Step 5: Migrate Order Addresses (if available)
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
          om.new_order_id as order_id,
          o.user_id,
          COALESCE(
            SUBSTRING_INDEX(old_o.billing_email, '@', 1),
            'Customer'
          ) as name,
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
          COALESCE(old_o.date_created_gmt, NOW()) as created_at,
          COALESCE(old_o.date_updated_gmt, NOW()) as updated_at,
          CASE 
            WHEN old_o.status IN ('cancelled', 'failed') THEN COALESCE(old_o.date_updated_gmt, NOW())
            ELSE NULL
          END as deleted_at
        FROM ${process.env.OLD_DB_NAME}.vh_wc_orders old_o
        INNER JOIN temp_order_mapping om ON old_o.id = om.old_order_id
        INNER JOIN orders o ON o.id = om.new_order_id
      `, { transaction });

      console.log('Order addresses migrated');

      // Step 6: Update order address references
      await queryInterface.sequelize.query(`
        UPDATE orders o
        INNER JOIN temp_order_mapping om ON o.id = om.new_order_id
        INNER JOIN order_addresses oa ON oa.order_id = om.new_order_id
        SET 
          o.order_billing_address_id = oa.id,
          o.order_shipping_address_id = oa.id
        WHERE oa.deleted_at IS NULL
      `, { transaction });

      // Step 7: Create Order Logs
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
          om.new_order_id as order_id,
          o.user_id,
          o.status,
          CONCAT('Order ', o.status, ' from WooCommerce migration') as label,
          CONCAT('Migrated from WooCommerce order ID: ', om.old_order_id) as additional_info,
          o.createdAt,
          o.updatedAt
        FROM orders o
        INNER JOIN temp_order_mapping om ON o.id = om.new_order_id
      `, { transaction });

      // Step 8: Clean up temporary tables
      await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_user_mapping`, { transaction });
      await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_order_mapping`, { transaction });

      // Step 9: Verification
      const [migratedOrdersCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM orders WHERE order_code IS NOT NULL
      `, { transaction });

      const [ordersByStatus] = await queryInterface.sequelize.query(`
        SELECT status, COUNT(*) as order_count FROM orders GROUP BY status
      `, { transaction });

      const [ordersWithItems] = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT o.id) as orders_with_items
        FROM orders o INNER JOIN order_items oi ON o.id = oi.order_id
      `, { transaction });

      console.log('Orders migration completed successfully!');
      console.log(`Orders migrated: ${migratedOrdersCount[0].count}`);
      console.log(`Orders with items: ${ordersWithItems[0].orders_with_items}`);
      
      console.log('\nOrders by status:');
      ordersByStatus.forEach(status => {
        console.log(`- ${status.status}: ${status.order_count} orders`);
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error('Orders migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      await queryInterface.sequelize.query(`
        DELETE FROM order_logs WHERE order_id IN (
          SELECT id FROM orders WHERE order_code IS NOT NULL
        )
      `, { transaction });

      await queryInterface.sequelize.query(`
        DELETE FROM order_items WHERE order_id IN (
          SELECT id FROM orders WHERE order_code IS NOT NULL
        )
      `, { transaction });

      await queryInterface.sequelize.query(`
        DELETE FROM order_addresses WHERE order_id IN (
          SELECT id FROM orders WHERE order_code IS NOT NULL
        )
      `, { transaction });

      await queryInterface.sequelize.query(`
        DELETE FROM orders WHERE order_code IS NOT NULL
      `, { transaction });

      await transaction.commit();
      console.log('Orders migration rolled back successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('Orders migration rollback failed:', error);
      throw error;
    }
  }
};
