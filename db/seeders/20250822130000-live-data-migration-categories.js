'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    
    try {
      console.log('🚀 Starting LIVE DATA MIGRATION: Categories from old database...');
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();
      
      // Step 1: Create temporary table for category data
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE temp_categories (
          old_term_id BIGINT,
          old_taxonomy_id BIGINT,
          name VARCHAR(255),
          slug VARCHAR(255),
          description TEXT,
          parent_id INT DEFAULT NULL,
          logo_url TEXT,
          createdAt DATETIME,
          updatedAt DATETIME,
          old_parent_term_id BIGINT DEFAULT NULL
        )
      `, { transaction });

      // Step 2: Extract categories from old database
      console.log('📥 Fetching categories from old database...');
      const categories = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          t.term_id, 
          tt.term_taxonomy_id, 
          t.name, 
          t.slug, 
          tt.description, 
          tt.parent
        FROM vh_terms t
        JOIN vh_term_taxonomy tt ON t.term_id = tt.term_id
        WHERE tt.taxonomy = 'product_cat'
      `);

      console.log(`✅ Found ${categories.length} categories to migrate`);

      // Step 3: Insert categories into temporary table
      console.log('📋 Inserting categories into temporary table...');
      for (const category of categories) {
        await queryInterface.sequelize.query(`
          INSERT INTO temp_categories (old_term_id, old_taxonomy_id, name, slug, description, parent_id, createdAt, updatedAt, old_parent_term_id)
          VALUES (?, ?, ?, ?, ?, NULL, NOW(), NOW(), ?)
        `, {
          replacements: [
            category.term_id,
            category.term_taxonomy_id,
            category.name,
            category.slug,
            category.description,
            category.parent
          ],
          transaction
        });
      }

      // Step 4: Create a mapping table for parent-child relationships
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE category_mapping (
          old_term_id BIGINT,
          new_category_id INT
        )
      `, { transaction });

             // Step 5: Insert categories and capture mapping (handle duplicate slugs)
       console.log('💾 Inserting categories into new database...');
       await queryInterface.sequelize.query(`
         INSERT IGNORE INTO categories (name, description, slug, parent_id, logo_url, createdAt, updatedAt)
         SELECT 
           tc.name, 
           tc.description, 
           tc.slug, 
           NULL as parent_id, 
           tc.logo_url, 
           tc.createdAt, 
           tc.updatedAt
         FROM temp_categories tc
         ORDER BY tc.old_parent_term_id ASC, tc.name ASC
       `, { transaction });

      // Step 6: Populate category mapping table
      await queryInterface.sequelize.query(`
        INSERT INTO category_mapping (old_term_id, new_category_id)
        SELECT tc.old_term_id, c.id
        FROM temp_categories tc
        JOIN categories c ON tc.slug = c.slug
      `, { transaction });

      // Step 7: Update parent-child relationships
      console.log('🔗 Setting up parent-child relationships...');
      await queryInterface.sequelize.query(`
        UPDATE categories c
        JOIN temp_categories tc ON c.slug = tc.slug
        JOIN category_mapping cm ON tc.old_parent_term_id = cm.old_term_id
        SET c.parent_id = cm.new_category_id
        WHERE tc.old_parent_term_id IS NOT NULL
      `, { transaction });

      // Step 8: Extract category images from old database with actual URLs
      console.log('🖼️ Fetching category images from old database...');
      const categoryImages = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          tm.term_id, 
          tm.meta_value as attachment_id,
          p.guid as image_url,
          p.post_title as image_title
        FROM vh_termmeta tm
        LEFT JOIN vh_posts p ON p.ID = CAST(tm.meta_value AS UNSIGNED) AND p.post_type = 'attachment'
        WHERE tm.meta_key IN ('thumbnail_id', 'product_cat_thumbnail_id', 'category_thumbnail_id')
        AND tm.meta_value IS NOT NULL
        AND tm.meta_value != ''
      `);

      console.log(`✅ Found ${categoryImages.length} category images to migrate`);

      // Update category images in temporary table with actual URLs
      for (const image of categoryImages) {
        const imageUrl = image.image_url || null;
        await queryInterface.sequelize.query(`
          UPDATE temp_categories 
          SET logo_url = ? 
          WHERE old_term_id = ?
        `, {
          replacements: [imageUrl, image.term_id],
          transaction
        });
      }

      // Update categories with logo URLs
      await queryInterface.sequelize.query(`
        UPDATE categories c
        JOIN temp_categories tc ON c.slug = tc.slug
        SET c.logo_url = tc.logo_url
        WHERE tc.logo_url IS NOT NULL
      `, { transaction });

      // Log categories with images
      const [categoriesWithImages] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM categories WHERE logo_url IS NOT NULL
      `, { transaction });
      console.log(`🖼️ Categories with images: ${categoriesWithImages[0].count}`);

      // Show sample categories with images
      const [sampleCategoriesWithImages] = await queryInterface.sequelize.query(`
        SELECT name, slug, logo_url 
        FROM categories 
        WHERE logo_url IS NOT NULL 
        LIMIT 5
      `, { transaction });
      
      if (sampleCategoriesWithImages.length > 0) {
        console.log('📸 Sample categories with images:');
        sampleCategoriesWithImages.forEach(cat => {
          console.log(`   - ${cat.name} (${cat.slug}): ${cat.logo_url}`);
        });
      }

      // Enhanced verification: Check if images are correctly mapped
      console.log('🔍 Verifying category-image mapping...');
      
      // Check how many categories have images vs total categories
      const [totalCategories] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM categories
      `, { transaction });
      
      const [categoriesWithImagesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM categories WHERE logo_url IS NOT NULL
      `, { transaction });
      
      console.log(`📊 Category-Image Mapping Summary:`);
      console.log(`   - Total categories: ${totalCategories[0].count}`);
      console.log(`   - Categories with images: ${categoriesWithImagesCount[0].count}`);
      console.log(`   - Categories without images: ${totalCategories[0].count - categoriesWithImagesCount[0].count}`);
      
      // Cross-verify with old database data
      const oldDbImageCount = await crossServerMigration.fetchFromOldDb(`
        SELECT COUNT(*) as count
        FROM vh_termmeta tm
        JOIN vh_term_taxonomy tt ON tm.term_id = tt.term_id
        WHERE tt.taxonomy = 'product_cat'
        AND tm.meta_key IN ('thumbnail_id', 'product_cat_thumbnail_id', 'category_thumbnail_id')
        AND tm.meta_value IS NOT NULL
        AND tm.meta_value != ''
      `);
      
      console.log(`🔍 Cross-Verification:`);
      console.log(`   - Images found in old DB: ${oldDbImageCount[0].count}`);
      console.log(`   - Images migrated to new DB: ${categoriesWithImagesCount[0].count}`);
      
      if (oldDbImageCount[0].count === categoriesWithImagesCount[0].count) {
        console.log(`✅ Perfect match! All category images migrated successfully.`);
      } else {
        console.log(`⚠️ Mismatch detected. Some images may not have been migrated properly.`);
      }
      
      // Show detailed mapping verification
      const [detailedMapping] = await queryInterface.sequelize.query(`
        SELECT 
          c.name as category_name,
          c.slug as category_slug,
          CASE 
            WHEN c.logo_url IS NOT NULL THEN '✅ Has Image'
            ELSE '❌ No Image'
          END as image_status,
          c.logo_url as image_url
        FROM categories c
        ORDER BY c.name ASC
        LIMIT 10
      `, { transaction });
      
      if (detailedMapping.length > 0) {
        console.log('📋 Detailed Category-Image Mapping (First 10):');
        detailedMapping.forEach(cat => {
          console.log(`   - ${cat.category_name} (${cat.category_slug}): ${cat.image_status}`);
          if (cat.image_url) {
            console.log(`     Image: ${cat.image_url}`);
          }
        });
      }

      // Step 9: Create product-category relationships
      console.log('🔗 Fetching product-category relationships from old database...');
      const productCategories = await crossServerMigration.fetchFromOldDb(`
        SELECT DISTINCT 
          tr.object_id as product_id, 
          tt.term_id,
          tt.count
        FROM vh_term_relationships tr
        JOIN vh_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
        WHERE tt.taxonomy = 'product_cat'
      `);

             // Insert product-category relationships (handle cases where categories might not exist)
       console.log(`🔗 Inserting ${productCategories.length} product-category relationships...`);
       for (const pc of productCategories) {
         await queryInterface.sequelize.query(`
           INSERT IGNORE INTO product_categories (product_id, category_id, is_primary)
           SELECT ?, c.id, 0
           FROM categories c
           JOIN temp_categories tc ON c.slug = tc.slug
           WHERE tc.old_term_id = ?
           AND ? IN (SELECT id FROM products)
           AND c.id IS NOT NULL
         `, {
           replacements: [pc.product_id, pc.term_id, pc.product_id],
           transaction
         });
       }

      // Step 10: Clean up temporary tables
      await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_categories`, { transaction });
      await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS category_mapping`, { transaction });

      // Step 11: Verification queries
      const [categoriesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM categories
      `, { transaction });

      const [productCategoriesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_categories
      `, { transaction });

      console.log('🎉 LIVE DATA MIGRATION: Categories completed successfully!');
      console.log(`📊 Categories migrated: ${categoriesCount[0].count}`);
      console.log(`🔗 Product-category relationships: ${productCategoriesCount[0].count}`);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      await transaction.commit();
    } catch (error) {
      await crossServerMigration.closeOldDbConnection();
      await transaction.rollback();
      console.error('❌ LIVE DATA MIGRATION: Categories failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back LIVE DATA MIGRATION: Categories...');
      
      await queryInterface.sequelize.query(`DELETE FROM product_categories`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM categories`, { transaction });
      
      await transaction.commit();
      console.log('✅ LIVE DATA MIGRATION: Categories rolled back successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ LIVE DATA MIGRATION: Categories rollback failed:', error);
      throw error;
    }
  }
};
