'use strict';

const SHORTCODE_PATTERN = /\[\s*sp_easyaccordion\s+id\s*=\s*(["']?)(\d+)\1\s*\]/gi;

/**
 * Detect "Frequently Asked Questions" (or similar) section and extract Q&A pairs.
 * Returns { faqs: [{ question, answer }], sectionStart, sectionLength }.
 */
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

  // Prefer matching a full HTML heading tag around the FAQ title so we can remove it too.
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

  if (SHORTCODE_PATTERN.test(sectionText) && sectionText.replace(SHORTCODE_PATTERN, '').trim().length < 50) {
    return { faqs, sectionStart: -1, sectionLength: 0 };
  }
  SHORTCODE_PATTERN.lastIndex = 0;

  let match;

  // Pattern 0: <h3><strong>1. Question?</strong></h3><p>Answer</p>
  if (/<h3[\s>][\s\S]*?<strong[\s\S]*?\d+[.)]/.test(sectionText)) {
    const h3Block =
      /<h3[^>]*>[\s\S]*?<strong[^>]*>(?:(\d+)[.)]\s*)?([\s\S]*?)<\/strong>[\s\S]*?<\/h3>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi;
    while ((match = h3Block.exec(sectionText)) !== null) {
      const question = stripHtml((match[1] || '') + (match[2] || '')).trim();
      const answer = stripHtml(match[3] || '').trim();
      if (question.length >= 10 && answer.length >= 15) {
        faqs.push({ question, answer: wrapAnswerInP(answer) });
      }
    }
  }

  // Pattern 1: <p><strong>1. Question?</strong></p><p>Answer</p>
  if (faqs.length === 0 && /<strong[^>]*>[\s\S]*?\d+[.)]/.test(sectionText)) {
    const strongNumbered =
      /<p[^>]*>\s*<strong[^>]*>(\d+[.)]\s*)?([\s\S]*?)<\/strong>\s*<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
    while ((match = strongNumbered.exec(sectionText)) !== null) {
      const question = stripHtml((match[1] || '') + (match[2] || '')).trim();
      const answer = stripHtml(match[3] || '').trim();
      if (question.length >= 10 && answer.length >= 15) {
        faqs.push({ question, answer: wrapAnswerInP(answer) });
      }
    }
  }

  // Pattern 2: Plain numbered lines — "1. Question?" then answer text.
  if (faqs.length === 0) {
    const numberedBlock = /(\d+)[.)]\s*([^\n<]+(?:\?|:)?)\s*[\n\r]+([\s\S]*?)(?=\d+[.)]\s*|\s*$)/gim;
    while ((match = numberedBlock.exec(sectionText)) !== null) {
      const question = stripHtml(match[2]).trim();
      let answer = match[3].trim();
      answer = stripHtml(answer).replace(/\n\s*\n/g, '\n\n').trim();
      if (question.length >= 10 && answer.length >= 15) {
        faqs.push({ question, answer: wrapAnswerInP(answer) });
      }
    }
  }

  // Pattern 3: <p><strong>Question</strong></p><p>Answer</p> (no number)
  if (faqs.length === 0) {
    const strongBlock =
      /<p[^>]*>\s*<strong[^>]*>([\s\S]*?)<\/strong>\s*<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/gi;
    while ((match = strongBlock.exec(sectionText)) !== null) {
      const question = stripHtml(match[1]).trim();
      const answer = stripHtml(match[2]).trim();
      if (question.length >= 10 && answer.length >= 15) {
        faqs.push({ question, answer: wrapAnswerInP(answer) });
      }
    }
  }

  // Pattern 4: **Question** followed by paragraph.
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

  const looksLikeFaq = (sectionText.match(/\?/g) || []).length >= 2 && sectionText.length > 100;
  if (faqs.length === 0 && looksLikeFaq) {
    return {
      faqs: [],
      sectionStart,
      sectionLength: sectionText.length
    };
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
      console.log('🚀 Seeder: extract FAQs from blog content into FAQs table and remove FAQ section from content...');

      const stats = {
        blogsWithFaqSection: 0,
        blogsUpdated: 0,
        faqsInserted: 0,
        errors: 0
      };

      const blogs = await queryInterface.sequelize.query(
        `SELECT id, title, content
         FROM blogs
         WHERE content IS NOT NULL
           AND content != ''
           AND deleted_at IS NULL`,
        { transaction, type: Sequelize.QueryTypes.SELECT }
      );

      for (const blog of blogs) {
        try {
          const { faqs, sectionStart, sectionLength } = extractProperFaqsFromContent(blog.content);
          if (sectionStart < 0 || sectionLength <= 0) continue;

          stats.blogsWithFaqSection++;

          const seen = new Set();
          for (const faq of faqs) {
            const q = faq.question.substring(0, 500);
            if (seen.has(q)) continue;
            seen.add(q);

            const existing = await queryInterface.sequelize.query(
              `SELECT id
               FROM FAQs
               WHERE entity_type = 'blog'
                 AND entity_id = :blogId
                 AND question = :q
                 AND deletedAt IS NULL`,
              {
                replacements: { blogId: blog.id, q },
                transaction,
                type: Sequelize.QueryTypes.SELECT
              }
            );
            if (existing && existing.length > 0) continue;

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
            stats.faqsInserted++;
          }

          // Remove the FAQ section (heading + Q&A) from the content now that it has been stored in FAQs.
          const cleaned =
            (blog.content.slice(0, sectionStart) + blog.content.slice(sectionStart + sectionLength))
              .replace(/\n\s*\n\s*\n/g, '\n\n')
              .trim();

          if (cleaned !== blog.content) {
            await queryInterface.sequelize.query(
              `UPDATE blogs SET content = :content WHERE id = :id`,
              {
                replacements: { content: cleaned, id: blog.id },
                transaction
              }
            );
            stats.blogsUpdated++;
            console.log(
              `   ✅ Blog ID ${blog.id}: extracted ${faqs.length} FAQs and removed FAQ section from content`
            );
          } else {
            console.log(
              `   ✅ Blog ID ${blog.id}: extracted ${faqs.length} FAQs (FAQ section already minimal or unchanged)`
            );
          }
        } catch (err) {
          stats.errors++;
          console.error(`   ❌ Blog ID ${blog.id}:`, err.message);
        }
      }

      console.log('\n📊 FAQ extraction seeder summary:');
      console.log(
        '   Blogs with FAQ section: ' +
          stats.blogsWithFaqSection +
          ', blogs updated: ' +
          stats.blogsUpdated +
          ', FAQs inserted: ' +
          stats.faqsInserted
      );
      console.log('   Errors: ' + stats.errors);

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Seeder failed:', error.message);
      throw error;
    }
  },

  async down() {
    console.log('🔄 Down: not reverting FAQ extraction or content changes (no-op).');
  }
};

