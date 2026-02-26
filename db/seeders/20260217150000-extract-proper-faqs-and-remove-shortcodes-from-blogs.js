'use strict';

/**
 * 1) Extract "proper" FAQs from blog content (Frequently Asked Questions section with real Q&A text),
 *    insert into FAQs table, and remove that section from blog content.
 * 2) Remove [sp_easyaccordion id="..."] shortcode from blog content (only for blogs that have FAQs in table).
 *
 * Prerequisite: Run 20260217140000-migrate-blog-faqs-from-accordion.js first so accordion-based blog FAQs exist.
 * Run order: accordion migration → this seeder.
 */

const SHORTCODE_PATTERN = /\[\s*sp_easyaccordion\s+id\s*=\s*(["']?)(\d+)\1\s*\]/gi;

/** Strip [sp_easyaccordion id="..."] from content */
function stripAccordionShortcodes(content) {
  if (!content || typeof content !== 'string') return content;
  return content.replace(SHORTCODE_PATTERN, '').replace(/\n\s*\n\s*\n/g, '\n\n').trim();
}

/**
 * Detect "Frequently Asked Questions" (or similar) section and extract Q&A pairs.
 * Supports: numbered list (1. Question? Answer...), HTML <p><strong>Q</strong></p><p>A</p>, and plain text.
 * Returns { faqs: [{ question, answer }], sectionStart, sectionLength } or { faqs: [], sectionStart: -1, sectionLength: 0 }.
 */
function extractProperFaqsFromContent(content) {
  const faqs = [];
  if (!content || typeof content !== 'string') return { faqs, sectionStart: -1, sectionLength: 0 };

  const lower = content.toLowerCase();
  const faqHeadingPatterns = [
    /frequently\s+asked\s+questions/,
    /<h[2-4][^>]*>\s*frequently\s+asked\s+questions\s*<\/h[2-4]>/i,
    /<h[2-4][^>]*>\s*faq\s*<\/h[2-4]>/i,
    /\*\*\s*frequently\s+asked\s+questions\s*\*\*/i,
    /\*\*\s*faq\s*\*\*/i
  ];

  let sectionStart = -1;
  for (const re of faqHeadingPatterns) {
    const m = content.match(re);
    if (m) {
      sectionStart = content.indexOf(m[0]);
      break;
    }
  }
  if (sectionStart === -1) return { faqs, sectionStart: -1, sectionLength: 0 };

  // Section runs from sectionStart until next major heading or shortcode or end (limit to ~15k chars)
  const afterHeading = content.slice(sectionStart);
  const sectionEndMatch = afterHeading.match(/\n\s*<h[1-4]\s|<\/h[1-4]>\s*<h[1-4]|\[sp_easyaccordion|$/i);
  const sectionLength = sectionEndMatch ? sectionEndMatch.index : Math.min(15000, afterHeading.length);
  let sectionText = afterHeading.slice(0, sectionLength);

  // Skip if section is only the shortcode (no real Q&A)
  if (SHORTCODE_PATTERN.test(sectionText) && sectionText.replace(SHORTCODE_PATTERN, '').trim().length < 50) {
    return { faqs, sectionStart: -1, sectionLength: 0 };
  }
  SHORTCODE_PATTERN.lastIndex = 0;

  // Pattern 1: Numbered Q&A — "1. Question text?" or "1) Question" then answer until "2." or end
  const numberedBlock = /(\d+)[.)]\s*([^\n<]+(?:\?|:)?)\s*[\n\r]+([\s\S]*?)(?=\d+[.)]\s*[\s\S]*|$)/gi;
  let match;
  while ((match = numberedBlock.exec(sectionText)) !== null) {
    const question = stripHtml(match[2]).trim();
    let answer = match[3].trim();
    answer = stripHtml(answer).replace(/\n\s*\n/g, '\n\n').trim();
    if (question.length >= 10 && answer.length >= 15) {
      faqs.push({ question, answer: wrapAnswerInP(answer) });
    }
  }

  // Pattern 2: HTML <p><strong>Question</strong></p><p>Answer</p> (if no numbered found)
  if (faqs.length === 0) {
    const strongBlock = /<p[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>\s*<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
    while ((match = strongBlock.exec(sectionText)) !== null) {
      const question = stripHtml(match[1]).trim();
      const answer = stripHtml(match[2]).trim();
      if (question.length >= 10 && answer.length >= 15) {
        faqs.push({ question, answer: wrapAnswerInP(answer) });
      }
    }
  }

  // Pattern 3: **Question** or bold line followed by paragraph
  if (faqs.length === 0) {
    const boldLine = /\*\*([^*]+)\*\*\s*[\n\r]+([\s\S]*?)(?=\*\*[^*]+\*\*|$)/g;
    while ((match = boldLine.exec(sectionText)) !== null) {
      const question = match[1].trim();
      const answer = stripHtml(match[2]).replace(/\n\s*\n/g, '\n\n').trim();
      if (question.length >= 10 && answer.length >= 15) {
        faqs.push({ question, answer: wrapAnswerInP(answer) });
      }
    }
  }

  return {
    faqs,
    sectionStart: faqs.length > 0 ? sectionStart : -1,
    sectionLength: faqs.length > 0 ? sectionText.length : 0
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

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      console.log('🚀 Extract proper FAQs from blog content & remove shortcodes...');
      console.log('================================================');

      const stats = {
        properFaqBlogsFound: 0,
        properFaqBlogsUpdated: 0,
        properFaqsInserted: 0,
        shortcodeBlogsFound: 0,
        shortcodeBlogsUpdated: 0,
        errors: 0
      };

      // ---- Part 1: Extract "proper" FAQs and remove FAQ section from content ----
      const allBlogs = await queryInterface.sequelize.query(
        `SELECT id, title, content FROM blogs WHERE content IS NOT NULL AND content != ''`,
        { transaction, type: Sequelize.QueryTypes.SELECT }
      );

      for (const blog of allBlogs) {
        try {
          const { faqs, sectionStart, sectionLength } = extractProperFaqsFromContent(blog.content);
          if (faqs.length === 0 || sectionStart < 0 || sectionLength <= 0) continue;

          stats.properFaqBlogsFound++;

          // Avoid duplicate questions
          const seen = new Set();
          for (const faq of faqs) {
            const q = faq.question.substring(0, 500);
            if (seen.has(q)) continue;
            seen.add(q);

            const existingRows = await queryInterface.sequelize.query(
              `SELECT id FROM FAQs WHERE entity_type = 'blog' AND entity_id = :blogId AND question = :q`,
              {
                replacements: { blogId: blog.id, q },
                transaction,
                type: Sequelize.QueryTypes.SELECT
              }
            );
            if (existingRows && existingRows.length > 0) continue;

            await queryInterface.bulkInsert(
              'FAQs',
              [
                {
                  entity_type: 'blog',
                  entity_id: blog.id,
                  question: q,
                  answer: (faq.answer || '').substring(0, 2000),
                  createdAt: new Date(),
                  updatedAt: new Date()
                }
              ],
              { transaction, ignoreDuplicates: true }
            );
            stats.properFaqsInserted++;
          }

          const cleaned = (blog.content.slice(0, sectionStart) + blog.content.slice(sectionStart + sectionLength))
            .replace(/\n\s*\n\s*\n/g, '\n\n')
            .trim();
          await queryInterface.sequelize.query(`UPDATE blogs SET content = :content WHERE id = :id`, {
            replacements: { content: cleaned, id: blog.id },
            transaction
          });
          stats.properFaqBlogsUpdated++;
          console.log(`   ✅ Proper FAQs: blog ID ${blog.id} — ${faqs.length} FAQs extracted, section removed`);
        } catch (err) {
          stats.errors++;
          console.error(`   ❌ Blog ID ${blog.id} (proper FAQ):`, err.message);
        }
      }

      // ---- Part 2: Remove shortcode from blogs that have FAQs in table ----
      const blogsWithShortcode = await queryInterface.sequelize.query(
        `SELECT id, title, content FROM blogs WHERE content LIKE '%sp_easyaccordion%'`,
        { transaction, type: Sequelize.QueryTypes.SELECT }
      );
      stats.shortcodeBlogsFound = Array.isArray(blogsWithShortcode) ? blogsWithShortcode.length : 0;

      const faqBlogRows = await queryInterface.sequelize.query(
        `SELECT DISTINCT entity_id as blog_id FROM FAQs WHERE entity_type = 'blog'`,
        { transaction, type: Sequelize.QueryTypes.SELECT }
      );
      const blogIdsWithFaqs = new Set((Array.isArray(faqBlogRows) ? faqBlogRows : []).map((r) => r.blog_id));

      for (const blog of blogsWithShortcode || []) {
        try {
          if (!blogIdsWithFaqs.has(blog.id)) {
            console.log(`   ⏭️  Shortcode: skip blog ID ${blog.id} (no FAQs in table)`);
            continue;
          }
          const cleaned = stripAccordionShortcodes(blog.content || '');
          if (cleaned === (blog.content || '')) continue;

          await queryInterface.sequelize.query(`UPDATE blogs SET content = :content WHERE id = :id`, {
            replacements: { content: cleaned, id: blog.id },
            transaction
          });
          stats.shortcodeBlogsUpdated++;
          console.log(`   ✅ Shortcode removed: blog ID ${blog.id}`);
        } catch (err) {
          stats.errors++;
          console.error(`   ❌ Blog ID ${blog.id} (shortcode):`, err.message);
        }
      }

      console.log('\n📊 Summary:');
      console.log('   Proper FAQ — blogs with section: ' + stats.properFaqBlogsFound + ', updated: ' + stats.properFaqBlogsUpdated + ', FAQs inserted: ' + stats.properFaqsInserted);
      console.log('   Shortcode — blogs with shortcode: ' + stats.shortcodeBlogsFound + ', updated: ' + stats.shortcodeBlogsUpdated);
      console.log('   Errors: ' + stats.errors);
      console.log('================================================\n');
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Seeder failed:', error.message);
      throw error;
    }
  },

  async down() {
    console.log('🔄 Down: Cannot revert FAQ extraction or shortcode removal. No-op.');
  }
};
