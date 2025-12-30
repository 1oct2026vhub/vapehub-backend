'use strict';

const { QueryInterface, DataTypes } = require('sequelize');
const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const crossServerMigration = new CrossServerMigration();
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🚀 Starting Product Variants Migration...\n');
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();
      
      // Step 1: Clear existing data from product_variants table
      console.log('🧹 Step 1: Clearing existing product variants data...');
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
      await queryInterface.sequelize.query('DELETE FROM product_variants', { transaction });
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
      console.log('✅ Cleared existing product variants data\n');
      
      // Step 2: Get all product variations from old database
      console.log('📊 Step 2: Fetching product variations from old database...');
      const productVariations = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          p.ID as id,
          p.post_parent as product_id,
          p.post_title as title,
          p.post_content as description,
          p.post_status as status,
          p.post_name as slug,
          p.post_date as created_date,
          p.post_modified as modified_date
        FROM vh_posts p
        WHERE p.post_type = 'product_variation'
          AND p.post_status = 'publish'
          AND p.post_parent IS NOT NULL
        ORDER BY p.post_parent, p.ID
      `);
      
      console.log(`📈 Found ${productVariations.length} product variations to migrate\n`);
      
      // Step 3: Get product variant meta data (prices, stock, etc.)
      console.log('🔍 Step 3: Fetching product variant meta data...');
      const variantMetaData = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          pm.post_id,
          pm.meta_key,
          pm.meta_value
        FROM vh_postmeta pm
        WHERE pm.post_id IN (
          SELECT p.ID 
          FROM vh_posts p 
          WHERE p.post_type = 'product_variation' 
            AND p.post_status = 'publish'
        )
        AND pm.meta_key IN (
          '_regular_price',
          '_sale_price', 
          '_price',
          '_stock',
          '_stock_status',
          '_weight',
          '_length',
          '_width',
          '_height',
          '_sku',
          '_manage_stock',
          '_backorders'
        )
        ORDER BY pm.post_id, pm.meta_key
      `);
      
      // Organize meta data by post_id
      const metaDataMap = {};
      variantMetaData.forEach(meta => {
        if (!metaDataMap[meta.post_id]) {
          metaDataMap[meta.post_id] = {};
        }
        metaDataMap[meta.post_id][meta.meta_key] = meta.meta_value;
      });
      
      console.log(`📊 Found meta data for ${Object.keys(metaDataMap).length} variants\n`);
      
      // Step 4: Process and insert product variants
      console.log('⚙️  Step 4: Processing and inserting product variants...');
      let insertedCount = 0;
      let skippedCount = 0;
      
      for (const variant of productVariations) {
        try {
          const meta = metaDataMap[variant.id] || {};
          
          // Extract and process meta data
          const regularPrice = parseFloat(meta._regular_price) || 0;
          const salePrice = parseFloat(meta._sale_price) || null;
          const price = parseFloat(meta._price) || regularPrice;
          const stock = parseInt(meta._stock) || 0;
          const stockStatus = meta._stock_status === 'instock' ? 'in_stock' : 'out_of_stock';
          const weight = parseFloat(meta._weight) || null;
          const length = parseFloat(meta._length) || null;
          const width = parseFloat(meta._width) || null;
          const height = parseFloat(meta._height) || null;
          const sku = meta._sku || null;
          
          // Determine final price (sale price if available, otherwise regular price)
          const finalPrice = salePrice && salePrice > 0 ? salePrice : price;
          const discountPrice = salePrice && salePrice > 0 ? salePrice : null;
          
          // Generate slug if not available
          let slug = variant.slug;
          if (!slug || slug === '') {
            slug = variant.title.toLowerCase()
              .replace(/[^a-z0-9\s-]/g, '')
              .replace(/\s+/g, '-')
              .replace(/-+/g, '-')
              .trim('-');
          }
          
          // Ensure unique slug
          let finalSlug = slug;
          let counter = 1;
          while (true) {
            const existingSlug = await queryInterface.sequelize.query(`
              SELECT id FROM product_variants WHERE slug = ?
            `, {
              replacements: [finalSlug],
              type: Sequelize.QueryTypes.SELECT,
              transaction
            });
            
            if (existingSlug.length === 0) break;
            finalSlug = `${slug}-${counter}`;
            counter++;
          }
          
          // Insert product variant
          await queryInterface.sequelize.query(`
            INSERT INTO product_variants (
              id, product_id, slug, regular_price, price, discount_price,
              weight, length, width, height, description, barcode, sku,
              stock, low_stock_threshold, stock_status, status,
              created_at, updated_at, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, {
            replacements: [
              variant.id,                    // Use exact ID from old DB
              variant.product_id,            // Parent product ID
              finalSlug,                     // Generated unique slug
              regularPrice,                  // Regular price
              finalPrice,                    // Final price
              discountPrice,                 // Discount price (if sale)
              weight,                        // Weight
              length,                        // Length
              width,                         // Width
              height,                        // Height
              variant.description,           // Description
              sku,                          // Barcode
              sku,                          // SKU
              stock,                        // Stock quantity
              5,                            // Low stock threshold (default)
              stockStatus,                  // Stock status
              variant.status === 'publish' ? 'active' : 'inactive', // Status
              variant.created_date,         // Created date
              variant.modified_date,        // Updated date
              1                             // Updated by (migration user)
            ],
            transaction
          });
          
          insertedCount++;
          
          if (insertedCount % 100 === 0) {
            console.log(`  📈 Processed ${insertedCount} variants...`);
          }
          
        } catch (error) {
          skippedCount++;
        }
      }
      
      // Step 5: Migrate product variant images
      console.log('\n🖼️ Step 5: Migrating product variant images...');
      
      // Clear existing variant images
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
      await queryInterface.sequelize.query('DELETE FROM product_variant_images', { transaction });
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
      console.log('✅ Cleared existing product variant images data');
      
      // Method 1: Get variant images from direct attachments (post_parent relationship)
      console.log('📥 Fetching variant images from direct attachments...');
      const directAttachments = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          p.ID as attachment_id,
          p.post_title as image_title,
          p.guid as image_url,
          p.post_parent as variant_id,
          parent.post_title as variant_title,
          'attachment' as source_type
        FROM vh_posts p
        JOIN vh_posts parent ON p.post_parent = parent.ID
        WHERE p.post_type = 'attachment'
          AND parent.post_type = 'product_variation'
          AND p.post_mime_type LIKE 'image%'
          AND p.guid IS NOT NULL
          AND p.guid != ''
        ORDER BY p.post_parent, p.ID
      `);
      
      console.log(`   • Found ${directAttachments.length} images from direct attachments`);
      
      // Method 2: Get variant images from postmeta (_thumbnail_id and _product_image_gallery)
      console.log('📥 Fetching variant images from postmeta...');
      const variantImageMeta = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          pm.post_id as variant_id,
          pm.meta_key,
          pm.meta_value as attachment_id,
          p.guid as image_url,
          p.post_title as image_title,
          parent.post_title as variant_title,
          'postmeta' as source_type
        FROM vh_postmeta pm
        LEFT JOIN vh_posts p ON p.ID = CAST(pm.meta_value AS UNSIGNED) AND p.post_type = 'attachment'
        LEFT JOIN vh_posts parent ON pm.post_id = parent.ID AND parent.post_type = 'product_variation'
        WHERE pm.meta_key IN ('_thumbnail_id', '_product_image_gallery')
          AND pm.meta_value IS NOT NULL
          AND pm.meta_value != ''
          AND pm.meta_value != '0'
          AND p.guid IS NOT NULL
          AND parent.ID IS NOT NULL
        ORDER BY pm.post_id, pm.meta_key
      `);
      
      console.log(`   • Found ${variantImageMeta.length} image meta records from postmeta`);
      
      // Process postmeta images - handle _thumbnail_id and _product_image_gallery
      const postmetaImages = [];
      for (const meta of variantImageMeta) {
        if (meta.meta_key === '_thumbnail_id') {
          // Single primary image
          postmetaImages.push({
            attachment_id: meta.attachment_id,
            image_title: meta.image_title,
            image_url: meta.image_url,
            variant_id: meta.variant_id,
            variant_title: meta.variant_title,
            source_type: 'postmeta',
            is_primary: true
          });
        } else if (meta.meta_key === '_product_image_gallery') {
          // Comma-separated gallery images
          const attachmentIds = meta.attachment_id
            .split(',')
            .map(id => id.trim())
            .filter(Boolean)
            .map(id => parseInt(id))
            .filter(id => !isNaN(id) && id > 0); // Validate numeric IDs
          
          // Fetch image URLs for gallery images
          if (attachmentIds.length > 0) {
            const galleryImages = await crossServerMigration.fetchFromOldDb(`
              SELECT 
                p.ID as attachment_id,
                p.post_title as image_title,
                p.guid as image_url
              FROM vh_posts p
              WHERE p.ID IN (${attachmentIds.join(',')})
                AND p.post_type = 'attachment'
                AND p.post_mime_type LIKE 'image%'
                AND p.guid IS NOT NULL
                AND p.guid != ''
              ORDER BY FIELD(p.ID, ${attachmentIds.join(',')})
            `);
            
            galleryImages.forEach((img, index) => {
              postmetaImages.push({
                attachment_id: img.attachment_id,
                image_title: img.image_title,
                image_url: img.image_url,
                variant_id: meta.variant_id,
                variant_title: meta.variant_title,
                source_type: 'postmeta',
                is_primary: false,
                gallery_index: index
              });
            });
          }
        }
      }
      
      console.log(`   • Processed ${postmetaImages.length} images from postmeta`);
      
      // Combine both sources and deduplicate by variant_id + image_url
      const allVariantImages = [...directAttachments, ...postmetaImages];
      const uniqueImages = new Map();
      
      allVariantImages.forEach(image => {
        if (!image.image_url || image.image_url.trim() === '') {
          return; // Skip invalid URLs
        }
        
        // Create unique key: variant_id + image_url
        const key = `${image.variant_id}_${image.image_url}`;
        if (!uniqueImages.has(key)) {
          uniqueImages.set(key, {
            ...image,
            is_primary: image.is_primary !== undefined ? image.is_primary : false
          });
        } else {
          // If duplicate found, prefer postmeta source and preserve is_primary flag
          const existing = uniqueImages.get(key);
          if (image.source_type === 'postmeta' && image.is_primary) {
            existing.is_primary = true;
          }
        }
      });
      
      const variantImages = Array.from(uniqueImages.values());
      
      console.log(`📊 Found ${variantImages.length} unique variant images to migrate`);
      console.log(`   • From direct attachments: ${directAttachments.length}`);
      console.log(`   • From postmeta: ${postmetaImages.length}`);
      
      let variantImagesInserted = 0;
      let variantImagesSkipped = 0;
      const skippedVariants = new Set();
      
      // Group images by variant_id to set primary image
      const imagesByVariant = {};
      variantImages.forEach(image => {
        if (!imagesByVariant[image.variant_id]) {
          imagesByVariant[image.variant_id] = [];
        }
        imagesByVariant[image.variant_id].push(image);
      });
      
      // Insert variant images
      for (const [variantId, images] of Object.entries(imagesByVariant)) {
        try {
          // Check if variant exists in new database
          const variantExists = await queryInterface.sequelize.query(`
            SELECT id FROM product_variants WHERE id = ?
          `, {
            replacements: [variantId],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });
          
          if (variantExists.length === 0) {
            console.log(`⚠️ Skipping images for variant ${variantId} - variant not found in new database`);
            variantImagesSkipped += images.length;
            skippedVariants.add(variantId);
            continue;
          }
          
          // Sort images: primary first, then by gallery_index or attachment_id
          images.sort((a, b) => {
            if (a.is_primary && !b.is_primary) return -1;
            if (!a.is_primary && b.is_primary) return 1;
            if (a.gallery_index !== undefined && b.gallery_index !== undefined) {
              return a.gallery_index - b.gallery_index;
            }
            return (a.attachment_id || 0) - (b.attachment_id || 0);
          });
          
          // Ensure at least one primary image
          const hasPrimary = images.some(img => img.is_primary);
          if (!hasPrimary && images.length > 0) {
            images[0].is_primary = true;
          }
          
          // Insert images for this variant
          for (let i = 0; i < images.length; i++) {
            const image = images[i];
            
            // Validate URL
            try {
              new URL(image.image_url);
            } catch (urlError) {
              console.log(`⚠️ Skipping invalid image URL for variant ${variantId}: ${image.image_url}`);
              variantImagesSkipped++;
              continue;
            }
            
            const isPrimary = image.is_primary || (i === 0 && !hasPrimary);
            
            await queryInterface.sequelize.query(`
              INSERT INTO product_variant_images (
                variant_id, image_url, alt_text, sort_order, is_primary,
                created_at, updated_at, updated_by
              ) VALUES (?, ?, ?, ?, ?, NOW(), NOW(), ?)
            `, {
              replacements: [
                image.variant_id,
                image.image_url,
                image.image_title || null,
                i, // sort_order
                isPrimary,
                1 // updated_by for migration
              ],
              transaction
            });
            
            variantImagesInserted++;
          }
          
          if (variantImagesInserted % 100 === 0) {
            console.log(`  📈 Processed ${variantImagesInserted} variant images...`);
          }
          
        } catch (error) {
          console.error(`❌ Error processing images for variant ${variantId}:`, error.message);
          variantImagesSkipped += images.length;
          skippedVariants.add(variantId);
        }
      }
      
      console.log(`✅ Variant images inserted: ${variantImagesInserted}`);
      console.log(`⚠️ Variant images skipped: ${variantImagesSkipped}`);
      if (skippedVariants.size > 0) {
        console.log(`⚠️ Variants with skipped images: ${Array.from(skippedVariants).slice(0, 10).join(', ')}${skippedVariants.size > 10 ? '...' : ''}`);
      }
      
      // Step 6: Final verification
      console.log('\n🔍 Step 6: Final verification...');
      const finalCount = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_variants
      `, { type: Sequelize.QueryTypes.SELECT, transaction });
      
      const uniqueProducts = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT product_id) as count FROM product_variants
      `, { type: Sequelize.QueryTypes.SELECT, transaction });
      
      const variantImagesCount = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_variant_images
      `, { type: Sequelize.QueryTypes.SELECT, transaction });
      
      const variantsWithImages = await queryInterface.sequelize.query(`
        SELECT COUNT(DISTINCT variant_id) as count FROM product_variant_images
      `, { type: Sequelize.QueryTypes.SELECT, transaction });
      
      console.log('\n📊 MIGRATION SUMMARY:');
      console.log('   • Product variants inserted:', insertedCount);
      console.log('   • Product variants skipped:', skippedCount);
      console.log('   • Total variant records in table:', finalCount[0].count);
      console.log('   • Unique parent products:', uniqueProducts[0].count);
      console.log('   • Variant images inserted:', variantImagesInserted);
      console.log('   • Variant images skipped:', variantImagesSkipped);
      console.log('   • Total variant images in table:', variantImagesCount[0].count);
      console.log('   • Variants with images:', variantsWithImages[0].count);
      
      // Sample migrated variants
      const sampleVariants = await queryInterface.sequelize.query(`
        SELECT 
          pv.id, pv.product_id, pv.slug, pv.regular_price, pv.price, 
          pv.stock, pv.stock_status, pv.status
        FROM product_variants pv
        ORDER BY pv.product_id, pv.id
        LIMIT 5
      `, { type: Sequelize.QueryTypes.SELECT, transaction });
      
      console.log('\n📋 Sample migrated product variants:');
      sampleVariants.forEach(variant => {
        console.log(`   • Variant: ${variant.id}, Product: ${variant.product_id}, Price: £${variant.price}, Stock: ${variant.stock}`);
      });
      
      await transaction.commit();
      await crossServerMigration.closeOldDbConnection();
      
      console.log('\n🎉 PRODUCT VARIANTS MIGRATION completed successfully!');
      console.log('✅ Product variants now have exact IDs matching old database');
      console.log('✅ All variant data properly mapped from vh_posts and vh_postmeta');
      console.log('✅ Variant images migrated from both direct attachments and postmeta (_thumbnail_id, _product_image_gallery)');
      console.log('✅ Images deduplicated and validated before insertion');
      console.log('✅ Fresh start with cleared existing data');
      
    } catch (error) {
      await transaction.rollback();
      await crossServerMigration.closeOldDbConnection();
      console.error('❌ Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back product variants migration...');
      
      // Disable foreign key checks
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
      
      // Delete all product variant images first (due to foreign key)
      await queryInterface.sequelize.query('DELETE FROM product_variant_images', { transaction });
      
      // Delete all product variants
      await queryInterface.sequelize.query('DELETE FROM product_variants', { transaction });
      
      // Re-enable foreign key checks
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
      
      await transaction.commit();
      console.log('✅ Product variants migration rolled back successfully');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
};
