'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const environment = process.env.NODE_ENV || 'local';
    const crossServerMigration = new CrossServerMigration(environment);
    
    try {
      console.log('🔄 Starting backfill of alt_text for existing product images...');
      console.log(`🔧 Environment: ${environment}`);
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();
      console.log('✅ Connected to old database successfully');

      // Get all existing product images from new database that don't have alt_text
      const [existingImages] = await queryInterface.sequelize.query(`
        SELECT 
          id, 
          product_id, 
          image_url,
          is_primary
        FROM product_images
        WHERE alt_text IS NULL OR alt_text = ''
        ORDER BY product_id, is_primary DESC, id ASC
      `, { 
        type: Sequelize.QueryTypes.SELECT,
        transaction 
      });

      console.log(`📊 Found ${existingImages.length} product images without alt_text`);

      if (existingImages.length === 0) {
        console.log('✅ No product images need alt_text backfill');
        await crossServerMigration.closeOldDbConnection();
        await transaction.commit();
        return;
      }

      // Get unique product IDs (products use exact ID mapping from old DB)
      const productIds = [...new Set(existingImages.map(img => img.product_id))];
      console.log(`🔍 Looking up alt_text for ${productIds.length} products...`);

      // Build alt_text map: product_id -> array of { is_primary, alt_text }
      // This matches the exact order images were inserted in the original migration
      const altTextMap = new Map();

      // Process products in batches to avoid large IN clauses
      const BATCH_SIZE = 1000;
      for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
        const batch = productIds.slice(i, i + BATCH_SIZE);
        
        // Fetch product images from old database (same query as original migration)
        const oldProductImages = await crossServerMigration.fetchFromOldDb(`
          SELECT 
            pm.post_id as product_id,
            pm.meta_key,
            pm.meta_value as attachment_id
          FROM vh_postmeta pm
          LEFT JOIN vh_posts p ON p.ID = CAST(pm.meta_value AS UNSIGNED) AND p.post_type = 'attachment'
          WHERE pm.meta_key IN ('_thumbnail_id', '_product_image_gallery')
          AND pm.meta_value IS NOT NULL
          AND pm.meta_value != ''
          AND pm.meta_value != '0'
          AND p.guid IS NOT NULL
          AND pm.post_id IN (${batch.join(',')})
          ORDER BY pm.post_id, pm.meta_key
        `);

        // Process each product's images
        for (const oldImage of oldProductImages) {
          const productId = oldImage.product_id;
          
          if (!altTextMap.has(productId)) {
            altTextMap.set(productId, []);
          }
          
          const images = altTextMap.get(productId);
          
          if (oldImage.meta_key === '_thumbnail_id') {
            // Primary image (thumbnail) - fetch alt_text
            const altTextData = await crossServerMigration.fetchFromOldDb(`
              SELECT pm_alt.meta_value as alt_text
              FROM vh_postmeta pm_alt
              WHERE pm_alt.post_id = ${oldImage.attachment_id}
              AND pm_alt.meta_key = '_wp_attachment_image_alt'
              LIMIT 1
            `);
            
            images.push({
              is_primary: true,
              alt_text: altTextData.length > 0 && altTextData[0].alt_text ? altTextData[0].alt_text : null
            });
          } else if (oldImage.meta_key === '_product_image_gallery') {
            // Gallery images - comma-separated attachment IDs
            const attachmentIds = oldImage.attachment_id.split(',').map(id => id.trim()).filter(Boolean);
            
            // Fetch alt_text for each gallery image
            if (attachmentIds.length > 0) {
              const galleryAltTexts = await crossServerMigration.fetchFromOldDb(`
                SELECT 
                  pm_alt.post_id as attachment_id,
                  pm_alt.meta_value as alt_text
                FROM vh_postmeta pm_alt
                WHERE pm_alt.post_id IN (${attachmentIds.join(',')})
                AND pm_alt.meta_key = '_wp_attachment_image_alt'
              `);
              
              // Create a map of attachment_id -> alt_text
              const altTextByAttachmentId = new Map();
              galleryAltTexts.forEach(item => {
                altTextByAttachmentId.set(parseInt(item.attachment_id), item.alt_text || null);
              });
              
              // Add gallery images in order
              attachmentIds.forEach(attachmentId => {
                images.push({
                  is_primary: false,
                  alt_text: altTextByAttachmentId.get(parseInt(attachmentId)) || null
                });
              });
            }
          }
        }
      }

      console.log(`✅ Built alt_text map for ${altTextMap.size} products`);

      let updatedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      // Group new images by product_id for matching
      const imagesByProduct = new Map();
      existingImages.forEach(img => {
        if (!imagesByProduct.has(img.product_id)) {
          imagesByProduct.set(img.product_id, []);
        }
        imagesByProduct.get(img.product_id).push(img);
      });

      // Update product images with alt_text by matching position
      for (const [productId, newImages] of imagesByProduct.entries()) {
        try {
          const oldImages = altTextMap.get(productId) || [];
          
          if (oldImages.length === 0) {
            skippedCount += newImages.length;
            continue;
          }

          // Match images by position:
          // - Primary images first (is_primary = true)
          // - Then gallery images in order (is_primary = false)
          let primaryIndex = 0;
          let galleryIndex = 0;

          for (const newImage of newImages) {
            let altText = null;

            if (newImage.is_primary) {
              // Find primary image in old data
              const primaryOldImage = oldImages.find(img => img.is_primary);
              if (primaryOldImage) {
                altText = primaryOldImage.alt_text;
                primaryIndex++;
              }
            } else {
              // Gallery image - match by position
              const galleryOldImages = oldImages.filter(img => !img.is_primary);
              if (galleryIndex < galleryOldImages.length) {
                altText = galleryOldImages[galleryIndex].alt_text;
                galleryIndex++;
              }
            }

            if (altText) {
              await queryInterface.sequelize.query(`
                UPDATE product_images
                SET alt_text = ?, updatedAt = NOW()
                WHERE id = ?
              `, {
                replacements: [altText, newImage.id],
                transaction
              });
              updatedCount++;
            } else {
              skippedCount++;
            }

            // Progress logging
            if ((updatedCount + skippedCount) % 100 === 0) {
              console.log(`  📈 Progress: ${updatedCount} updated, ${skippedCount} skipped...`);
            }
          }
        } catch (error) {
          console.error(`❌ Error updating alt_text for product ${productId}:`, error.message);
          errorCount += newImages.length;
        }
      }

      await crossServerMigration.closeOldDbConnection();
      await transaction.commit();

      console.log('\n📊 BACKFILL SUMMARY:');
      console.log(`   • Product images updated: ${updatedCount}`);
      console.log(`   • Product images skipped (no alt_text found): ${skippedCount}`);
      console.log(`   • Errors: ${errorCount}`);
      console.log(`   • Total processed: ${existingImages.length}`);
      console.log('\n✅ Alt text backfill completed successfully!');

    } catch (error) {
      console.error('❌ Alt text backfill failed:', error);
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
      console.log('🔄 Rolling back alt_text backfill (clearing alt_text values)...');
      
      const [result] = await queryInterface.sequelize.query(`
        UPDATE product_images 
        SET alt_text = NULL, updatedAt = NOW()
        WHERE alt_text IS NOT NULL
      `, { transaction });
      
      await transaction.commit();
      console.log(`✅ Alt text backfill rolled back. ${result.affectedRows || 0} records cleared.`);
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Alt text backfill rollback failed:', error);
      throw error;
    }
  }
};
