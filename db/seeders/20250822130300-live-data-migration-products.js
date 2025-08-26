'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    
    try {
      console.log('🚀 Starting LIVE DATA MIGRATION: Products from old database...');
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();
      
      // Step 1: Create temporary tables for products
      await queryInterface.sequelize.query(`
        CREATE TEMPORARY TABLE temp_products (
          old_post_id BIGINT,
          name VARCHAR(255),
          slug VARCHAR(255),
          description TEXT,
          price DECIMAL(10,2),
          discount_price DECIMAL(10,2),
          stock_quantity INT,
          status ENUM('draft', 'published', 'archived') DEFAULT 'draft',
          product_type VARCHAR(50),
          is_variable BOOLEAN DEFAULT FALSE,
          createdAt DATETIME,
          updatedAt DATETIME
        )
      `, { transaction });

             await queryInterface.sequelize.query(`
         CREATE TEMPORARY TABLE temp_variants (
           old_variation_id BIGINT,
           parent_product_id BIGINT,
           name VARCHAR(255),
           slug VARCHAR(255),
           price DECIMAL(10,2),
           regular_price DECIMAL(10,2),
           discount_price DECIMAL(10,2),
           stock INT DEFAULT 0,
           stock_status ENUM('in_stock', 'out_of_stock', 'backorder') DEFAULT 'in_stock',
           weight DECIMAL(8,2),
           length DECIMAL(8,2),
           width DECIMAL(8,2),
           height DECIMAL(8,2),
           description TEXT,
           barcode VARCHAR(100),
           status ENUM('active', 'inactive') DEFAULT 'active',
           created_at DATETIME,
           updated_at DATETIME
         )
       `, { transaction });

      // Step 2: Extract products from old database
      console.log('📥 Fetching products from old database...');
      const products = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          p.ID,
          p.post_title,
          p.post_name,
          p.post_content,
          CAST(COALESCE(NULLIF(pm_price.meta_value, ''), '0') AS DECIMAL(10,2)) as price,
          CAST(COALESCE(NULLIF(pm_sale_price.meta_value, ''), '0') AS DECIMAL(10,2)) as discount_price,
          CAST(COALESCE(NULLIF(pm_stock.meta_value, ''), '0') AS DECIMAL(10,0)) as stock_quantity,
          p.post_status,
          pm_type.meta_value as product_type,
          p.post_date,
          p.post_modified
        FROM vh_posts p
        LEFT JOIN vh_postmeta pm_price ON p.ID = pm_price.post_id AND pm_price.meta_key = '_regular_price'
        LEFT JOIN vh_postmeta pm_sale_price ON p.ID = pm_sale_price.post_id AND pm_sale_price.meta_key = '_sale_price'
        LEFT JOIN vh_postmeta pm_stock ON p.ID = pm_stock.post_id AND pm_stock.meta_key = '_stock'
        LEFT JOIN vh_postmeta pm_type ON p.ID = pm_type.post_id AND pm_type.meta_key = '_product_type'
        WHERE p.post_type = 'product'
        AND p.post_status IN ('publish', 'draft', 'private')
        AND p.post_name IS NOT NULL AND p.post_name != ''
      `);

      console.log(`✅ Found ${products.length} products to migrate`);

      // Step 3: Insert products into temporary table
      console.log('📋 Inserting products into temporary table...');
      for (const product of products) {
        await queryInterface.sequelize.query(`
          INSERT INTO temp_products (old_post_id, name, slug, description, price, discount_price, stock_quantity, status, product_type, is_variable, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, {
          replacements: [
            product.ID,
            product.post_title,
            product.post_name,
            product.post_content,
            product.price,
            product.discount_price,
            product.stock_quantity,
            product.post_status === 'publish' ? 'published' : product.post_status === 'draft' ? 'draft' : 'archived',
            product.product_type,
            product.product_type === 'variable',
            product.post_date,
            product.post_modified
          ],
          transaction
        });
      }

      // Step 4: Extract product variations from old database
      console.log('📥 Fetching product variations from old database...');
      const variants = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          p.ID as variation_id,
          p.post_parent as parent_product_id,
          p.post_title,
          SUBSTRING(p.post_name, 1, 100) as post_name,
          CAST(COALESCE(NULLIF(pm_price.meta_value, ''), '0') AS DECIMAL(10,2)) as price,
          CAST(COALESCE(NULLIF(pm_regular_price.meta_value, ''), '0') AS DECIMAL(10,2)) as regular_price,
          CAST(COALESCE(NULLIF(pm_sale_price.meta_value, ''), '0') AS DECIMAL(10,2)) as discount_price,
          CAST(COALESCE(NULLIF(pm_stock.meta_value, ''), '0') AS DECIMAL(10,0)) as stock,
          pm_stock_status.meta_value as stock_status,
          CAST(COALESCE(NULLIF(pm_weight.meta_value, ''), '0') AS DECIMAL(8,2)) as weight,
          CAST(COALESCE(NULLIF(pm_length.meta_value, ''), '0') AS DECIMAL(8,2)) as length,
          CAST(COALESCE(NULLIF(pm_width.meta_value, ''), '0') AS DECIMAL(8,2)) as width,
          CAST(COALESCE(NULLIF(pm_height.meta_value, ''), '0') AS DECIMAL(8,2)) as height,
          p.post_content as description,
          pm_barcode.meta_value as barcode,
          p.post_status,
          p.post_date,
          p.post_modified
        FROM vh_posts p
        LEFT JOIN vh_postmeta pm_price ON p.ID = pm_price.post_id AND pm_price.meta_key = '_price'
        LEFT JOIN vh_postmeta pm_regular_price ON p.ID = pm_regular_price.post_id AND pm_regular_price.meta_key = '_regular_price'
        LEFT JOIN vh_postmeta pm_sale_price ON p.ID = pm_sale_price.post_id AND pm_sale_price.meta_key = '_sale_price'
        LEFT JOIN vh_postmeta pm_stock ON p.ID = pm_stock.post_id AND pm_stock.meta_key = '_stock'
        LEFT JOIN vh_postmeta pm_stock_status ON p.ID = pm_stock_status.post_id AND pm_stock_status.meta_key = '_stock_status'
        LEFT JOIN vh_postmeta pm_weight ON p.ID = pm_weight.post_id AND pm_weight.meta_key = '_weight'
        LEFT JOIN vh_postmeta pm_length ON p.ID = pm_length.post_id AND pm_length.meta_key = '_length'
        LEFT JOIN vh_postmeta pm_width ON p.ID = pm_width.post_id AND pm_width.meta_key = '_width'
        LEFT JOIN vh_postmeta pm_height ON p.ID = pm_height.post_id AND pm_height.meta_key = '_height'
        LEFT JOIN vh_postmeta pm_barcode ON p.ID = pm_barcode.post_id AND pm_barcode.meta_key = '_barcode'
        WHERE p.post_type = 'product_variation'
        AND p.post_status IN ('publish', 'draft', 'private')
      `);

      console.log(`✅ Found ${variants.length} variants to migrate`);

      // Step 5: Insert variants into temporary table
      console.log('📋 Inserting variants into temporary table...');
      for (const variant of variants) {
                 await queryInterface.sequelize.query(`
           INSERT INTO temp_variants (old_variation_id, parent_product_id, name, slug, price, regular_price, discount_price, stock, stock_status, weight, length, width, height, description, barcode, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         `, {
           replacements: [
             variant.variation_id,
             variant.parent_product_id,
             variant.post_title,
             variant.post_name,
             variant.price,
             variant.regular_price,
             variant.discount_price,
             variant.stock,
             variant.stock_status === 'instock' ? 'in_stock' : variant.stock_status === 'outofstock' ? 'out_of_stock' : 'backorder',
             variant.weight,
             variant.length,
             variant.width,
             variant.height,
             variant.description,
             variant.barcode,
             variant.post_status === 'publish' ? 'active' : 'inactive',
             variant.post_date,
             variant.post_modified
           ],
           transaction
         });
      }

             // Step 6: Insert products into new database (handle duplicate slugs)
       console.log('💾 Inserting products into new database...');
       await queryInterface.sequelize.query(`
         INSERT IGNORE INTO products (name, slug, description, price, discount_price, stock_quantity, status, createdAt, updatedAt)
         SELECT 
           name, 
           slug, 
           description, 
           price, 
           discount_price, 
           stock_quantity, 
           status, 
           createdAt, 
           updatedAt
         FROM temp_products
         ORDER BY name ASC
       `, { transaction });

             // Step 7: Insert product variants into new database (handle cases where products might not exist)
       console.log('💾 Inserting product variants into new database...');
               await queryInterface.sequelize.query(`
          INSERT IGNORE INTO product_variants (product_id, slug, price, regular_price, discount_price, stock, stock_status, weight, length, width, height, description, barcode, status, created_at, updated_at)
          SELECT 
            p.id as product_id, 
            tv.slug, 
            tv.price, 
            tv.regular_price, 
            tv.discount_price, 
            tv.stock, 
            tv.stock_status, 
            tv.weight, 
            tv.length, 
            tv.width, 
            tv.height, 
            tv.description, 
            tv.barcode, 
            tv.status, 
            tv.created_at, 
            tv.updated_at
          FROM temp_variants tv
          JOIN temp_products tp ON tv.parent_product_id = tp.old_post_id
          JOIN products p ON tp.slug = p.slug
          WHERE p.id IS NOT NULL
          ORDER BY p.id ASC, tv.slug ASC
        `, { transaction });

                   // Step 8: Extract product images from old database with actual URLs
      console.log('🖼️ Fetching product images from old database...');
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
      `);

                   // Step 9: Insert product images into new database (handle cases where products might not exist)
      console.log(`🖼️ Inserting ${productImages.length} product images...`);
      let productImagesInserted = 0;
      for (const image of productImages) {
        const imageUrl = image.image_url || null;
        if (imageUrl) {
          const [insertResult] = await queryInterface.sequelize.query(`
            INSERT IGNORE INTO product_images (product_id, image_url, is_primary, createdAt, updatedAt)
            SELECT 
              p.id as product_id, 
              ? as image_url, 
              CASE WHEN ? = '_thumbnail_id' THEN 1 ELSE 0 END as is_primary, 
              NOW(), 
              NOW()
            FROM temp_products tp
            JOIN products p ON tp.slug = p.slug
            WHERE tp.old_post_id = ?
            AND p.id IS NOT NULL
          `, {
            replacements: [imageUrl, image.meta_key, image.post_id],
            transaction
          });
          
          if (insertResult.affectedRows > 0) {
            productImagesInserted++;
          }
        }
      }
      console.log(`✅ Successfully inserted ${productImagesInserted} product images with actual URLs`);

                   // Step 10: Extract variant images from old database with actual URLs
      console.log('🖼️ Fetching variant images from old database...');
      const variantImages = await crossServerMigration.fetchFromOldDb(`
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
        AND pm.post_id IN (SELECT ID FROM vh_posts WHERE post_type = 'product_variation')
      `);

                   // Step 11: Insert variant images into new database (handle cases where variants might not exist)
      console.log(`🖼️ Inserting ${variantImages.length} variant images...`);
      let variantImagesInserted = 0;
      for (const image of variantImages) {
        const imageUrl = image.image_url || null;
        if (imageUrl) {
          const [insertResult] = await queryInterface.sequelize.query(`
            INSERT IGNORE INTO product_variant_images (variant_id, image_url, alt_text, sort_order, is_primary, created_at, updated_at)
            SELECT 
              pv.id as variant_id, 
              ? as image_url, 
              NULL as alt_text, 
              0 as sort_order, 
              CASE WHEN ? = '_thumbnail_id' THEN 1 ELSE 0 END as is_primary, 
              NOW(), 
              NOW()
            FROM temp_variants tv
            JOIN product_variants pv ON tv.slug = pv.slug
            WHERE tv.old_variation_id = ?
            AND pv.id IS NOT NULL
          `, {
            replacements: [imageUrl, image.meta_key, image.post_id],
            transaction
          });
          
          if (insertResult.affectedRows > 0) {
            variantImagesInserted++;
          }
        }
      }
      console.log(`✅ Successfully inserted ${variantImagesInserted} variant images with actual URLs`);

      // Step 12: Enhanced verification and logging
      console.log('🔍 Verifying product and variant image mapping...');
      
      // Check how many products have images vs total products
      const [totalProducts] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM products
      `, { transaction });
      
      const [productsWithImagesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT product_id) as count FROM product_images
      `, { transaction });
      
      const [totalVariants] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_variants
      `, { transaction });
      
      const [variantsWithImagesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT variant_id) as count FROM product_variant_images
      `, { transaction });
      
      console.log(`📊 Product-Image Mapping Summary:`);
      console.log(`   - Total products: ${totalProducts[0].count}`);
      console.log(`   - Products with images: ${productsWithImagesCount[0].count}`);
      console.log(`   - Products without images: ${totalProducts[0].count - productsWithImagesCount[0].count}`);
      
      console.log(`📊 Variant-Image Mapping Summary:`);
      console.log(`   - Total variants: ${totalVariants[0].count}`);
      console.log(`   - Variants with images: ${variantsWithImagesCount[0].count}`);
      console.log(`   - Variants without images: ${totalVariants[0].count - variantsWithImagesCount[0].count}`);
      
      // Cross-verify with old database data
      const oldDbProductImageCount = await crossServerMigration.fetchFromOldDb(`
        SELECT COUNT(*) as count
        FROM vh_postmeta pm
        LEFT JOIN vh_posts p ON p.ID = CAST(pm.meta_value AS UNSIGNED) AND p.post_type = 'attachment'
        WHERE pm.meta_key IN ('_thumbnail_id', '_product_image_gallery')
        AND pm.meta_value IS NOT NULL
        AND pm.meta_value != ''
        AND pm.meta_value != '0'
        AND p.guid IS NOT NULL
        AND pm.post_id IN (SELECT ID FROM vh_posts WHERE post_type = 'product')
      `);
      
      const oldDbVariantImageCount = await crossServerMigration.fetchFromOldDb(`
        SELECT COUNT(*) as count
        FROM vh_postmeta pm
        LEFT JOIN vh_posts p ON p.ID = CAST(pm.meta_value AS UNSIGNED) AND p.post_type = 'attachment'
        WHERE pm.meta_key IN ('_thumbnail_id', '_product_image_gallery')
        AND pm.meta_value IS NOT NULL
        AND pm.meta_value != ''
        AND pm.meta_value != '0'
        AND p.guid IS NOT NULL
        AND pm.post_id IN (SELECT ID FROM vh_posts WHERE post_type = 'product_variation')
      `);
      
      console.log(`🔍 Cross-Verification:`);
      console.log(`   - Product images found in old DB: ${oldDbProductImageCount[0].count}`);
      console.log(`   - Product images migrated to new DB: ${productImagesInserted}`);
      console.log(`   - Variant images found in old DB: ${oldDbVariantImageCount[0].count}`);
      console.log(`   - Variant images migrated to new DB: ${variantImagesInserted}`);
      
      // Show sample products with images
      const [sampleProductsWithImages] = await queryInterface.sequelize.query(`
        SELECT 
          p.name as product_name,
          p.slug as product_slug,
          pi.image_url,
          pi.is_primary
        FROM products p
        JOIN product_images pi ON p.id = pi.product_id
        WHERE pi.is_primary = 1
        ORDER BY p.name ASC
        LIMIT 5
      `, { transaction });
      
      if (sampleProductsWithImages.length > 0) {
        console.log('📸 Sample products with primary images:');
        sampleProductsWithImages.forEach(product => {
          console.log(`   - ${product.product_name} (${product.product_slug}): ${product.image_url}`);
        });
      }
      
      // Show sample variants with images
      const [sampleVariantsWithImages] = await queryInterface.sequelize.query(`
        SELECT 
          p.name as product_name,
          pv.slug as variant_slug,
          pvi.image_url,
          pvi.is_primary
        FROM product_variants pv
        JOIN products p ON pv.product_id = p.id
        JOIN product_variant_images pvi ON pv.id = pvi.variant_id
        WHERE pvi.is_primary = 1
        ORDER BY p.name ASC, pv.slug ASC
        LIMIT 5
      `, { transaction });
      
      if (sampleVariantsWithImages.length > 0) {
        console.log('📸 Sample variants with primary images:');
        sampleVariantsWithImages.forEach(variant => {
          console.log(`   - ${variant.product_name} > ${variant.variant_slug}: ${variant.image_url}`);
        });
      }

      // Step 13: Clean up temporary tables
      await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_products`, { transaction });
      await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_variants`, { transaction });

      // Step 14: Final verification queries
      const [productsCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM products
      `, { transaction });

      const [variantsCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_variants
      `, { transaction });

      const [productImagesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_images
      `, { transaction });

      const [variantImagesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_variant_images
      `, { transaction });

      console.log('🎉 LIVE DATA MIGRATION: Products completed successfully!');
      console.log(`📊 Products migrated: ${productsCount[0].count}`);
      console.log(`📊 Product variants migrated: ${variantsCount[0].count}`);
      console.log(`🖼️ Product images migrated: ${productImagesCount[0].count}`);
      console.log(`🖼️ Variant images migrated: ${variantImagesCount[0].count}`);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      await transaction.commit();
    } catch (error) {
      await crossServerMigration.closeOldDbConnection();
      await transaction.rollback();
      console.error('❌ LIVE DATA MIGRATION: Products failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back LIVE DATA MIGRATION: Products...');
      
      await queryInterface.sequelize.query(`DELETE FROM product_variant_images`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM product_images`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM product_variants`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM products`, { transaction });
      
      await transaction.commit();
      console.log('✅ LIVE DATA MIGRATION: Products rolled back successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ LIVE DATA MIGRATION: Products rollback failed:', error);
      throw error;
    }
  }
};
