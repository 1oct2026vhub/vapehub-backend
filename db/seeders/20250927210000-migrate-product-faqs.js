'use strict';

/**
 * Product FAQs Migration Script
 * 
 * This seeder extracts FAQs from product descriptions and migrates them to the FAQs table.
 * 
 * Features:
 * - Extracts Rank Math FAQ blocks from product descriptions
 * - Parses both JSON and HTML FAQ formats
 * - Inserts FAQs into the faqs table with proper relationships
 * - Removes FAQ blocks from product descriptions after extraction
 * - Handles HTML cleanup and validation
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('🚀 Starting PRODUCT FAQS MIGRATION...');
      
      const migrationStats = {
        productsProcessed: 0,
        faqsExtracted: 0,
        faqsInserted: 0,
        productsUpdated: 0,
        errors: 0
      };

      // Step 1: Find products with FAQ blocks
      console.log('\n🔍 Step 1: Finding products with FAQ blocks...');
      const productsWithFAQs = await queryInterface.sequelize.query(`
        SELECT id, name, description
        FROM products 
        WHERE description LIKE '%wp:rank-math/faq-block%' 
        OR description LIKE '%rank-math-faq-block%'
        AND deletedAt IS NULL
      `, {
        type: Sequelize.QueryTypes.SELECT
      });

      console.log(`📊 Found ${productsWithFAQs.length} products with FAQ blocks`);

      if (productsWithFAQs.length === 0) {
        console.log('⚠️  No products with FAQ blocks found. Migration completed.');
        return;
      }

      // Step 2: Process each product
      console.log('\n🔄 Step 2: Processing products and extracting FAQs...');
      
      for (const product of productsWithFAQs) {
        migrationStats.productsProcessed++;
        
        try {
          console.log(`\n📦 Processing product: ${product.name} (ID: ${product.id})`);
          
          // Extract FAQs from description
          const faqs = extractFAQsFromDescription(product.description);
          
          if (faqs.length > 0) {
            console.log(`   📝 Found ${faqs.length} FAQs`);
            migrationStats.faqsExtracted += faqs.length;
            
            // Insert FAQs into database
            const insertedFAQs = await insertFAQs(queryInterface, product.id, faqs);
            migrationStats.faqsInserted += insertedFAQs;
            
            // Remove FAQ blocks from description
            const cleanedDescription = removeFAQsFromDescription(product.description);
            
            // Update product description
            await queryInterface.sequelize.query(`
              UPDATE products 
              SET description = :cleanedDescription, updatedAt = NOW()
              WHERE id = :productId
            `, {
              replacements: {
                cleanedDescription,
                productId: product.id
              }
            });
            
            migrationStats.productsUpdated++;
            console.log(`   ✅ Extracted ${insertedFAQs} FAQs and cleaned description`);
          } else {
            console.log(`   ⚠️  No valid FAQs found in description`);
          }
          
        } catch (error) {
          migrationStats.errors++;
          console.error(`   ❌ Error processing product ${product.id}:`, error.message);
        }
      }

      // Step 3: Generate migration report
      console.log('\n📊 Generating migration report...');
      generateMigrationReport(migrationStats);

      console.log('\n🎉 PRODUCT FAQS MIGRATION COMPLETED SUCCESSFULLY!');

    } catch (error) {
      console.error('\n❌ PRODUCT FAQS MIGRATION FAILED:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🔄 Rolling back FAQ migration...');
    
    try {
      // Clear all product FAQs
      await queryInterface.bulkDelete('faqs', {
        entity_type: 'product'
      }, {});
      
      console.log('✅ All product FAQs cleared successfully');
      
    } catch (error) {
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
              question: cleanHtmlContent(faq.title),
              answer: cleanHtmlContent(faq.content)
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
                question: cleanHtmlContent(questionMatch[1]),
                answer: cleanHtmlContent(answerMatch[1])
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
              faqs.push({ question, answer });
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
 * Clean HTML content and convert to plain text
 */
function cleanHtmlContent(content) {
  if (!content) return '';
  
  // Decode HTML entities
  content = content
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\\u003c/g, '<')
    .replace(/\\u003e/g, '>')
    .replace(/\\u0026/g, '&');
  
  // Remove HTML tags but preserve content
  content = content
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  return content;
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
 * Insert FAQs into database
 */
async function insertFAQs(queryInterface, productId, faqs) {
  let insertedCount = 0;
  
  try {
    const faqsToInsert = faqs.map((faq, index) => ({
      entity_type: 'product',
      entity_id: productId,
      question: faq.question.substring(0, 500), // Limit question length
      answer: faq.answer.substring(0, 2000), // Limit answer length
      createdAt: new Date(),
      updatedAt: new Date()
    }));

    // Insert FAQs in batches
    const batchSize = 10;
    for (let i = 0; i < faqsToInsert.length; i += batchSize) {
      const batch = faqsToInsert.slice(i, i + batchSize);
      await queryInterface.bulkInsert('faqs', batch);
      insertedCount += batch.length;
    }

  } catch (error) {
    console.error('Error inserting FAQs:', error.message);
  }
  
  return insertedCount;
}

/**
 * Generate migration report
 */
function generateMigrationReport(migrationStats) {
  const report = `
📊 PRODUCT FAQS MIGRATION REPORT
================================================================
Migration completed at: ${new Date().toISOString()}

STATISTICS:
- Products Processed: ${migrationStats.productsProcessed}
- FAQs Extracted: ${migrationStats.faqsExtracted}
- FAQs Inserted: ${migrationStats.faqsInserted}
- Products Updated: ${migrationStats.productsUpdated}
- Errors: ${migrationStats.errors}

SUCCESS RATE: ${migrationStats.productsProcessed > 0 ? 
  ((migrationStats.productsUpdated / migrationStats.productsProcessed) * 100).toFixed(2)
  : 0}%

FAQ EXTRACTION RATE: ${migrationStats.productsProcessed > 0 ? 
  ((migrationStats.faqsExtracted / migrationStats.productsProcessed).toFixed(2))
  : 0} FAQs per product

MIGRATION QUALITY:
- Data Integrity: ${migrationStats.errors === 0 ? '✅ Perfect' : '⚠️ Some errors occurred'}
- Extraction Success: ${migrationStats.faqsExtracted > 0 ? '✅ Success' : '❌ No FAQs found'}
- Description Cleanup: ${migrationStats.productsUpdated > 0 ? '✅ Completed' : '❌ Not completed'}

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
    
    const reportPath = path.join(logsDir, 'product-faqs-migration-report.txt');
    fs.writeFileSync(reportPath, report);
    console.log(`📄 Detailed report saved to: ${reportPath}`);
  } catch (error) {
    console.log('⚠️  Could not save report file:', error.message);
  }
}
