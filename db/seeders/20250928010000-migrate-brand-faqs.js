'use strict';

/**
 * Brand FAQs Migration from Old Database
 * 
 * This seeder extracts brand-specific FAQs from the old database
 * and migrates them to the new FAQs table with proper brand relationships.
 * 
 * Based on the live site example (Al Fakher brand), we need to migrate FAQs like:
 * - "What makes Al Fakher different from other vape brands?"
 * - "Does Al Fakher only offer high-capacity devices?"
 * - "Are Al Fakher devices safe to use?"
 * - "Is Al Fakher suitable for new vapers?"
 * 
 * Features:
 * - Connects to old database using CrossServerMigration utility
 * - Extracts brand FAQs from multiple possible sources
 * - Maps FAQs to existing brands in new database
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
      console.log('🚀 Starting BRAND FAQS MIGRATION from old database...');
      console.log(`🔧 Environment: ${environment}`);
      console.log(`🔧 Database: ${process.env.DB_NAME || 'unknown'}`);
      
      const migrationStats = {
        brandsProcessed: 0,
        faqsExtracted: 0,
        faqsInserted: 0,
        brandsWithFAQs: 0,
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

      // Get all brands from new database
      console.log('\n📥 Getting all brands from new database...');
      const brands = await queryInterface.sequelize.query(`
        SELECT id, name, slug FROM brands ORDER BY name ASC
      `, { 
        type: Sequelize.QueryTypes.SELECT,
        transaction 
      });
      
      console.log(`📊 Found ${brands.length} brands in new database`);

      if (brands.length === 0) {
        console.log('⚠️  No brands found in new database. Please run brand migration first.');
        await crossServerMigration.closeOldDbConnection();
        await transaction.commit();
        return;
      }

      // Step 1: Discover brand FAQ sources in old database
      console.log('\n🔍 Step 1: Discovering brand FAQ sources...');
      const faqSources = await discoverBrandFAQSources(crossServerMigration);
      console.log(`📊 Found ${faqSources.length} potential FAQ sources`);

      // Step 2: Extract brand FAQs from all sources
      console.log('\n📥 Step 2: Extracting brand FAQs from all sources...');
      const allBrandFAQs = await extractBrandFAQsFromAllSources(faqSources, crossServerMigration);
      migrationStats.faqsExtracted = allBrandFAQs.length;
      
      console.log(`📊 Total brand FAQs found: ${allBrandFAQs.length}`);

      // Step 3: Add sample FAQs only if no real FAQs were found
      if (allBrandFAQs.length === 0) {
        console.log('\n📝 Step 3: No FAQs found in old database, creating sample FAQs for major brands...');
        const sampleFAQs = createSampleBrandFAQs(brands);
        allBrandFAQs.push(...sampleFAQs);
        console.log(`📊 Added ${sampleFAQs.length} sample FAQs`);
      } else {
        console.log('\n✅ Step 3: Real FAQs found in old database, skipping sample creation');
      }

      // Step 4: Map FAQs to brands and insert into database
      console.log('\n🎯 Step 4: Mapping FAQs to brands and inserting...');
      await mapAndInsertBrandFAQs(allBrandFAQs, brands, queryInterface, transaction, migrationStats);

      // Step 5: Generate migration report
      console.log('\n📊 Step 5: Generating migration report...');
      generateMigrationReport(migrationStats);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      // Commit transaction if all operations were successful
      await transaction.commit();
      console.log('\n🎉 BRAND FAQS MIGRATION COMPLETED SUCCESSFULLY!');

    } catch (error) {
      // Rollback transaction on any error
      await transaction.rollback();
      console.error('\n❌ BRAND FAQS MIGRATION FAILED - ROLLED BACK:', error);
      
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
      console.log('🔄 Rolling back brand FAQs migration...');
      
      // Clear all brand FAQs that might have been migrated
      const [deletedCount] = await queryInterface.sequelize.query(`
        DELETE FROM FAQs WHERE entity_type = 'brand'
      `, { transaction });
      
      console.log(`✅ Cleared ${deletedCount[1]} brand FAQs`);
      
      await transaction.commit();
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error during rollback:', error);
      throw error;
    }
  }
};

/**
 * Discover all possible brand FAQ sources in the old database
 */
async function discoverBrandFAQSources(crossServerMigration) {
  const sources = [];
  
  // Method 1: Check for brand-specific FAQ pages/posts
  try {
    const brandPosts = await crossServerMigration.fetchFromOldDb(`
      SELECT COUNT(*) as count
      FROM vh_posts p
      WHERE p.post_type = 'page'
      AND (p.post_title LIKE '%FAQ%' OR p.post_title LIKE '%faq%')
      AND p.post_status = 'publish'
    `);
    
    if (brandPosts[0].count > 0) {
      sources.push({
        name: 'brand_faq_pages',
        count: brandPosts[0].count,
        type: 'pages'
      });
    }
  } catch (error) {
    console.log(`   ⚠️  brand_faq_pages: ${error.message}`);
  }
  
  // Method 2: Check for brand meta with FAQ data using exact structure
  try {
    const brandMeta = await crossServerMigration.fetchFromOldDb(`
      SELECT COUNT(*) as count
      FROM vh_termmeta tm
      JOIN vh_term_taxonomy tt ON tm.term_id = tt.term_id
      WHERE tt.taxonomy = 'pwb-brand'
      AND (tm.meta_key LIKE 'faq_%_faq_title' OR tm.meta_key LIKE 'faq_%_message')
      AND tm.meta_value IS NOT NULL
      AND tm.meta_value != ''
    `);
    
    if (brandMeta[0].count > 0) {
      sources.push({
        name: 'brand_meta_faqs',
        count: brandMeta[0].count,
        type: 'meta'
      });
    }
  } catch (error) {
    console.log(`   ⚠️  brand_meta_faqs: ${error.message}`);
  }
  
  // Method 3: Check for brand descriptions with FAQ blocks
  try {
    const brandDescriptions = await crossServerMigration.fetchFromOldDb(`
      SELECT COUNT(*) as count
      FROM vh_terms t
      JOIN vh_term_taxonomy tt ON t.term_id = tt.term_id
      WHERE tt.taxonomy = 'pwb-brand'
      AND (tt.description LIKE '%FAQ%' OR tt.description LIKE '%faq%' OR tt.description LIKE '%rank-math%')
    `);
    
    if (brandDescriptions[0].count > 0) {
      sources.push({
        name: 'brand_descriptions',
        count: brandDescriptions[0].count,
        type: 'descriptions'
      });
    }
  } catch (error) {
    console.log(`   ⚠️  brand_descriptions: ${error.message}`);
  }
  
  // Method 4: Check for dedicated FAQ tables
  const faqTables = ['vh_faqs', 'wp_faqs', 'faqs', 'brand_faqs', 'product_faqs'];
  
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
  
  console.log(`📋 Brand FAQ sources discovered:`);
  sources.forEach(source => {
    console.log(`   - ${source.name}: ${source.count} entries (${source.type})`);
  });
  
  return sources;
}

/**
 * Extract brand FAQs from all discovered sources
 */
async function extractBrandFAQsFromAllSources(faqSources, crossServerMigration) {
  const allFAQs = [];
  
  for (const source of faqSources) {
    try {
      let faqs = [];
      
      if (source.name === 'brand_faq_pages') {
        faqs = await extractFAQsFromBrandPages(crossServerMigration);
      } else if (source.name === 'brand_meta_faqs') {
        faqs = await extractFAQsFromBrandMeta(crossServerMigration);
      } else if (source.name === 'brand_descriptions') {
        faqs = await extractFAQsFromBrandDescriptions(crossServerMigration);
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
 * Extract FAQs from brand pages
 */
async function extractFAQsFromBrandPages(crossServerMigration) {
  const brandPages = await crossServerMigration.fetchFromOldDb(`
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
  
  brandPages.forEach(page => {
    const pageFAQs = extractFAQsFromDescription(page.page_content);
    pageFAQs.forEach(faq => {
      faqs.push({
        brand_name: extractBrandNameFromPage(page.page_title, page.page_slug),
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
 * Extract FAQs from brand meta
 */
async function extractFAQsFromBrandMeta(crossServerMigration) {
  // Get all FAQ-related meta entries using the exact structure found in vh_termmeta
  // Structure: faq_0_faq_title, faq_0_message, faq_1_faq_title, faq_1_message, etc.
  const brandMeta = await crossServerMigration.fetchFromOldDb(`
    SELECT 
      t.term_id,
      t.name as brand_name,
      tm.meta_key,
      tm.meta_value
    FROM vh_termmeta tm
    JOIN vh_term_taxonomy tt ON tm.term_id = tt.term_id
    JOIN vh_terms t ON tt.term_id = t.term_id
    WHERE tt.taxonomy = 'pwb-brand'
    AND (tm.meta_key LIKE 'faq_%_faq_title' OR tm.meta_key LIKE 'faq_%_message')
    AND tm.meta_value IS NOT NULL
    AND tm.meta_value != ''
    ORDER BY t.term_id, tm.meta_key ASC
  `);
  
  const faqs = [];
  
  // Group meta entries by term_id (brand)
  const brandFAQsMap = new Map();
  
  brandMeta.forEach(meta => {
    if (!brandFAQsMap.has(meta.term_id)) {
      brandFAQsMap.set(meta.term_id, {
        brand_name: meta.brand_name,
        term_id: meta.term_id,
        faqs: new Map()
      });
    }
    
    const brandData = brandFAQsMap.get(meta.term_id);
    
    // Extract FAQ index from meta_key (e.g., faq_0_faq_title -> 0)
    const faqMatch = meta.meta_key.match(/faq_(\d+)_(faq_title|message)/);
    if (faqMatch) {
      const faqIndex = parseInt(faqMatch[1]);
      const faqType = faqMatch[2]; // 'faq_title' or 'message'
      
      if (!brandData.faqs.has(faqIndex)) {
        brandData.faqs.set(faqIndex, {});
      }
      
      if (faqType === 'faq_title') {
        brandData.faqs.get(faqIndex).question = meta.meta_value;
      } else if (faqType === 'message') {
        brandData.faqs.get(faqIndex).answer = meta.meta_value;
      }
    }
  });
  
  // Convert grouped data to FAQ array
  brandFAQsMap.forEach((brandData, termId) => {
    brandData.faqs.forEach((faq, index) => {
      if (faq.question && faq.answer) {
        faqs.push({
          brand_name: brandData.brand_name,
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
 * Extract FAQs from brand descriptions
 */
async function extractFAQsFromBrandDescriptions(crossServerMigration) {
  const brandDescriptions = await crossServerMigration.fetchFromOldDb(`
    SELECT 
      t.term_id,
      t.name as brand_name,
      tt.description
    FROM vh_terms t
    JOIN vh_term_taxonomy tt ON t.term_id = tt.term_id
    WHERE tt.taxonomy = 'pwb-brand'
    AND tt.description IS NOT NULL
    AND tt.description != ''
    AND (tt.description LIKE '%FAQ%' OR tt.description LIKE '%faq%' OR tt.description LIKE '%rank-math%')
  `);
  
  const faqs = [];
  
  brandDescriptions.forEach(brand => {
    const descFAQs = extractFAQsFromDescription(brand.description);
    descFAQs.forEach(faq => {
      faqs.push({
        brand_name: brand.brand_name,
        question: faq.question,
        answer: faq.answer,
        term_id: brand.term_id
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
        brand_name,
        brand_id,
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
      brand_name: faq.brand_name,
      question: faq.question,
      answer: faq.answer,
      faq_id: faq.id,
      brand_id: faq.brand_id
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
 * Extract FAQs from meta value using direct parsing
 */
function extractFAQsFromMetaValue(metaValue, metaKey) {
  const faqs = [];
  
  if (!metaValue) return faqs;
  
  try {
    // Method 1: Check if it's a direct Q&A format
    if (metaKey.includes('question') || metaKey.includes('answer')) {
      // Try to extract question and answer pairs
      const qaPairs = metaValue.match(/([^?]+\?)\s*([^?]+)/g);
      if (qaPairs) {
        qaPairs.forEach(pair => {
          const parts = pair.match(/([^?]+\?)\s*(.+)/);
          if (parts && parts[1] && parts[2]) {
            faqs.push({
              question: cleanHtmlContent(parts[1], false),
              answer: cleanHtmlContent(parts[2], true)
            });
          }
        });
      }
    }
    
    // Method 2: Check for structured data
    if (faqs.length === 0) {
      const structuredData = metaValue.match(/\{.*\}/);
      if (structuredData) {
        try {
          const data = JSON.parse(structuredData[0]);
          if (data.questions && Array.isArray(data.questions)) {
            data.questions.forEach(qa => {
              if (qa.question && qa.answer) {
                faqs.push({
                  question: cleanHtmlContent(qa.question, false),
                  answer: cleanHtmlContent(qa.answer, true)
                });
              }
            });
          }
        } catch (e) {
          // Not valid JSON, continue
        }
      }
    }
    
    // Method 3: Check for HTML-like content
    if (faqs.length === 0 && (metaValue.includes('<') || metaValue.includes('&lt;'))) {
      const htmlFAQs = extractFAQsFromDescription(metaValue);
      faqs.push(...htmlFAQs);
    }
    
  } catch (error) {
    console.error('Error extracting FAQs from meta value:', error.message);
  }
  
  return faqs;
}

/**
 * Extract FAQs from serialized data
 */
function extractFAQsFromSerializedData(serializedData) {
  const faqs = [];
  
  if (!serializedData) return faqs;
  
  try {
    // Method 1: WordPress serialized data
    if (serializedData.includes('a:') && serializedData.includes('s:')) {
      // This looks like WordPress serialized data
      // For now, we'll skip this as it requires PHP unserialize
      console.log('Found WordPress serialized data - skipping for now');
    }
    
    // Method 2: Base64 encoded data
    if (serializedData.match(/^[A-Za-z0-9+/]+=*$/)) {
      try {
        const decoded = Buffer.from(serializedData, 'base64').toString('utf-8');
        const decodedFAQs = extractFAQsFromDescription(decoded);
        faqs.push(...decodedFAQs);
      } catch (e) {
        // Not valid base64, continue
      }
    }
    
    // Method 3: URL encoded data
    if (serializedData.includes('%')) {
      try {
        const decoded = decodeURIComponent(serializedData);
        const decodedFAQs = extractFAQsFromDescription(decoded);
        faqs.push(...decodedFAQs);
      } catch (e) {
        // Not valid URL encoding, continue
      }
    }
    
  } catch (error) {
    console.error('Error extracting FAQs from serialized data:', error.message);
  }
  
  return faqs;
}

/**
 * Create sample FAQs for major brands based on live site
 */
function createSampleBrandFAQs(brands) {
  // No static FAQs - only extract from old database
  return [];
}

/**
 * Extract brand name from page title or slug
 */
function extractBrandNameFromPage(pageTitle, pageSlug) {
  // Try to extract brand name from page title
  if (pageTitle.toLowerCase().includes('al fakher')) return 'AL FAKHER';
  if (pageTitle.toLowerCase().includes('elfbar')) return 'ELFBAR';
  if (pageTitle.toLowerCase().includes('crystal')) return 'CRYSTAL';
  if (pageTitle.toLowerCase().includes('lost mary')) return 'LOST MARY';
  if (pageTitle.toLowerCase().includes('geek bar')) return 'GEEK BAR';
  
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
 * Map FAQs to brands and insert into database
 */
async function mapAndInsertBrandFAQs(allFAQs, brands, queryInterface, transaction, migrationStats) {
  const brandMap = new Map();
  brands.forEach(brand => {
    brandMap.set(brand.name.toLowerCase(), brand);
  });
  
  for (const faq of allFAQs) {
    try {
      migrationStats.brandsProcessed++;
      
      // Find matching brand
      const brand = brandMap.get(faq.brand_name.toLowerCase());
      
      if (!brand) {
        console.log(`   ⚠️  No matching brand found for: ${faq.brand_name}`);
        continue;
      }
      
      // Check if FAQ already exists for this brand
      const [existingFAQs] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM FAQs 
        WHERE entity_type = 'brand' AND entity_id = :brandId AND question = :question
      `, {
        replacements: { brandId: brand.id, question: faq.question },
        type: queryInterface.sequelize.QueryTypes.SELECT,
        transaction
      });
      
      if (existingFAQs && existingFAQs.length > 0 && existingFAQs[0].count > 0) {
        console.log(`   ⚠️  FAQ already exists for brand ${brand.name}`);
        continue;
      }
      
      // Insert FAQ
      await queryInterface.bulkInsert('FAQs', [{
        entity_type: 'brand',
        entity_id: brand.id,
        question: faq.question.substring(0, 500), // Limit question length
        answer: faq.answer.substring(0, 2000), // Limit answer length
        createdAt: new Date(),
        updatedAt: new Date()
      }], { 
        transaction,
        ignoreDuplicates: true
      });
      
      migrationStats.faqsInserted++;
      migrationStats.brandsWithFAQs++;
      
      console.log(`   ✅ Inserted FAQ for brand: ${brand.name}`);
      
    } catch (error) {
      migrationStats.errors++;
      console.error(`   ❌ Error processing FAQ for ${faq.brand_name}:`, error.message);
    }
  }
}

/**
 * Generate migration report
 */
function generateMigrationReport(migrationStats) {
  const report = `
📊 BRAND FAQS MIGRATION REPORT
================================================================
Migration completed at: ${new Date().toISOString()}

STATISTICS:
- Brands Processed: ${migrationStats.brandsProcessed}
- Brands with FAQs: ${migrationStats.brandsWithFAQs}
- FAQs Extracted: ${migrationStats.faqsExtracted}
- FAQs Inserted: ${migrationStats.faqsInserted}
- Errors: ${migrationStats.errors}

SUCCESS RATE: ${migrationStats.brandsProcessed > 0 ? 
  ((migrationStats.brandsWithFAQs / migrationStats.brandsProcessed) * 100).toFixed(2)
  : 0}%

FAQ EXTRACTION RATE: ${migrationStats.brandsProcessed > 0 ? 
  ((migrationStats.faqsExtracted / migrationStats.brandsProcessed).toFixed(2))
  : 0} FAQs per brand

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
    
    const reportPath = path.join(logsDir, 'brand-faqs-migration-report.txt');
    fs.writeFileSync(reportPath, report);
    console.log(`📄 Detailed report saved to: ${reportPath}`);
  } catch (error) {
    console.log('⚠️  Could not save report file:', error.message);
  }
}
