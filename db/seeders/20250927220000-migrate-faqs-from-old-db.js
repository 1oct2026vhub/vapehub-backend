'use strict';

/**
 * FAQ Migration from Old Database
 * 
 * This seeder extracts FAQs from product descriptions in the old database
 * and migrates them to the new FAQs table.
 * 
 * Features:
 * - Connects to old database using CrossServerMigration utility
 * - Extracts Rank Math FAQ blocks from old product descriptions
 * - Parses both JSON and HTML FAQ formats
 * - Inserts FAQs into the FAQs table with proper relationships
 * - Prevents duplicate FAQ insertion by checking individual questions
 * - Removes FAQ blocks from product descriptions in new database
 * - Handles transaction safety to prevent staging server issues
 * - Comprehensive error handling and logging
 */

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const environment = process.env.NODE_ENV || 'local';
    const crossServerMigration = new CrossServerMigration(environment);
    
    try {
      console.log('🚀 Starting FAQ MIGRATION from Old Database...');
      console.log(`🔧 Environment: ${environment}`);
      console.log(`🔧 Database: ${process.env.DB_NAME || 'unknown'}`);
      
      const migrationStats = {
        productsProcessed: 0,
        faqsExtracted: 0,
        faqsInserted: 0,
        faqsSkipped: 0,
        productsWithFAQs: 0,
        productsUpdated: 0,
        errors: 0
      };

      // Connect to old database
      await crossServerMigration.connectToOldDb();
      console.log('✅ Connected to old database successfully');

      // Check if FAQs table exists in new database
      console.log('\n🔍 Checking FAQs table existence in new database...');
      const [tableCheck] = await queryInterface.sequelize.query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'FAQs'
      `, { 
        type: Sequelize.QueryTypes.SELECT,
        transaction 
      });
      
      if (tableCheck.length === 0) {
        throw new Error('FAQs table does not exist in new database');
      }
      console.log('✅ FAQs table exists in new database');

      // Step 1: Fetch ALL products from old database (not just those with FAQ blocks)
      console.log('\n📥 Step 1: Fetching ALL products from old database...');
      
      const allProducts = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          p.ID as old_product_id,
          p.post_title as name,
          p.post_content as description
        FROM vh_posts p
        WHERE p.post_type = 'product'
        AND p.post_status IN ('publish', 'draft', 'private')
        ORDER BY p.ID ASC
      `);

      console.log(`📊 Found ${allProducts.length} total products in old database`);

      // Filter products that have FAQ blocks
      const productsWithFAQs = allProducts.filter(product => {
        return product.description && (
          product.description.includes('wp:rank-math/faq-block') ||
          product.description.includes('rank-math-faq-block')
        );
      });

      console.log(`📊 Found ${productsWithFAQs.length} products with FAQ blocks`);
      console.log(`📊 Will process ${allProducts.length} total products to extract FAQs`);

      if (allProducts.length === 0) {
        console.log('⚠️  No products found in old database. Migration completed.');
        await crossServerMigration.closeOldDbConnection();
        await transaction.commit();
        return;
      }

      // Step 2: Process each product and extract FAQs
      console.log('\n🔄 Step 2: Processing ALL products and extracting FAQs...');
      
      for (const product of allProducts) {
        migrationStats.productsProcessed++;
        
        try {
          console.log(`\n📦 Processing product: ${product.name} (Old ID: ${product.old_product_id})`);
          
          // Extract FAQs from description
          const faqs = extractFAQsFromDescription(product.description);
          
          if (faqs.length > 0) {
            console.log(`   📝 Found ${faqs.length} FAQs`);
            migrationStats.faqsExtracted += faqs.length;
            
            // Check each FAQ individually to avoid duplicates
            const faqsToInsert = [];
            
            for (const faq of faqs) {
              // Check if this specific FAQ already exists
              const [existing] = await queryInterface.sequelize.query(`
                SELECT id FROM FAQs 
                WHERE entity_type = 'product' 
                AND entity_id = :productId 
                AND question = :question
                AND deletedAt IS NULL
              `, {
                replacements: { 
                  productId: product.old_product_id,
                  question: faq.question.substring(0, 500)
                },
                type: Sequelize.QueryTypes.SELECT,
                transaction
              });
              
              if (!existing || existing.length === 0) {
                faqsToInsert.push(faq);
              } else {
                migrationStats.faqsSkipped++;
                console.log(`   ⚠️  FAQ already exists: "${faq.question.substring(0, 50)}..."`);
              }
            }
            
            if (faqsToInsert.length > 0) {
              migrationStats.productsWithFAQs++;
              
              // Insert only new FAQs into database using old product ID as entity_id
              const insertedFAQs = await insertFAQs(queryInterface, product.old_product_id, faqsToInsert, transaction);
              migrationStats.faqsInserted += insertedFAQs;
              
              console.log(`   ✅ Inserted ${insertedFAQs} new FAQs for product ${product.old_product_id}`);
            } else {
              console.log(`   ℹ️  All FAQs already exist for product ${product.old_product_id}`);
            }
            
            // Remove FAQ blocks from product description in new database
            try {
              // Fetch product from new database (products use direct ID mapping)
              const [newProducts] = await queryInterface.sequelize.query(`
                SELECT id, description 
                FROM products 
                WHERE id = :productId 
                AND deletedAt IS NULL
              `, {
                replacements: { productId: product.old_product_id },
                type: Sequelize.QueryTypes.SELECT,
                transaction
              });
              
              if (newProducts && newProducts.length > 0) {
                const newProduct = newProducts[0];
                
                // Remove FAQ blocks from description
                const cleanedDescription = removeFAQsFromDescription(newProduct.description);
                
                // Only update if description actually changed
                if (cleanedDescription !== newProduct.description) {
                  // Update product description in new database
                  await queryInterface.sequelize.query(`
                    UPDATE products 
                    SET description = :cleanedDescription, updatedAt = NOW()
                    WHERE id = :productId
                  `, {
                    replacements: {
                      cleanedDescription,
                      productId: product.old_product_id
                    },
                    transaction
                  });
                  
                  migrationStats.productsUpdated++;
                  console.log(`   ✅ Cleaned FAQ blocks from product description`);
                } else {
                  console.log(`   ℹ️  No FAQ blocks found in product description (already clean)`);
                }
              } else {
                console.log(`   ⚠️  Product ${product.old_product_id} not found in new database - skipping description cleanup`);
              }
            } catch (updateError) {
              console.error(`   ⚠️  Error updating product description:`, updateError.message);
              // Don't fail the entire migration if description update fails
            }
          } else {
            console.log(`   ⚠️  No valid FAQs found in description`);
          }
          
        } catch (error) {
          migrationStats.errors++;
          console.error(`   ❌ Error processing product ${product.old_product_id}:`, error.message);
          console.error(`   🔧 Full error:`, error);
        }
      }

      // Step 3: Generate migration report
      console.log('\n📊 Generating migration report...');
      generateMigrationReport(migrationStats);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      // Commit transaction if all operations were successful
      await transaction.commit();
      console.log('\n🎉 FAQ MIGRATION FROM OLD DATABASE COMPLETED SUCCESSFULLY!');

    } catch (error) {
      // Rollback transaction on any error
      await transaction.rollback();
      console.error('\n❌ FAQ MIGRATION FROM OLD DATABASE FAILED - ROLLED BACK:', error);
      
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
      console.log('🔄 Rolling back FAQ migration from old database...');
      
      // Clear all product FAQs that might have been migrated
      const [deletedCount] = await queryInterface.sequelize.query(`
        DELETE FROM FAQs WHERE entity_type = 'product'
      `, { transaction });
      
      console.log(`✅ Cleared ${deletedCount[1]} product FAQs`);
      
      await transaction.commit();
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error during rollback:', error);
      throw error;
    }
  }
};

/**
 * Extract FAQs from product description
 */
function extractFAQsFromDescription(description) {
  const faqs = [];
  
  if (!description) {
    return faqs;
  }

  try {
    // Method 1: Extract from JSON comment block
    const jsonMatch = description.match(/<!-- wp:rank-math\/faq-block ({.*?}) -->/);
    if (jsonMatch) {
      const jsonData = JSON.parse(jsonMatch[1]);
      if (jsonData.questions && Array.isArray(jsonData.questions)) {
        jsonData.questions.forEach(faq => {
          if (faq.title && faq.content && faq.visible !== false) {
            faqs.push({
              question: cleanHtmlContent(faq.title, false), // No <p> tags for questions
              answer: cleanHtmlContent(faq.content, true)   // <p> tags for answers
            });
          }
        });
      }
    }

    // Method 2: Extract from HTML blocks (if JSON method didn't work)
    if (faqs.length === 0) {
      const htmlMatch = description.match(/<div class="wp-block-rank-math-faq-block">(.*?)<\/div>/s);
      if (htmlMatch) {
        const faqHtml = htmlMatch[1];
        const faqItems = faqHtml.match(/<div class="rank-math-faq-item">(.*?)<\/div>/gs);
        
        if (faqItems) {
          faqItems.forEach(item => {
            const questionMatch = item.match(/<h3[^>]*class="rank-math-question"[^>]*>(.*?)<\/h3>/s);
            const answerMatch = item.match(/<div[^>]*class="rank-math-answer"[^>]*>(.*?)<\/div>/s);
            
            if (questionMatch && answerMatch) {
              faqs.push({
                question: cleanHtmlContent(questionMatch[1], false), // No <p> tags for questions
                answer: cleanHtmlContent(answerMatch[1], true)       // <p> tags for answers
              });
            }
          });
        }
      }
    }

    // Method 3: Fallback - extract any FAQ-like patterns
    if (faqs.length === 0) {
      const fallbackMatches = description.match(/<h3[^>]*>(.*?)<\/h3>\s*<div[^>]*>(.*?)<\/div>/gs);
      if (fallbackMatches) {
        fallbackMatches.forEach(match => {
          const parts = match.match(/<h3[^>]*>(.*?)<\/h3>\s*<div[^>]*>(.*?)<\/div>/s);
          if (parts && parts[1] && parts[2]) {
            const question = cleanHtmlContent(parts[1]);
            const answer = cleanHtmlContent(parts[2]);
            
            // Basic validation - check if it looks like a Q&A
            if (question.length > 10 && answer.length > 10 && 
                (question.includes('?') || question.toLowerCase().includes('how') || 
                 question.toLowerCase().includes('what') || question.toLowerCase().includes('when'))) {
              faqs.push({ 
                question: cleanHtmlContent(question, false), // No <p> tags for questions
                answer: cleanHtmlContent(answer, true)      // <p> tags for answers
              });
            }
          }
        });
      }
    }

  } catch (error) {
    console.error('Error extracting FAQs:', error.message);
  }

  return faqs;
}

/**
 * Remove FAQ blocks from product description
 */
function removeFAQsFromDescription(description) {
  if (!description) return description;
  
  let cleaned = description;
  
  // Remove Rank Math FAQ comment blocks
  cleaned = cleaned.replace(/<!-- wp:rank-math\/faq-block[^>]*>.*?<!-- \/wp:rank-math\/faq-block -->/gs, '');
  
  // Remove FAQ HTML blocks
  cleaned = cleaned.replace(/<div class="wp-block-rank-math-faq-block">.*?<\/div>/gs, '');
  
  // Remove FAQ heading if it exists
  cleaned = cleaned.replace(/<!-- wp:heading[^>]*>\s*<h[1-6][^>]*>.*?FAQs.*?<\/h[1-6]>\s*<!-- \/wp:heading -->/gi, '');
  cleaned = cleaned.replace(/<h[1-6][^>]*>.*?FAQs.*?<\/h[1-6]>/gi, '');
  
  // Clean up extra whitespace and empty paragraphs
  cleaned = cleaned
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive line breaks
    .replace(/<!-- wp:paragraph -->\s*<p>\s*<\/p>\s*<!-- \/wp:paragraph -->/g, '') // Remove empty paragraphs
    .trim();
  
  return cleaned;
}

/**
 * Clean HTML content and optionally format with <p> tags
 */
function cleanHtmlContent(content, addPTags = true) {
  if (!content) return '';
  
  // Decode HTML entities
  content = content
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/\\u003c/g, '<')
    .replace(/\\u003e/g, '>')
    .replace(/\\u0026/g, '&');
  
  // If not adding <p> tags (for questions), strip all HTML tags
  if (!addPTags) {
    content = content
      .replace(/<[^>]*>/g, '') // Remove all HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  } else {
    // For answers, preserve paragraph structure but clean up
    content = content
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    // Only add <p> tags if content doesn't already have them
    if (!content.includes('<p>')) {
      content = `<p>${content}</p>`;
    }
  }
  
  return content;
}

/**
 * Insert FAQs into database with transaction safety
 */
async function insertFAQs(queryInterface, productId, faqs, transaction) {
  let insertedCount = 0;
  
  try {
    console.log(`   📝 Preparing to insert ${faqs.length} FAQs for product ${productId}`);
    
    const faqsToInsert = faqs.map((faq, index) => ({
      entity_type: 'product',
      entity_id: productId,
      question: faq.question.substring(0, 500), // Limit question length
      answer: faq.answer.substring(0, 2000), // Limit answer length
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    console.log(`   🔧 Sample FAQ data:`, {
      entity_type: faqsToInsert[0]?.entity_type,
      entity_id: faqsToInsert[0]?.entity_id,
      questionLength: faqsToInsert[0]?.question?.length,
      answerLength: faqsToInsert[0]?.answer?.length
    });

    // Insert FAQs in batches with transaction safety
    const batchSize = 10;
    for (let i = 0; i < faqsToInsert.length; i += batchSize) {
      const batch = faqsToInsert.slice(i, i + batchSize);
      console.log(`   💾 Inserting batch ${Math.floor(i/batchSize) + 1} with ${batch.length} FAQs...`);
      
      try {
        await queryInterface.bulkInsert('FAQs', batch, { 
          transaction,
          ignoreDuplicates: false // Don't ignore duplicates - we want to catch them
        });
        insertedCount += batch.length;
        console.log(`   ✅ Batch inserted successfully`);
      } catch (batchError) {
        console.error(`   ❌ Batch insert failed:`, batchError.message);
        console.error(`   🔧 Batch data:`, JSON.stringify(batch, null, 2));
        console.error(`   🔧 Full error:`, batchError);
        throw batchError; // Re-throw to trigger transaction rollback
      }
    }

    console.log(`   🎉 Successfully inserted ${insertedCount} FAQs`);

  } catch (error) {
    console.error('❌ Error inserting FAQs:', error.message);
    console.error('🔧 Error details:', {
      productId,
      faqsCount: faqs.length,
      errorStack: error.stack
    });
    throw error; // Re-throw to trigger transaction rollback
  }
  
  return insertedCount;
}

/**
 * Generate migration report
 */
function generateMigrationReport(migrationStats) {
  const report = `
📊 FAQ MIGRATION FROM OLD DATABASE REPORT
================================================================
Migration completed at: ${new Date().toISOString()}

STATISTICS:
- Products Processed: ${migrationStats.productsProcessed}
- Products with FAQs: ${migrationStats.productsWithFAQs}
- FAQs Extracted: ${migrationStats.faqsExtracted}
- FAQs Inserted: ${migrationStats.faqsInserted}
- FAQs Skipped (Duplicates): ${migrationStats.faqsSkipped}
- Products Updated (Description Cleaned): ${migrationStats.productsUpdated}
- Errors: ${migrationStats.errors}

SUCCESS RATE: ${migrationStats.productsProcessed > 0 ? 
  ((migrationStats.productsWithFAQs / migrationStats.productsProcessed) * 100).toFixed(2)
  : 0}%

FAQ EXTRACTION RATE: ${migrationStats.productsProcessed > 0 ? 
  ((migrationStats.faqsExtracted / migrationStats.productsProcessed).toFixed(2))
  : 0} FAQs per product

INSERTION SUCCESS RATE: ${migrationStats.faqsExtracted > 0 ? 
  ((migrationStats.faqsInserted / (migrationStats.faqsInserted + migrationStats.faqsSkipped)) * 100).toFixed(2)
  : 0}%

DESCRIPTION CLEANUP RATE: ${migrationStats.productsWithFAQs > 0 ? 
  ((migrationStats.productsUpdated / migrationStats.productsWithFAQs) * 100).toFixed(2)
  : 0}%

MIGRATION QUALITY:
- Data Integrity: ${migrationStats.errors === 0 ? '✅ Perfect' : '⚠️ Some errors occurred'}
- Extraction Success: ${migrationStats.faqsExtracted > 0 ? '✅ Success' : '❌ No FAQs found'}
- Duplicate Prevention: ${migrationStats.faqsSkipped > 0 ? `✅ ${migrationStats.faqsSkipped} duplicates prevented` : '✅ No duplicates found'}
- Insertion Success: ${migrationStats.faqsInserted > 0 ? '✅ Success' : '⚠️ No new FAQs inserted'}
- Description Cleanup: ${migrationStats.productsUpdated > 0 ? '✅ Completed' : '⚠️ No descriptions cleaned'}

================================================================
`;

  console.log(report);

  // Save report to file
  const fs = require('fs');
  const path = require('path');
  const logsDir = path.join(__dirname, '../../../logs');
  
  try {
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    const reportPath = path.join(logsDir, 'faq-migration-from-old-db-report.txt');
    fs.writeFileSync(reportPath, report);
    console.log(`📄 Detailed report saved to: ${reportPath}`);
  } catch (error) {
    console.log('⚠️  Could not save report file:', error.message);
  }
}
