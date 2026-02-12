'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('🚀 Starting Image URL Replacement in Product Descriptions...');
      console.log('================================================');

      const stats = {
        productsFound: 0,
        productsUpdated: 0,
        urlsReplaced: 0,
        errors: 0
      };

      // Old URLs to replace
      const oldUrls = [
        'https://i0.wp.com/www.vapehub.co.uk/wp-content',
        'https://www.vapehub.co.uk/wp-content'
      ];
      const newUrl = 'https://vapehub-assets.s3.eu-north-1.amazonaws.com';

      // Step 1: Find products with old URLs in descriptions
      console.log('\n🔍 Step 1: Finding products with old image URLs in descriptions...');
      
      const productsWithOldUrls = await queryInterface.sequelize.query(`
        SELECT id, name, description
        FROM products
        WHERE (
          description LIKE '%https://i0.wp.com/www.vapehub.co.uk/wp-content%'
          OR description LIKE '%https://www.vapehub.co.uk/wp-content%'
        )
        AND description IS NOT NULL
      `, {
        type: Sequelize.QueryTypes.SELECT
      });

      stats.productsFound = productsWithOldUrls.length;
      console.log(`📊 Found ${stats.productsFound} products with old image URLs`);

      if (stats.productsFound === 0) {
        console.log('✅ No products found with old image URLs. Migration completed.');
        return;
      }

      // Step 2: Process each product and replace URLs
      console.log('\n🔄 Step 2: Replacing image URLs in product descriptions...');
      console.log('─'.repeat(60));

      for (const product of productsWithOldUrls) {
        try {
          let updatedDescription = product.description;
          let urlCount = 0;

          // Replace each old URL pattern
          // Pattern: Replace old domain with new S3 domain, removing /wp-content from path
          // Example: https://www.vapehub.co.uk/wp-content/uploads/... -> https://vapehub-assets.s3.eu-north-1.amazonaws.com/uploads/...
          
          // Replace https://i0.wp.com/www.vapehub.co.uk/wp-content
          const i0wpPattern = /https:\/\/i0\.wp\.com\/www\.vapehub\.co\.uk\/wp-content/g;
          const i0wpMatches = updatedDescription.match(i0wpPattern);
          if (i0wpMatches) {
            urlCount += i0wpMatches.length;
            stats.urlsReplaced += i0wpMatches.length;
            updatedDescription = updatedDescription.replace(i0wpPattern, newUrl);
          }

          // Replace https://www.vapehub.co.uk/wp-content
          const standardPattern = /https:\/\/www\.vapehub\.co\.uk\/wp-content/g;
          const standardMatches = updatedDescription.match(standardPattern);
          if (standardMatches) {
            urlCount += standardMatches.length;
            stats.urlsReplaced += standardMatches.length;
            updatedDescription = updatedDescription.replace(standardPattern, newUrl);
          }

          // Remove query parameters from image URLs (e.g., ?ssl=1, ?resize=...)
          // This handles URLs in src="..." or src='...' attributes
          // Pattern matches: URL followed by ? and query parameters, then closing quote or space
          const queryParamPattern = /(https:\/\/vapehub-assets\.s3\.eu-north-1\.amazonaws\.com[^"'\s>]+)\?[^"'\s>]+/g;
          const queryParamMatches = updatedDescription.match(queryParamPattern);
          if (queryParamMatches) {
            updatedDescription = updatedDescription.replace(queryParamPattern, (match) => {
              // Remove everything after the first ?
              return match.split('?')[0];
            });
          }

          // Only update if there were changes
          if (urlCount > 0) {
            await queryInterface.sequelize.query(`
              UPDATE products
              SET description = :description,
                  updated_at = NOW()
              WHERE id = :productId
            `, {
              replacements: {
                description: updatedDescription,
                productId: product.id
              },
              type: Sequelize.QueryTypes.UPDATE
            });

            stats.productsUpdated++;
            console.log(`✅ Updated product ID ${product.id}: ${product.name.substring(0, 50)}${product.name.length > 50 ? '...' : ''} (${urlCount} URL(s) replaced)`);
          }
        } catch (error) {
          stats.errors++;
          console.error(`❌ Error updating product ID ${product.id}:`, error.message);
        }
      }

      // Step 3: Summary
      console.log('\n📊 Summary:');
      console.log('================================================');
      console.log(`✅ Products Found: ${stats.productsFound}`);
      console.log(`✅ Products Updated: ${stats.productsUpdated}`);
      console.log(`✅ Total URLs Replaced: ${stats.urlsReplaced}`);
      console.log(`❌ Errors: ${stats.errors}`);
      console.log('');

      // Step 4: Verify replacement
      console.log('🔍 Step 3: Verifying replacement...');
      const remainingOldUrls = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count
        FROM products
        WHERE (
          description LIKE '%https://i0.wp.com/www.vapehub.co.uk/wp-content%'
          OR description LIKE '%https://www.vapehub.co.uk/wp-content%'
        )
        AND description IS NOT NULL
      `, {
        type: Sequelize.QueryTypes.SELECT
      });

      const remainingCount = remainingOldUrls[0]?.count || 0;
      
      if (remainingCount === 0) {
        console.log('✅ Verification passed: No old URLs remaining in descriptions');
      } else {
        console.log(`⚠️  Warning: ${remainingCount} products still contain old URLs`);
      }

      console.log('\n✅ Image URL Replacement Completed Successfully!');
      console.log('================================================\n');

    } catch (error) {
      console.error('❌ Error during image URL replacement:', error.message);
      console.error(error.stack);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      console.log('🔄 Rolling back Image URL Replacement...');
      console.log('================================================');

      const stats = {
        productsFound: 0,
        productsUpdated: 0,
        errors: 0
      };

      // Reverse replacement: S3 URL back to old URLs
      const newUrl = 'https://vapehub-assets.s3.eu-north-1.amazonaws.com';
      const oldUrls = [
        { from: 'https://i0.wp.com/www.vapehub.co.uk/wp-content', to: 'https://i0.wp.com/www.vapehub.co.uk/wp-content' },
        { from: 'https://www.vapehub.co.uk/wp-content', to: 'https://www.vapehub.co.uk/wp-content' }
      ];

      // Find products with S3 URLs
      const productsWithS3Urls = await queryInterface.sequelize.query(`
        SELECT id, name, description
        FROM products
        WHERE description LIKE '%${newUrl}%'
        AND description IS NOT NULL
      `, {
        type: Sequelize.QueryTypes.SELECT
      });

      stats.productsFound = productsWithS3Urls.length;
      console.log(`📊 Found ${stats.productsFound} products with S3 URLs to rollback`);

      if (stats.productsFound === 0) {
        console.log('✅ No products found with S3 URLs. Rollback completed.');
        return;
      }

      // Note: We can't perfectly reverse because we don't know which old URL was originally used
      // So we'll replace S3 URL with the standard WordPress URL
      // We need to add back /wp-content since we removed it during the up migration
      const standardOldUrl = 'https://www.vapehub.co.uk/wp-content';

      for (const product of productsWithS3Urls) {
        try {
          let updatedDescription = product.description;
          
          // Replace S3 URL back to standard WordPress URL
          // Add back /wp-content since we removed it during migration
          if (updatedDescription.includes(newUrl)) {
            updatedDescription = updatedDescription.replace(
              new RegExp(newUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
              standardOldUrl
            );

            await queryInterface.sequelize.query(`
              UPDATE products
              SET description = :description,
                  updated_at = NOW()
              WHERE id = :productId
            `, {
              replacements: {
                description: updatedDescription,
                productId: product.id
              },
              type: Sequelize.QueryTypes.UPDATE
            });

            stats.productsUpdated++;
            console.log(`✅ Rolled back product ID ${product.id}: ${product.name.substring(0, 50)}${product.name.length > 50 ? '...' : ''}`);
          }
        } catch (error) {
          stats.errors++;
          console.error(`❌ Error rolling back product ID ${product.id}:`, error.message);
        }
      }

      console.log('\n📊 Rollback Summary:');
      console.log('================================================');
      console.log(`✅ Products Found: ${stats.productsFound}`);
      console.log(`✅ Products Updated: ${stats.productsUpdated}`);
      console.log(`❌ Errors: ${stats.errors}`);
      console.log('\n⚠️  Note: Rollback replaces S3 URLs with standard WordPress URL');
      console.log('⚠️  Original i0.wp.com URLs cannot be perfectly restored');
      console.log('\n✅ Rollback Completed!\n');

    } catch (error) {
      console.error('❌ Error during rollback:', error.message);
      console.error(error.stack);
      throw error;
    }
  }
};
