'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    
    try {
      console.log('🚀 Starting Product Brands Migration...\n');
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();
      
      // Step 1: Clear existing product brands data
      console.log('🧹 Step 1: Clearing existing product brands data...');
      await queryInterface.sequelize.query(`DELETE FROM product_brands`, { transaction });
      console.log('✅ Cleared existing product brands data\n');
      
      // Step 2: Fetch product brands from old database
      console.log('📊 Step 2: Fetching product brands from old database...');
      const productBrandsData = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          p.ID as product_id,
          p.post_title as product_title,
          t.term_id as brand_term_id,
          t.name as brand_name,
          t.slug as brand_slug
        FROM vh_posts p
        JOIN vh_term_relationships tr ON p.ID = tr.object_id
        JOIN vh_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
        JOIN vh_terms t ON tt.term_id = t.term_id
        WHERE p.post_type = 'product'
          AND p.post_status = 'publish'
          AND tt.taxonomy = 'pwb-brand'
        ORDER BY p.ID, t.term_id
      `);
      
      console.log(`📈 Found ${productBrandsData.length} product brands to migrate\n`);
      
      // Step 3: Process and insert product brands
      console.log('⚙️ Step 3: Processing and inserting product brands...');
      let insertedCount = 0;
      let skippedCount = 0;
      
      for (const brandData of productBrandsData) {
        try {
          // Check if product exists in new database (using exact ID)
          const productExists = await queryInterface.sequelize.query(`
            SELECT id FROM products WHERE id = ?
          `, {
            replacements: [brandData.product_id],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });
          
          if (productExists.length === 0) {
            console.log(`⚠️ Skipping brand for product ${brandData.product_id} - product not found in new database`);
            skippedCount++;
            continue;
          }
          
          // Get brand_id from new database using brand_slug
          const brand = await queryInterface.sequelize.query(`
            SELECT id FROM brands WHERE slug = ?
          `, {
            replacements: [brandData.brand_slug],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });
          
          if (brand.length === 0) {
            console.log(`⚠️ Skipping brand ${brandData.brand_slug} for product ${brandData.product_id} - brand not found in new database`);
            skippedCount++;
            continue;
          }
          
          // Check if this product-brand relationship already exists
          const existingRelation = await queryInterface.sequelize.query(`
            SELECT id FROM product_brands WHERE product_id = ? AND brand_id = ?
          `, {
            replacements: [brandData.product_id, brand[0].id],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });
          
          if (existingRelation.length > 0) {
            // Skip duplicate relationship
            continue;
          }
          
          // Insert product brand
          await queryInterface.sequelize.query(`
            INSERT INTO product_brands (
              product_id, brand_id, is_primary, created_at, updated_at
            ) VALUES (?, ?, ?, NOW(), NOW())
          `, {
            replacements: [
              brandData.product_id,        // Exact product ID from old DB
              brand[0].id,                // Brand ID from new DB
              true                        // is_primary = true (default)
            ],
            transaction
          });
          
          insertedCount++;
          
          if (insertedCount % 100 === 0) {
            console.log(`  📈 Processed ${insertedCount} product brands...`);
          }
          
        } catch (error) {
          console.error(`❌ Error inserting product brand for product ${brandData.product_id}:`, error.message);
          skippedCount++;
        }
      }
      
      console.log(`\n✅ Product brands inserted: ${insertedCount}`);
      console.log(`⚠️ Product brands skipped: ${skippedCount}\n`);
      
      // Step 4: Final verification
      console.log('🔍 Step 4: Final verification...\n');
      
      const [totalRecords] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_brands
      `, { transaction });
      
      const [uniqueProducts] = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT product_id) as count FROM product_brands
      `, { transaction });
      
      const [uniqueBrands] = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT brand_id) as count FROM product_brands
      `, { transaction });
      
      const [sampleBrands] = await queryInterface.sequelize.query(`
        SELECT 
          pb.product_id,
          p.name as product_name,
          b.name as brand_name
        FROM product_brands pb
        JOIN products p ON pb.product_id = p.id
        JOIN brands b ON pb.brand_id = b.id
        ORDER BY pb.product_id
        LIMIT 5
      `, { transaction });
      
      console.log('📊 MIGRATION SUMMARY:');
      console.log(`   • Product brands inserted: ${insertedCount}`);
      console.log(`   • Product brands skipped: ${skippedCount}`);
      console.log(`   • Total records in table: ${totalRecords[0].count}`);
      console.log(`   • Unique products with brands: ${uniqueProducts[0].count}`);
      console.log(`   • Unique brands used: ${uniqueBrands[0].count}\n`);
      
      console.log('📋 Sample migrated product brands:');
      sampleBrands.forEach(brand => {
        console.log(`   • Product: ${brand.product_id} (${brand.product_name}), Brand: ${brand.brand_name}`);
      });
      
      // Close old database connection
      await crossServerMigration.closeOldDbConnection();
      
      await transaction.commit();
      
    } catch (error) {
      await crossServerMigration.closeOldDbConnection();
      await transaction.rollback();
      console.error('❌ PRODUCT BRANDS MIGRATION failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back PRODUCT BRANDS MIGRATION...');
      
      await queryInterface.sequelize.query(`DELETE FROM product_brands`, { transaction });
      
      await transaction.commit();
      console.log('✅ PRODUCT BRANDS MIGRATION rolled back successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ PRODUCT BRANDS MIGRATION rollback failed:', error);
      throw error;
    }
  }
};
