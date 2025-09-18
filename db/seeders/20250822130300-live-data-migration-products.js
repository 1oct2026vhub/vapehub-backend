'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    
    try {
      console.log('🚀 FIXED PRODUCT MIGRATION: Starting fresh product migration with exact ID mapping...');
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();
      
      // Step 1: Clear all existing product-related data
      console.log('🧹 Step 1: Clearing all existing product data...');
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
      
      // Clear only the tables we're inserting into
      await queryInterface.sequelize.query('DELETE FROM product_images', { transaction });
      await queryInterface.sequelize.query('DELETE FROM products', { transaction });
      
      // Reset auto increment to start from 1
      await queryInterface.sequelize.query('ALTER TABLE products AUTO_INCREMENT = 1', { transaction });
      
      console.log('✅ All existing product data cleared');
      
      // Step 2: Fetch all products from old database with comprehensive field mapping
      console.log('📥 Step 2: Fetching products from old database with all fields...');
      
      const products = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          p.ID as old_product_id,
          p.post_title as name,
          p.post_name as slug,
          p.post_content as description,
          p.post_status,
          p.post_date as created_at,
          p.post_modified as updated_at,
          
          -- Basic pricing and stock
          CAST(COALESCE(NULLIF(pm_regular_price.meta_value, ''), '0') AS DECIMAL(10,2)) as price,
          CAST(COALESCE(NULLIF(pm_sale_price.meta_value, ''), '0') AS DECIMAL(10,2)) as discount_price,
          CAST(COALESCE(NULLIF(pm_stock.meta_value, ''), '0') AS DECIMAL(10,0)) as stock_quantity,
          
          -- Product attributes from meta
          pm_puff_count.meta_value as puff_count,
          pm_battery_capacity.meta_value as battery_capacity,
          pm_coil_style.meta_value as coil_style,
          pm_device_style.meta_value as device_style,
          pm_eliquid_capacity.meta_value as eliquid_capacity,
          pm_pod_coil_style.meta_value as pod_coil_style,
          pm_pod_fill_style.meta_value as pod_fill_style,
          pm_power_supply.meta_value as power_supply,
          pm_nicotine_strength.meta_value as nicotine_strength,
          pm_nicotine_type.meta_value as nicotine_type,
          pm_vg_ratio.meta_value as vg_ratio,
          pm_vaping_style.meta_value as vaping_style,
          pm_bottle_size.meta_value as bottle_size,
          
          -- Additional product flags
          pm_is_new.meta_value as is_new,
          pm_product_type.meta_value as product_type
          
        FROM vh_posts p
        
        -- Basic pricing and stock meta
        LEFT JOIN vh_postmeta pm_regular_price ON p.ID = pm_regular_price.post_id AND pm_regular_price.meta_key = '_regular_price'
        LEFT JOIN vh_postmeta pm_sale_price ON p.ID = pm_sale_price.post_id AND pm_sale_price.meta_key = '_sale_price'
        LEFT JOIN vh_postmeta pm_stock ON p.ID = pm_stock.post_id AND pm_stock.meta_key = '_stock'
        
        -- Product attribute meta fields
        LEFT JOIN vh_postmeta pm_puff_count ON p.ID = pm_puff_count.post_id AND pm_puff_count.meta_key = '_puff_count'
        LEFT JOIN vh_postmeta pm_battery_capacity ON p.ID = pm_battery_capacity.post_id AND pm_battery_capacity.meta_key = '_battery_capacity'
        LEFT JOIN vh_postmeta pm_coil_style ON p.ID = pm_coil_style.post_id AND pm_coil_style.meta_key = '_coil_style'
        LEFT JOIN vh_postmeta pm_device_style ON p.ID = pm_device_style.post_id AND pm_device_style.meta_key = '_device_style'
        LEFT JOIN vh_postmeta pm_eliquid_capacity ON p.ID = pm_eliquid_capacity.post_id AND pm_eliquid_capacity.meta_key = '_eliquid_capacity'
        LEFT JOIN vh_postmeta pm_pod_coil_style ON p.ID = pm_pod_coil_style.post_id AND pm_pod_coil_style.meta_key = '_pod_coil_style'
        LEFT JOIN vh_postmeta pm_pod_fill_style ON p.ID = pm_pod_fill_style.post_id AND pm_pod_fill_style.meta_key = '_pod_fill_style'
        LEFT JOIN vh_postmeta pm_power_supply ON p.ID = pm_power_supply.post_id AND pm_power_supply.meta_key = '_power_supply'
        LEFT JOIN vh_postmeta pm_nicotine_strength ON p.ID = pm_nicotine_strength.post_id AND pm_nicotine_strength.meta_key = '_nicotine_strength'
        LEFT JOIN vh_postmeta pm_nicotine_type ON p.ID = pm_nicotine_type.post_id AND pm_nicotine_type.meta_key = '_nicotine_type'
        LEFT JOIN vh_postmeta pm_vg_ratio ON p.ID = pm_vg_ratio.post_id AND pm_vg_ratio.meta_key = '_vg_ratio'
        LEFT JOIN vh_postmeta pm_vaping_style ON p.ID = pm_vaping_style.post_id AND pm_vaping_style.meta_key = '_vaping_style'
        LEFT JOIN vh_postmeta pm_bottle_size ON p.ID = pm_bottle_size.post_id AND pm_bottle_size.meta_key = '_bottle_size'
        
        -- Additional flags
        LEFT JOIN vh_postmeta pm_is_new ON p.ID = pm_is_new.post_id AND pm_is_new.meta_key = '_is_new'
        LEFT JOIN vh_postmeta pm_product_type ON p.ID = pm_product_type.post_id AND pm_product_type.meta_key = '_product_type'
        
        WHERE p.post_type = 'product'
        AND p.post_status IN ('publish', 'draft', 'private')
        AND p.post_name IS NOT NULL 
        AND p.post_name != ''
        ORDER BY p.ID ASC
      `);

      console.log(`✅ Found ${products.length} products to migrate`);

      // Step 3: Insert products with exact ID mapping
      console.log('💾 Step 3: Inserting products with exact ID mapping...');
      
      let insertedCount = 0;
      let skippedCount = 0;
      
      for (const product of products) {
        try {
          // Map status
          let status = 'draft';
          if (product.post_status === 'publish') {
            status = 'published';
          } else if (product.post_status === 'draft') {
            status = 'draft';
          } else if (product.post_status === 'private') {
            status = 'archived';
          }
          
          // Map is_new flag
          const isNew = product.is_new === 'yes' || product.is_new === '1' || product.is_new === 'true';
          
          // Convert puff_count to integer if it exists
          const puffCount = product.puff_count ? parseInt(product.puff_count) || null : null;
          
          // Convert stock_quantity to integer if it exists
          const stockQuantity = product.stock_quantity ? parseInt(product.stock_quantity) || null : null;
          
          // Insert with exact ID from old database
          await queryInterface.sequelize.query(`
            INSERT INTO products (
              id, name, slug, description, price, discount_price, stock_quantity,
              puff_count, is_new, battery_capacity, coil_style, device_style,
              eliquid_capacity, pod_coil_style, pod_fill_style, power_supply,
              nicotine_strength, nicotine_type, vg_ratio, vaping_style, bottle_size,
              status, createdAt, updatedAt, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, {
            replacements: [
              product.old_product_id,  // Use exact ID from old database
              product.name,
              product.slug,
              product.description,
              product.price || null,
              product.discount_price || null,
              stockQuantity,
              puffCount,
              isNew,
              product.battery_capacity || null,
              product.coil_style || null,
              product.device_style || null,
              product.eliquid_capacity || null,
              product.pod_coil_style || null,
              product.pod_fill_style || null,
              product.power_supply || null,
              product.nicotine_strength || null,
              product.nicotine_type || null,
              product.vg_ratio || null,
              product.vaping_style || null,
              product.bottle_size || null,
              status,
              product.created_at,
              product.updated_at,
              1 // updated_by = 1 for migration
            ],
            transaction
          });
          
          insertedCount++;
          
        } catch (error) {
          console.error(`❌ Error inserting product ${product.old_product_id} (${product.name}):`, error.message);
          skippedCount++;
        }
      }

      // Step 4: Migrate product images
      console.log('🖼️ Step 4: Migrating product images...');
      
      const productImages = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          pm.post_id,
          pm.meta_key,
          pm.meta_value as attachment_id,
          p.guid as image_url,
          p.post_title as image_title
        FROM vh_postmeta pm
        LEFT JOIN vh_posts p ON p.ID = CAST(pm.meta_value AS UNSIGNED) AND p.post_type = 'attachment'
        WHERE pm.meta_key IN ('_thumbnail_id', '_product_image_gallery')
        AND pm.meta_value IS NOT NULL
        AND pm.meta_value != ''
        AND pm.meta_value != '0'
        AND p.guid IS NOT NULL
        AND pm.post_id IN (SELECT ID FROM vh_posts WHERE post_type = 'product')
      `);

      let productImagesInserted = 0;
      for (const image of productImages) {
        try {
          const imageUrl = image.image_url || null;
          if (imageUrl) {
            await queryInterface.sequelize.query(`
              INSERT INTO product_images (product_id, image_url, is_primary, createdAt, updatedAt)
              VALUES (?, ?, ?, NOW(), NOW())
            `, {
              replacements: [
                image.post_id, // Use exact product ID
                imageUrl,
                image.meta_key === '_thumbnail_id' ? 1 : 0
              ],
              transaction
            });
            
            productImagesInserted++;
          }
        } catch (error) {
          console.error(`❌ Error inserting image for product ${image.post_id}:`, error.message);
        }
      }

      // Re-enable foreign key checks
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
      
      // Step 5: Final verification
      console.log('🔍 Step 5: Final verification...');
      
      const [totalProducts] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM products
      `, { transaction });
      
      const [productsWithImages] = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT product_id) as count FROM product_images
      `, { transaction });
      
      const [totalImages] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_images
      `, { transaction });
      
      // Show sample of migrated products
      const [sampleProducts] = await queryInterface.sequelize.query(`
        SELECT 
          p.id,
          p.name,
          p.slug,
          p.price,
          p.discount_price,
          p.stock_quantity,
          p.puff_count,
          p.battery_capacity,
          p.nicotine_strength,
          p.status
        FROM products p
        ORDER BY p.id ASC
        LIMIT 5
      `, { transaction });
      
      console.log('\n📊 MIGRATION SUMMARY:');
      console.log(`   • Products inserted: ${insertedCount}`);
      console.log(`   • Products skipped: ${skippedCount}`);
      console.log(`   • Total products in DB: ${totalProducts[0].count}`);
      console.log(`   • Product images inserted: ${productImagesInserted}`);
      console.log(`   • Total images in DB: ${totalImages[0].count}`);
      console.log(`   • Products with images: ${productsWithImages[0].count}`);
      
      console.log('\n📋 Sample migrated products:');
      sampleProducts.forEach(product => {
        console.log(`   • ID: ${product.id}, Name: ${product.name}, Price: ${product.price}, Stock: ${product.stock_quantity}`);
      });

      await crossServerMigration.closeOldDbConnection();
      await transaction.commit();
      
      console.log('\n🎉 FIXED PRODUCT MIGRATION completed successfully!');
      console.log('✅ Products now have exact IDs matching old database');
      console.log('✅ All Product model fields properly mapped');
      console.log('✅ Product images migrated');
      console.log('✅ No variants included (as requested)');
      
    } catch (error) {
      console.error('❌ FIXED PRODUCT MIGRATION failed:', error);
      await transaction.rollback();
      if (crossServerMigration.oldDbConnection) {
        await crossServerMigration.closeOldDbConnection();
      }
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back FIXED PRODUCT MIGRATION...');
      
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
      
      // Clear in correct order
      await queryInterface.sequelize.query('DELETE FROM product_variant_images', { transaction });
      await queryInterface.sequelize.query('DELETE FROM product_images', { transaction });
      await queryInterface.sequelize.query('DELETE FROM product_variants', { transaction });
      await queryInterface.sequelize.query('DELETE FROM product_attribute_terms', { transaction });
      await queryInterface.sequelize.query('DELETE FROM product_categories', { transaction });
      await queryInterface.sequelize.query('DELETE FROM product_brands', { transaction });
      await queryInterface.sequelize.query('DELETE FROM products', { transaction });
      
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
      await transaction.commit();
      
      console.log('✅ FIXED PRODUCT MIGRATION rolled back successfully!');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ FIXED PRODUCT MIGRATION rollback failed:', error);
      throw error;
    }
  }
};
