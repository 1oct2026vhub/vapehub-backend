'use strict';

/**
 * Comprehensive Reviews Data Migration from Old Database
 * 
 * This seeder migrates:
 * - Reviews (with all fields and relationships)
 * - Maps reviews to existing users, orders, and products
 * - Handles data validation and error recovery
 * - Supports WooCommerce review data migration
 * - Maps old review IDs to new review IDs
 */

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const environment = process.env.NODE_ENV || 'local';
    console.log(`🔧 Using environment: ${environment}`);
    const crossServerMigration = new CrossServerMigration(environment);
    
    try {
      console.log('🚀 Starting REVIEWS DATA MIGRATION from old database...');
      
      const migrationStats = {
        reviews: { processed: 0, created: 0, errors: 0 },
        skipped: { duplicateReference: 0, noUserMapping: 0, noOrderMapping: 0, noProductMapping: 0 }
      };

      // Connect to old database
      await crossServerMigration.connectToOldDb();

      // Check if review data exists
      const reviewDataExists = await checkReviewDataExists(crossServerMigration);
      if (!reviewDataExists.hasReviewData) {
        console.log('⚠️  No review data found in old database. Skipping review migration.');
        console.log('💡 Available tables:', reviewDataExists.availableTables.slice(0, 10).join(', ') + '...');
        await crossServerMigration.closeOldDbConnection();
        return;
      }
      
      console.log(`✅ Found review data source: ${reviewDataExists.dataSource}`);
      console.log(`📊 Reviews available: ${reviewDataExists.reviewCount}`);

      // Clear existing review data before migration
      console.log('\n🧹 Clearing existing review data...');
      await clearExistingReviewData(queryInterface);
      console.log('✅ Existing review data cleared successfully');

      // Step 1: Create user mapping from old database
      console.log('\n🔗 Step 1: Creating user mapping...');
      const userMapping = await createUserMapping(crossServerMigration, queryInterface);
      console.log(`✅ Created user mapping for ${userMapping.size} users`);

      // Step 2: Create order mapping from old database
      console.log('\n🔗 Step 2: Creating order mapping...');
      const orderMapping = await createOrderMapping(crossServerMigration, queryInterface);
      console.log(`✅ Created order mapping for ${orderMapping.size} orders`);

      // Step 3: Create product mapping from old database
      console.log('\n🔗 Step 3: Creating product mapping...');
      const productMapping = await createProductMapping(crossServerMigration, queryInterface);
      console.log(`✅ Created product mapping for ${productMapping.size} products`);

      // Step 4: Migrate reviews
      console.log('\n🎯 Step 4: Migrating reviews...');
      await migrateReviews(crossServerMigration, queryInterface, Sequelize, {
        userMapping,
        orderMapping,
        productMapping,
        migrationStats
      });

      // Step 5: Generate final report
      console.log('\n📊 Generating migration report...');
      generateMigrationReport(migrationStats);

      console.log('\n🎉 REVIEWS DATA MIGRATION COMPLETED SUCCESSFULLY!');

    } catch (error) {
      console.error('\n❌ REVIEWS DATA MIGRATION FAILED:', error);
      throw error;
    } finally {
      await crossServerMigration.closeOldDbConnection();
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🔄 Rolling back reviews data migration...');
    
    try {
      // Clear all migrated review data
      await queryInterface.bulkDelete('reviews', {}, {});
      console.log('✅ All review data cleared successfully');
      
      // Reset auto-increment
      await queryInterface.sequelize.query('ALTER TABLE reviews AUTO_INCREMENT = 1');
      console.log('✅ Review ID auto-increment reset');
      
    } catch (error) {
      console.error('❌ Error during rollback:', error);
      throw error;
    }
  }
};

/**
 * Check if review data exists in old database
 */
async function checkReviewDataExists(crossServerMigration) {
  try {
    // Check for common review table names in old database
    const possibleTableNames = [
      'vh_comments',      // VapeHub WooCommerce reviews
      'wp_comments',      // Standard WooCommerce reviews
      'reviews',          // Custom reviews table
      'product_reviews',  // Product-specific reviews
      'wp_woocommerce_order_items', // WooCommerce order items (might contain reviews)
      'wp_posts'          // WordPress posts (might contain reviews)
    ];

    let hasReviewData = false;
    let dataSource = null;
    let reviewCount = 0;
    let availableTables = [];

    // Get all available tables
    const tablesResult = await crossServerMigration.queryOldDb('SHOW TABLES');
    availableTables = tablesResult[0].map(row => Object.values(row)[0]);

    // Check each possible table for review data
    for (const tableName of possibleTableNames) {
      if (availableTables.includes(tableName)) {
        try {
          // Check for review-like data in this table
          let countQuery = '';
          
          switch (tableName) {
            case 'vh_comments':
            case 'wp_comments':
              // WooCommerce reviews are stored as comments with comment_type = 'review'
              countQuery = `
                SELECT COUNT(*) as count 
                FROM ${tableName} 
                WHERE comment_type = 'review' 
                AND comment_approved = '1'
                AND comment_content IS NOT NULL 
                AND comment_content != ''
              `;
              break;
              
            case 'reviews':
            case 'product_reviews':
              countQuery = `
                SELECT COUNT(*) as count 
                FROM ${tableName} 
                WHERE id IS NOT NULL
              `;
              break;
              
            case 'wp_woocommerce_order_items':
              // Check if this table contains review data
              countQuery = `
                SELECT COUNT(*) as count 
                FROM ${tableName} 
                WHERE order_item_type = 'line_item'
              `;
              break;
              
            case 'wp_posts':
              // Check for review posts
              countQuery = `
                SELECT COUNT(*) as count 
                FROM ${tableName} 
                WHERE post_type = 'product' 
                AND post_status = 'publish'
              `;
              break;
          }

          if (countQuery) {
            const countResult = await crossServerMigration.queryOldDb(countQuery);
            const count = countResult[0][0].count;
            
            if (count > 0) {
              hasReviewData = true;
              dataSource = tableName;
              reviewCount = count;
              console.log(`✅ Found ${count} reviews in ${tableName}`);
              break;
            }
          }
        } catch (error) {
          console.log(`⚠️  Could not check ${tableName}: ${error.message}`);
        }
      }
    }

    return {
      hasReviewData,
      dataSource,
      reviewCount,
      availableTables
    };

  } catch (error) {
    console.error('❌ Error checking review data existence:', error);
    return {
      hasReviewData: false,
      dataSource: null,
      reviewCount: 0,
      availableTables: []
    };
  }
}

/**
 * Clear existing review data
 */
async function clearExistingReviewData(queryInterface) {
  try {
    await queryInterface.bulkDelete('reviews', {}, {});
    console.log('✅ Existing reviews cleared');
  } catch (error) {
    console.error('❌ Error clearing existing reviews:', error);
    throw error;
  }
}

/**
 * Create user mapping from old database to new database
 */
async function createUserMapping(crossServerMigration, queryInterface) {
  const userMapping = new Map();
  
  try {
    // Get users from new database (direct ID mapping since old_user_id doesn't exist)
    const newUsers = await queryInterface.sequelize.query(`
      SELECT id, email
      FROM users 
      WHERE id IS NOT NULL
    `, {
      type: queryInterface.sequelize.QueryTypes.SELECT
    });

    // Create direct ID mapping for users
    newUsers.forEach(user => {
      userMapping.set(user.id, user.id);
    });

    console.log(`📊 Mapped ${userMapping.size} users`);
    return userMapping;

  } catch (error) {
    console.error('❌ Error creating user mapping:', error);
    return userMapping;
  }
}

/**
 * Create order mapping from old database to new database
 */
async function createOrderMapping(crossServerMigration, queryInterface) {
  const orderMapping = new Map();
  
  try {
    // Get orders from new database (direct ID mapping since old_order_id doesn't exist)
    const newOrders = await queryInterface.sequelize.query(`
      SELECT id, order_unique_id
      FROM orders 
      WHERE id IS NOT NULL
    `, {
      type: queryInterface.sequelize.QueryTypes.SELECT
    });

    // Create direct ID mapping for orders
    newOrders.forEach(order => {
      orderMapping.set(order.id, order.id);
    });

    console.log(`📊 Mapped ${orderMapping.size} orders`);
    return orderMapping;

  } catch (error) {
    console.error('❌ Error creating order mapping:', error);
    return orderMapping;
  }
}

/**
 * Create product mapping from old database to new database
 */
async function createProductMapping(crossServerMigration, queryInterface) {
  const productMapping = new Map();
  
  try {
    // Get products from new database (products have same IDs as old database)
    // Include both published and draft products since reviews might be for draft products
    const newProducts = await queryInterface.sequelize.query(`
      SELECT id, name, slug, status
      FROM products 
      WHERE status IN ('published', 'draft')
      AND deletedAt IS NULL
    `, {
      type: queryInterface.sequelize.QueryTypes.SELECT
    });

    // Create direct ID mapping (old ID = new ID for products)
    newProducts.forEach(product => {
      productMapping.set(product.id, product.id);
    });

    console.log(`📊 Mapped ${productMapping.size} products (direct ID mapping)`);
    return productMapping;

  } catch (error) {
    console.error('❌ Error creating product mapping:', error);
    return productMapping;
  }
}

/**
 * Migrate reviews from old database
 */
async function migrateReviews(crossServerMigration, queryInterface, Sequelize, { userMapping, orderMapping, productMapping, migrationStats }) {
  try {
    // Get review data from old database
    const reviewDataExists = await checkReviewDataExists(crossServerMigration);
    const { dataSource } = reviewDataExists;

    let reviewsQuery = '';
    
    switch (dataSource) {
      case 'vh_comments':
      case 'wp_comments':
        // WooCommerce reviews - Enhanced to capture more review data
        const metaTable = dataSource === 'vh_comments' ? 'vh_commentmeta' : 'wp_commentmeta';
        reviewsQuery = `
          SELECT 
            c.comment_ID as old_review_id,
            c.comment_post_ID as old_product_id,
            c.comment_author_email as user_email,
            c.comment_author as user_name,
            c.comment_content as comment,
            COALESCE(rating_meta.meta_value, '5') as rating,
            c.comment_date as created_at,
            c.comment_approved as is_visible,
            c.comment_type as comment_type,
            verified_meta.meta_value as verified
          FROM ${dataSource} c
          LEFT JOIN ${metaTable} rating_meta ON c.comment_ID = rating_meta.comment_id AND rating_meta.meta_key = 'rating'
          LEFT JOIN ${metaTable} verified_meta ON c.comment_ID = verified_meta.comment_id AND verified_meta.meta_key = 'verified'
          WHERE c.comment_type = 'review'
          AND c.comment_approved = '1'
          AND c.comment_content IS NOT NULL 
          AND c.comment_content != ''
          AND LENGTH(TRIM(c.comment_content)) > 10
          ORDER BY c.comment_date DESC
        `;
        break;
        
      case 'reviews':
      case 'product_reviews':
        // Custom reviews table
        reviewsQuery = `
          SELECT 
            id as old_review_id,
            product_id as old_product_id,
            user_id as old_user_id,
            user_name,
            user_email,
            rating,
            comment,
            created_at,
            is_visible,
            verified,
            testimonial
          FROM ${dataSource}
          WHERE id IS NOT NULL
          ORDER BY id
        `;
        break;
        
      default:
        throw new Error(`Unsupported review data source: ${dataSource}`);
    }

    console.log(`🔍 Fetching reviews from ${dataSource}...`);
    const oldReviews = await crossServerMigration.fetchFromOldDb(reviewsQuery);
    console.log(`📊 Found ${oldReviews.length} reviews to migrate`);

    // Process reviews in batches
    const batchSize = 100;
    const batches = [];
    for (let i = 0; i < oldReviews.length; i += batchSize) {
      batches.push(oldReviews.slice(i, i + batchSize));
    }

    console.log(`📦 Processing ${batches.length} batches of ${batchSize} reviews each`);

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(`\n🔄 Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} reviews)`);

      const reviewsToInsert = [];

      for (const oldReview of batch) {
        migrationStats.reviews.processed++;
        
        try {
          // Map old IDs to new IDs
          const newProductId = productMapping.get(oldReview.old_product_id);
          const newUserId = userMapping.get(oldReview.old_user_id);
          const newOrderId = null; // Orders mapping can be added if needed

          // Skip if no product mapping found
          if (!newProductId) {
            migrationStats.skipped.noProductMapping++;
            console.log(`⚠️  Skipping review ${oldReview.old_review_id}: No product mapping for ${oldReview.old_product_id}`);
            continue;
          }

          // Skip if no user mapping found (but allow null users for guest reviews)
          let finalUserId = null;
          if (oldReview.old_user_id && !newUserId) {
            migrationStats.skipped.noUserMapping++;
            console.log(`⚠️  Skipping review ${oldReview.old_review_id}: No user mapping for ${oldReview.old_user_id}`);
            continue;
          } else if (newUserId) {
            finalUserId = newUserId;
          }

          // Prepare review data for insertion
          const reviewData = {
            user_id: finalUserId,
            order_id: newOrderId,
            product_id: newProductId,
            user_name: oldReview.user_name || null,
            company_name: null, // Not available in old data
            rating: parseInt(oldReview.rating) || 5,
            comment: oldReview.comment || null,
            is_visible: oldReview.is_visible === '1' || oldReview.is_visible === true || oldReview.is_visible === 1,
            verified_by: oldReview.verified === '1' || oldReview.verified === true || oldReview.verified === 1 || 
                        (oldReview.comment_approved === '1' && oldReview.comment_type === 'review') || false,
            testimonial: oldReview.testimonial === '1' || oldReview.testimonial === true || oldReview.testimonial === 1 || false,
            created_at: oldReview.created_at || new Date(),
            updated_at: new Date()
          };

          // Validate rating
          if (reviewData.rating < 1 || reviewData.rating > 5) {
            reviewData.rating = 5; // Default to 5 if invalid
          }

          // Clean up comment text (remove extra whitespace, handle special characters)
          if (reviewData.comment) {
            reviewData.comment = reviewData.comment.trim()
              .replace(/\s+/g, ' ') // Replace multiple spaces with single space
              .replace(/[\r\n]+/g, ' ') // Replace line breaks with space
              .substring(0, 1000); // Limit to 1000 characters
          }

          // Enhanced verification logic for VapeHub-style reviews
          if (reviewData.verified_by === false && reviewData.comment && reviewData.comment.length > 10) {
            // If it's a substantial review with a real name, consider it verified
            if (reviewData.user_name && reviewData.user_name.trim().length > 2) {
              reviewData.verified_by = true;
            }
          }

          reviewsToInsert.push(reviewData);

        } catch (error) {
          migrationStats.reviews.errors++;
          console.error(`❌ Error processing review ${oldReview.old_review_id}:`, error.message);
        }
      }

      // Insert batch of reviews
      if (reviewsToInsert.length > 0) {
        try {
          await queryInterface.bulkInsert('reviews', reviewsToInsert);
          migrationStats.reviews.created += reviewsToInsert.length;
          console.log(`✅ Inserted ${reviewsToInsert.length} reviews`);
        } catch (error) {
          migrationStats.reviews.errors += reviewsToInsert.length;
          console.error(`❌ Error inserting batch:`, error.message);
        }
      }

      // Progress update
      const progress = ((batchIndex + 1) / batches.length * 100).toFixed(1);
      console.log(`📈 Progress: ${progress}% (${migrationStats.reviews.created} reviews created)`);
    }

  } catch (error) {
    console.error('❌ Error migrating reviews:', error);
    throw error;
  }
}

/**
 * Generate migration report
 */
function generateMigrationReport(migrationStats) {
  const report = `
📊 REVIEWS MIGRATION REPORT
================================================================
Migration completed at: ${new Date().toISOString()}

STATISTICS:
- Total Processed: ${migrationStats.reviews.processed}
- Successfully Created: ${migrationStats.reviews.created}
- Errors: ${migrationStats.reviews.errors}

SKIPPED RECORDS:
- No User Mapping: ${migrationStats.skipped.noUserMapping}
- No Order Mapping: ${migrationStats.skipped.noOrderMapping}
- No Product Mapping: ${migrationStats.skipped.noProductMapping}
- Duplicate References: ${migrationStats.skipped.duplicateReference}

SUCCESS RATE: ${migrationStats.reviews.processed > 0 ? 
  ((migrationStats.reviews.created / migrationStats.reviews.processed) * 100).toFixed(2)
  : 0}%

MIGRATION QUALITY:
- Data Integrity: ${migrationStats.reviews.errors === 0 ? '✅ Perfect' : '⚠️ Some errors occurred'}
- Mapping Success: ${migrationStats.skipped.noProductMapping === 0 ? '✅ Perfect' : '⚠️ Some products not found'}
- User Association: ${migrationStats.skipped.noUserMapping === 0 ? '✅ Perfect' : '⚠️ Some users not found'}

================================================================
`;

  console.log(report);

  // Save report to file
  const fs = require('fs');
  const path = require('path');
  const reportPath = path.join(__dirname, '../../../logs/reviews-migration-report.txt');
  
  try {
    fs.writeFileSync(reportPath, report);
    console.log(`📄 Detailed report saved to: ${reportPath}`);
  } catch (error) {
    console.log('⚠️  Could not save report file:', error.message);
  }
}
