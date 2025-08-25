'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('Starting orders migration with product ID mapping...');
      
      // Temporarily disable foreign key checks
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
      
      // Step 1: Create product mapping table
      console.log('Creating product ID mapping...');
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE temp_product_mapping AS
        SELECT 
          old_p.ID as old_product_id,
          new_p.id as new_product_id
        FROM ${process.env.OLD_DB_NAME}.vh_posts old_p
                 INNER JOIN products new_p ON new_p.slug COLLATE utf8mb4_unicode_ci = old_p.post_name COLLATE utf8mb4_unicode_ci
        WHERE old_p.post_type = 'product'
        AND old_p.post_status = 'publish'
      `, { transaction });

             // Step 2: Create variant mapping table (simplified - will use NULL for variants)
       console.log('Creating variant ID mapping...');
       await queryInterface.sequelize.query(`
         CREATE TEMPORARY TABLE temp_variant_mapping (
           old_variant_id INT,
           new_variant_id INT
         )
       `, { transaction });

      // Step 3: Create orders from vh_wc_order_product_lookup
      console.log('Creating orders from order product lookup...');
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
          opl.customer_id as user_id,
          NULL as coupon_id,
          (SELECT SUM(product_net_revenue) 
           FROM ${process.env.OLD_DB_NAME}.vh_wc_order_product_lookup 
           WHERE order_id = opl.order_id) as total,
          0.00 as discount_price,
          'completed' as status,
          1 as shipping_method_id,
          COALESCE(opl.date_created, NOW()) as createdAt,
          COALESCE(opl.date_created, NOW()) as updatedAt,
          NULL as deletedAt,
          NULL as shipping_address_id,
          NULL as billing_address_id,
          CONCAT('ORD-', opl.order_id, '-', DATE_FORMAT(COALESCE(opl.date_created, NOW()), '%Y%m%d')) as order_unique_id,
          0.00 as deals_discount,
          NULL as applicable_deals,
          0.00 as shipping_cost,
          CAST(opl.order_id AS CHAR) as order_code,
          NULL as email,
          NULL as phone,
          NULL as order_shipping_address_id,
          NULL as order_billing_address_id,
          NULL as referral_id,
          (SELECT SUM(product_net_revenue) 
           FROM ${process.env.OLD_DB_NAME}.vh_wc_order_product_lookup 
           WHERE order_id = opl.order_id) as sub_total,
          NULL as discount_type,
          1 as payment_method_id,
          NULL as shipstation_order_id,
          0 as loyalty_flag,
          0.00 as loyalty_discount,
          0.00 as mailSubscription_discount,
          1 as ordered
        FROM ${process.env.OLD_DB_NAME}.vh_wc_order_product_lookup opl
                 WHERE NOT EXISTS (
           SELECT 1 FROM orders new_o 
           WHERE new_o.order_code COLLATE utf8mb4_unicode_ci = CAST(opl.order_id AS CHAR) COLLATE utf8mb4_unicode_ci
         )
        GROUP BY opl.order_id, opl.customer_id, opl.date_created
      `, { transaction });

      // Step 4: Update orders with statistics data
      console.log('Updating orders with statistics data...');
      await queryInterface.sequelize.query(`
        UPDATE orders o
        INNER JOIN ${process.env.OLD_DB_NAME}.vh_wc_order_stats os ON os.order_id = CAST(o.order_code AS UNSIGNED)
        SET 
          o.total = COALESCE(os.total_sales, o.total),
          o.sub_total = COALESCE(os.net_total, o.sub_total),
          o.shipping_cost = COALESCE(os.shipping_total, o.shipping_cost),
          o.discount_price = COALESCE(os.tax_total, o.discount_price),
          o.user_id = COALESCE(os.customer_id, o.user_id),
          o.updatedAt = NOW()
        WHERE o.order_code IS NOT NULL
      `, { transaction });

      // Step 5: Create order items with mapped product IDs
      console.log('Creating order items with mapped product IDs...');
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
          COALESCE(pm.new_product_id, 1) as product_id, -- Map to new product ID or default to 1
          COALESCE(vm.new_variant_id, NULL) as variant_id, -- Map to new variant ID
          'piece' as unit,
          CASE 
            WHEN opl.product_qty > 0 THEN opl.product_net_revenue / opl.product_qty
            ELSE 0
          END as unit_price,
          opl.product_qty as quantity,
          NULL as discount_price,
          opl.product_net_revenue as total,
          COALESCE(opl.date_created, NOW()) as createdAt,
          COALESCE(opl.date_created, NOW()) as updatedAt,
          NULL as deletedAt
        FROM ${process.env.OLD_DB_NAME}.vh_wc_order_product_lookup opl
                 INNER JOIN orders o ON o.order_code COLLATE utf8mb4_unicode_ci = CAST(opl.order_id AS CHAR) COLLATE utf8mb4_unicode_ci
        LEFT JOIN temp_product_mapping pm ON pm.old_product_id = opl.product_id
        LEFT JOIN temp_variant_mapping vm ON vm.old_variant_id = opl.variation_id
        WHERE NOT EXISTS (
          SELECT 1 FROM order_items existing_oi 
          WHERE existing_oi.order_id = o.id 
          AND existing_oi.product_id = COALESCE(pm.new_product_id, 1)
        )
      `, { transaction });

      // Step 6: Create order addresses
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

      // Step 7: Update order address references
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

      // Step 8: Update user emails
      console.log('Updating user emails...');
      await queryInterface.sequelize.query(`
        UPDATE orders o
        INNER JOIN users u ON o.user_id = u.id
        SET o.email = u.email
        WHERE o.email IS NULL
        AND u.email IS NOT NULL
      `, { transaction });

      // Step 9: Create order logs
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
          CONCAT('Order ', o.status, ' from order product lookup migration') as label,
          CONCAT('Migrated from order ID: ', o.order_code) as additional_info,
          o.createdAt,
          o.updatedAt
        FROM orders o
        WHERE o.order_code IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM order_logs ol WHERE ol.order_id = o.id
        )
      `, { transaction });

      // Step 10: Clean up temporary tables
      await queryInterface.sequelize.query('DROP TEMPORARY TABLE IF EXISTS temp_product_mapping', { transaction });
      await queryInterface.sequelize.query('DROP TEMPORARY TABLE IF EXISTS temp_variant_mapping', { transaction });

      // Step 11: Verification and reporting
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

      const [productMappingStats] = await queryInterface.sequelize.query(`
        SELECT 
          COUNT(DISTINCT oi.product_id) as unique_products_used,
          COUNT(DISTINCT oi.variant_id) as unique_variants_used
        FROM order_items oi
        WHERE oi.product_id IS NOT NULL
      `, { transaction });

      console.log('\n=== MIGRATION COMPLETED SUCCESSFULLY ===');
      console.log(`📊 Orders migrated: ${migratedOrdersCount[0].count}`);
      console.log(` Orders with items: ${ordersWithItems[0].orders_with_items}`);
      console.log(` Total revenue: £${totalAmount[0].total_amount || 0}`);
      console.log(`📦 Unique products used: ${productMappingStats[0].unique_products_used}`);
      console.log(`🎨 Unique variants used: ${productMappingStats[0].unique_variants_used}`);

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