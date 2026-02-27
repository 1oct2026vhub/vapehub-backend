'use strict';

/**
 * Blog FAQs Migration from SP Easy Accordion Plugin
 * 
 * This seeder extracts FAQs from SP Easy Accordion plugin posts in the old database
 * and migrates them to the new FAQs table with blog relationships.
 * 
 * Features:
 * - Connects to old database using CrossServerMigration utility
 * - Extracts accordion data from sp_easy_accordion custom post type
 * - Parses PHP serialized data from post meta
 * - Maps accordions to blog posts via shortcode references
 * - Inserts FAQs into the FAQs table with entity_type='blog'
 * - Handles transaction safety to prevent staging server issues
 * - Comprehensive error handling and logging
 */

const CrossServerMigration = require('../../utils/cross-server-migration');
const phpUnserialize = require('phpunserialize');

const SHORTCODE_PATTERN = /\[\s*sp_easyaccordion\s+id\s*=\s*(["']?)(\d+)\1\s*\]/gi;

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const environment = process.env.NODE_ENV || 'local';
    const crossServerMigration = new CrossServerMigration(environment);
    
    try {
      console.log('🚀 Starting BLOG FAQS MIGRATION from SP Easy Accordion...');
      console.log(`🔧 Environment: ${environment}`);
      console.log(`🔧 Database: ${process.env.DB_NAME || 'unknown'}`);
      
      const migrationStats = {
        accordionsProcessed: 0,
        accordionsWithFAQs: 0,
        faqsExtracted: 0,
        faqsInserted: 0,
        faqsSkipped: 0,
        blogPostsMapped: 0,
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

      // Step 1: Find blog posts in NEW database with accordion references
      console.log('\n📥 Step 1: Finding blog posts with accordion references in NEW database...');
      
      const blogsWithAccordions = await queryInterface.sequelize.query(`
        SELECT 
          id as new_blog_id,
          title,
          slug,
          content,
          CAST(
            SUBSTRING_INDEX(
              SUBSTRING_INDEX(
                SUBSTRING(content, LOCATE('id="', content, LOCATE('[sp_easyaccordion', content)) + 4),
                '"', 1
              ),
              '"', 1
            ) AS UNSIGNED
          ) as old_accordion_id
        FROM blogs
        WHERE content LIKE '%sp_easyaccordion%'
        AND content LIKE '%id=%'
        AND deleted_at IS NULL
        ORDER BY id ASC
      `, {
        type: Sequelize.QueryTypes.SELECT,
        transaction
      });

      console.log(`📊 Found ${blogsWithAccordions.length} blog posts with accordion references`);

      if (blogsWithAccordions.length === 0) {
        console.log('⚠️  No blog posts with accordion references found. Migration completed.');
        await crossServerMigration.closeOldDbConnection();
        await transaction.commit();
        return;
      }

      // Extract unique accordion IDs
      const accordionIds = [...new Set(
        blogsWithAccordions
          .map(b => b.old_accordion_id)
          .filter(id => id && id > 0)
      )];

      console.log(`📊 Found ${accordionIds.length} unique accordion IDs: ${accordionIds.join(', ')}`);

      if (accordionIds.length === 0) {
        console.log('⚠️  No valid accordion IDs found. Migration completed.');
        await crossServerMigration.closeOldDbConnection();
        await transaction.commit();
        return;
      }

      // Step 2: Fetch accordion FAQ data from OLD database
      console.log('\n📥 Step 2: Fetching accordion FAQ data from OLD database...');
      
      const accordionPosts = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          p.ID as accordion_id,
          p.post_title as accordion_title,
          pm.meta_value as accordion_data
        FROM vh_posts p
        INNER JOIN vh_postmeta pm ON p.ID = pm.post_id
        WHERE p.post_type = 'sp_easy_accordion'
        AND p.post_status = 'publish'
        AND pm.meta_key = 'sp_eap_upload_options'
        AND p.ID IN (${accordionIds.join(',')})
        ORDER BY p.ID ASC
      `);

      console.log(`📊 Found ${accordionPosts.length} accordion posts in OLD database`);

      // Step 3: Extract FAQs from each accordion
      console.log('\n🔄 Step 3: Extracting FAQs from accordions...');
      
      const accordionFAQsMap = new Map(); // accordion_id -> array of FAQs

      for (const accordionPost of accordionPosts) {
        migrationStats.accordionsProcessed++;
        
        try {
          const accordionId = accordionPost.accordion_id;
          const serializedData = accordionPost.accordion_data;
          
          console.log(`\n📦 Processing accordion: ${accordionPost.accordion_title} (ID: ${accordionId})`);
          
          if (!serializedData) {
            console.log(`   ⚠️  No accordion data found`);
            continue;
          }

          // Extract FAQs from PHP serialized data
          const faqs = extractFAQsFromSerializedData(serializedData);
          
          if (faqs.length > 0) {
            migrationStats.accordionsWithFAQs++;
            migrationStats.faqsExtracted += faqs.length;
            accordionFAQsMap.set(accordionId, faqs);
            console.log(`   ✅ Extracted ${faqs.length} FAQs`);
          } else {
            console.log(`   ⚠️  No FAQs found in accordion data`);
          }
          
        } catch (error) {
          migrationStats.errors++;
          console.error(`   ❌ Error processing accordion ${accordionPost.accordion_id}:`, error.message);
        }
      }

      console.log(`\n📊 Total FAQs extracted: ${migrationStats.faqsExtracted}`);

      // Step 4: Map FAQs to blog posts and insert
      console.log('\n💾 Step 4: Mapping FAQs to blog posts and inserting...');
      
      for (const blogPost of blogsWithAccordions) {
        const accordionId = blogPost.old_accordion_id;
        const faqs = accordionFAQsMap.get(accordionId);
        
        if (!faqs || faqs.length === 0) {
          console.log(`   ⚠️  No FAQs found for accordion ${accordionId} (blog: ${blogPost.title})`);
          continue;
        }

        migrationStats.blogPostsMapped++;
        const newBlogId = blogPost.new_blog_id;

        // Insert FAQs for this blog post
        let insertedCount = 0;
        for (const faq of faqs) {
          try {
            // Check if FAQ already exists
            const [existing] = await queryInterface.sequelize.query(`
              SELECT id FROM FAQs 
              WHERE entity_type = 'blog' 
              AND entity_id = :blogId 
              AND question = :question
              AND deletedAt IS NULL
            `, {
              replacements: { 
                blogId: newBlogId,
                question: faq.question.substring(0, 500)
              },
              type: Sequelize.QueryTypes.SELECT,
              transaction
            });
            
            if (existing && existing.length > 0) {
              migrationStats.faqsSkipped++;
              continue;
            }

            // Insert FAQ
            await queryInterface.bulkInsert('FAQs', [{
              entity_type: 'blog',
              entity_id: newBlogId,
              question: faq.question.substring(0, 500),
              answer: faq.answer.substring(0, 2000),
              createdAt: new Date(),
              updatedAt: new Date()
            }], { 
              transaction,
              ignoreDuplicates: true
            });

            migrationStats.faqsInserted++;
            insertedCount++;
            
          } catch (error) {
            migrationStats.errors++;
            console.error(`   ❌ Error inserting FAQ for blog ${newBlogId}:`, error.message);
          }
        }

        console.log(`   ✅ Inserted ${insertedCount} FAQs for blog "${blogPost.title}" (ID: ${newBlogId}, Accordion: ${accordionId})`);
      }

      // Step 5: Remove shortcode and FAQ section from blog content
      console.log('\n🧹 Step 5: Removing shortcode and FAQ section from blog content...');
      let contentUpdates = 0;
      for (const blogPost of blogsWithAccordions) {
        if (!blogPost.content || typeof blogPost.content !== 'string') continue;
        let cleaned = blogPost.content
          .replace(SHORTCODE_PATTERN, '')
          .replace(/\n\s*\n\s*\n/g, '\n\n')
          .trim();
        // Remove orphaned "FAQ" / "Frequently Asked Questions" heading block if it's now standalone
        cleaned = cleaned.replace(
          /<h[1-4][^>]*>\s*(?:FAQ|Frequently\s+Asked\s+Questions)\s*<\/h[1-4]>\s*/gi,
          ''
        ).replace(/\n\s*\n\s*\n/g, '\n\n').trim();
        if (cleaned !== blogPost.content) {
          await queryInterface.sequelize.query(
            `UPDATE blogs SET content = :content, updated_at = :updatedAt WHERE id = :id`,
            {
              replacements: {
                content: cleaned,
                updatedAt: new Date(),
                id: blogPost.new_blog_id
              },
              transaction
            }
          );
          contentUpdates++;
          console.log(`   ✅ Removed shortcode from blog ID ${blogPost.new_blog_id}: "${blogPost.title}"`);
        }
      }
      console.log(`📊 Updated content for ${contentUpdates} blog(s)`);

      // Step 6: Generate migration report
      console.log('\n📊 Step 6: Generating migration report...');
      generateMigrationReport(migrationStats);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      // Commit transaction if all operations were successful
      await transaction.commit();
      console.log('\n🎉 BLOG FAQS MIGRATION FROM ACCORDION COMPLETED SUCCESSFULLY!');

    } catch (error) {
      // Rollback transaction on any error
      await transaction.rollback();
      console.error('\n❌ BLOG FAQS MIGRATION FROM ACCORDION FAILED - ROLLED BACK:', error);
      
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
      console.log('🔄 Rolling back blog FAQs migration from accordion...');
      
      // Clear all blog FAQs that might have been migrated
      const [deletedCount] = await queryInterface.sequelize.query(`
        DELETE FROM FAQs WHERE entity_type = 'blog'
      `, { transaction });
      
      console.log(`✅ Cleared ${deletedCount[1]} blog FAQs`);
      
      await transaction.commit();
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error during rollback:', error);
      throw error;
    }
  }
};

/**
 * Extract FAQs from PHP serialized data
 * Format: a:5:{s:18:"eap_accordion_type";s:17:"content-accordion";...}
 * Uses phpunserialize for reliable parsing; falls back to regex for edge cases.
 */
function extractFAQsFromSerializedData(serializedData) {
  const faqs = [];
  
  if (!serializedData || typeof serializedData !== 'string') {
    return faqs;
  }

  try {
    // Method 0: Parse with PHP unserialize and read accordion_content_source
    try {
      const parsed = phpUnserialize(serializedData);
      if (parsed && typeof parsed === 'object') {
        const source = parsed.accordion_content_source;
        const items = Array.isArray(source) ? source : (source && typeof source === 'object' ? Object.values(source) : null);
        if (items && items.length > 0) {
          for (const item of items) {
            if (!item || typeof item !== 'object') continue;
            const question = item.accordion_content_title;
            const answer = item.accordion_content_description;
            if (question != null && answer != null) {
              const q = String(question).trim();
              const a = String(answer).trim();
              if (q.length > 3 && a.length > 3) {
                faqs.push({
                  question: cleanHtmlContent(q, false),
                  answer: cleanHtmlContent(a, true)
                });
              }
            }
          }
        }
      }
    } catch (_) {
      // Unserialize failed; fall through to regex methods
    }

    // Method 1: Extract accordion_content_source array and parse items (regex fallback)
    if (faqs.length === 0) {
      const contentSourceMatch = serializedData.match(/s:24:"accordion_content_source";a:(\d+):\{(.*)\}/);
    
      if (contentSourceMatch) {
      const itemCount = parseInt(contentSourceMatch[1]);
      const contentSourceData = contentSourceMatch[2];
      
      // Extract individual accordion items
      // Pattern: i:N;a:M:{s:23:"accordion_content_title";s:XX:"...";s:29:"accordion_content_description";s:XX:"...";}
      const itemPattern = /i:(\d+);a:\d+:\{[^}]*s:23:"accordion_content_title";s:(\d+):"((?:[^"\\]|\\.)*)";[^}]*s:29:"accordion_content_description";s:(\d+):"((?:[^"\\]|\\.)*)";/g;
      
      let match;
      while ((match = itemPattern.exec(contentSourceData)) !== null) {
        const question = match[3].replace(/\\(.)/g, '$1'); // Unescape
        const answer = match[5].replace(/\\(.)/g, '$1'); // Unescape
        
        if (question && answer && question.length > 3 && answer.length > 3) {
          faqs.push({
            question: cleanHtmlContent(question, false),
            answer: cleanHtmlContent(answer, true)
          });
        }
      }
    }
    }

    // Method 2: Direct pattern matching in entire serialized string (more flexible)
    if (faqs.length === 0) {
      // Look for title and description pairs anywhere in the serialized data
      const titlePattern = /s:23:"accordion_content_title";s:(\d+):"((?:[^"\\]|\\.)*)";/g;
      const descPattern = /s:29:"accordion_content_description";s:(\d+):"((?:[^"\\]|\\.)*)";/g;
      
      const titles = [];
      const descriptions = [];
      
      let titleMatch;
      while ((titleMatch = titlePattern.exec(serializedData)) !== null) {
        const title = titleMatch[2].replace(/\\(.)/g, '$1');
        titles.push({ index: titleMatch.index, value: title });
      }
      
      let descMatch;
      while ((descMatch = descPattern.exec(serializedData)) !== null) {
        const desc = descMatch[2].replace(/\\(.)/g, '$1');
        descriptions.push({ index: descMatch.index, value: desc });
      }
      
      // Match titles with descriptions (they should appear in pairs)
      const minLength = Math.min(titles.length, descriptions.length);
      for (let i = 0; i < minLength; i++) {
        if (titles[i].value && descriptions[i].value && 
            titles[i].value.length > 3 && descriptions[i].value.length > 3) {
          faqs.push({
            question: cleanHtmlContent(titles[i].value, false),
            answer: cleanHtmlContent(descriptions[i].value, true)
          });
        }
      }
    }

    // Method 3: Fallback - extract any Q&A-like patterns
    if (faqs.length === 0) {
      // Try to find any patterns that look like questions and answers
      const qaPattern = /"accordion_content_title"[^"]*"([^"]{10,200})"[^"]*"accordion_content_description"[^"]*"([^"]{20,})"/g;
      let qaMatch;
      while ((qaMatch = qaPattern.exec(serializedData)) !== null) {
        const question = qaMatch[1];
        const answer = qaMatch[2];
        
        if (question && answer && question.length > 5 && answer.length > 10) {
          faqs.push({
            question: cleanHtmlContent(question, false),
            answer: cleanHtmlContent(answer, true)
          });
        }
      }
    }

  } catch (error) {
    console.error('Error extracting FAQs from serialized data:', error.message);
    console.error('Serialized data sample:', serializedData.substring(0, 500));
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
 * Generate migration report
 */
function generateMigrationReport(migrationStats) {
  const report = `
📊 BLOG FAQS MIGRATION FROM ACCORDION REPORT
================================================================
Migration completed at: ${new Date().toISOString()}

STATISTICS:
- Accordions Processed: ${migrationStats.accordionsProcessed}
- Accordions with FAQs: ${migrationStats.accordionsWithFAQs}
- FAQs Extracted: ${migrationStats.faqsExtracted}
- FAQs Inserted: ${migrationStats.faqsInserted}
- FAQs Skipped (Duplicates): ${migrationStats.faqsSkipped}
- Blog Posts Mapped: ${migrationStats.blogPostsMapped}
- Errors: ${migrationStats.errors}

SUCCESS RATE: ${migrationStats.accordionsProcessed > 0 ? 
  ((migrationStats.accordionsWithFAQs / migrationStats.accordionsProcessed) * 100).toFixed(2)
  : 0}%

FAQ EXTRACTION RATE: ${migrationStats.accordionsProcessed > 0 ? 
  ((migrationStats.faqsExtracted / migrationStats.accordionsProcessed).toFixed(2))
  : 0} FAQs per accordion

INSERTION SUCCESS RATE: ${migrationStats.faqsExtracted > 0 ? 
  ((migrationStats.faqsInserted / (migrationStats.faqsInserted + migrationStats.faqsSkipped)) * 100).toFixed(2)
  : 0}%

MIGRATION QUALITY:
- Data Integrity: ${migrationStats.errors === 0 ? '✅ Perfect' : '⚠️ Some errors occurred'}
- Extraction Success: ${migrationStats.faqsExtracted > 0 ? '✅ Success' : '❌ No FAQs found'}
- Duplicate Prevention: ${migrationStats.faqsSkipped > 0 ? `✅ ${migrationStats.faqsSkipped} duplicates prevented` : '✅ No duplicates found'}
- Insertion Success: ${migrationStats.faqsInserted > 0 ? '✅ Success' : '⚠️ No new FAQs inserted'}
- Blog Mapping: ${migrationStats.blogPostsMapped > 0 ? '✅ Completed' : '⚠️ No blog posts mapped'}

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
    
    const reportPath = path.join(logsDir, 'blog-faqs-accordion-migration-report.txt');
    fs.writeFileSync(reportPath, report);
    console.log(`📄 Detailed report saved to: ${reportPath}`);
  } catch (error) {
    console.log('⚠️  Could not save report file:', error.message);
  }
}
