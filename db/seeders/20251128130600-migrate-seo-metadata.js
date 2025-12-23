'use strict';

/**
 * SEO Metadata Migration from Old Database
 * 
 * This seeder extracts SEO metadata (meta title, description, focus keyword, etc.)
 * from the old database and migrates them to the new seo_meta table.
 * 
 * SAFETY FEATURES:
 * - Only inserts if SEO metadata doesn't exist (won't overwrite existing data)
 * - Checks unique constraints before inserting (slug, entityType+entityId)
 * - Uses transactions (rollback on error)
 * - Validates entity existence before creating SEO metadata
 * - Handles slug conflicts gracefully
 * 
 * Sources:
 * - Products: vh_postmeta with rank_math_* keys
 * - Categories: vh_termmeta with rank_math_* keys (product_cat taxonomy)
 * - Brands: vh_termmeta with rank_math_* keys (pwb-brand taxonomy)
 */

const CrossServerMigration = require('../../utils/cross-server-migration');
const SlugManager = require('../../utils/slugManager');
const { SlugRelation } = require('../../models');

const slugManager = new SlugManager(SlugRelation);

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const environment = process.env.NODE_ENV || 'local';
    const crossServerMigration = new CrossServerMigration(environment);
    
    try {
      console.log('🚀 Starting SEO METADATA MIGRATION from old database...');
      console.log(`🔧 Environment: ${environment}`);
      
      const migrationStats = {
        productsProcessed: 0,
        productsInserted: 0,
        productsSkipped: 0,
        categoriesProcessed: 0,
        categoriesInserted: 0,
        categoriesSkipped: 0,
        brandsProcessed: 0,
        brandsInserted: 0,
        brandsSkipped: 0,
        errors: 0
      };

      // Connect to old database
      await crossServerMigration.connectToOldDb();
      console.log('✅ Connected to old database successfully');

      // ============================================
      // STEP 1: MIGRATE PRODUCT SEO METADATA
      // ============================================
      console.log('\n📦 Step 1: Migrating Product SEO Metadata...');
      
      const productSeoData = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          p.ID as old_product_id,
          p.post_name as slug,
          pm_title.meta_value as rank_math_title,
          pm_description.meta_value as rank_math_description,
          pm_focus_keyword.meta_value as rank_math_focus_keyword,
          pm_robots.meta_value as rank_math_robots,
          pm_canonical.meta_value as rank_math_canonical_url,
          pm_og_image.meta_value as rank_math_og_image,
          pm_facebook_title.meta_value as rank_math_facebook_title,
          pm_facebook_description.meta_value as rank_math_facebook_description,
          pm_facebook_image.meta_value as rank_math_facebook_image
        FROM vh_posts p
        LEFT JOIN vh_postmeta pm_title ON p.ID = pm_title.post_id AND pm_title.meta_key = 'rank_math_title'
        LEFT JOIN vh_postmeta pm_description ON p.ID = pm_description.post_id AND pm_description.meta_key = 'rank_math_description'
        LEFT JOIN vh_postmeta pm_focus_keyword ON p.ID = pm_focus_keyword.post_id AND pm_focus_keyword.meta_key = 'rank_math_focus_keyword'
        LEFT JOIN vh_postmeta pm_robots ON p.ID = pm_robots.post_id AND pm_robots.meta_key = 'rank_math_robots'
        LEFT JOIN vh_postmeta pm_canonical ON p.ID = pm_canonical.post_id AND pm_canonical.meta_key = 'rank_math_canonical_url'
        LEFT JOIN vh_postmeta pm_og_image ON p.ID = pm_og_image.post_id AND pm_og_image.meta_key = 'rank_math_og_image'
        LEFT JOIN vh_postmeta pm_facebook_title ON p.ID = pm_facebook_title.post_id AND pm_facebook_title.meta_key = 'rank_math_facebook_title'
        LEFT JOIN vh_postmeta pm_facebook_description ON p.ID = pm_facebook_description.post_id AND pm_facebook_description.meta_key = 'rank_math_facebook_description'
        LEFT JOIN vh_postmeta pm_facebook_image ON p.ID = pm_facebook_image.post_id AND pm_facebook_image.meta_key = 'rank_math_facebook_image'
        WHERE p.post_type = 'product'
        AND p.post_status IN ('publish', 'draft', 'private')
        AND p.post_name IS NOT NULL
        AND p.post_name != ''
        AND (
          pm_title.meta_value IS NOT NULL 
          OR pm_description.meta_value IS NOT NULL
          OR pm_focus_keyword.meta_value IS NOT NULL
        )
        ORDER BY p.ID ASC
      `);

      console.log(`📊 Found ${productSeoData.length} products with SEO metadata`);

      for (const seoData of productSeoData) {
        try {
          migrationStats.productsProcessed++;

          // Find the product in new database by old ID (products use exact ID mapping)
          const [products] = await queryInterface.sequelize.query(`
            SELECT id, name, slug, status FROM products WHERE id = ?
          `, {
            replacements: [seoData.old_product_id],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });

          if (!products || products.length === 0) {
            migrationStats.productsSkipped++;
            continue;
          }

          const product = products[0];
          const newProductId = product.id;
          const productSlug = seoData.slug || product.slug;

          if (!productSlug || !productSlug.trim()) {
            migrationStats.productsSkipped++;
            continue;
          }

          // CRITICAL SAFETY CHECK: Check if SEO metadata already exists
          // This prevents overwriting existing data
          const [existingSeo] = await queryInterface.sequelize.query(`
            SELECT id FROM seo_meta 
            WHERE entityType = 'product' AND entityId = ?
          `, {
            replacements: [newProductId],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });

          if (existingSeo && existingSeo.length > 0) {
            migrationStats.productsSkipped++;
            continue;
          }

          // Normalize slug (same as product controller)
          const normalizedSlug = slugManager.normalizeSlug(productSlug);
          
          if (!normalizedSlug) {
            migrationStats.productsSkipped++;
            continue;
          }

          // CRITICAL SAFETY CHECK: Check if slug is already taken
          const [existingSlug] = await queryInterface.sequelize.query(`
            SELECT id, entityType, entityId FROM seo_meta WHERE slug = ?
          `, {
            replacements: [normalizedSlug],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });

          let finalSlug = normalizedSlug;
          if (existingSlug && existingSlug.length > 0) {
            const existing = existingSlug[0];
            // If slug belongs to different entity, create unique slug
            if (existing.entityType !== 'product' || existing.entityId !== newProductId) {
              finalSlug = `${normalizedSlug}-${newProductId}`;
              console.log(`   ⚠️  Slug conflict for product ${newProductId}, using: ${finalSlug}`);
            }
          }

          await insertProductSeoMeta(queryInterface, Sequelize, {
            productId: newProductId,
            slug: finalSlug,
            seoData,
            productStatus: product.status,
            transaction
          });

          migrationStats.productsInserted++;
          if (migrationStats.productsInserted % 50 === 0) {
            console.log(`   ✅ Processed ${migrationStats.productsInserted} products...`);
          }

        } catch (error) {
          migrationStats.errors++;
          console.error(`   ❌ Error processing product ${seoData.old_product_id}:`, error.message);
        }
      }

      console.log(`✅ Product SEO metadata: ${migrationStats.productsInserted} inserted, ${migrationStats.productsSkipped} skipped, ${migrationStats.errors} errors`);

      // ============================================
      // STEP 2: MIGRATE CATEGORY SEO METADATA
      // ============================================
      console.log('\n📂 Step 2: Migrating Category SEO Metadata...');
      
      const categorySeoData = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          t.term_id as old_term_id,
          t.name as category_name,
          t.slug,
          tm_title.meta_value as rank_math_title,
          tm_description.meta_value as rank_math_description,
          tm_focus_keyword.meta_value as rank_math_focus_keyword,
          tm_robots.meta_value as rank_math_robots,
          tm_canonical.meta_value as rank_math_canonical_url,
          tm_og_image.meta_value as rank_math_og_image
        FROM vh_terms t
        JOIN vh_term_taxonomy tt ON t.term_id = tt.term_id
        LEFT JOIN vh_termmeta tm_title ON t.term_id = tm_title.term_id AND tm_title.meta_key = 'rank_math_title'
        LEFT JOIN vh_termmeta tm_description ON t.term_id = tm_description.term_id AND tm_description.meta_key = 'rank_math_description'
        LEFT JOIN vh_termmeta tm_focus_keyword ON t.term_id = tm_focus_keyword.term_id AND tm_focus_keyword.meta_key = 'rank_math_focus_keyword'
        LEFT JOIN vh_termmeta tm_robots ON t.term_id = tm_robots.term_id AND tm_robots.meta_key = 'rank_math_robots'
        LEFT JOIN vh_termmeta tm_canonical ON t.term_id = tm_canonical.term_id AND tm_canonical.meta_key = 'rank_math_canonical_url'
        LEFT JOIN vh_termmeta tm_og_image ON t.term_id = tm_og_image.term_id AND tm_og_image.meta_key = 'rank_math_og_image'
        WHERE tt.taxonomy = 'product_cat'
        AND (
          tm_title.meta_value IS NOT NULL 
          OR tm_description.meta_value IS NOT NULL
          OR tm_focus_keyword.meta_value IS NOT NULL
        )
        ORDER BY t.term_id ASC
      `);

      console.log(`📊 Found ${categorySeoData.length} categories with SEO metadata`);

      for (const seoData of categorySeoData) {
        try {
          migrationStats.categoriesProcessed++;

          // Find category in new database by slug
          const [categories] = await queryInterface.sequelize.query(`
            SELECT id, name, slug FROM categories WHERE slug = ?
          `, {
            replacements: [seoData.slug],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });

          if (!categories || categories.length === 0) {
            migrationStats.categoriesSkipped++;
            continue;
          }

          const category = categories[0];
          const newCategoryId = category.id;
          const categorySlug = seoData.slug || category.slug;

          if (!categorySlug || !categorySlug.trim()) {
            migrationStats.categoriesSkipped++;
            continue;
          }

          // CRITICAL SAFETY CHECK: Check if SEO metadata already exists
          const [existingSeo] = await queryInterface.sequelize.query(`
            SELECT id FROM seo_meta 
            WHERE entityType = 'category' AND entityId = ?
          `, {
            replacements: [newCategoryId],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });

          if (existingSeo && existingSeo.length > 0) {
            migrationStats.categoriesSkipped++;
            continue;
          }

          // Normalize slug
          const normalizedSlug = slugManager.normalizeSlug(categorySlug);
          
          if (!normalizedSlug) {
            migrationStats.categoriesSkipped++;
            continue;
          }

          // CRITICAL SAFETY CHECK: Check if slug is already taken
          const [existingSlug] = await queryInterface.sequelize.query(`
            SELECT id, entityType, entityId FROM seo_meta WHERE slug = ?
          `, {
            replacements: [normalizedSlug],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });

          let finalSlug = normalizedSlug;
          if (existingSlug && existingSlug.length > 0) {
            const existing = existingSlug[0];
            if (existing.entityType !== 'category' || existing.entityId !== newCategoryId) {
              finalSlug = `${normalizedSlug}-${newCategoryId}`;
              console.log(`   ⚠️  Slug conflict for category ${newCategoryId}, using: ${finalSlug}`);
            }
          }

          await insertCategorySeoMeta(queryInterface, Sequelize, {
            categoryId: newCategoryId,
            slug: finalSlug,
            seoData,
            transaction
          });

          migrationStats.categoriesInserted++;
          if (migrationStats.categoriesInserted % 20 === 0) {
            console.log(`   ✅ Processed ${migrationStats.categoriesInserted} categories...`);
          }

        } catch (error) {
          migrationStats.errors++;
          console.error(`   ❌ Error processing category ${seoData.category_name}:`, error.message);
        }
      }

      console.log(`✅ Category SEO metadata: ${migrationStats.categoriesInserted} inserted, ${migrationStats.categoriesSkipped} skipped, ${migrationStats.errors} errors`);

      // ============================================
      // STEP 3: MIGRATE BRAND SEO METADATA
      // ============================================
      console.log('\n🏷️  Step 3: Migrating Brand SEO Metadata...');
      
      const brandSeoData = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          t.term_id as old_term_id,
          t.name as brand_name,
          t.slug,
          tm_title.meta_value as rank_math_title,
          tm_description.meta_value as rank_math_description,
          tm_focus_keyword.meta_value as rank_math_focus_keyword,
          tm_robots.meta_value as rank_math_robots,
          tm_canonical.meta_value as rank_math_canonical_url,
          tm_og_image.meta_value as rank_math_og_image
        FROM vh_terms t
        JOIN vh_term_taxonomy tt ON t.term_id = tt.term_id
        LEFT JOIN vh_termmeta tm_title ON t.term_id = tm_title.term_id AND tm_title.meta_key = 'rank_math_title'
        LEFT JOIN vh_termmeta tm_description ON t.term_id = tm_description.term_id AND tm_description.meta_key = 'rank_math_description'
        LEFT JOIN vh_termmeta tm_focus_keyword ON t.term_id = tm_focus_keyword.term_id AND tm_focus_keyword.meta_key = 'rank_math_focus_keyword'
        LEFT JOIN vh_termmeta tm_robots ON t.term_id = tm_robots.term_id AND tm_robots.meta_key = 'rank_math_robots'
        LEFT JOIN vh_termmeta tm_canonical ON t.term_id = tm_canonical.term_id AND tm_canonical.meta_key = 'rank_math_canonical_url'
        LEFT JOIN vh_termmeta tm_og_image ON t.term_id = tm_og_image.term_id AND tm_og_image.meta_key = 'rank_math_og_image'
        WHERE tt.taxonomy = 'pwb-brand'
        AND (
          tm_title.meta_value IS NOT NULL 
          OR tm_description.meta_value IS NOT NULL
          OR tm_focus_keyword.meta_value IS NOT NULL
        )
        ORDER BY t.term_id ASC
      `);

      console.log(`📊 Found ${brandSeoData.length} brands with SEO metadata`);

      for (const seoData of brandSeoData) {
        try {
          migrationStats.brandsProcessed++;

          // Find brand in new database by slug
          const [brands] = await queryInterface.sequelize.query(`
            SELECT id, name, slug FROM brands WHERE slug = ?
          `, {
            replacements: [seoData.slug],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });

          if (!brands || brands.length === 0) {
            migrationStats.brandsSkipped++;
            continue;
          }

          const brand = brands[0];
          const newBrandId = brand.id;
          const brandSlug = seoData.slug || brand.slug;

          if (!brandSlug || !brandSlug.trim()) {
            migrationStats.brandsSkipped++;
            continue;
          }

          // CRITICAL SAFETY CHECK: Check if SEO metadata already exists
          const [existingSeo] = await queryInterface.sequelize.query(`
            SELECT id FROM seo_meta 
            WHERE entityType = 'brand' AND entityId = ?
          `, {
            replacements: [newBrandId],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });

          if (existingSeo && existingSeo.length > 0) {
            migrationStats.brandsSkipped++;
            continue;
          }

          // Normalize slug
          const normalizedSlug = slugManager.normalizeSlug(brandSlug);
          
          if (!normalizedSlug) {
            migrationStats.brandsSkipped++;
            continue;
          }

          // CRITICAL SAFETY CHECK: Check if slug is already taken
          const [existingSlug] = await queryInterface.sequelize.query(`
            SELECT id, entityType, entityId FROM seo_meta WHERE slug = ?
          `, {
            replacements: [normalizedSlug],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });

          let finalSlug = normalizedSlug;
          if (existingSlug && existingSlug.length > 0) {
            const existing = existingSlug[0];
            if (existing.entityType !== 'brand' || existing.entityId !== newBrandId) {
              finalSlug = `${normalizedSlug}-${newBrandId}`;
              console.log(`   ⚠️  Slug conflict for brand ${newBrandId}, using: ${finalSlug}`);
            }
          }

          await insertBrandSeoMeta(queryInterface, Sequelize, {
            brandId: newBrandId,
            slug: finalSlug,
            seoData,
            transaction
          });

          migrationStats.brandsInserted++;
          if (migrationStats.brandsInserted % 20 === 0) {
            console.log(`   ✅ Processed ${migrationStats.brandsInserted} brands...`);
          }

        } catch (error) {
          migrationStats.errors++;
          console.error(`   ❌ Error processing brand ${seoData.brand_name}:`, error.message);
        }
      }

      console.log(`✅ Brand SEO metadata: ${migrationStats.brandsInserted} inserted, ${migrationStats.brandsSkipped} skipped, ${migrationStats.errors} errors`);

      // ============================================
      // STEP 4: GENERATE MIGRATION REPORT
      // ============================================
      console.log('\n📊 Step 4: Generating Migration Report...');
      generateMigrationReport(migrationStats);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      // Commit transaction
      await transaction.commit();
      console.log('\n🎉 SEO METADATA MIGRATION COMPLETED SUCCESSFULLY!');

    } catch (error) {
      // Rollback transaction on any error
      await transaction.rollback();
      console.error('\n❌ SEO METADATA MIGRATION FAILED - ROLLED BACK:', error);
      
      // Close old database connection if still open
      if (crossServerMigration.oldDbConnection) {
        await crossServerMigration.closeOldDbConnection();
      }
      
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back SEO metadata migration...');
      console.log('⚠️  WARNING: This will delete ALL SEO metadata for products, categories, and brands');
      console.log('⚠️  This includes manually created SEO metadata as well');
      
      // Note: In a production environment, you might want to add a flag to track
      // which records were migrated vs manually created, so you only delete migrated ones
      const [deletedCount] = await queryInterface.sequelize.query(`
        DELETE FROM seo_meta 
        WHERE entityType IN ('product', 'category', 'brand')
      `, { transaction });
      
      console.log(`✅ Cleared SEO metadata for products, categories, and brands`);
      
      await transaction.commit();
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error during rollback:', error);
      throw error;
    }
  }
};

/**
 * Insert product SEO metadata
 */
async function insertProductSeoMeta(queryInterface, Sequelize, { productId, slug, seoData, productStatus, transaction }) {
  const title = seoData.rank_math_title || seoData.rank_math_facebook_title || null;
  const description = seoData.rank_math_description || seoData.rank_math_facebook_description || null;
  const focusKeyword = seoData.rank_math_focus_keyword || null;
  const canonicalUrl = seoData.rank_math_canonical_url || null;
  
  // Parse robots meta to determine noIndex
  let noIndex = false;
  if (seoData.rank_math_robots) {
    const robots = seoData.rank_math_robots.toLowerCase();
    noIndex = robots.includes('noindex');
  } else {
    // Default: noIndex if product is not published
    noIndex = productStatus !== 'published';
  }

  // Get OG image (prefer og_image, fallback to facebook_image)
  let ogImage = seoData.rank_math_og_image || seoData.rank_math_facebook_image || null;
  
  // If ogImage is an attachment ID, try to get the actual URL from old DB
  if (ogImage && /^\d+$/.test(ogImage)) {
    try {
      // Note: This requires old DB connection, but we'll handle it gracefully
      ogImage = ogImage; // Keep as-is, can be resolved later if needed
    } catch (error) {
      // If we can't get the image URL, keep the ID
    }
  }

  await queryInterface.sequelize.query(`
    INSERT INTO seo_meta (
      entityType, entityId, title, description, focusKeyword, 
      slug, canonicalUrl, ogImage, noIndex, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `, {
    replacements: [
      'product',
      productId,
      title,
      description,
      focusKeyword,
      slug,
      canonicalUrl,
      ogImage,
      noIndex
    ],
    transaction
  });
}

/**
 * Insert category SEO metadata
 */
async function insertCategorySeoMeta(queryInterface, Sequelize, { categoryId, slug, seoData, transaction }) {
  const title = seoData.rank_math_title || null;
  const description = seoData.rank_math_description || null;
  const focusKeyword = seoData.rank_math_focus_keyword || null;
  const canonicalUrl = seoData.rank_math_canonical_url || null;
  
  // Parse robots meta to determine noIndex
  let noIndex = false;
  if (seoData.rank_math_robots) {
    const robots = seoData.rank_math_robots.toLowerCase();
    noIndex = robots.includes('noindex');
  }

  // Get OG image
  let ogImage = seoData.rank_math_og_image || null;

  await queryInterface.sequelize.query(`
    INSERT INTO seo_meta (
      entityType, entityId, title, description, focusKeyword, 
      slug, canonicalUrl, ogImage, noIndex, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `, {
    replacements: [
      'category',
      categoryId,
      title,
      description,
      focusKeyword,
      slug,
      canonicalUrl,
      ogImage,
      noIndex
    ],
    transaction
  });
}

/**
 * Insert brand SEO metadata
 */
async function insertBrandSeoMeta(queryInterface, Sequelize, { brandId, slug, seoData, transaction }) {
  const title = seoData.rank_math_title || null;
  const description = seoData.rank_math_description || null;
  const focusKeyword = seoData.rank_math_focus_keyword || null;
  const canonicalUrl = seoData.rank_math_canonical_url || null;
  
  // Parse robots meta to determine noIndex
  let noIndex = false;
  if (seoData.rank_math_robots) {
    const robots = seoData.rank_math_robots.toLowerCase();
    noIndex = robots.includes('noindex');
  }

  // Get OG image
  let ogImage = seoData.rank_math_og_image || null;

  await queryInterface.sequelize.query(`
    INSERT INTO seo_meta (
      entityType, entityId, title, description, focusKeyword, 
      slug, canonicalUrl, ogImage, noIndex, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `, {
    replacements: [
      'brand',
      brandId,
      title,
      description,
      focusKeyword,
      slug,
      canonicalUrl,
      ogImage,
      noIndex
    ],
    transaction
  });
}

/**
 * Generate migration report
 */
function generateMigrationReport(migrationStats) {
  const totalProcessed = migrationStats.productsProcessed + migrationStats.categoriesProcessed + migrationStats.brandsProcessed;
  const totalInserted = migrationStats.productsInserted + migrationStats.categoriesInserted + migrationStats.brandsInserted;
  const totalSkipped = migrationStats.productsSkipped + migrationStats.categoriesSkipped + migrationStats.brandsSkipped;

  const report = `
📊 SEO METADATA MIGRATION REPORT
================================================================
Migration completed at: ${new Date().toISOString()}

STATISTICS:
- Products Processed: ${migrationStats.productsProcessed}
- Products Inserted: ${migrationStats.productsInserted}
- Products Skipped: ${migrationStats.productsSkipped}
- Categories Processed: ${migrationStats.categoriesProcessed}
- Categories Inserted: ${migrationStats.categoriesInserted}
- Categories Skipped: ${migrationStats.categoriesSkipped}
- Brands Processed: ${migrationStats.brandsProcessed}
- Brands Inserted: ${migrationStats.brandsInserted}
- Brands Skipped: ${migrationStats.brandsSkipped}
- Total Errors: ${migrationStats.errors}

SUCCESS RATES:
- Products: ${migrationStats.productsProcessed > 0 ? 
  ((migrationStats.productsInserted / migrationStats.productsProcessed) * 100).toFixed(2)
  : 0}%
- Categories: ${migrationStats.categoriesProcessed > 0 ? 
  ((migrationStats.categoriesInserted / migrationStats.categoriesProcessed) * 100).toFixed(2)
  : 0}%
- Brands: ${migrationStats.brandsProcessed > 0 ? 
  ((migrationStats.brandsInserted / migrationStats.brandsProcessed) * 100).toFixed(2)
  : 0}%

TOTAL INSERTED: ${totalInserted}
TOTAL SKIPPED: ${totalSkipped} (existing records preserved)

MIGRATION QUALITY:
- Data Integrity: ${migrationStats.errors === 0 ? '✅ Perfect' : '⚠️ Some errors occurred'}
- Overall Success: ${totalInserted > 0 ? '✅ Success' : '❌ No data migrated'}
- Existing Data Protected: ✅ All existing SEO metadata preserved

================================================================
`;

  console.log(report);

  // Save report to file
  const fs = require('fs');
  const path = require('path');
  const logsDir = path.join(__dirname, '../../../logs');
  
  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    const reportPath = path.join(logsDir, 'seo-metadata-migration-report.txt');
    fs.writeFileSync(reportPath, report);
    console.log(`📄 Detailed report saved to: ${reportPath}`);
  } catch (error) {
    console.log('⚠️  Could not save report file:', error.message);
  }
}


