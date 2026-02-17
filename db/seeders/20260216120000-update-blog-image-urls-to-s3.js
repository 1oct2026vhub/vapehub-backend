'use strict';

/**
 * Update blog image URLs from WordPress domain to S3 domain
 *
 * Replaces in blogs.content:
 *   https://www.vapehub.co.uk/wp-content/uploads/...
 * with:
 *   https://vapehub-assets.s3.eu-north-1.amazonaws.com/uploads/...
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('🚀 Starting Blog Image URL Update...');
      console.log('================================================');

      const stats = {
        blogsFound: 0,
        blogsUpdated: 0,
        urlsReplaced: 0,
        errors: 0
      };

      // Patterns to match WordPress upload URLs (multiple variants)
      const newBaseUrl = 'https://vapehub-assets.s3.eu-north-1.amazonaws.com/uploads/';
      const oldPatterns = [
        { pattern: /https:\/\/www\.vapehub\.co\.uk\/wp-content\/uploads\//g, name: 'https://www' },
        { pattern: /http:\/\/www\.vapehub\.co\.uk\/wp-content\/uploads\//g, name: 'http://www' },
        { pattern: /https:\/\/vapehub\.co\.uk\/wp-content\/uploads\//g, name: 'https (no www)' },
        { pattern: /http:\/\/vapehub\.co\.uk\/wp-content\/uploads\//g, name: 'http (no www)' },
        { pattern: /https:\/\/i0\.wp\.com\/www\.vapehub\.co\.uk\/wp-content\/uploads\//g, name: 'i0.wp.com' }
      ];

      // Step 1: Find blogs with WordPress URLs in content
      console.log('\n🔍 Step 1: Finding blogs with WordPress image URLs in content...');
      
      const blogsWithOldUrls = await queryInterface.sequelize.query(`
        SELECT id, title, content
        FROM blogs
        WHERE content LIKE '%wp-content/uploads%'
        AND deleted_at IS NULL
      `, {
        type: Sequelize.QueryTypes.SELECT
      });

      stats.blogsFound = blogsWithOldUrls.length;
      console.log(`📊 Found ${stats.blogsFound} blogs with WordPress image URLs`);

      if (stats.blogsFound === 0) {
        console.log('✅ No blogs found with WordPress image URLs. Migration completed.');
        return;
      }

      // Step 2: Process each blog and replace URLs
      console.log('\n🔄 Step 2: Replacing image URLs in blog content...');
      console.log('─'.repeat(60));

      for (const blog of blogsWithOldUrls) {
        try {
          let content = blog.content || '';
          let totalReplaced = 0;
          const replacedByPattern = [];

          for (const { pattern, name } of oldPatterns) {
            const before = content;
            content = content.replace(pattern, newBaseUrl);
            const count = (before.match(pattern) || []).length;
            if (count > 0) {
              totalReplaced += count;
              replacedByPattern.push(`${name}: ${count}`);
            }
          }

          if (totalReplaced > 0) {
            stats.urlsReplaced += totalReplaced;

            await queryInterface.sequelize.query(`
              UPDATE blogs
              SET content = :content
              WHERE id = :blogId
            `, {
              replacements: {
                content,
                blogId: blog.id
              },
              type: Sequelize.QueryTypes.UPDATE
            });

            stats.blogsUpdated++;
            const titlePreview = blog.title ? blog.title.substring(0, 50) + (blog.title.length > 50 ? '...' : '') : 'Untitled';
            console.log(`✅ Updated blog ID ${blog.id}: ${titlePreview} (${totalReplaced} URL(s) replaced: ${replacedByPattern.join(', ')})`);
          }
        } catch (error) {
          stats.errors++;
          console.error(`❌ Error updating blog ID ${blog.id}:`, error.message);
        }
      }

      // Step 3: Summary
      console.log('\n📊 Summary:');
      console.log('================================================');
      console.log(`✅ Blogs Found: ${stats.blogsFound}`);
      console.log(`✅ Blogs Updated: ${stats.blogsUpdated}`);
      console.log(`✅ Total URLs Replaced: ${stats.urlsReplaced}`);
      console.log(`❌ Errors: ${stats.errors}`);
      console.log('');

      // Step 4: Verify replacement and list any remaining blogs
      console.log('🔍 Step 3: Verifying replacement...');
      const remainingBlogs = await queryInterface.sequelize.query(`
        SELECT id, title,
          SUBSTRING(content, 1, 500) as content_preview
        FROM blogs
        WHERE content LIKE '%wp-content/uploads%'
        AND deleted_at IS NULL
      `, {
        type: Sequelize.QueryTypes.SELECT
      });

      const remainingCount = remainingBlogs.length;

      if (remainingCount === 0) {
        console.log('✅ Verification passed: No WordPress URLs remaining in blog content');
      } else {
        console.log(`⚠️  Warning: ${remainingCount} blog(s) still contain WordPress URLs:`);
        for (const b of remainingBlogs) {
          const titlePreview = b.title ? b.title.substring(0, 60) + (b.title.length > 60 ? '...' : '') : 'Untitled';
          console.log(`   - Blog ID ${b.id}: ${titlePreview}`);
          // Show a snippet of where wp-content appears so we can add a pattern if needed
          const idx = (b.content_preview || '').indexOf('wp-content');
          if (idx !== -1) {
            const snippet = (b.content_preview || '').substring(Math.max(0, idx - 30), idx + 80);
            console.log(`     Snippet: ...${snippet}...`);
          }
        }
      }

      console.log('\n✅ Blog Image URL Update Completed Successfully!');
      console.log('================================================\n');

    } catch (error) {
      console.error('❌ Error during blog image URL update:', error.message);
      console.error(error.stack);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      console.log('🔄 Rolling back Blog Image URL Update...');
      console.log('================================================');

      const stats = {
        blogsFound: 0,
        blogsUpdated: 0,
        errors: 0
      };

      // Reverse replacement: S3 URL back to WordPress URL
      const newBaseUrl = 'https://vapehub-assets.s3.eu-north-1.amazonaws.com/uploads/';
      const oldBaseUrl = 'https://www.vapehub.co.uk/wp-content/uploads/';

      // Find blogs with S3 URLs
      const blogsWithS3Urls = await queryInterface.sequelize.query(`
        SELECT id, title, content
        FROM blogs
        WHERE content LIKE '%${newBaseUrl}%'
        AND deleted_at IS NULL
      `, {
        type: Sequelize.QueryTypes.SELECT
      });

      stats.blogsFound = blogsWithS3Urls.length;
      console.log(`📊 Found ${stats.blogsFound} blogs with S3 URLs to rollback`);

      if (stats.blogsFound === 0) {
        console.log('✅ No blogs found with S3 URLs. Rollback completed.');
        return;
      }

      // Replace S3 URL back to WordPress URL
      const s3Pattern = new RegExp(newBaseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');

      for (const blog of blogsWithS3Urls) {
        try {
          const originalContent = blog.content || '';
          
          if (originalContent.includes(newBaseUrl)) {
            const updatedContent = originalContent.replace(s3Pattern, oldBaseUrl);

            await queryInterface.sequelize.query(`
              UPDATE blogs
              SET content = :content
              WHERE id = :blogId
            `, {
              replacements: {
                content: updatedContent,
                blogId: blog.id
              },
              type: Sequelize.QueryTypes.UPDATE
            });

            stats.blogsUpdated++;
            const titlePreview = blog.title ? blog.title.substring(0, 50) + (blog.title.length > 50 ? '...' : '') : 'Untitled';
            console.log(`✅ Rolled back blog ID ${blog.id}: ${titlePreview}`);
          }
        } catch (error) {
          stats.errors++;
          console.error(`❌ Error rolling back blog ID ${blog.id}:`, error.message);
        }
      }

      console.log('\n📊 Rollback Summary:');
      console.log('================================================');
      console.log(`✅ Blogs Found: ${stats.blogsFound}`);
      console.log(`✅ Blogs Updated: ${stats.blogsUpdated}`);
      console.log(`❌ Errors: ${stats.errors}`);
      console.log('\n✅ Rollback Completed!\n');

    } catch (error) {
      console.error('❌ Error during rollback:', error.message);
      console.error(error.stack);
      throw error;
    }
  }
};
