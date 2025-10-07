'use strict';

/**
 * Category FAQs Migration from Old Database
 * 
 * This seeder extracts category-specific FAQs from the old database
 * and migrates them to the new FAQs table with proper category relationships.
 * 
 * Features:
 * - Connects to old database using CrossServerMigration utility
 * - Extracts category FAQs from multiple possible sources
 * - Maps FAQs to existing categories in new database
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
      console.log('🚀 Starting CATEGORY FAQS MIGRATION from old database...');
      console.log(`🔧 Environment: ${environment}`);
      console.log(`🔧 Database: ${process.env.DB_NAME || 'unknown'}`);
      
      const migrationStats = {
        categoriesProcessed: 0,
        faqsExtracted: 0,
        faqsInserted: 0,
        categoriesWithFAQs: 0,
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

      // Get all categories from new database
      console.log('\n📥 Getting all categories from new database...');
      const categories = await queryInterface.sequelize.query(`
        SELECT id, name, slug FROM categories ORDER BY name ASC
      `, { 
        type: Sequelize.QueryTypes.SELECT,
        transaction 
      });
      
      console.log(`📊 Found ${categories.length} categories in new database`);

      if (categories.length === 0) {
        console.log('⚠️  No categories found in new database. Please run category migration first.');
        await crossServerMigration.closeOldDbConnection();
        await transaction.commit();
        return;
      }

      // Step 1: Discover category FAQ sources in old database
      console.log('\n🔍 Step 1: Discovering category FAQ sources...');
      const faqSources = await discoverCategoryFAQSources(crossServerMigration);
      console.log(`📊 Found ${faqSources.length} potential FAQ sources`);

      // Step 2: Extract category FAQs from all sources
      console.log('\n📥 Step 2: Extracting category FAQs from all sources...');
      const allCategoryFAQs = await extractCategoryFAQsFromAllSources(faqSources, crossServerMigration);
      migrationStats.faqsExtracted = allCategoryFAQs.length;
      
      console.log(`📊 Total category FAQs found: ${allCategoryFAQs.length}`);

      // Step 3: Map FAQs to categories and insert into database
      console.log('\n🎯 Step 3: Mapping FAQs to categories and inserting...');
      await mapAndInsertCategoryFAQs(allCategoryFAQs, categories, queryInterface, transaction, migrationStats);

      // Step 4: Generate migration report
      console.log('\n📊 Step 4: Generating migration report...');
      generateMigrationReport(migrationStats);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      // Commit transaction if all operations were successful
      await transaction.commit();
      console.log('\n🎉 CATEGORY FAQS MIGRATION COMPLETED SUCCESSFULLY!');

    } catch (error) {
      // Rollback transaction on any error
      await transaction.rollback();
      console.error('\n❌ CATEGORY FAQS MIGRATION FAILED - ROLLED BACK:', error);
      
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
      console.log('🔄 Rolling back category FAQs migration...');
      
      // Clear all category FAQs that might have been migrated
      const [deletedCount] = await queryInterface.sequelize.query(`
        DELETE FROM FAQs WHERE entity_type = 'category'
      `, { transaction });
      
      console.log(`✅ Cleared ${deletedCount[1]} category FAQs`);
      
      await transaction.commit();
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error during rollback:', error);
      throw error;
    }
  }
};

/**
 * Discover all possible category FAQ sources in the old database
 */
async function discoverCategoryFAQSources(crossServerMigration) {
  const sources = [];
  
  // Method 1: Check for category-specific FAQ pages/posts
  try {
    const categoryPosts = await crossServerMigration.fetchFromOldDb(`
      SELECT COUNT(*) as count
      FROM vh_posts p
      WHERE p.post_type = 'page'
      AND (p.post_title LIKE '%FAQ%' OR p.post_title LIKE '%faq%')
      AND p.post_status = 'publish'
    `);
    
    if (categoryPosts[0].count > 0) {
      sources.push({
        name: 'category_faq_pages',
        count: categoryPosts[0].count,
        type: 'pages'
      });
    }
  } catch (error) {
    console.log(`   ⚠️  category_faq_pages: ${error.message}`);
  }
  
  // Method 2: Check for category meta with FAQ data using exact structure
  try {
    const categoryMeta = await crossServerMigration.fetchFromOldDb(`
      SELECT COUNT(*) as count
      FROM vh_termmeta tm
      JOIN vh_term_taxonomy tt ON tm.term_id = tt.term_id
      WHERE tt.taxonomy = 'product_cat'
      AND (tm.meta_key LIKE 'faq_%_faq_title' OR tm.meta_key LIKE 'faq_%_message')
      AND tm.meta_value IS NOT NULL
      AND tm.meta_value != ''
    `);
    
    if (categoryMeta[0].count > 0) {
      sources.push({
        name: 'category_meta_faqs',
        count: categoryMeta[0].count,
        type: 'meta'
      });
    }
  } catch (error) {
    console.log(`   ⚠️  category_meta_faqs: ${error.message}`);
  }
  
  // Method 3: Check for category descriptions with FAQ blocks
  try {
    const categoryDescriptions = await crossServerMigration.fetchFromOldDb(`
      SELECT COUNT(*) as count
      FROM vh_terms t
      JOIN vh_term_taxonomy tt ON t.term_id = tt.term_id
      WHERE tt.taxonomy = 'product_cat'
      AND (tt.description LIKE '%FAQ%' OR tt.description LIKE '%faq%' OR tt.description LIKE '%rank-math%')
    `);
    
    if (categoryDescriptions[0].count > 0) {
      sources.push({
        name: 'category_descriptions',
        count: categoryDescriptions[0].count,
        type: 'descriptions'
      });
    }
  } catch (error) {
    console.log(`   ⚠️  category_descriptions: ${error.message}`);
  }
  
  // Method 4: Check for dedicated FAQ tables
  const faqTables = ['vh_faqs', 'wp_faqs', 'faqs', 'category_faqs', 'product_faqs'];
  
  for (const table of faqTables) {
    try {
      const result = await crossServerMigration.fetchFromOldDb(`
        SELECT COUNT(*) as count FROM ${table}
      `);
      
      if (result[0].count > 0) {
        sources.push({
          name: table,
          count: result[0].count,
          type: 'table'
        });
      }
    } catch (error) {
      // Table might not exist, continue
    }
  }
  
  console.log(`📋 Category FAQ sources discovered:`);
  sources.forEach(source => {
    console.log(`   - ${source.name}: ${source.count} entries (${source.type})`);
  });
  
  return sources;
}

/**
 * Extract category FAQs from all discovered sources
 */
async function extractCategoryFAQsFromAllSources(faqSources, crossServerMigration) {
  const allFAQs = [];
  
  for (const source of faqSources) {
    try {
      let faqs = [];
      
      if (source.name === 'category_faq_pages') {
        faqs = await extractFAQsFromCategoryPages(crossServerMigration);
      } else if (source.name === 'category_meta_faqs') {
        faqs = await extractFAQsFromCategoryMeta(crossServerMigration);
      } else if (source.name === 'category_descriptions') {
        faqs = await extractFAQsFromCategoryDescriptions(crossServerMigration);
      } else if (source.type === 'table') {
        faqs = await extractFAQsFromTable(source.name, crossServerMigration);
      }
      
      faqs.forEach(faq => {
        faq.source = source.name;
        allFAQs.push(faq);
      });
      
      console.log(`   ✅ Extracted ${faqs.length} FAQs from ${source.name}`);
    } catch (error) {
      console.log(`   ❌ Error extracting FAQs from ${source.name}: ${error.message}`);
    }
  }
  
  return allFAQs;
}

/**
 * Extract FAQs from category pages
 */
async function extractFAQsFromCategoryPages(crossServerMigration) {
  const categoryPages = await crossServerMigration.fetchFromOldDb(`
    SELECT 
      p.ID as page_id,
      p.post_title as page_title,
      p.post_content as page_content,
      p.post_name as page_slug
    FROM vh_posts p
    WHERE p.post_type = 'page'
    AND (p.post_title LIKE '%FAQ%' OR p.post_title LIKE '%faq%')
    AND p.post_status = 'publish'
    AND p.post_content IS NOT NULL
    AND p.post_content != ''
  `);
  
  const faqs = [];
  
  categoryPages.forEach(page => {
    const pageFAQs = extractFAQsFromDescription(page.page_content);
    pageFAQs.forEach(faq => {
      faqs.push({
        category_name: extractCategoryNameFromPage(page.page_title, page.page_slug),
        question: faq.question,
        answer: faq.answer,
        page_id: page.page_id,
        page_title: page.page_title
      });
    });
  });
  
  return faqs;
}

/**
 * Extract FAQs from category meta using the exact structure found in vh_termmeta
 * Structure: faq_0_faq_title, faq_0_message, faq_1_faq_title, faq_1_message, etc.
 */
async function extractFAQsFromCategoryMeta(crossServerMigration) {
  // Get all FAQ-related meta entries using the exact structure for categories
  const categoryMeta = await crossServerMigration.fetchFromOldDb(`
    SELECT 
      t.term_id,
      t.name as category_name,
      tm.meta_key,
      tm.meta_value
    FROM vh_termmeta tm
    JOIN vh_term_taxonomy tt ON tm.term_id = tt.term_id
    JOIN vh_terms t ON tt.term_id = t.term_id
    WHERE tt.taxonomy = 'product_cat'
    AND (tm.meta_key LIKE 'faq_%_faq_title' OR tm.meta_key LIKE 'faq_%_message')
    AND tm.meta_value IS NOT NULL
    AND tm.meta_value != ''
    ORDER BY t.term_id, tm.meta_key ASC
  `);
  
  const faqs = [];
  
  // Group meta entries by term_id (category)
  const categoryFAQsMap = new Map();
  
  categoryMeta.forEach(meta => {
    if (!categoryFAQsMap.has(meta.term_id)) {
      categoryFAQsMap.set(meta.term_id, {
        category_name: meta.category_name,
        term_id: meta.term_id,
        faqs: new Map()
      });
    }
    
    const categoryData = categoryFAQsMap.get(meta.term_id);
    
    // Extract FAQ index from meta_key (e.g., faq_0_faq_title -> 0)
    const faqMatch = meta.meta_key.match(/faq_(\d+)_(faq_title|message)/);
    if (faqMatch) {
      const faqIndex = parseInt(faqMatch[1]);
      const faqType = faqMatch[2]; // 'faq_title' or 'message'
      
      if (!categoryData.faqs.has(faqIndex)) {
        categoryData.faqs.set(faqIndex, {});
      }
      
      if (faqType === 'faq_title') {
        categoryData.faqs.get(faqIndex).question = meta.meta_value;
      } else if (faqType === 'message') {
        categoryData.faqs.get(faqIndex).answer = meta.meta_value;
      }
    }
  });
  
  // Convert grouped data to FAQ array
  categoryFAQsMap.forEach((categoryData, termId) => {
    categoryData.faqs.forEach((faq, index) => {
      if (faq.question && faq.answer) {
        faqs.push({
          category_name: categoryData.category_name,
          question: cleanHtmlContent(faq.question, false), // No <p> tags for questions
          answer: cleanHtmlContent(faq.answer, true),       // <p> tags for answers
          term_id: termId,
          faq_index: index
        });
      }
    });
  });
  
  return faqs;
}

/**
 * Extract FAQs from category descriptions
 */
async function extractFAQsFromCategoryDescriptions(crossServerMigration) {
  const categoryDescriptions = await crossServerMigration.fetchFromOldDb(`
    SELECT 
      t.term_id,
      t.name as category_name,
      tt.description
    FROM vh_terms t
    JOIN vh_term_taxonomy tt ON t.term_id = tt.term_id
    WHERE tt.taxonomy = 'product_cat'
    AND tt.description IS NOT NULL
    AND tt.description != ''
    AND (tt.description LIKE '%FAQ%' OR tt.description LIKE '%faq%' OR tt.description LIKE '%rank-math%')
  `);
  
  const faqs = [];
  
  categoryDescriptions.forEach(category => {
    const descFAQs = extractFAQsFromDescription(category.description);
    descFAQs.forEach(faq => {
      faqs.push({
        category_name: category.category_name,
        question: faq.question,
        answer: faq.answer,
        term_id: category.term_id
      });
    });
  });
  
  return faqs;
}

/**
 * Extract FAQs from dedicated FAQ tables
 */
async function extractFAQsFromTable(tableName, crossServerMigration) {
  try {
    const faqs = await crossServerMigration.fetchFromOldDb(`
      SELECT 
        id,
        category_name,
        category_id,
        question,
        answer,
        created_at
      FROM ${tableName}
      WHERE question IS NOT NULL
      AND answer IS NOT NULL
      AND question != ''
      AND answer != ''
    `);
    
    return faqs.map(faq => ({
      category_name: faq.category_name,
      question: faq.question,
      answer: faq.answer,
      faq_id: faq.id,
      category_id: faq.category_id
    }));
  } catch (error) {
    console.log(`   ⚠️  Error reading ${tableName}: ${error.message}`);
    return [];
  }
}

/**
 * Extract FAQs from description content (similar to product FAQ extraction)
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

    // Method 2: Extract from HTML blocks
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
            const question = cleanHtmlContent(parts[1], false);
            const answer = cleanHtmlContent(parts[2], true);
            
            // Basic validation - check if it looks like a Q&A
            if (question.length > 10 && answer.length > 10 && 
                (question.includes('?') || question.toLowerCase().includes('how') || 
                 question.toLowerCase().includes('what') || question.toLowerCase().includes('when') ||
                 question.toLowerCase().includes('why') || question.toLowerCase().includes('where'))) {
              faqs.push({ 
                question: question,
                answer: answer
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
 * Extract category name from page title or slug
 */
function extractCategoryNameFromPage(pageTitle, pageSlug) {
  // Try to extract category name from page title
  if (pageTitle.toLowerCase().includes('disposable')) return 'Disposable Vapes';
  if (pageTitle.toLowerCase().includes('e-liquid')) return 'E-Liquids';
  if (pageTitle.toLowerCase().includes('pod')) return 'Pod Kits';
  if (pageTitle.toLowerCase().includes('kit')) return 'Vape Kits';
  
  // Try to extract from slug
  if (pageSlug) {
    const slugParts = pageSlug.split('-');
    if (slugParts.length > 0) {
      return slugParts.map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    }
  }
  
  // Fallback to page title
  return pageTitle.replace(/FAQ|faq|Frequently Asked Questions/gi, '').trim();
}

/**
 * Map FAQs to categories and insert into database
 */
async function mapAndInsertCategoryFAQs(allFAQs, categories, queryInterface, transaction, migrationStats) {
  const categoryMap = new Map();
  categories.forEach(category => {
    categoryMap.set(category.name.toLowerCase(), category);
  });
  
  for (const faq of allFAQs) {
    try {
      migrationStats.categoriesProcessed++;
      
      // Find matching category
      const category = categoryMap.get(faq.category_name.toLowerCase());
      
      if (!category) {
        console.log(`   ⚠️  No matching category found for: ${faq.category_name}`);
        continue;
      }
      
      // Check if FAQ already exists for this category
      const [existingFAQs] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM FAQs 
        WHERE entity_type = 'category' AND entity_id = :categoryId AND question = :question
      `, {
        replacements: { categoryId: category.id, question: faq.question },
        type: queryInterface.sequelize.QueryTypes.SELECT,
        transaction
      });
      
      if (existingFAQs && existingFAQs.length > 0 && existingFAQs[0].count > 0) {
        console.log(`   ⚠️  FAQ already exists for category ${category.name}`);
        continue;
      }
      
      // Insert FAQ
      await queryInterface.bulkInsert('FAQs', [{
        entity_type: 'category',
        entity_id: category.id,
        question: faq.question.substring(0, 500), // Limit question length
        answer: faq.answer.substring(0, 2000), // Limit answer length
        createdAt: new Date(),
        updatedAt: new Date()
      }], { 
        transaction,
        ignoreDuplicates: true
      });
      
      migrationStats.faqsInserted++;
      migrationStats.categoriesWithFAQs++;
      
      console.log(`   ✅ Inserted FAQ for category: ${category.name}`);
      
    } catch (error) {
      migrationStats.errors++;
      console.error(`   ❌ Error processing FAQ for ${faq.category_name}:`, error.message);
    }
  }
}

/**
 * Generate migration report
 */
function generateMigrationReport(migrationStats) {
  const report = `
📊 CATEGORY FAQS MIGRATION REPORT
================================================================
Migration completed at: ${new Date().toISOString()}

STATISTICS:
- Categories Processed: ${migrationStats.categoriesProcessed}
- Categories with FAQs: ${migrationStats.categoriesWithFAQs}
- FAQs Extracted: ${migrationStats.faqsExtracted}
- FAQs Inserted: ${migrationStats.faqsInserted}
- Errors: ${migrationStats.errors}

SUCCESS RATE: ${migrationStats.categoriesProcessed > 0 ? 
  ((migrationStats.categoriesWithFAQs / migrationStats.categoriesProcessed) * 100).toFixed(2)
  : 0}%

FAQ EXTRACTION RATE: ${migrationStats.categoriesProcessed > 0 ? 
  ((migrationStats.faqsExtracted / migrationStats.categoriesProcessed).toFixed(2))
  : 0} FAQs per category

INSERTION SUCCESS RATE: ${migrationStats.faqsExtracted > 0 ? 
  ((migrationStats.faqsInserted / migrationStats.faqsExtracted) * 100).toFixed(2)
  : 0}%

MIGRATION QUALITY:
- Data Integrity: ${migrationStats.errors === 0 ? '✅ Perfect' : '⚠️ Some errors occurred'}
- Extraction Success: ${migrationStats.faqsExtracted > 0 ? '✅ Success' : '❌ No FAQs found'}
- Insertion Success: ${migrationStats.faqsInserted === migrationStats.faqsExtracted ? '✅ Perfect' : '⚠️ Some insertions failed'}

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
    
    const reportPath = path.join(logsDir, 'category-faqs-migration-report.txt');
    fs.writeFileSync(reportPath, report);
    console.log(`📄 Detailed report saved to: ${reportPath}`);
  } catch (error) {
    console.log('⚠️  Could not save report file:', error.message);
  }
}
