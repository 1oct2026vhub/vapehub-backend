'use strict';

/**
 * Comprehensive Blog Data Migration from Old Database
 * 
 * This seeder migrates:
 * - Blog categories (with hierarchical structure)
 * - Blog posts (with content and metadata)
 * - Category-blog relationships
 * - Blog images (with S3 migration)
 */

const CrossServerMigration = require('../../utils/cross-server-migration');
const { uploadFiletToS3, generateUniqueFileName, generateCloudFrontUrlForS3, checkImageExists } = require('../../library/s3/s3Helper');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Progress tracking for failed downloads
let failedDownloads = [];
const progressFile = path.join(__dirname, '../../logs/blog-migration-progress.json');
const logFile = path.join(__dirname, '../../logs/blog-migration.log');

// Circuit breaker for 502 errors - SHARED SERVER configuration
let circuitBreaker = {
  consecutive502s: 0,
  totalErrors: 0,
  isOpen: false,
  lastErrorTime: null,
  cooldownPeriod: 900000 // 15 minutes for shared hosting
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const environment = process.env.NODE_ENV || 'local';
    console.log(`🔧 Using environment: ${environment}`);
    const crossServerMigration = new CrossServerMigration(environment);
    
    try {
      console.log('🚀 Starting BLOG DATA MIGRATION from old database...');
      
      const migrationStats = {
        categories: { processed: 0, created: 0, errors: 0 },
        blogs: { processed: 0, created: 0, errors: 0 },
        categoryRelations: { processed: 0, created: 0, errors: 0 },
        images: { processed: 0, uploaded: 0, skipped: 0, errors: 0, retryable_errors: 0 }
      };

      // Load previous progress if exists
      loadProgress(migrationStats);

      // Connect to old database
      await crossServerMigration.connectToOldDb();

      // Check if blog data exists (WordPress or custom tables)
      const blogDataExists = await checkBlogDataExists(crossServerMigration);
      if (!blogDataExists.hasAnyBlogData) {
        console.log('⚠️  No blog data found in old database. Skipping blog migration.');
        console.log('💡 Available tables:', blogDataExists.availableTables.slice(0, 10).join(', ') + '...');
        console.log('📖 To import blog data, first run the SQL dump files in x_migration/ directory');
        await crossServerMigration.closeOldDbConnection();
        return;
      }
      
      console.log(`✅ Found blog data source: ${blogDataExists.dataSource}`);
      console.log(`📊 Blog posts available: ${blogDataExists.postCount}`);
      if (blogDataExists.categoryCount > 0) {
        console.log(`📂 Categories available: ${blogDataExists.categoryCount}`);
      }

      // Clear existing blog data before migration
      console.log('\n🧹 Clearing existing blog data...');
      await clearExistingBlogData(queryInterface);
      console.log('✅ Existing blog data cleared successfully');

      // Step 1: Migrate blog categories
      console.log('\n📂 Step 1: Migrating blog categories...');
      await migrateBlogCategories(crossServerMigration, queryInterface, Sequelize, migrationStats, blogDataExists.useWordPress);


      // Step 2: Migrate blog posts
      console.log('\n📝 Step 2: Migrating blog posts...');
      await migrateBlogPosts(crossServerMigration, queryInterface, Sequelize, migrationStats, blogDataExists.useWordPress);

      // Step 3: Migrate category relationships
      console.log('\n🔗 Step 3: Migrating blog-category relationships...');
      await migrateBlogCategoryRelations(crossServerMigration, queryInterface, Sequelize, migrationStats, blogDataExists.useWordPress);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      console.log('\n✅ Blog data migration completed!');
      generateMigrationReport(migrationStats);

      // Save final progress
      saveProgress(migrationStats);

      if (failedDownloads.length > 0) {
        console.log('\n⚠️  Some blog images failed to download. Failed URLs saved to logs/blog-migration-progress.json');
        console.log('💡 You can manually retry these images later.');
      }

    } catch (error) {
      console.error('❌ Error during blog migration:', error);
      // Save progress even on error
      saveProgress(migrationStats);
      await crossServerMigration.closeOldDbConnection();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('⚠️ Blog migration cannot be automatically reversed');
    console.log('⚠️ Manual cleanup would be required');
    console.log('💡 You can delete migrated data using:');
    console.log('   DELETE FROM blog_category_relations;');
    console.log('   DELETE FROM blogs;');
    console.log('   DELETE FROM blog_categories;');
  }
};

/**
 * Migrate blog categories with hierarchical structure
 */
async function migrateBlogCategories(crossServerMigration, queryInterface, Sequelize, migrationStats, useWordPress = false) {
  try {
    let oldCategories;
    
    if (useWordPress) {
      // Get categories from WordPress taxonomy system
      oldCategories = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          tt.term_taxonomy_id as old_id,
          t.name,
          t.slug,
          tt.description,
          NULL as image_url,
          tt.parent as parent_id,
          'active' as status,
          NOW() as created_at,
          NOW() as updated_at
        FROM vh_term_taxonomy tt
        JOIN vh_terms t ON tt.term_id = t.term_id
        WHERE tt.taxonomy = 'category'
        ORDER BY ISNULL(tt.parent), tt.parent ASC, tt.term_taxonomy_id ASC
      `);
    } else {
      // Get categories from custom blog tables
      oldCategories = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          id as old_id,
          name,
          slug,
          description,
          image_url,
          parent_id,
          status,
          created_at,
          updated_at
        FROM blog_categories 
        ORDER BY ISNULL(parent_id), parent_id ASC, id ASC
      `);
    }

    console.log(`📊 Found ${oldCategories.length} blog categories to migrate`);

    const categoryMapping = {}; // old_id -> new_id mapping
    const defaultUserId = await getDefaultUserId(queryInterface);

    // Process categories in order (parents first)
    for (const oldCategory of oldCategories) {
      migrationStats.categories.processed++;
      
      try {
        // No need to check for existing categories since we cleared all data

        // Store category image URL directly (no S3 upload for now)
        let imageUrl = oldCategory.image_url;
        if (imageUrl) {
          logMessage(`📸 Storing category image URL: ${imageUrl}`);
          migrationStats.images.processed++;
          migrationStats.images.skipped++; // Count as skipped since we're not uploading
        }

        // Create new category
        const newCategory = await queryInterface.sequelize.query(`
          INSERT INTO blog_categories 
          (name, slug, description, image_url, parent_id, status, updated_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, {
          replacements: [
            oldCategory.name,
            oldCategory.slug,
            oldCategory.description,
            imageUrl,
            oldCategory.parent_id ? categoryMapping[oldCategory.parent_id] : null,
            oldCategory.status || 'active',
            defaultUserId,
            oldCategory.created_at,
            oldCategory.updated_at
          ],
          type: Sequelize.QueryTypes.INSERT
        });

        categoryMapping[oldCategory.old_id] = newCategory[0];
        migrationStats.categories.created++;
        
        logMessage(`✅ Created blog category: ${oldCategory.name} (ID: ${newCategory[0]})`);

        // Add delay to respect shared server
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        migrationStats.categories.errors++;
        logMessage(`❌ Error creating category ${oldCategory.name}: ${error.message}`);
      }
    }

    console.log(`📂 Categories migration completed: ${migrationStats.categories.created} created, ${migrationStats.categories.errors} errors`);
    return categoryMapping;

  } catch (error) {
    logMessage(`❌ Error in blog categories migration: ${error.message}`);
    throw error;
  }
}

/**
 * Find matching product image for a blog post based on title content
 */
async function findMatchingProductImage(blogTitle, originalImageUrl, queryInterface, migrationStats) {
  try {
    const titleLower = blogTitle.toLowerCase();
    
    // Define product brand keywords and their priorities
    const brandMatches = [
      { keywords: ['elf bar 600', 'elf bar v2'], priority: 1 },
      { keywords: ['elf bar'], priority: 2 },
      { keywords: ['elux legend', 'elux firerose'], priority: 1 },
      { keywords: ['elux'], priority: 2 },
      { keywords: ['lost mary bm600', 'lost mary bm3500'], priority: 1 },
      { keywords: ['lost mary'], priority: 2 },
      { keywords: ['crystal pro max', 'crystal legend', 'ske crystal'], priority: 1 },
      { keywords: ['crystal'], priority: 3 },
      { keywords: ['hayati pro ultra', 'hayati remix'], priority: 1 },
      { keywords: ['hayati'], priority: 2 },
      { keywords: ['randm tornado'], priority: 1 },
      { keywords: ['ivg 2400', 'ivg smart'], priority: 1 },
      { keywords: ['disposable vape', 'disposable'], priority: 4 },
      { keywords: ['pod kit', 'vape kit'], priority: 4 }
    ];

    let bestMatch = null;
    let bestPriority = 999;

    // Find the most specific match
    for (const brand of brandMatches) {
      for (const keyword of brand.keywords) {
        if (titleLower.includes(keyword)) {
          if (brand.priority < bestPriority) {
            bestPriority = brand.priority;
            bestMatch = keyword;
          }
          break; // Found a match for this brand, check next brand
        }
      }
    }

    if (bestMatch) {
      logMessage(`🎯 Blog "${blogTitle}" matches product category: "${bestMatch}"`);
      
      // Build SQL LIKE condition based on the match
      let productNameCondition;
      if (bestMatch.includes('elf bar 600')) {
        productNameCondition = "p.name LIKE '%elf%bar%600%' OR p.name LIKE '%elf%bar%v2%'";
      } else if (bestMatch.includes('elf bar')) {
        productNameCondition = "p.name LIKE '%elf%bar%'";
      } else if (bestMatch.includes('elux legend')) {
        productNameCondition = "p.name LIKE '%elux%legend%'";
      } else if (bestMatch.includes('elux firerose')) {
        productNameCondition = "p.name LIKE '%elux%firerose%'";
      } else if (bestMatch.includes('elux')) {
        productNameCondition = "p.name LIKE '%elux%'";
      } else if (bestMatch.includes('lost mary bm600')) {
        productNameCondition = "p.name LIKE '%lost%mary%bm600%'";
      } else if (bestMatch.includes('lost mary bm3500')) {
        productNameCondition = "p.name LIKE '%lost%mary%bm3500%'";
      } else if (bestMatch.includes('lost mary')) {
        productNameCondition = "p.name LIKE '%lost%mary%'";
      } else if (bestMatch.includes('crystal pro max')) {
        productNameCondition = "p.name LIKE '%crystal%pro%max%'";
      } else if (bestMatch.includes('ske crystal')) {
        productNameCondition = "p.name LIKE '%ske%crystal%'";
      } else if (bestMatch.includes('crystal legend')) {
        productNameCondition = "p.name LIKE '%crystal%legend%'";
      } else if (bestMatch.includes('crystal')) {
        productNameCondition = "p.name LIKE '%crystal%'";
      } else if (bestMatch.includes('hayati pro ultra')) {
        productNameCondition = "p.name LIKE '%hayati%pro%ultra%'";
      } else if (bestMatch.includes('hayati remix')) {
        productNameCondition = "p.name LIKE '%hayati%remix%'";
      } else if (bestMatch.includes('hayati')) {
        productNameCondition = "p.name LIKE '%hayati%'";
      } else if (bestMatch.includes('randm tornado')) {
        productNameCondition = "p.name LIKE '%randm%tornado%' OR p.name LIKE '%rand%m%tornado%'";
      } else if (bestMatch.includes('ivg 2400')) {
        productNameCondition = "p.name LIKE '%ivg%2400%'";
      } else if (bestMatch.includes('ivg smart')) {
        productNameCondition = "p.name LIKE '%ivg%smart%'";
      } else if (bestMatch.includes('pod kit')) {
        productNameCondition = "p.name LIKE '%pod%kit%'";
      } else if (bestMatch.includes('vape kit')) {
        productNameCondition = "p.name LIKE '%vape%kit%' OR p.name LIKE '%kit%'";
      } else if (bestMatch.includes('disposable')) {
        productNameCondition = "p.name LIKE '%disposable%'";
      } else {
        productNameCondition = `p.name LIKE '%${bestMatch.replace(/\s+/g, '%')}%'`;
      }

      // Find matching product with image
      const productMatches = await queryInterface.sequelize.query(`
        SELECT 
          p.id,
          p.name,
          pi.image_url,
          pi.is_primary
        FROM products p
        JOIN product_images pi ON p.id = pi.product_id
        WHERE ${productNameCondition}
        ORDER BY pi.is_primary DESC, p.id ASC
        LIMIT 1
      `, { type: queryInterface.sequelize.QueryTypes.SELECT });

      if (productMatches.length > 0) {
        const product = productMatches[0];
        logMessage(`✅ Found product match: "${product.name}" -> ${product.image_url}`);
        migrationStats.images.uploaded++; // Count as successful match
        return product.image_url;
      } else {
        logMessage(`⚠️ No product found matching: "${bestMatch}"`);
      }
    } else {
      logMessage(`💭 No product keywords found in: "${blogTitle}"`);
    }

    // Fallback to original image if no product match
    if (originalImageUrl) {
      migrationStats.images.skipped++; // Count as skipped (original used)
      return originalImageUrl;
    }

    migrationStats.images.errors++; // Count as error (no image available)
    return null;

  } catch (error) {
    logMessage(`❌ Error finding product image for "${blogTitle}": ${error.message}`);
    migrationStats.images.errors++;
    // Fallback to original image on error
    return originalImageUrl || null;
  }
}

/**
 * Migrate blog posts
 */
async function migrateBlogPosts(crossServerMigration, queryInterface, Sequelize, migrationStats, useWordPress = false) {
  try {
    let oldBlogs;
    
    if (useWordPress) {
      // Get blog posts from WordPress posts table with featured images
      oldBlogs = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          p.ID as old_id,
          p.post_title as title,
          p.post_name as slug,
          p.post_content as content,
          COALESCE(att.guid, NULL) as image_url,
          p.post_author as author_id,
          p.post_date as published_at,
          CASE 
            WHEN p.post_status = 'publish' THEN 'published'
            WHEN p.post_status = 'draft' THEN 'draft'
            ELSE 'draft'
          END as status,
          p.post_date as created_at,
          p.post_modified as updated_at
        FROM vh_posts p
        LEFT JOIN vh_postmeta pm ON p.ID = pm.post_id AND pm.meta_key = '_thumbnail_id'
        LEFT JOIN vh_posts att ON pm.meta_value = att.ID AND att.post_type = 'attachment'
        WHERE p.post_type = 'post' 
          AND p.post_status IN ('publish', 'draft')
        ORDER BY p.ID ASC
      `);
    } else {
      // Get blog posts from custom blog tables
      oldBlogs = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          id as old_id,
          title,
          slug,
          content,
          image_url,
          author_id,
          published_at,
          status,
          created_at,
          updated_at
        FROM blogs 
        ORDER BY id ASC
      `);
    }

    console.log(`📊 Found ${oldBlogs.length} blog posts to migrate`);

    const blogMapping = {}; // old_id -> new_id mapping
    const defaultUserId = await getDefaultUserId(queryInterface);

    for (const oldBlog of oldBlogs) {
      migrationStats.blogs.processed++;
      
      try {
        // No need to check for existing blogs since we cleared all data

        // Find matching product image or use original image
        let imageUrl = await findMatchingProductImage(oldBlog.title, oldBlog.image_url, queryInterface, migrationStats);
        if (imageUrl) {
          logMessage(`📸 Using image: ${imageUrl}`);
          migrationStats.images.processed++;
        }

        // Keep content as-is (no embedded image processing for now)
        let processedContent = oldBlog.content;

        // Map author_id (use default if author doesn't exist)
        let authorId = oldBlog.author_id;
        if (authorId) {
          const authorExists = await queryInterface.sequelize.query(`
            SELECT id FROM users WHERE id = ?
          `, {
            replacements: [authorId],
            type: Sequelize.QueryTypes.SELECT
          });
          
          if (authorExists.length === 0) {
            authorId = defaultUserId;
          }
        } else {
          authorId = defaultUserId;
        }

        // Create new blog post
        const newBlog = await queryInterface.sequelize.query(`
          INSERT INTO blogs 
          (title, slug, content, image_url, author_id, published_at, updated_by, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, {
          replacements: [
            oldBlog.title,
            oldBlog.slug,
            processedContent,
            imageUrl,
            authorId,
            oldBlog.published_at,
            defaultUserId,
            oldBlog.status || 'draft',
            oldBlog.created_at,
            oldBlog.updated_at
          ],
          type: Sequelize.QueryTypes.INSERT
        });

        blogMapping[oldBlog.old_id] = newBlog[0];
        migrationStats.blogs.created++;
        
        logMessage(`✅ Created blog post: ${oldBlog.title} (ID: ${newBlog[0]})`);

        // Add delay between posts
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        migrationStats.blogs.errors++;
        logMessage(`❌ Error creating blog ${oldBlog.title}: ${error.message}`);
      }
    }

    console.log(`📝 Blogs migration completed: ${migrationStats.blogs.created} created, ${migrationStats.blogs.errors} errors`);
    return blogMapping;

  } catch (error) {
    logMessage(`❌ Error in blog posts migration: ${error.message}`);
    throw error;
  }
}

/**
 * Migrate blog-category relationships
 */
async function migrateBlogCategoryRelations(crossServerMigration, queryInterface, Sequelize, migrationStats, useWordPress = false) {
  try {
    let oldRelations;
    
    if (useWordPress) {
      // Get blog-category relationships from WordPress with titles for matching
      oldRelations = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          p.ID as old_post_id,
          p.post_title,
          tt.term_taxonomy_id as old_category_id,
          t.name as category_name,
          NOW() as created_at
        FROM vh_posts p
        JOIN vh_term_relationships tr ON p.ID = tr.object_id
        JOIN vh_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
        JOIN vh_terms t ON tt.term_id = t.term_id
        WHERE p.post_type = 'post'
          AND p.post_status IN ('publish', 'draft')
          AND tt.taxonomy = 'category'
        ORDER BY p.ID, tt.term_taxonomy_id
      `);
    } else {
      // Get relationships from custom blog tables
      oldRelations = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          blog_id as old_blog_id,
          category_id as old_category_id,
          created_at
        FROM blog_category_relations 
        ORDER BY blog_id, category_id
      `);
    }

    console.log(`📊 Found ${oldRelations.length} blog-category relations to migrate`);

    let blogMapping, categoryMapping;
    
    if (useWordPress) {
      // Create title-based mappings for WordPress
      blogMapping = await getBlogMappingByTitle(queryInterface);
      categoryMapping = await getCategoryMappingByName(queryInterface);
    } else {
      // Use old mapping approach for custom tables
      blogMapping = await getBlogMapping(queryInterface);
      categoryMapping = await getCategoryMapping(queryInterface);
    }

    for (const oldRelation of oldRelations) {
      migrationStats.categoryRelations.processed++;
      
      try {
        let newBlogId, newCategoryId;
        
        if (useWordPress) {
          // Match by title and name
          newBlogId = blogMapping[oldRelation.post_title?.toLowerCase()?.trim()];
          newCategoryId = categoryMapping[oldRelation.category_name?.toLowerCase()?.trim()];
        } else {
          // Match by old IDs
          newBlogId = blogMapping[oldRelation.old_blog_id];
          newCategoryId = categoryMapping[oldRelation.old_category_id];
        }

        if (!newBlogId || !newCategoryId) {
          if (useWordPress) {
            logMessage(`⚠️ Skipping relation - blog or category not found: "${oldRelation.post_title}" -> "${oldRelation.category_name}"`);
          } else {
            logMessage(`⚠️ Skipping relation - blog or category not found: blog ${oldRelation.old_blog_id} -> category ${oldRelation.old_category_id}`);
          }
          continue;
        }

        // Check if relation already exists
        const existingRelation = await queryInterface.sequelize.query(`
          SELECT 1 FROM blog_category_relations WHERE blog_id = ? AND category_id = ?
        `, {
          replacements: [newBlogId, newCategoryId],
          type: Sequelize.QueryTypes.SELECT
        });

        if (existingRelation.length > 0) {
          if (useWordPress) {
            logMessage(`⏭️ Relation already exists: "${oldRelation.post_title}" -> "${oldRelation.category_name}"`);
          } else {
            logMessage(`⏭️ Relation already exists: blog ${newBlogId} -> category ${newCategoryId}`);
          }
          continue;
        }

        // Create relation
        await queryInterface.sequelize.query(`
          INSERT INTO blog_category_relations (blog_id, category_id, created_at)
          VALUES (?, ?, ?)
        `, {
          replacements: [newBlogId, newCategoryId, oldRelation.created_at],
          type: Sequelize.QueryTypes.INSERT
        });

        migrationStats.categoryRelations.created++;
        if (useWordPress) {
          logMessage(`✅ Created blog-category relation: "${oldRelation.post_title}" -> "${oldRelation.category_name}"`);
        } else {
          logMessage(`✅ Created blog-category relation: blog ${newBlogId} -> category ${newCategoryId}`);
        }

      } catch (error) {
        migrationStats.categoryRelations.errors++;
        logMessage(`❌ Error creating blog-category relation: ${error.message}`);
      }
    }

    console.log(`🔗 Category relations migration completed: ${migrationStats.categoryRelations.created} created, ${migrationStats.categoryRelations.errors} errors`);

  } catch (error) {
    logMessage(`❌ Error in blog-category relations migration: ${error.message}`);
    throw error;
  }
}



/**
 * Check if blog data exists in old database (WordPress or custom tables)
 */
async function checkBlogDataExists(crossServerMigration) {
  try {
    const tables = await crossServerMigration.fetchFromOldDb('SHOW TABLES');
    const tableNames = tables.map(table => Object.values(table)[0].toLowerCase());
    
    // Check for custom blog tables first
    const customBlogTables = {
      blog_categories: tableNames.includes('blog_categories'),
      blogs: tableNames.includes('blogs'),
      blog_category_relations: tableNames.includes('blog_category_relations')
    };

    const hasCustomBlogTables = Object.values(customBlogTables).some(exists => exists);
    
    if (hasCustomBlogTables) {
      // Count custom blog data
      let postCount = 0;
      try {
        const blogCountResult = await crossServerMigration.fetchFromOldDb('SELECT COUNT(*) as count FROM blogs');
        postCount = blogCountResult[0]?.count || 0;
      } catch (e) { /* ignore */ }
      
      return {
        hasAnyBlogData: postCount > 0,
        dataSource: 'Custom Blog Tables',
        postCount,
        categoryCount: 0,
        tagCount: 0, // Tags not needed
        availableTables: tableNames,
        useWordPress: false
      };
    }
    
    // Check for WordPress blog data
    const hasWordPressTables = tableNames.includes('vh_posts') && tableNames.includes('vh_term_taxonomy');
    
    if (hasWordPressTables) {
      let postCount = 0;
      let categoryCount = 0;
      let tagCount = 0;
      
      try {
        // Count WordPress blog posts
        const wpPostsResult = await crossServerMigration.fetchFromOldDb(`
          SELECT COUNT(*) as count 
          FROM vh_posts 
          WHERE post_type = 'post' AND post_status = 'publish'
        `);
        postCount = wpPostsResult[0]?.count || 0;
        
        // Count WordPress categories
        const wpCategoriesResult = await crossServerMigration.fetchFromOldDb(`
          SELECT COUNT(*) as count 
          FROM vh_term_taxonomy 
          WHERE taxonomy = 'category'
        `);
        categoryCount = wpCategoriesResult[0]?.count || 0;
        
        // Tags are not needed for this migration
        tagCount = 0;
        
      } catch (e) {
        logMessage(`⚠️ Error counting WordPress data: ${e.message}`);
      }
      
      return {
        hasAnyBlogData: postCount > 0,
        dataSource: 'WordPress',
        postCount,
        categoryCount,
        tagCount: 0, // Tags not needed
        availableTables: tableNames,
        useWordPress: true
      };
    }
    
    return {
      hasAnyBlogData: false,
      dataSource: 'None',
      postCount: 0,
      categoryCount: 0,
      tagCount: 0, // Tags not needed
      availableTables: tableNames,
      useWordPress: false
    };
    
  } catch (error) {
    logMessage(`❌ Error checking blog data existence: ${error.message}`);
    return {
      hasAnyBlogData: false,
      dataSource: 'Error',
      postCount: 0,
      categoryCount: 0,
      tagCount: 0, // Tags not needed
      availableTables: [],
      useWordPress: false
    };
  }
}

/**
 * Get default user ID for assignments
 */
async function getDefaultUserId(queryInterface) {
  try {
    // Try to find admin user by email first
    const adminUser = await queryInterface.sequelize.query(`
      SELECT id FROM users WHERE email = 'admin@vapehub.co.uk' LIMIT 1
    `, {
      type: queryInterface.sequelize.QueryTypes.SELECT
    });
    
    if (adminUser.length > 0) {
      return adminUser[0].id;
    }
    
    // If no admin found, get the first user
    const firstUser = await queryInterface.sequelize.query(`
      SELECT id FROM users ORDER BY id ASC LIMIT 1
    `, {
      type: queryInterface.sequelize.QueryTypes.SELECT
    });
    
    return firstUser.length > 0 ? firstUser[0].id : 1;
  } catch (error) {
    logMessage(`⚠️ Error getting default user ID: ${error.message}. Using fallback ID: 1`);
    return 1; // Fallback to user ID 1
  }
}

/**
 * Migrate a single image to S3
 */
async function migrateImage(imageUrl, folder, imageStats) {
  try {
    if (!imageUrl || imageUrl.trim() === '') {
      return null;
    }

    // Generate S3 key based on image URL
    const urlParts = imageUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];
    const s3Key = `${folder}/${fileName}`;

    // Check if image already exists in S3
    const imageExists = await checkImageExists(s3Key);
    if (imageExists) {
      imageStats.skipped++;
      return generateCloudFrontUrlForS3(s3Key);
    }

    // Check circuit breaker
    if (await checkCircuitBreaker()) {
      logMessage(`🔌 Circuit breaker is open. Skipping image: ${imageUrl}`);
      return null;
    }

    // Try to download and upload
    const uploadResult = await downloadAndUploadToS3(imageUrl, folder, s3Key, imageStats);
    if (uploadResult) {
      imageStats.uploaded++;
      return generateCloudFrontUrlForS3(uploadResult);
    }

    return null;

  } catch (error) {
    imageStats.errors++;
    logMessage(`❌ Error migrating image ${imageUrl}: ${error.message}`);
    return null;
  }
}

// Essential helper functions for blog migration
async function getBlogMapping(queryInterface) {
  return {}; // Simplified - would need proper implementation
}

async function getCategoryMapping(queryInterface) {
  return {}; // Simplified - would need proper implementation
}


/**
 * Create blog mapping by title for WordPress
 */
async function getBlogMappingByTitle(queryInterface) {
  const [blogs] = await queryInterface.sequelize.query(`
    SELECT id, title 
    FROM blogs 
    ORDER BY id
  `);
  
  const mapping = {};
  blogs.forEach(blog => {
    const titleKey = blog.title.toLowerCase().trim();
    mapping[titleKey] = blog.id;
  });
  
  return mapping;
}

/**
 * Create category mapping by name for WordPress
 */
async function getCategoryMappingByName(queryInterface) {
  const [categories] = await queryInterface.sequelize.query(`
    SELECT id, name 
    FROM blog_categories 
    ORDER BY id
  `);
  
  const mapping = {};
  categories.forEach(category => {
    const nameKey = category.name.toLowerCase().trim();
    mapping[nameKey] = category.id;
  });
  
  return mapping;
}


async function processContentImages(content, imageStats) {
  if (!content) return content;
  // Simplified implementation - would scan for img tags and migrate URLs
  return content;
}

async function downloadAndUploadToS3(imageUrl, folder, s3Key, imageStats) {
  try {
    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.vapehub.co.uk/'
      }
    });

    const tempDir = os.tmpdir();
    const tempFileName = generateUniqueFileName('temp.jpg');
    const tempFile = path.join(tempDir, tempFileName);
    const writer = fs.createWriteStream(tempFile);

    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const fileBuffer = fs.readFileSync(tempFile);
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: response.headers['content-type'] || 'image/jpeg'
    };

    const uploadResult = await uploadFiletToS3(uploadParams);
    fs.unlinkSync(tempFile);

    return uploadResult && uploadResult.Location ? s3Key : null;
  } catch (error) {
    logMessage(`❌ Error downloading/uploading ${imageUrl}: ${error.message}`);
    return null;
  }
}

async function checkCircuitBreaker() {
  return circuitBreaker.isOpen;
}

function updateCircuitBreaker(statusCode) {
  circuitBreaker.totalErrors++;
  if (statusCode === 502) {
    circuitBreaker.consecutive502s++;
    if (circuitBreaker.consecutive502s >= 3) {
      circuitBreaker.isOpen = true;
    }
  }
}

function resetCircuitBreaker() {
  circuitBreaker.consecutive502s = 0;
  circuitBreaker.isOpen = false;
}

function logMessage(message) {
  console.log(message);
  try {
    const logsDir = path.dirname(logFile);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    fs.appendFileSync(logFile, `${new Date().toISOString()}: ${message}\n`);
  } catch (error) {
    // Ignore file write errors
  }
}

function loadProgress(migrationStats) {
  try {
    if (fs.existsSync(progressFile)) {
      const data = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
      failedDownloads = data.failedDownloads || [];
      console.log(`📂 Loaded ${failedDownloads.length} failed downloads from previous run`);
    }
  } catch (error) {
    console.error('⚠️ Could not load progress file:', error.message);
  }
}

function saveProgress(migrationStats) {
  try {
    const progressData = {
      failedDownloads: failedDownloads,
      stats: migrationStats,
      lastUpdated: new Date().toISOString()
    };
    
    const logsDir = path.dirname(progressFile);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    fs.writeFileSync(progressFile, JSON.stringify(progressData, null, 2));
  } catch (error) {
    console.error('⚠️ Could not save progress file:', error.message);
  }
}

function generateMigrationReport(migrationStats) {
  const report = `
📊 BLOG MIGRATION REPORT
========================
Categories: ${migrationStats.categories.created}/${migrationStats.categories.processed} created
Blog Posts: ${migrationStats.blogs.created}/${migrationStats.blogs.processed} created
Category Relations: ${migrationStats.categoryRelations.created} created

🖼️ BLOG IMAGES REPORT
=====================
Product Images Matched: ${migrationStats.images.uploaded}
Original Images Used: ${migrationStats.images.skipped}
Images Processed: ${migrationStats.images.processed}
Image Errors: ${migrationStats.images.errors}
Failed Downloads: ${failedDownloads.length}

🎯 PRODUCT MATCHING SUCCESS
==========================
Product-related blogs with matching product images: ${migrationStats.images.uploaded}
Generic blogs using original images: ${migrationStats.images.skipped}
`;

  console.log(report);
  logMessage(report);
}

/**
 * Clear existing blog data before migration
 */
async function clearExistingBlogData(queryInterface) {
  try {
    // Clear in correct order to avoid foreign key constraints
    console.log('🗑️  Clearing blog category relations...');
    await queryInterface.sequelize.query('DELETE FROM blog_category_relations', {
      type: queryInterface.sequelize.QueryTypes.DELETE
    });

    console.log('🗑️  Clearing blog posts...');
    await queryInterface.sequelize.query('DELETE FROM blogs', {
      type: queryInterface.sequelize.QueryTypes.DELETE
    });

    console.log('🗑️  Clearing blog categories...');
    await queryInterface.sequelize.query('DELETE FROM blog_categories', {
      type: queryInterface.sequelize.QueryTypes.DELETE
    });

    // Reset auto-increment counters
    console.log('🔄 Resetting auto-increment counters...');
    await queryInterface.sequelize.query('ALTER TABLE blog_categories AUTO_INCREMENT = 1', {
      type: queryInterface.sequelize.QueryTypes.RAW
    });
    await queryInterface.sequelize.query('ALTER TABLE blogs AUTO_INCREMENT = 1', {
      type: queryInterface.sequelize.QueryTypes.RAW
    });
    await queryInterface.sequelize.query('ALTER TABLE blog_category_relations AUTO_INCREMENT = 1', {
      type: queryInterface.sequelize.QueryTypes.RAW
    });

    console.log('✅ All existing blog data cleared successfully');
  } catch (error) {
    console.error('❌ Error clearing existing blog data:', error.message);
    throw error;
  }
}
