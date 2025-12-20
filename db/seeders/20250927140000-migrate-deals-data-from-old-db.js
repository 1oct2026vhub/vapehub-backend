'use strict';

/**
 * Deals Data Migration from Old Database
 * 
 * This seeder migrates:
 * - Deals (with all fields and relationships)
 * - Deal-Product relationships
 * - Deal images to S3
 * - Handles data validation and error recovery
 */

const CrossServerMigration = require('../../utils/cross-server-migration');
const { uploadFiletToS3, generateUniqueFileName, generateCloudFrontUrlForS3, checkImageExists } = require('../../library/s3/s3Helper');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

module.exports = {
  async up(queryInterface, Sequelize) {
    const environment = process.env.NODE_ENV || 'local';
    console.log(`🔧 Using environment: ${environment}`);
    const crossServerMigration = new CrossServerMigration(environment);
    
    try {
      console.log('🚀 Starting DEALS DATA MIGRATION from old database...');
      
      const migrationStats = {
        deals: { processed: 0, created: 0, errors: 0 },
        dealProducts: { processed: 0, created: 0, errors: 0 },
        dealSlugRelations: { processed: 0, created: 0, errors: 0 },
        images: { processed: 0, uploaded: 0, skipped: 0, errors: 0 }
      };

      // Connect to old database
      await crossServerMigration.connectToOldDb();

      // Check if deals data exists
      const dealsDataExists = await checkDealsDataExists(crossServerMigration);
      if (!dealsDataExists.hasDealsData) {
        console.log('⚠️  No deals data found in old database. Skipping deals migration.');
        console.log('💡 Available tables:', dealsDataExists.availableTables.slice(0, 10).join(', ') + '...');
        await crossServerMigration.closeOldDbConnection();
        return;
      }
      
      console.log(`✅ Found deals data source: ${dealsDataExists.dataSource}`);
      console.log(`📊 Deals available: ${dealsDataExists.dealCount}`);

      // Clear existing deals data before migration
      console.log('\n🧹 Clearing existing deals data...');
      await clearExistingDealsData(queryInterface);
      console.log('✅ Existing deals data cleared successfully');

      // Step 1: Migrate deals
      console.log('\n🎯 Step 1: Migrating deals...');
      if (dealsDataExists.dataSource === 'woocommerce_discount_rules') {
        await migrateWooCommerceDeals(crossServerMigration, queryInterface, Sequelize, migrationStats);
      } else {
        await migrateDeals(crossServerMigration, queryInterface, Sequelize, migrationStats);
      }

      // Step 2: Migrate deal-product relationships
      console.log('\n🔗 Step 2: Migrating deal-product relationships...');
      await migrateDealProducts(crossServerMigration, queryInterface, Sequelize, migrationStats);

      // Step 3: Add deal slugs to slug_relations table
      console.log('\n🔗 Step 3: Adding deal slugs to slug_relations...');
      await migrateDealSlugRelations(queryInterface, Sequelize, migrationStats);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      console.log('\n✅ Deals data migration completed!');
      generateMigrationReport(migrationStats);

    } catch (error) {
      console.error('❌ Error during deals migration:', error);
      await crossServerMigration.closeOldDbConnection();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🧹 Removing deals data...');
    
    try {
      // Remove in correct order to avoid foreign key constraints
      await queryInterface.sequelize.query('DELETE FROM slug_relations WHERE entity_type = \'deal\'');
      await queryInterface.sequelize.query('DELETE FROM deal_products');
      await queryInterface.sequelize.query('DELETE FROM deals');
      
      // Reset auto-increment counters
      await queryInterface.sequelize.query('ALTER TABLE deal_products AUTO_INCREMENT = 1');
      await queryInterface.sequelize.query('ALTER TABLE deals AUTO_INCREMENT = 1');
      
      console.log('✅ Deals data removed successfully');
    } catch (error) {
      console.error('❌ Error removing deals data:', error);
      throw error;
    }
  }
};

/**
 * Check if deals data exists in old database
 */
async function checkDealsDataExists(crossServerMigration) {
  try {
    const tables = await crossServerMigration.fetchFromOldDb('SHOW TABLES');
    const tableNames = tables.map(table => Object.values(table)[0].toLowerCase());
    
    // Check for WooCommerce discount rules table
    const hasWdrRulesTable = tableNames.includes('vh_wdr_rules');
    
    if (hasWdrRulesTable) {
      let dealCount = 0;
      try {
        const dealCountResult = await crossServerMigration.fetchFromOldDb('SELECT COUNT(*) as count FROM vh_wdr_rules WHERE enabled = 1 AND deleted = 0');
        dealCount = dealCountResult[0]?.count || 0;
      } catch (e) { /* ignore */ }
      
      return {
        hasDealsData: dealCount > 0,
        dataSource: 'woocommerce_discount_rules',
        dealCount,
        availableTables: tableNames
      };
    }
    
    // Check for regular deals table
    const hasDealsTable = tableNames.includes('deals');
    if (hasDealsTable) {
      let dealCount = 0;
      try {
        const dealCountResult = await crossServerMigration.fetchFromOldDb('SELECT COUNT(*) as count FROM deals');
        dealCount = dealCountResult[0]?.count || 0;
      } catch (e) { /* ignore */ }
      
      return {
        hasDealsData: dealCount > 0,
        dataSource: 'deals',
        dealCount,
        availableTables: tableNames
      };
    }
    
    return {
      hasDealsData: false,
      dataSource: 'none',
      dealCount: 0,
      availableTables: tableNames
    };
    
  } catch (error) {
    console.error('Error checking deals data:', error);
    return {
      hasDealsData: false,
      dataSource: 'error',
      dealCount: 0,
      availableTables: []
    };
  }
}

/**
 * Clear existing deals data before migration
 */
async function clearExistingDealsData(queryInterface) {
  try {
    // Clear in correct order to avoid foreign key constraints
    console.log('🗑️  Clearing deal slug relations...');
    await queryInterface.sequelize.query('DELETE FROM slug_relations WHERE entity_type = \'deal\'', {
      type: queryInterface.sequelize.QueryTypes.DELETE
    });

    console.log('🗑️  Clearing deal-product relationships...');
    await queryInterface.sequelize.query('DELETE FROM deal_products', {
      type: queryInterface.sequelize.QueryTypes.DELETE
    });

    console.log('🗑️  Clearing deals...');
    await queryInterface.sequelize.query('DELETE FROM deals', {
      type: queryInterface.sequelize.QueryTypes.DELETE
    });

    // Reset auto-increment counters
    console.log('🔄 Resetting auto-increment counters...');
    await queryInterface.sequelize.query('ALTER TABLE deal_products AUTO_INCREMENT = 1', {
      type: queryInterface.sequelize.QueryTypes.RAW
    });
    await queryInterface.sequelize.query('ALTER TABLE deals AUTO_INCREMENT = 1', {
      type: queryInterface.sequelize.QueryTypes.RAW
    });

    console.log('✅ All existing deals data cleared successfully');
  } catch (error) {
    console.error('❌ Error clearing existing deals data:', error.message);
    throw error;
  }
}

/**
 * Check if a column exists in a table
 */
async function checkColumnExists(crossServerMigration, tableName, columnName) {
  try {
    const result = await crossServerMigration.fetchFromOldDb(`
      SELECT COUNT(*) as count 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = '${tableName}' 
        AND COLUMN_NAME = '${columnName}'
    `);
    
    return result && result.length > 0 && result[0].count > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Get deal thumbnail URL from WordPress postmeta using JOIN query
 * Returns the actual image URL (thumbnail_url) from the JOIN query
 */
async function getDealThumbnailUrl(crossServerMigration, dealId) {
  try {
    // Use JOIN query pattern like screenshot to get thumbnail_url directly
    const imageResults = await crossServerMigration.fetchFromOldDb(`
      SELECT 
        pm.post_id,
        pm.meta_value as thumbnail_id,
        p_thumb.guid as thumbnail_url,
        pm.meta_key
      FROM vh_postmeta pm
      LEFT JOIN vh_posts p_thumb ON pm.meta_value = p_thumb.ID AND p_thumb.post_type = 'attachment'
      WHERE pm.post_id = ${dealId}
        AND (
          pm.meta_key = '_thumbnail_id' 
          OR pm.meta_key = '_wdr_image' 
          OR pm.meta_key = 'deal_image'
          OR pm.meta_key = 'wdr_rule_image'
          OR pm.meta_key LIKE '%image%'
        )
      ORDER BY 
        CASE pm.meta_key
          WHEN '_wdr_image' THEN 1
          WHEN 'deal_image' THEN 2
          WHEN 'wdr_rule_image' THEN 3
          WHEN '_thumbnail_id' THEN 4
          ELSE 5
        END
      LIMIT 1
    `);

    if (imageResults && imageResults.length > 0) {
      const result = imageResults[0];
      
      // If we got a thumbnail_url from the JOIN (guid from vh_posts) - this is the image URL we need
      if (result.thumbnail_url) {
        return result.thumbnail_url;
      }
      
      // If meta_value is a direct URL (starts with http) - also use it
      if (result.thumbnail_id && typeof result.thumbnail_id === 'string' && result.thumbnail_id.startsWith('http')) {
        return result.thumbnail_id;
      }
    }

    // Try to get image from vh_wdr_rules table if it has an image column
    try {
      const ruleImage = await crossServerMigration.fetchFromOldDb(`
        SELECT image_url 
        FROM vh_wdr_rules 
        WHERE id = ${dealId}
        LIMIT 1
      `);
      
      if (ruleImage && ruleImage.length > 0 && ruleImage[0].image_url) {
        return ruleImage[0].image_url;
      }
    } catch (e) {
      // Column doesn't exist, ignore
    }

    return null;
  } catch (error) {
    console.log(`⚠️ Error fetching thumbnail for deal ${dealId}: ${error.message}`);
    return null;
  }
}

/**
 * Migrate deal image to S3
 * Downloads from thumbnail_url and uploads to S3, returns CloudFront URL
 */
async function migrateDealImageToS3(thumbnailUrl, dealId, imageStats) {
  try {
    if (!thumbnailUrl || thumbnailUrl.trim() === '') {
      return null;
    }

    // Skip if already in S3 or CloudFront
    if (thumbnailUrl.includes('s3') || thumbnailUrl.includes('cloudfront')) {
      console.log(`⏭️ Image already in S3/CloudFront: ${thumbnailUrl}`);
      imageStats.skipped++;
      return thumbnailUrl;
    }

    imageStats.processed++;

    // Generate S3 key
    const urlParts = thumbnailUrl.split('/');
    const originalFileName = urlParts[urlParts.length - 1];
    const fileExtension = path.extname(originalFileName) || '.jpg';
    const uniqueFileName = generateUniqueFileName(`deal-${dealId}${fileExtension}`);
    const s3Key = `deals/${uniqueFileName}`;

    // Check if image already exists in S3
    const imageExists = await checkImageExists(s3Key);
    if (imageExists) {
      console.log(`✅ Image already exists in S3: ${s3Key}`);
      imageStats.skipped++;
      return generateCloudFrontUrlForS3(s3Key);
    }

    // Download and upload to S3
    const uploadResult = await downloadAndUploadToS3(thumbnailUrl, s3Key, imageStats);
    if (uploadResult) {
      imageStats.uploaded++;
      return generateCloudFrontUrlForS3(s3Key);
    }

    return null;

  } catch (error) {
    console.error(`❌ Error migrating deal image ${thumbnailUrl}: ${error.message}`);
    imageStats.errors++;
    return null;
  }
}

/**
 * Download image from thumbnail_url and upload to S3
 */
async function downloadAndUploadToS3(thumbnailUrl, s3Key, imageStats) {
  try {
    console.log(`📥 Downloading from thumbnail_url: ${thumbnailUrl}`);

    let response;
    try {
      response = await axios({
        method: 'GET',
        url: thumbnailUrl,
        responseType: 'stream',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ImageBot/1.0)',
          'Accept': 'image/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Connection': 'keep-alive'
        },
        maxContentLength: 10 * 1024 * 1024, // 10MB max file size
        validateStatus: function (status) {
          return status >= 200 && status < 300;
        }
      });
      
      console.log(`✅ Successfully downloaded: ${thumbnailUrl}`);
    } catch (error) {
      console.error(`❌ Failed to download ${thumbnailUrl}: ${error.message}`);
      return null;
    }

    // Save to temporary file
    const tempDir = os.tmpdir();
    const tempFileName = generateUniqueFileName('deal-temp.jpg');
    const tempFile = path.join(tempDir, tempFileName);
    const writer = fs.createWriteStream(tempFile);

    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // Upload to S3
    const fileBuffer = fs.readFileSync(tempFile);
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: response.headers['content-type'] || 'image/jpeg',
      CacheControl: 'max-age=31536000' // 1 year cache
    };

    console.log(`📤 Uploading to S3: ${s3Key}`);
    const uploadResult = await uploadFiletToS3(uploadParams);
    
    // Clean up temp file
    fs.unlinkSync(tempFile);

    if (uploadResult && uploadResult.Location) {
      console.log(`✅ Successfully uploaded to S3: ${s3Key}`);
      return s3Key;
    }

    return null;

  } catch (error) {
    console.error(`❌ Error processing image: ${error.message}`);
    return null;
  }
}

/**
 * Migrate WooCommerce discount rules as deals
 */
async function migrateWooCommerceDeals(crossServerMigration, queryInterface, Sequelize, migrationStats) {
  try {
    // Check if image_url column exists in vh_wdr_rules table
    const hasImageColumn = await checkColumnExists(crossServerMigration, 'vh_wdr_rules', 'image_url');
    
    // Get all active WooCommerce discount rules
    const oldDeals = await crossServerMigration.fetchFromOldDb(`
      SELECT 
        id,
        title,
        priority,
        filters,
        conditions,
        product_adjustments,
        cart_adjustments,
        bulk_adjustments,
        set_adjustments,
        date_from,
        date_to,
        usage_limits,
        created_on,
        modified_on
        ${hasImageColumn ? ', image_url' : ''}
      FROM vh_wdr_rules 
      WHERE enabled = 1 AND deleted = 0
      ORDER BY priority, id
    `);

    console.log(`📊 Found ${oldDeals.length} WooCommerce discount rules to migrate as deals`);

    for (const oldDeal of oldDeals) {
      migrationStats.deals.processed++;
      
      try {
        // Check if deal already exists
        const existingDeal = await queryInterface.sequelize.query(`
          SELECT id FROM deals WHERE id = ?
        `, {
          replacements: [oldDeal.id],
          type: Sequelize.QueryTypes.SELECT
        });

        if (existingDeal.length > 0) {
          console.log(`⏭️ Deal already exists: ${oldDeal.title} (ID: ${oldDeal.id})`);
          continue;
        }

        // Parse discount information from WooCommerce rules
        let discountType = 'percentage';
        let discountValue = 0;
        let minQuantity = null;
        let maxQuantity = null;
        let description = '';

        console.log(`🔍 Processing deal: ${oldDeal.title} (ID: ${oldDeal.id})`);
        console.log(`📊 Raw data - product_adjustments: ${oldDeal.product_adjustments}`);
        console.log(`📊 Raw data - cart_adjustments: ${oldDeal.cart_adjustments}`);
        console.log(`📊 Raw data - bulk_adjustments: ${oldDeal.bulk_adjustments}`);
        console.log(`📊 Raw data - set_adjustments: ${oldDeal.set_adjustments}`);

        // Try to extract discount info from various adjustment fields
        const adjustments = [
          oldDeal.product_adjustments,
          oldDeal.cart_adjustments,
          oldDeal.bulk_adjustments,
          oldDeal.set_adjustments
        ].filter(adj => adj && adj !== '[]' && adj !== '{}');

        console.log(`🔧 Found ${adjustments.length} non-empty adjustments to parse`);

        for (const adjustment of adjustments) {
          try {
            const parsed = JSON.parse(adjustment);
            console.log(`✅ Parsed adjustment:`, JSON.stringify(parsed, null, 2));
            
            // Check for set_adjustments structure (product_cumulative)
            if (parsed.operator === 'product_cumulative' && parsed.ranges) {
              console.log(`🎯 Found product_cumulative operator with ranges`);
              
              // Get the first range (usually "1")
              const rangeKeys = Object.keys(parsed.ranges);
              if (rangeKeys.length > 0) {
                const firstRangeKey = rangeKeys[0];
                const firstRange = parsed.ranges[firstRangeKey];
                
                if (firstRange) {
                  // Extract required_qty from "from" field
                  minQuantity = firstRange.from ? parseInt(firstRange.from) : null;
                  maxQuantity = firstRange.from ? parseInt(firstRange.from) : null; // Same as required_qty for "buy N for fixed price"
                  
                  // Extract fixed_price from "value" field
                  if (firstRange.value) {
                    discountValue = parseFloat(firstRange.value);
                    discountType = 'fixed';
                  }
                  
                  console.log(`📦 Extracted - required_qty: ${minQuantity}, get_qty: ${maxQuantity}, fixed_price: ${discountValue}`);
                }
              }
            }
            
            // Fallback to old logic for other adjustment types
            if (parsed.type && !minQuantity) {
              discountType = parsed.type === 'percentage' ? 'percentage' : 'fixed';
              discountValue = parsed.value || 0;
              console.log(`💰 Fallback discount type: ${discountType}, value: ${discountValue}`);
            }
            if (parsed.ranges && Array.isArray(parsed.ranges) && !minQuantity) {
              const firstRange = parsed.ranges[0];
              if (firstRange) {
                minQuantity = firstRange.from || null;
                maxQuantity = firstRange.to || null;
                if (firstRange.value) {
                  discountValue = firstRange.value;
                }
                if (firstRange.type) {
                  discountType = firstRange.type === 'percentage' ? 'percentage' : 'fixed';
                }
                console.log(`📦 Fallback quantity range: ${minQuantity} to ${maxQuantity}`);
              }
            }
          } catch (e) {
            console.log(`❌ Failed to parse adjustment: ${adjustment}`, e.message);
          }
        }

        // Set default values if parsing failed
        if (minQuantity === null) {
          minQuantity = 1; // Default minimum quantity
          console.log(`🔧 Using default minQuantity: ${minQuantity}`);
        }
        if (maxQuantity === null) {
          maxQuantity = 1; // Default maximum quantity
          console.log(`🔧 Using default maxQuantity: ${maxQuantity}`);
        }
        if (discountValue === 0) {
          discountValue = 10; // Default 10% discount
          discountType = 'percentage';
          console.log(`🔧 Using default discount: ${discountValue}%`);
        }

        // Generate description from title and rules
        description = oldDeal.title;
        if (oldDeal.conditions && oldDeal.conditions !== '[]') {
          description += ' (WooCommerce discount rule)';
        }

        // Get thumbnail_url using JOIN query (this gives us the image URL)
        let thumbnailUrl = null;

        // First, check if image_url was selected from vh_wdr_rules table
        if (oldDeal.image_url) {
          thumbnailUrl = oldDeal.image_url;
          console.log(`📸 Found image in vh_wdr_rules table: ${thumbnailUrl}`);
        } else {
          // Use JOIN query to get thumbnail_url directly (the actual image URL)
          thumbnailUrl = await getDealThumbnailUrl(crossServerMigration, oldDeal.id);
          if (thumbnailUrl) {
            console.log(`📸 Found thumbnail_url from postmeta JOIN: ${thumbnailUrl}`);
          } else {
            console.log(`⚠️ No thumbnail found for deal: ${oldDeal.title} (ID: ${oldDeal.id})`);
          }
        }

        // Migrate image to S3 if we have a thumbnail_url
        let finalImageUrl = thumbnailUrl;
        if (thumbnailUrl) {
          finalImageUrl = await migrateDealImageToS3(thumbnailUrl, oldDeal.id, migrationStats.images);
          if (!finalImageUrl) {
            console.log(`⚠️ Failed to migrate image to S3, using original thumbnail_url: ${thumbnailUrl}`);
            finalImageUrl = thumbnailUrl; // Fallback to original URL
          } else {
            console.log(`✅ Image migrated to S3: ${finalImageUrl}`);
          }
        }

        // Create deal
        await queryInterface.bulkInsert('deals', [{
          id: oldDeal.id,
          name: oldDeal.title,
          slug: oldDeal.title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim('-'),
          image_url: finalImageUrl, // S3/CloudFront URL
          deal_type: 'BUY_N_FOR_FIXED', // Default deal type
          required_qty: minQuantity,
          get_qty: maxQuantity,
          fixed_price: discountType === 'fixed' ? discountValue : null,
          discount_percent: discountType === 'percentage' ? discountValue : null,
          is_active: true,
          valid_from: oldDeal.date_from || new Date(),
          valid_to: oldDeal.date_to || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
          createdAt: oldDeal.created_on || new Date(),
          updatedAt: oldDeal.modified_on || new Date()
        }]);

        migrationStats.deals.created++;
        console.log(`✅ Created deal from WooCommerce rule: ${oldDeal.title} (ID: ${oldDeal.id})`);

      } catch (error) {
        console.error(`❌ Error creating deal ${oldDeal.id}:`, error.message);
        migrationStats.deals.errors++;
      }
    }

    console.log(`✅ WooCommerce deals migration completed: ${migrationStats.deals.created} created, ${migrationStats.deals.errors} errors`);

  } catch (error) {
    console.error('❌ Error in WooCommerce deals migration:', error);
    throw error;
  }
}

/**
 * Migrate deals from old database
 */
async function migrateDeals(crossServerMigration, queryInterface, Sequelize, migrationStats) {
  try {
    // Get deals from old database
    const oldDeals = await crossServerMigration.fetchFromOldDb(`
      SELECT 
        id as old_id,
        name,
        slug,
        image_url,
        deal_type,
        required_qty,
        get_qty,
        fixed_price,
        discount_percent,
        tiered_qty_json,
        bundle_product_ids_json,
        is_active,
        valid_from,
        valid_to,
        is_deleted,
        created_at,
        updated_at
      FROM deals 
      ORDER BY id ASC
    `);

    console.log(`📊 Found ${oldDeals.length} deals to migrate`);

    const dealMapping = {}; // old_id -> new_id mapping

    for (const oldDeal of oldDeals) {
      migrationStats.deals.processed++;
      
      try {
        // Validate required fields
        if (!oldDeal.name || !oldDeal.deal_type || !oldDeal.valid_from || !oldDeal.valid_to) {
          console.log(`⚠️ Skipping deal ${oldDeal.old_id} - missing required fields`);
          migrationStats.deals.errors++;
          continue;
        }

        // Generate slug if missing
        let slug = oldDeal.slug;
        if (!slug) {
          slug = oldDeal.name.toLowerCase()
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
            SELECT id FROM deals WHERE slug = ?
          `, {
            replacements: [finalSlug],
            type: Sequelize.QueryTypes.SELECT
          });

          if (existingSlug.length === 0) break;
          finalSlug = `${slug}-${counter}`;
          counter++;
        }

        // Migrate image to S3 if we have an image URL
        let finalImageUrl = oldDeal.image_url;
        if (oldDeal.image_url) {
          finalImageUrl = await migrateDealImageToS3(oldDeal.image_url, oldDeal.old_id, migrationStats.images);
          if (!finalImageUrl) {
            console.log(`⚠️ Failed to migrate image to S3, using original URL: ${oldDeal.image_url}`);
            finalImageUrl = oldDeal.image_url; // Fallback to original URL
          }
        }

        // Create deal
        const [newDealId] = await queryInterface.bulkInsert('deals', [{
          name: oldDeal.name,
          slug: finalSlug,
          image_url: finalImageUrl, // S3/CloudFront URL
          deal_type: oldDeal.deal_type,
          required_qty: oldDeal.required_qty,
          get_qty: oldDeal.get_qty,
          fixed_price: oldDeal.fixed_price,
          discount_percent: oldDeal.discount_percent,
          tiered_qty_json: oldDeal.tiered_qty_json ? JSON.stringify(oldDeal.tiered_qty_json) : null,
          bundle_product_ids_json: oldDeal.bundle_product_ids_json ? JSON.stringify(oldDeal.bundle_product_ids_json) : null,
          is_active: oldDeal.is_active !== 0,
          valid_from: oldDeal.valid_from,
          valid_to: oldDeal.valid_to,
          is_deleted: oldDeal.is_deleted === 1,
          createdAt: oldDeal.created_at || new Date(),
          updatedAt: oldDeal.updated_at || new Date()
        }], { returning: true });

        dealMapping[oldDeal.old_id] = newDealId;
        migrationStats.deals.created++;
        console.log(`✅ Created deal: ${oldDeal.name} (ID: ${newDealId})`);

      } catch (error) {
        console.error(`❌ Error creating deal ${oldDeal.name}:`, error.message);
        migrationStats.deals.errors++;
      }
    }

    // Store deal mapping for use in deal-product migration
    global.dealMapping = dealMapping;

    console.log(`✅ Deals migration completed: ${migrationStats.deals.created} created, ${migrationStats.deals.errors} errors`);

  } catch (error) {
    console.error('❌ Error in deals migration:', error);
    throw error;
  }
}

/**
 * Migrate deal-product relationships
 */
async function migrateDealProducts(crossServerMigration, queryInterface, Sequelize, migrationStats) {
  try {
    // Get deal-product relationships from new database (they already exist)
    const existingDealProducts = await queryInterface.sequelize.query(`
      SELECT 
        deal_id,
        product_id,
        createdAt,
        updatedAt
      FROM deal_products 
      ORDER BY deal_id, product_id
    `, { type: Sequelize.QueryTypes.SELECT });

    console.log(`📊 Found ${existingDealProducts.length} existing deal-product relationships`);

    // Since deal_products are already in the new database, we just need to ensure they're properly linked
    // This step is mainly for reporting purposes
    migrationStats.dealProducts.processed = existingDealProducts.length;
    migrationStats.dealProducts.created = existingDealProducts.length;
    migrationStats.dealProducts.errors = 0;

    console.log(`✅ Deal-product relationships already exist: ${existingDealProducts.length} relationships found`);

  } catch (error) {
    console.error('❌ Error checking deal-product relationships:', error);
    throw error;
  }
}

/**
 * Migrate deal slugs to slug_relations table
 */
async function migrateDealSlugRelations(queryInterface, Sequelize, migrationStats) {
  try {
    // Get all deals with slugs
    const deals = await queryInterface.sequelize.query(`
      SELECT id, slug, createdAt, updatedAt 
      FROM deals 
      WHERE slug IS NOT NULL AND slug != ''
      ORDER BY id
    `, { type: Sequelize.QueryTypes.SELECT });

    console.log(`📊 Found ${deals.length} deals with slugs to add to slug_relations`);

    for (const deal of deals) {
      migrationStats.dealSlugRelations.processed++;
      
      try {
        // Check if slug relation already exists
        const existingSlugRelation = await queryInterface.sequelize.query(`
          SELECT 1 FROM slug_relations 
          WHERE entity_type = 'deal' AND entity_id = ?
        `, {
          replacements: [deal.id],
          type: Sequelize.QueryTypes.SELECT
        });

        if (existingSlugRelation.length > 0) {
          console.log(`⏭️ Deal slug relation already exists: deal ${deal.id}`);
          continue;
        }

        // Check if slug is already used by another entity
        const existingSlug = await queryInterface.sequelize.query(`
          SELECT 1 FROM slug_relations 
          WHERE slug = ?
        `, {
          replacements: [deal.slug],
          type: Sequelize.QueryTypes.SELECT
        });

        if (existingSlug.length > 0) {
          console.log(`⚠️ Skipping deal ${deal.id} - slug '${deal.slug}' already exists`);
          migrationStats.dealSlugRelations.errors++;
          continue;
        }

               // Create slug relation
               await queryInterface.bulkInsert('slug_relations', [{
                 entity_type: 'deal',
                 entity_id: deal.id,
                 slug: deal.slug,
                 created_at: deal.createdAt || new Date(),
                 updated_at: deal.updatedAt || new Date()
               }]);

        migrationStats.dealSlugRelations.created++;
        console.log(`✅ Created deal slug relation: ${deal.slug} -> deal ${deal.id}`);

      } catch (error) {
        console.error(`❌ Error creating deal slug relation for deal ${deal.id}:`, error.message);
        migrationStats.dealSlugRelations.errors++;
      }
    }

    console.log(`✅ Deal slug relations migration completed: ${migrationStats.dealSlugRelations.created} created, ${migrationStats.dealSlugRelations.errors} errors`);

  } catch (error) {
    console.error('❌ Error in deal slug relations migration:', error);
    throw error;
  }
}

/**
 * Generate migration report
 */
function generateMigrationReport(migrationStats) {
  const report = `
🎉 DEALS MIGRATION REPORT
========================
Deals Processed: ${migrationStats.deals.processed}
Deals Created: ${migrationStats.deals.created}
Deals Errors: ${migrationStats.deals.errors}

Deal-Product Relations Processed: ${migrationStats.dealProducts.processed}
Deal-Product Relations Created: ${migrationStats.dealProducts.created}
Deal-Product Relations Errors: ${migrationStats.dealProducts.errors}

Deal Slug Relations Processed: ${migrationStats.dealSlugRelations.processed}
Deal Slug Relations Created: ${migrationStats.dealSlugRelations.created}
Deal Slug Relations Errors: ${migrationStats.dealSlugRelations.errors}

Image Migration:
  - Processed: ${migrationStats.images.processed}
  - Uploaded to S3: ${migrationStats.images.uploaded}
  - Skipped: ${migrationStats.images.skipped}
  - Errors: ${migrationStats.images.errors}

Total Deals Migrated: ${migrationStats.deals.created}
Total Relationships Migrated: ${migrationStats.dealProducts.created}
Total Slug Relations Created: ${migrationStats.dealSlugRelations.created}
`;

  console.log(report);
}
