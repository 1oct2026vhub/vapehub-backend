'use strict';

/**
 * Remove [sp_easyaccordion id="..."] shortcode from blog content
 * and the "Frequently Asked Questions" heading directly above it.
 *
 * No FAQ extraction or inserts into FAQs table happen here.
 */

const SHORTCODE_PATTERN = /\[\s*sp_easyaccordion\s+id\s*=\s*(["']?)(\d+)\1\s*\]/gi;

/**
 * Remove the [sp_easyaccordion ...] shortcode and the "Frequently Asked Questions"
 * heading directly above it (if present).
 */
function removeFaqHeadingAndShortcode(content) {
  if (!content || typeof content !== 'string') return content;

  let updated = content;
  let match;

  // Reset regex state for safety
  SHORTCODE_PATTERN.lastIndex = 0;

  // Handle all shortcodes in the content
  while ((match = SHORTCODE_PATTERN.exec(updated)) !== null) {
    const shortcodeStart = match.index;
    const shortcodeEnd = shortcodeStart + match[0].length;

    // Look for an FAQ heading BEFORE this shortcode.
    const beforeShortcode = updated.slice(0, shortcodeStart);

    // Find the last <h1–h6> heading containing "Frequently Asked Questions"
    const headingRegex = /<h([1-6])[^>]*>[\s\S]*?frequently\s+asked\s+questions[\s\S]*?<\/h\1>/gi;
    let headingMatch;
    let lastHeadingMatch = null;

    while ((headingMatch = headingRegex.exec(beforeShortcode)) !== null) {
      lastHeadingMatch = {
        start: headingMatch.index,
        end: headingRegex.lastIndex
      };
    }

    let removeStart = shortcodeStart;
    let removeEnd = shortcodeEnd;

    if (lastHeadingMatch) {
      // Only treat this heading as associated with the shortcode if it is reasonably close
      const distance = shortcodeStart - lastHeadingMatch.end;
      if (distance >= 0 && distance <= 2000) {
        removeStart = lastHeadingMatch.start;
      }
    }

    // Remove from removeStart to removeEnd
    updated = (updated.slice(0, removeStart) + updated.slice(removeEnd))
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();

    // Reset regex position for updated content
    SHORTCODE_PATTERN.lastIndex = 0;
  }

  return updated;
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      console.log('🚀 Remove SP Easy Accordion shortcodes and nearby FAQ headings from blog content...');
      console.log('================================================');

      const blogsWithShortcode = await queryInterface.sequelize.query(
        `SELECT id, title, content FROM blogs WHERE content LIKE '%sp_easyaccordion%'`,
        { transaction, type: Sequelize.QueryTypes.SELECT }
      );
      const totalBlogs = Array.isArray(blogsWithShortcode) ? blogsWithShortcode.length : 0;

      let blogsUpdated = 0;
      let errors = 0;

      for (const blog of blogsWithShortcode || []) {
        try {
          const originalContent = blog.content || '';
          const cleaned = removeFaqHeadingAndShortcode(originalContent);
          if (cleaned === originalContent) {
            console.log(`   ⏭️  Blog ID ${blog.id}: no changes needed.`);
            continue;
          }

          await queryInterface.sequelize.query(`UPDATE blogs SET content = :content WHERE id = :id`, {
            replacements: { content: cleaned, id: blog.id },
            transaction
          });
          blogsUpdated++;
          console.log(`   ✅ Blog ID ${blog.id}: shortcode and FAQ heading (if present) removed.`);
        } catch (err) {
          errors++;
          console.error(`   ❌ Blog ID ${blog.id}:`, err.message);
        }
      }

      console.log('\n📊 Summary:');
      console.log('   Blogs with shortcode: ' + totalBlogs + ', updated: ' + blogsUpdated);
      console.log('   Errors: ' + errors);
      console.log('================================================\n');
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Seeder failed:', error.message);
      throw error;
    }
  },

  async down() {
    console.log('🔄 Down: Cannot restore removed headings/shortcodes. No-op.');
  }
};
