'use strict';

/**
 * Blog SEO Metadata Migration from Old Database
 * 
 * This seeder extracts SEO metadata (meta title, description, focus keyword, etc.)
 * from the old database for blog posts and migrates them to the new seo_meta table.
 * 
 * SAFETY FEATURES:
 * - Only inserts if SEO metadata doesn't exist (won't overwrite existing data)
 * - Checks unique constraints before inserting (slug, entityType+entityId)
 * - Uses transactions (rollback on error)
 * - Validates entity existence before creating SEO metadata
 * - Handles slug conflicts gracefully
 * 
 * Sources:
 * - Blog Posts: vh_postmeta with rank_math_* keys (post_type = 'post')
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
      console.log('🚀 Starting BLOG SEO METADATA MIGRATION from old database...');
      console.log(`🔧 Environment: ${environment}`);
      
      const migrationStats = {
        blogsProcessed: 0,
        blogsInserted: 0,
        blogsSkipped: 0,
        errors: 0
      };

      // Connect to old database
      await crossServerMigration.connectToOldDb();
      console.log('✅ Connected to old database successfully');

      // ============================================
      // STEP 1: FETCH BLOG SEO METADATA FROM OLD DB
      // ============================================
      console.log('\n📝 Step 1: Fetching Blog SEO Metadata from old DB...');
      
      const blogSeoData = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          p.ID as old_post_id,
          p.post_name as slug,
          pm_title.meta_value as rank_math_title,
          pm_description.meta_value as rank_math_description,
          pm_focus_keyword.meta_value as rank_math_focus_keyword,
          pm_robots.meta_value as rank_math_robots,
          pm_canonical.meta_value as rank_math_canonical_url,
          pm_og_image.meta_value as rank_math_og_image,
          pm_facebook_title.meta_value as rank_math_facebook_title,
          pm_facebook_description.meta_value as rank_math_facebook_description,
          pm_facebook_image.meta_value as rank_math_facebook_image,
          p.post_status as post_status,
          p.post_date as published_at
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
        WHERE p.post_type = 'post'
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

      console.log(`📊 Found ${blogSeoData.length} blog posts with SEO metadata`);

      // ============================================
      // STEP 2: INSERT INTO seo_meta AS blog_post
      // ============================================
      for (const seoData of blogSeoData) {
        try {
          migrationStats.blogsProcessed++;

          const blogSlug = (seoData.slug || '').trim();
          if (!blogSlug) {
            migrationStats.blogsSkipped++;
            continue;
          }

          // Find the blog in new DB by slug
          const blogs = await queryInterface.sequelize.query(`
            SELECT id, title, slug, status, published_at
            FROM blogs 
            WHERE slug = ?
          `, {
            replacements: [blogSlug],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });

          if (!blogs || blogs.length === 0) {
            // No matching blog in new DB, skip
            migrationStats.blogsSkipped++;
            continue;
          }

          const blog = blogs[0];
          const newBlogId = blog.id;

          // CRITICAL SAFETY CHECK: Check if SEO metadata already exists
          const [existingSeo] = await queryInterface.sequelize.query(`
            SELECT id 
            FROM seo_meta 
            WHERE entityType = 'blog_post' AND entityId = ?
          `, {
            replacements: [newBlogId],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });

          if (existingSeo && existingSeo.length > 0) {
            migrationStats.blogsSkipped++;
            continue;
          }

          // Normalize slug (same logic as elsewhere)
          const normalizedSlug = slugManager.normalizeSlug(blogSlug);
          if (!normalizedSlug) {
            migrationStats.blogsSkipped++;
            continue;
          }

          // CRITICAL SAFETY CHECK: Check if slug is already taken
          const [existingSlug] = await queryInterface.sequelize.query(`
            SELECT id, entityType, entityId 
            FROM seo_meta 
            WHERE slug = ?
          `, {
            replacements: [normalizedSlug],
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });

          let finalSlug = normalizedSlug;
          if (existingSlug && existingSlug.length > 0) {
            const existing = existingSlug[0];
            if (existing.entityType !== 'blog_post' || existing.entityId !== newBlogId) {
              finalSlug = `${normalizedSlug}-${newBlogId}`;
              console.log(`   ⚠️  Slug conflict for blog ${newBlogId}, using: ${finalSlug}`);
            }
          }

          // Determine blog status for noIndex calculation
          // Use blog status from new DB, or infer from old post_status
          let blogStatus = blog.status;
          if (!blogStatus) {
            blogStatus = seoData.post_status === 'publish' ? 'published' : 'draft';
          }

          // Insert blog SEO metadata
          await insertBlogSeoMeta(queryInterface, Sequelize, {
            blogId: newBlogId,
            slug: finalSlug,
            seoData,
            blogStatus: blogStatus,
            transaction
          });

          migrationStats.blogsInserted++;
          if (migrationStats.blogsInserted % 20 === 0) {
            console.log(`   ✅ Processed ${migrationStats.blogsInserted} blogs...`);
          }

        } catch (error) {
          migrationStats.errors++;
          console.error(`   ❌ Error processing blog post ${seoData.old_post_id}:`, error.message);
        }
      }

      console.log(`✅ Blog SEO metadata: ${migrationStats.blogsInserted} inserted, ${migrationStats.blogsSkipped} skipped, ${migrationStats.errors} errors`);

      // ============================================
      // STEP 3: GENERATE MIGRATION REPORT
      // ============================================
      console.log('\n📊 Step 3: Generating Migration Report...');
      generateMigrationReport(migrationStats);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      // Commit transaction
      await transaction.commit();
      console.log('\n🎉 BLOG SEO METADATA MIGRATION COMPLETED SUCCESSFULLY!');

    } catch (error) {
      // Rollback transaction on any error
      await transaction.rollback();
      console.error('\n❌ BLOG SEO METADATA MIGRATION FAILED - ROLLED BACK:', error);
      
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
      console.log('🔄 Rolling back blog SEO metadata migration...');
      console.log('⚠️  WARNING: This will delete ALL SEO metadata for blog posts (entityType = blog_post)');
      console.log('⚠️  This includes manually created SEO metadata as well');
      
      await queryInterface.sequelize.query(`
        DELETE FROM seo_meta 
        WHERE entityType = 'blog_post'
      `, { transaction });
      
      console.log(`✅ Cleared SEO metadata for blog posts`);
      
      await transaction.commit();
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error during rollback:', error);
      throw error;
    }
  }
};

/**
 * Insert blog SEO metadata
 */
async function insertBlogSeoMeta(queryInterface, Sequelize, { blogId, slug, seoData, blogStatus, transaction }) {
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
    // Default: noIndex if blog is not published
    noIndex = blogStatus !== 'published';
  }

  // Get OG image (prefer og_image, fallback to facebook_image)
  let ogImage = seoData.rank_math_og_image || seoData.rank_math_facebook_image || null;
  
  // If ogImage is an attachment ID, keep as-is (can be resolved later if needed)
  if (ogImage && /^\d+$/.test(ogImage)) {
    // Optionally resolve via old DB later; keep ID for now
  }

  await queryInterface.sequelize.query(`
    INSERT INTO seo_meta (
      entityType, entityId, title, description, focusKeyword, 
      slug, canonicalUrl, ogImage, noIndex, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  `, {
    replacements: [
      'blog_post',
      blogId,
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
  const totalProcessed = migrationStats.blogsProcessed;
  const totalInserted = migrationStats.blogsInserted;
  const totalSkipped = migrationStats.blogsSkipped;

  const report = `
📊 BLOG SEO METADATA MIGRATION REPORT
================================================================
Migration completed at: ${new Date().toISOString()}

STATISTICS:
- Blogs Processed: ${migrationStats.blogsProcessed}
- Blogs Inserted: ${migrationStats.blogsInserted}
- Blogs Skipped: ${migrationStats.blogsSkipped}
- Total Errors: ${migrationStats.errors}

SUCCESS RATES:
- Blogs: ${migrationStats.blogsProcessed > 0 ? 
  ((migrationStats.blogsInserted / migrationStats.blogsProcessed) * 100).toFixed(2)
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
    
    const reportPath = path.join(logsDir, 'blog-seo-metadata-migration-report.txt');
    fs.writeFileSync(reportPath, report);
    console.log(`📄 Detailed report saved to: ${reportPath}`);
  } catch (error) {
    console.log('⚠️  Could not save report file:', error.message);
  }
}

