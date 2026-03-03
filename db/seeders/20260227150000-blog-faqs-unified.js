'use strict';

/**
 * Unified Blog FAQs Seeder
 *
 * Single entry point for the full FAQ flow:
 * 1. Migrate FAQs from SP Easy Accordion (old DB) into FAQs table.
 * 2. Remove [sp_easyaccordion] shortcode and "Frequently Asked Questions" heading from blog content.
 * 3. Extract inline FAQ sections from blog content, save to FAQs table, and remove those blocks.
 *
 * Run once: npx sequelize-cli db:seed --seed 20260227150000-blog-faqs-unified.js
 */

const CrossServerMigration = require('../../utils/cross-server-migration');
const phpUnserialize = require('phpunserialize');

const SHORTCODE_PATTERN = /\[\s*sp_easyaccordion\s+id\s*=\s*(["']?)(\d+)\1\s*\]/gi;

// ----- Step 2: Remove shortcode and FAQ heading (from 20260217150000) -----

function removeFaqHeadingAndShortcode(content) {
  if (!content || typeof content !== 'string') return content;

  let updated = content;
  let match;
  let removedAnyShortcode = false;

  SHORTCODE_PATTERN.lastIndex = 0;

  while ((match = SHORTCODE_PATTERN.exec(updated)) !== null) {
    const shortcodeStart = match.index;
    const shortcodeEnd = shortcodeStart + match[0].length;
    const beforeShortcode = updated.slice(0, shortcodeStart);

    const headingRegex = /<h([1-6])[^>]*>[\s\S]*?frequently\s+asked\s+questions[\s\S]*?<\/h\1>/gi;
    let headingMatch;
    let lastHeadingMatch = null;

    while ((headingMatch = headingRegex.exec(beforeShortcode)) !== null) {
      lastHeadingMatch = { start: headingMatch.index, end: headingRegex.lastIndex };
    }

    let removeStart = shortcodeStart;
    let removeEnd = shortcodeEnd;
    if (lastHeadingMatch) {
      const distance = shortcodeStart - lastHeadingMatch.end;
      if (distance >= 0 && distance <= 2000) removeStart = lastHeadingMatch.start;
    }

    updated = (updated.slice(0, removeStart) + updated.slice(removeEnd))
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
    removedAnyShortcode = true;
    SHORTCODE_PATTERN.lastIndex = 0;
  }

  if (removedAnyShortcode) {
    const faqHeadingRegex = /<h([1-6])[^>]*>[\s\S]*?frequently\s+asked\s+questions[\s\S]*?<\/h\1>/gi;
    updated = updated.replace(faqHeadingRegex, '').replace(/\n\s*\n\s*\n/g, '\n\n').trim();
  }

  return updated;
}

// ----- Step 3: Extract inline FAQs from content (from 20260227120000) -----

function extractProperFaqsFromContent(content) {
  const faqs = [];
  if (!content || typeof content !== 'string') return { faqs, sectionStart: -1, sectionLength: 0 };

  const faqHeadingPatterns = [
    /frequently\s+asked\s+questions/i,
    /<h[2-4][^>]*>\s*faq\s*<\/h[2-4]>/i,
    /\*\*\s*frequently\s+asked\s+questions\s*\*\*/i,
    /\*\*\s*faq\s*\*\*/i
  ];

  let sectionStart = -1;
  let headingLevel = null;

  const headingTagMatch = content.match(
    /<h([1-4])[^>]*>[\s\S]*?frequently\s+asked\s+questions[\s\S]*?<\/h\1>/i
  );
  if (headingTagMatch) {
    sectionStart = content.indexOf(headingTagMatch[0]);
    headingLevel = parseInt(headingTagMatch[1], 10) || null;
  } else {
    for (const re of faqHeadingPatterns) {
      const m = content.match(re);
      if (m) {
        sectionStart = content.indexOf(m[0]);
        break;
      }
    }
  }
  if (sectionStart === -1) return { faqs, sectionStart: -1, sectionLength: 0 };

  const afterHeading = content.slice(sectionStart);
  let sectionEndRegex;
  if (headingLevel) {
    const levels = [];
    for (let l = 1; l <= headingLevel; l++) levels.push(`h${l}`);
    const headingGroup = levels.join('|');
    sectionEndRegex = new RegExp(
      `\\n\\s*<(?:${headingGroup})\\b|<\\/h[1-4]>\\s*<(?:${headingGroup})\\b|\\[sp_easyaccordion|$`,
      'im'
    );
  } else {
    sectionEndRegex = /\n\s*<h[1-4]\s|<\/h[1-4]>\s*<h[1-4]|\[sp_easyaccordion|$/im;
  }
  const sectionEndMatch = afterHeading.match(sectionEndRegex);
  const sectionLen = sectionEndMatch ? sectionEndMatch.index : Math.min(15000, afterHeading.length);
  let sectionText = afterHeading.slice(0, sectionLen);

  const closingHeadingMatch = sectionText.match(/<\/h[1-4]>/i);
  if (closingHeadingMatch) {
    const endOfHeading = sectionText.indexOf(closingHeadingMatch[0]) + closingHeadingMatch[0].length;
    sectionText = sectionText.slice(endOfHeading).trim();
  } else {
    const firstNewline = sectionText.search(/\r?\n/);
    if (firstNewline !== -1) sectionText = sectionText.slice(firstNewline + 1).trim();
  }

  if (SHORTCODE_PATTERN.test(sectionText) && sectionText.replace(SHORTCODE_PATTERN, '').trim().length < 50) {
    return { faqs, sectionStart: -1, sectionLength: 0 };
  }
  SHORTCODE_PATTERN.lastIndex = 0;

  let match;

  if (/<h3[\s>][\s\S]*?<strong[\s\S]*?\d+[.)]/.test(sectionText)) {
    const h3Block = /<h3[^>]*>[\s\S]*?<strong[^>]*>(?:(\d+)[.)]\s*)?([\s\S]*?)<\/strong>[\s\S]*?<\/h3>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi;
    while ((match = h3Block.exec(sectionText)) !== null) {
      const question = stripHtml((match[1] || '') + (match[2] || '')).trim();
      const answer = stripHtml(match[3] || '').trim();
      if (question.length >= 10 && answer.length >= 15) faqs.push({ question, answer: wrapAnswerInP(answer) });
    }
  }

  if (faqs.length === 0 && /<strong[^>]*>[\s\S]*?\d+[.)]/.test(sectionText)) {
    const strongNumbered = /<p[^>]*>\s*<strong[^>]*>(\d+[.)]\s*)?([\s\S]*?)<\/strong>\s*<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
    while ((match = strongNumbered.exec(sectionText)) !== null) {
      const question = stripHtml((match[1] || '') + (match[2] || '')).trim();
      const answer = stripHtml(match[3] || '').trim();
      if (question.length >= 10 && answer.length >= 15) faqs.push({ question, answer: wrapAnswerInP(answer) });
    }
  }

  if (faqs.length === 0) {
    const numberedBlock = /(\d+)[.)]\s*([^\n<]+(?:\?|:)?)\s*[\n\r]+([\s\S]*?)(?=\d+[.)]\s*|\s*$)/gim;
    while ((match = numberedBlock.exec(sectionText)) !== null) {
      const question = stripHtml(match[2]).trim();
      let answer = match[3].trim();
      answer = stripHtml(answer).replace(/\n\s*\n/g, '\n\n').trim();
      if (question.length >= 10 && answer.length >= 15) faqs.push({ question, answer: wrapAnswerInP(answer) });
    }
  }

  if (faqs.length === 0) {
    const strongBlock = /<p[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>\s*<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
    while ((match = strongBlock.exec(sectionText)) !== null) {
      const question = stripHtml(match[1]).trim();
      const answer = stripHtml(match[2]).trim();
      if (question.length >= 10 && answer.length >= 15) faqs.push({ question, answer: wrapAnswerInP(answer) });
    }
  }

  if (faqs.length === 0) {
    const boldLine = /\*\*([^*]+)\*\*\s*[\n\r]+([\s\S]*?)(?=\*\*[^*]+\*\*|$)/g;
    while ((match = boldLine.exec(sectionText)) !== null) {
      const question = match[1].trim();
      const answer = stripHtml(match[2]).replace(/\n\s*\n/g, '\n\n').trim();
      if (question.length >= 10 && answer.length >= 15) faqs.push({ question, answer: wrapAnswerInP(answer) });
    }
  }

  return {
    faqs,
    sectionStart: faqs.length > 0 ? sectionStart : -1,
    sectionLength: faqs.length > 0 ? sectionLen : 0
  };
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function wrapAnswerInP(text) {
  if (!text) return '';
  text = text.trim();
  if (/^<p>/i.test(text)) return text;
  return `<p>${text}</p>`;
}

// ----- Step 1: Accordion migration helpers (from 20260217140000) -----

function extractFAQsFromSerializedData(serializedData) {
  const faqs = [];
  if (!serializedData || typeof serializedData !== 'string') return faqs;

  try {
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
                faqs.push({ question: cleanHtmlContent(q, false), answer: cleanHtmlContent(a, true) });
              }
            }
          }
        }
      }
    } catch (_) {}

    if (faqs.length === 0) {
      const contentSourceMatch = serializedData.match(/s:24:"accordion_content_source";a:(\d+):\{(.*)\}/);
      if (contentSourceMatch) {
        const contentSourceData = contentSourceMatch[2];
        const itemPattern = /i:(\d+);a:\d+:\{[^}]*s:23:"accordion_content_title";s:(\d+):"((?:[^"\\]|\\.)*)";[^}]*s:29:"accordion_content_description";s:(\d+):"((?:[^"\\]|\\.)*)";/g;
        let match;
        while ((match = itemPattern.exec(contentSourceData)) !== null) {
          const question = match[3].replace(/\\(.)/g, '$1');
          const answer = match[5].replace(/\\(.)/g, '$1');
          if (question && answer && question.length > 3 && answer.length > 3) {
            faqs.push({ question: cleanHtmlContent(question, false), answer: cleanHtmlContent(answer, true) });
          }
        }
      }
    }

    if (faqs.length === 0) {
      const titlePattern = /s:23:"accordion_content_title";s:(\d+):"((?:[^"\\]|\\.)*)";/g;
      const descPattern = /s:29:"accordion_content_description";s:(\d+):"((?:[^"\\]|\\.)*)";/g;
      const titles = [];
      const descriptions = [];
      let titleMatch;
      while ((titleMatch = titlePattern.exec(serializedData)) !== null) {
        titles.push({ value: titleMatch[2].replace(/\\(.)/g, '$1') });
      }
      let descMatch;
      while ((descMatch = descPattern.exec(serializedData)) !== null) {
        descriptions.push({ value: descMatch[2].replace(/\\(.)/g, '$1') });
      }
      const minLength = Math.min(titles.length, descriptions.length);
      for (let i = 0; i < minLength; i++) {
        if (titles[i].value && descriptions[i].value && titles[i].value.length > 3 && descriptions[i].value.length > 3) {
          faqs.push({
            question: cleanHtmlContent(titles[i].value, false),
            answer: cleanHtmlContent(descriptions[i].value, true)
          });
        }
      }
    }

    if (faqs.length === 0) {
      const qaPattern = /"accordion_content_title"[^"]*"([^"]{10,200})"[^"]*"accordion_content_description"[^"]*"([^"]{20,})"/g;
      let qaMatch;
      while ((qaMatch = qaPattern.exec(serializedData)) !== null) {
        const question = qaMatch[1];
        const answer = qaMatch[2];
        if (question && answer && question.length > 5 && answer.length > 10) {
          faqs.push({ question: cleanHtmlContent(question, false), answer: cleanHtmlContent(answer, true) });
        }
      }
    }
  } catch (error) {
    console.error('Error extracting FAQs from serialized data:', error.message);
  }

  return faqs;
}

function cleanHtmlContent(content, addPTags = true) {
  if (!content) return '';
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
  if (!addPTags) {
    content = content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  } else {
    content = content.replace(/\s+/g, ' ').trim();
    if (!content.includes('<p>')) content = `<p>${content}</p>`;
  }
  return content;
}

function generateMigrationReport(migrationStats) {
  const report = `
📊 BLOG FAQS UNIFIED MIGRATION REPORT
================================================================
Completed at: ${new Date().toISOString()}

ACCORDION MIGRATION:
- Accordions Processed: ${migrationStats.accordionsProcessed}
- Accordions with FAQs: ${migrationStats.accordionsWithFAQs}
- FAQs Extracted: ${migrationStats.faqsExtracted}
- FAQs Inserted: ${migrationStats.faqsInserted}
- FAQs Skipped (Duplicates): ${migrationStats.faqsSkipped}
- Blog Posts Mapped: ${migrationStats.blogPostsMapped}
- Errors: ${migrationStats.errors}

CONTENT EXTRACTION:
- Blogs with FAQ section: ${migrationStats.blogsWithFaqSection}
- Blogs content updated: ${migrationStats.blogsUpdated}
- Inline FAQs inserted: ${migrationStats.inlineFaqsInserted}

================================================================
`;
  console.log(report);
  const fs = require('fs');
  const path = require('path');
  const logsDir = path.join(__dirname, '../../../logs');
  try {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(path.join(logsDir, 'blog-faqs-unified-report.txt'), report);
    console.log(`📄 Report saved to: ${path.join(logsDir, 'blog-faqs-unified-report.txt')}`);
  } catch (e) {
    console.log('⚠️  Could not save report:', e.message);
  }
}

// ----- Main seeder -----

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const environment = process.env.NODE_ENV || 'local';
    const crossServerMigration = new CrossServerMigration(environment);

    const migrationStats = {
      accordionsProcessed: 0,
      accordionsWithFAQs: 0,
      faqsExtracted: 0,
      faqsInserted: 0,
      faqsSkipped: 0,
      blogPostsMapped: 0,
      errors: 0,
      blogsWithFaqSection: 0,
      blogsUpdated: 0,
      inlineFaqsInserted: 0
    };

    try {
      console.log('🚀 BLOG FAQS UNIFIED SEEDER — accordion migration + shortcode removal + content extraction');
      console.log(`🔧 Environment: ${environment}`);

      const tableCheckRows = await queryInterface.sequelize.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'FAQs'`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      );
      if (!tableCheckRows || tableCheckRows.length === 0) {
        throw new Error('FAQs table does not exist in new database');
      }
      console.log('✅ FAQs table exists');

      await crossServerMigration.connectToOldDb();
      console.log('✅ Connected to old database');

      // --- Step 1: Accordion migration ---
      console.log('\n📥 Step 1: Finding blogs with accordion shortcodes...');
      const blogsRaw = await queryInterface.sequelize.query(
        `SELECT id as new_blog_id, title, slug, content FROM blogs WHERE content LIKE '%sp_easyaccordion%' AND deleted_at IS NULL ORDER BY id ASC`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      );

      const blogsWithAccordions = [];
      for (const row of blogsRaw) {
        const content = row.content || '';
        SHORTCODE_PATTERN.lastIndex = 0;
        const match = SHORTCODE_PATTERN.exec(content);
        const old_accordion_id = match ? parseInt(match[2], 10) : null;
        if (old_accordion_id && old_accordion_id > 0) blogsWithAccordions.push({ ...row, old_accordion_id });
      }
      console.log(`📊 Found ${blogsWithAccordions.length} blog(s) with accordion references`);

      if (blogsWithAccordions.length > 0) {
        const accordionIds = [...new Set(
          blogsWithAccordions.map(b => b.old_accordion_id).filter(id => id && id > 0)
        )];
        console.log(`📊 Unique accordion IDs: ${accordionIds.join(', ')}`);

        const accordionPosts = await crossServerMigration.fetchFromOldDb(`
          SELECT p.ID as accordion_id, p.post_title as accordion_title, pm.meta_value as accordion_data
          FROM vh_posts p
          INNER JOIN vh_postmeta pm ON p.ID = pm.post_id
          WHERE p.post_type = 'sp_easy_accordion' AND p.post_status = 'publish' AND pm.meta_key = 'sp_eap_upload_options'
          AND p.ID IN (${accordionIds.join(',')})
          ORDER BY p.ID ASC
        `);

        const accordionFAQsMap = new Map();
        for (const accordionPost of accordionPosts) {
          migrationStats.accordionsProcessed++;
          const serializedData = accordionPost.accordion_data;
          if (!serializedData) continue;
          const faqs = extractFAQsFromSerializedData(serializedData);
          if (faqs.length > 0) {
            migrationStats.accordionsWithFAQs++;
            migrationStats.faqsExtracted += faqs.length;
            accordionFAQsMap.set(accordionPost.accordion_id, faqs);
          }
        }

        console.log('\n💾 Inserting accordion FAQs into FAQs table...');
        for (const blogPost of blogsWithAccordions) {
          const faqs = accordionFAQsMap.get(blogPost.old_accordion_id);
          if (!faqs || faqs.length === 0) continue;
          migrationStats.blogPostsMapped++;
          const newBlogId = blogPost.new_blog_id;
          for (const faq of faqs) {
            const existingRows = await queryInterface.sequelize.query(
              `SELECT id FROM FAQs WHERE entity_type = 'blog' AND entity_id = :blogId AND question = :question AND deletedAt IS NULL`,
              { replacements: { blogId: newBlogId, question: faq.question.substring(0, 500) }, type: Sequelize.QueryTypes.SELECT, transaction }
            );
            if (existingRows && existingRows.length > 0) {
              migrationStats.faqsSkipped++;
              continue;
            }
            await queryInterface.bulkInsert('FAQs', [{
              entity_type: 'blog',
              entity_id: newBlogId,
              question: faq.question.substring(0, 500),
              answer: faq.answer.substring(0, 2000),
              createdAt: new Date(),
              updatedAt: new Date()
            }], { transaction, ignoreDuplicates: true });
            migrationStats.faqsInserted++;
          }
        }
      }

      await crossServerMigration.closeOldDbConnection();
      console.log('✅ Old DB connection closed');

      // --- Step 2: Remove shortcode and FAQ heading from content ---
      console.log('\n🧹 Step 2: Removing shortcode and FAQ heading from blog content...');
      let contentUpdates = 0;
      for (const blogPost of blogsWithAccordions) {
        const content = blogPost.content || '';
        const cleaned = removeFaqHeadingAndShortcode(content);
        if (cleaned === content) continue;
        await queryInterface.sequelize.query(
          `UPDATE blogs SET content = :content, updated_at = :updatedAt WHERE id = :id`,
          { replacements: { content: cleaned, updatedAt: new Date(), id: blogPost.new_blog_id }, transaction }
        );
        contentUpdates++;
      }
      console.log(`📊 Updated ${contentUpdates} blog(s) (shortcode + heading removed)`);

      // --- Step 3: Extract inline FAQ sections and remove blocks ---
      console.log('\n📥 Step 3: Extracting inline FAQ sections from blog content...');
      const allBlogs = await queryInterface.sequelize.query(
        `SELECT id, title, content FROM blogs WHERE content IS NOT NULL AND content != '' AND deleted_at IS NULL`,
        { transaction, type: Sequelize.QueryTypes.SELECT }
      );

      for (const blog of allBlogs) {
        try {
          const { faqs, sectionStart, sectionLength } = extractProperFaqsFromContent(blog.content);
          if (sectionStart < 0 || sectionLength <= 0 || faqs.length === 0) continue;

          migrationStats.blogsWithFaqSection++;
          const seen = new Set();
          for (const faq of faqs) {
            const q = faq.question.substring(0, 500);
            if (seen.has(q)) continue;
            seen.add(q);
            const existing = await queryInterface.sequelize.query(
              `SELECT id FROM FAQs WHERE entity_type = 'blog' AND entity_id = :blogId AND question = :q AND deletedAt IS NULL`,
              { replacements: { blogId: blog.id, q }, transaction, type: Sequelize.QueryTypes.SELECT }
            );
            if (existing && existing.length > 0) continue;
            await queryInterface.bulkInsert('FAQs', [{
              entity_type: 'blog',
              entity_id: blog.id,
              question: q,
              answer: (faq.answer || '').substring(0, 2000),
              createdAt: new Date(),
              updatedAt: new Date()
            }], { transaction, ignoreDuplicates: true });
            migrationStats.inlineFaqsInserted++;
          }

          const cleaned = (blog.content.slice(0, sectionStart) + blog.content.slice(sectionStart + sectionLength))
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .trim();
          if (faqs.length > 0 && cleaned !== blog.content) {
            await queryInterface.sequelize.query(
              `UPDATE blogs SET content = :content WHERE id = :id`,
              { replacements: { content: cleaned, id: blog.id }, transaction }
            );
            migrationStats.blogsUpdated++;
          }
        } catch (err) {
          migrationStats.errors++;
          console.error(`   ❌ Blog ID ${blog.id}:`, err.message);
        }
      }

      generateMigrationReport(migrationStats);
      await transaction.commit();
      console.log('\n🎉 BLOG FAQS UNIFIED SEEDER COMPLETED SUCCESSFULLY!');
    } catch (error) {
      await transaction.rollback();
      if (crossServerMigration.oldDbConnection) await crossServerMigration.closeOldDbConnection();
      console.error('\n❌ BLOG FAQS UNIFIED SEEDER FAILED:', error.message);
      throw error;
    }
  },

  async down() {
    console.log('🔄 Down: not reverting FAQ migration or content changes (no-op).');
  }
};
