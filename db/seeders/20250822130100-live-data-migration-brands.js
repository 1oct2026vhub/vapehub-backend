'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    
    try {
      console.log('🚀 Starting LIVE DATA MIGRATION: Brands from old database...');
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();
      
      // Step 1: Create temporary table for brands
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE temp_brands (
          old_term_id BIGINT,
          name VARCHAR(255),
          slug VARCHAR(255),
          description TEXT,
          logo_url TEXT,
          createdAt DATETIME,
          updatedAt DATETIME
        )
      `, { transaction });

      // Step 2: Extract brands from old database
      console.log('📥 Fetching brands from old database...');
      const brands = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          t.term_id, 
          t.name, 
          t.slug, 
          tt.description
        FROM vh_terms t
        JOIN vh_term_taxonomy tt ON t.term_id = tt.term_id
        WHERE tt.taxonomy = 'pwb-brand'
      `);

      console.log(`✅ Found ${brands.length} brands to migrate`);

      // Step 3: Insert brands into temporary table
      console.log('📋 Inserting brands into temporary table...');
      for (const brand of brands) {
        await queryInterface.sequelize.query(`
          INSERT INTO temp_brands (old_term_id, name, slug, description, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, NOW(), NOW())
        `, {
          replacements: [
            brand.term_id,
            brand.name,
            brand.slug,
            brand.description
          ],
          transaction
        });
      }

      // Step 4: Extract brand logos from old database with actual URLs
      console.log('🖼️ Fetching brand logos from old database...');
      
      // First, let's check what taxonomies have brand logos
      const brandTaxonomiesWithLogos = await crossServerMigration.fetchFromOldDb(`
        SELECT DISTINCT tt.taxonomy, COUNT(*) as count
        FROM vh_termmeta tm
        JOIN vh_term_taxonomy tt ON tm.term_id = tt.term_id
        WHERE tm.meta_key IN ('pwb_brand_logo', 'brand_logo', 'brand_image', 'thumbnail_id')
        AND tm.meta_value IS NOT NULL
        AND tm.meta_value != ''
        GROUP BY tt.taxonomy
      `);
      
      console.log('🔍 Brand taxonomies with logos:');
      brandTaxonomiesWithLogos.forEach(tax => {
        console.log(`   - ${tax.taxonomy}: ${tax.count} logos`);
      });
      
      // Check if pwb-brand taxonomy has any meta data at all
      const brandMetaData = await crossServerMigration.fetchFromOldDb(`
        SELECT DISTINCT tm.meta_key, COUNT(*) as count
        FROM vh_termmeta tm
        JOIN vh_term_taxonomy tt ON tm.term_id = tt.term_id
        WHERE tt.taxonomy = 'pwb-brand'
        GROUP BY tm.meta_key
        ORDER BY count DESC
      `);
      
      console.log('🔍 Meta keys for pwb-brand taxonomy:');
      brandMetaData.forEach(meta => {
        console.log(`   - ${meta.meta_key}: ${meta.count} entries`);
      });
      
      // Check if there are any brand logos in pwb-brand taxonomy
      const brandLogos = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          tm.term_id, 
          tt.taxonomy,
          t.name as brand_name,
          tm.meta_key,
          tm.meta_value as attachment_id,
          p.guid as image_url,
          p.post_title as image_title
        FROM vh_termmeta tm
        JOIN vh_term_taxonomy tt ON tm.term_id = tt.term_id
        JOIN vh_terms t ON tt.term_id = t.term_id
        LEFT JOIN vh_posts p ON p.ID = CAST(tm.meta_value AS UNSIGNED) AND p.post_type = 'attachment'
        WHERE tt.taxonomy = 'pwb-brand'
        AND tm.meta_value IS NOT NULL
        AND tm.meta_value != ''
        AND tm.meta_value != '0'
        AND p.guid IS NOT NULL
      `);

      console.log(`✅ Found ${brandLogos.length} brand logos to migrate`);

      // Debug: Check what term IDs are in temp_brands
      const [tempBrandTermIds] = await queryInterface.sequelize.query(`
        SELECT old_term_id, name FROM temp_brands ORDER BY old_term_id LIMIT 10
      `, { transaction });
      console.log('🔍 Sample term IDs in temp_brands:');
      tempBrandTermIds.forEach(brand => {
        console.log(`   - Term ID: ${brand.old_term_id}, Name: ${brand.name}`);
      });
      
      // Debug: Check what brand names are in brand logos
      console.log('🔍 Sample brand names in brand logos:');
      brandLogos.slice(0, 10).forEach(logo => {
        console.log(`   - Brand: ${logo.brand_name}, Meta Key: ${logo.meta_key}, Image URL: ${logo.image_url || 'NULL'}`);
      });
      
      // Update brand logos in temporary table by matching brand names
      console.log('🔄 Updating brand logos in temporary table...');
      let updatedCount = 0;
      for (const logo of brandLogos) {
        const imageUrl = logo.image_url || null;
        
        const [updateResult] = await queryInterface.sequelize.query(`
          UPDATE temp_brands 
          SET logo_url = ? 
          WHERE name = ?
        `, {
          replacements: [imageUrl, logo.brand_name],
          transaction
        });
        
        if (updateResult.affectedRows > 0) {
          updatedCount++;
          console.log(`   ✅ Updated Brand: ${logo.brand_name}, Image URL: ${imageUrl || 'NULL'}`);
        } else {
          console.log(`   ❌ No match found for Brand: ${logo.brand_name}`);
        }
      }
      console.log(`📊 Successfully updated ${updatedCount} brand logos`);
      
      // Check how many brands have logos in temp table
      const [tempBrandsWithLogos] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM temp_brands WHERE logo_url IS NOT NULL
      `, { transaction });
      console.log(`📊 Brands with logos in temp table: ${tempBrandsWithLogos[0].count}`);

                   // Step 5: Insert brands into new database (handle duplicate slugs and preserve logos)
      console.log('💾 Inserting brands into new database...');
      await queryInterface.sequelize.query(`
        INSERT INTO brands (name, description, slug, logo_url, createdAt, updatedAt)
        SELECT 
          name, 
          description, 
          slug, 
          logo_url, 
          createdAt, 
          updatedAt
        FROM temp_brands
        ORDER BY name ASC
        ON DUPLICATE KEY UPDATE
          logo_url = VALUES(logo_url),
          updatedAt = NOW()
      `, { transaction });
      
      // Check how many brands have logos after insertion
      const [brandsWithLogosAfterInsert] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM brands WHERE logo_url IS NOT NULL
      `, { transaction });
      console.log(`📊 Brands with logos after insertion: ${brandsWithLogosAfterInsert[0].count}`);

      // Step 6: Create product-brand relationships
      console.log('🔗 Fetching product-brand relationships from old database...');
      const productBrands = await crossServerMigration.fetchFromOldDb(`
        SELECT DISTINCT 
          tr.object_id as product_id, 
          tt.term_id,
          tt.count
        FROM vh_term_relationships tr
        JOIN vh_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
        WHERE tt.taxonomy = 'pwb-brand'
      `);

             // Insert product-brand relationships (handle cases where brands might not exist)
       console.log(`🔗 Inserting ${productBrands.length} product-brand relationships...`);
       for (const pb of productBrands) {
         await queryInterface.sequelize.query(`
           INSERT IGNORE INTO product_brands (product_id, brand_id, is_primary)
           SELECT ?, b.id, 0
           FROM brands b
           JOIN temp_brands tb ON b.slug = tb.slug
           WHERE tb.old_term_id = ?
           AND ? IN (SELECT id FROM products)
           AND b.id IS NOT NULL
         `, {
           replacements: [pb.product_id, pb.term_id, pb.product_id],
           transaction
         });
       }

      // Step 7: Enhanced verification and logging
      console.log('🔍 Verifying brand-image mapping...');
      
      // Check how many brands have images vs total brands
      const [totalBrands] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM brands
      `, { transaction });
      
      const [brandsWithImagesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM brands WHERE logo_url IS NOT NULL
      `, { transaction });
      
      console.log(`📊 Brand-Image Mapping Summary:`);
      console.log(`   - Total brands: ${totalBrands[0].count}`);
      console.log(`   - Brands with images: ${brandsWithImagesCount[0].count}`);
      console.log(`   - Brands without images: ${totalBrands[0].count - brandsWithImagesCount[0].count}`);
      
      // Cross-verify with old database data
      const oldDbImageCount = await crossServerMigration.fetchFromOldDb(`
        SELECT COUNT(*) as count
        FROM vh_termmeta tm
        JOIN vh_term_taxonomy tt ON tm.term_id = tt.term_id
        WHERE tt.taxonomy = 'pwb-brand'
        AND tm.meta_key IN ('pwb_brand_logo', 'brand_logo', 'brand_image', 'thumbnail_id')
        AND tm.meta_value IS NOT NULL
        AND tm.meta_value != ''
        AND tm.meta_value != '0'
      `);
      
      console.log(`🔍 Cross-Verification:`);
      console.log(`   - Images found in old DB: ${oldDbImageCount[0].count}`);
      console.log(`   - Images migrated to new DB: ${brandsWithImagesCount[0].count}`);
      
      if (oldDbImageCount[0].count === brandsWithImagesCount[0].count) {
        console.log(`✅ Perfect match! All brand images migrated successfully.`);
      } else {
        console.log(`⚠️ Mismatch detected. Some images may not have been migrated properly.`);
      }
      
      // Show sample brands with images
      const [sampleBrandsWithImages] = await queryInterface.sequelize.query(`
        SELECT name, slug, logo_url 
        FROM brands 
        WHERE logo_url IS NOT NULL 
        LIMIT 5
      `, { transaction });
      
      if (sampleBrandsWithImages.length > 0) {
        console.log('📸 Sample brands with images:');
        sampleBrandsWithImages.forEach(brand => {
          console.log(`   - ${brand.name} (${brand.slug}): ${brand.logo_url}`);
        });
      }
      
      // Show detailed mapping verification
      const [detailedMapping] = await queryInterface.sequelize.query(`
        SELECT 
          b.name as brand_name,
          b.slug as brand_slug,
          CASE 
            WHEN b.logo_url IS NOT NULL THEN '✅ Has Image'
            ELSE '❌ No Image'
          END as image_status,
          b.logo_url as image_url
        FROM brands b
        ORDER BY b.name ASC
        LIMIT 10
      `, { transaction });
      
      if (detailedMapping.length > 0) {
        console.log('📋 Detailed Brand-Image Mapping (First 10):');
        detailedMapping.forEach(brand => {
          console.log(`   - ${brand.brand_name} (${brand.brand_slug}): ${brand.image_status}`);
          if (brand.image_url) {
            console.log(`     Image: ${brand.image_url}`);
          }
        });
      }

      // Step 8: Clean up temporary table
      await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_brands`, { transaction });

      // Step 9: Final verification queries
      const [brandsCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM brands
      `, { transaction });

      const [productBrandsCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_brands
      `, { transaction });

      console.log('🎉 LIVE DATA MIGRATION: Brands completed successfully!');
      console.log(`📊 Brands migrated: ${brandsCount[0].count}`);
      console.log(`🔗 Product-brand relationships: ${productBrandsCount[0].count}`);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      await transaction.commit();
    } catch (error) {
      await crossServerMigration.closeOldDbConnection();
      await transaction.rollback();
      console.error('❌ LIVE DATA MIGRATION: Brands failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back LIVE DATA MIGRATION: Brands...');
      
      await queryInterface.sequelize.query(`DELETE FROM product_brands`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM brands`, { transaction });
      
      await transaction.commit();
      console.log('✅ LIVE DATA MIGRATION: Brands rolled back successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ LIVE DATA MIGRATION: Brands rollback failed:', error);
      throw error;
    }
  }
};
