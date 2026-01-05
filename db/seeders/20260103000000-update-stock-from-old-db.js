'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

/**
 * Stock Update Seeder
 * 
 * This seeder updates stock quantities for existing product variants
 * from the old database without creating new records.
 * It only updates the 'stock' column in product_variants table.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    
    try {
      console.log('🚀 Starting Stock Update Migration from old database...');
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();
      
      // Step 1: Get all existing variants from new database
      console.log('📊 Step 1: Fetching existing product variants from new database...');
      const existingVariants = await queryInterface.sequelize.query(`
        SELECT id, product_id, slug, stock as current_stock
        FROM product_variants
        WHERE deleted_at IS NULL
        ORDER BY id ASC
      `, {
        type: Sequelize.QueryTypes.SELECT,
        transaction
      });
      
      console.log(`✅ Found ${existingVariants.length} existing variants to update\n`);
      
      if (existingVariants.length === 0) {
        console.log('⚠️  No variants found in new database. Skipping stock update.');
        await crossServerMigration.closeOldDbConnection();
        await transaction.commit();
        return;
      }
      
      // Step 2: Get variant IDs to fetch stock from old database
      const variantIds = existingVariants.map(v => v.id);
      console.log(`📥 Step 2: Fetching stock data from old database for ${variantIds.length} variants...`);
      
      // Fetch stock data from old database in batches to avoid SQL query size limits
      const BATCH_SIZE = 1000;
      const stockMap = {};
      
      for (let i = 0; i < variantIds.length; i += BATCH_SIZE) {
        const batch = variantIds.slice(i, i + BATCH_SIZE);
        
        const variantStockData = await crossServerMigration.fetchFromOldDb(`
          SELECT 
            pm.post_id as variant_id,
            CAST(COALESCE(NULLIF(pm.meta_value, ''), '0') AS DECIMAL(10,0)) as stock_quantity,
            pm_stock_status.meta_value as stock_status
          FROM vh_postmeta pm
          LEFT JOIN vh_postmeta pm_stock_status ON pm.post_id = pm_stock_status.post_id 
            AND pm_stock_status.meta_key = '_stock_status'
          WHERE pm.meta_key = '_stock'
            AND pm.post_id IN (${batch.join(',')})
          ORDER BY pm.post_id ASC
        `);
        
        variantStockData.forEach(item => {
          if (item.variant_id) {
            stockMap[item.variant_id] = {
              stock: parseInt(item.stock_quantity) || 0,
              stock_status: item.stock_status === 'instock' ? 'in_stock' : 'out_of_stock'
            };
          }
        });
      }
      
      console.log(`✅ Found stock data for ${Object.keys(stockMap).length} variants in old database\n`);
      
      // Step 3: Update stock for each variant
      console.log('💾 Step 3: Updating stock for variants...');
      
      let updatedCount = 0;
      let skippedCount = 0;
      let unchangedCount = 0;
      
      for (const variant of existingVariants) {
        try {
          const stockData = stockMap[variant.id];
          
          if (!stockData) {
            // No stock data found in old database - skip this variant
            skippedCount++;
            if (skippedCount <= 10) {
              console.log(`  ⚠️  Skipping variant ${variant.id} (${variant.slug}) - no stock data in old DB`);
            }
            continue;
          }
          
          const newStock = stockData.stock;
          const newStockStatus = stockData.stock_status;
          
          // Check if stock actually changed
          if (variant.current_stock === newStock) {
            unchangedCount++;
            continue;
          }
          
          // Update variant stock
          await queryInterface.sequelize.query(`
            UPDATE product_variants
            SET 
              stock = ?,
              stock_status = ?,
              updated_at = NOW(),
              updated_by = 1
            WHERE id = ?
          `, {
            replacements: [newStock, newStockStatus, variant.id],
            transaction
          });
          
          updatedCount++;
          
          if (updatedCount % 100 === 0) {
            console.log(`  📈 Updated ${updatedCount} variants...`);
          }
          
        } catch (error) {
          console.error(`❌ Error updating variant ${variant.id}:`, error.message);
          skippedCount++;
        }
      }
      
      // Step 4: Final verification
      console.log('\n🔍 Step 4: Final verification...');
      
      const [totalVariants] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_variants WHERE deleted_at IS NULL
      `, {
        type: Sequelize.QueryTypes.SELECT,
        transaction
      });
      
      const [variantsWithStock] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count 
        FROM product_variants 
        WHERE deleted_at IS NULL AND stock > 0
      `, {
        type: Sequelize.QueryTypes.SELECT,
        transaction
      });
      
      const [totalStock] = await queryInterface.sequelize.query(`
        SELECT SUM(stock) as total 
        FROM product_variants 
        WHERE deleted_at IS NULL
      `, {
        type: Sequelize.QueryTypes.SELECT,
        transaction
      });
      
      // Show sample of updated variants
      const sampleVariants = await queryInterface.sequelize.query(`
        SELECT 
          id, product_id, slug, stock, stock_status
        FROM product_variants
        WHERE deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 5
      `, {
        type: Sequelize.QueryTypes.SELECT,
        transaction
      });
      
      console.log('\n📊 STOCK UPDATE SUMMARY:');
      console.log(`   • Variants processed: ${existingVariants.length}`);
      console.log(`   • Variants updated: ${updatedCount}`);
      console.log(`   • Variants unchanged: ${unchangedCount}`);
      console.log(`   • Variants skipped: ${skippedCount}`);
      console.log(`   • Total variants in DB: ${totalVariants.count}`);
      console.log(`   • Variants with stock > 0: ${variantsWithStock.count}`);
      console.log(`   • Total stock quantity: ${totalStock.total || 0}`);
      
      console.log('\n📋 Sample updated variants:');
      sampleVariants.forEach(variant => {
        console.log(`   • Variant ID: ${variant.id}, Product: ${variant.product_id}, Stock: ${variant.stock}, Status: ${variant.stock_status}`);
      });
      
      await crossServerMigration.closeOldDbConnection();
      await transaction.commit();
      
      console.log('\n🎉 Stock update migration completed successfully!');
      console.log('✅ Stock quantities updated from old database');
      console.log('✅ Only existing variants were updated (no new records created)');
      
    } catch (error) {
      console.error('❌ Stock update migration failed:', error);
      await transaction.rollback();
      if (crossServerMigration.oldDbConnection) {
        await crossServerMigration.closeOldDbConnection();
      }
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('⚠️  Stock update migration cannot be rolled back automatically.');
    console.log('💡 Stock values would need to be restored from backup or re-migrated.');
    // No rollback needed as this only updates existing data
  }
};

