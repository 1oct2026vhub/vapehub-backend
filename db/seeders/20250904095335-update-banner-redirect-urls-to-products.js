'use strict';

/**
 * Update Banner Redirect URLs to Product Pages
 * 
 * This seeder intelligently maps banner redirect URLs from old site links
 * to actual product pages based on product keywords in the URL/content
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🔗 Updating banner redirect URLs to product pages...');
    
    try {
      const migrationStats = {
        processed: 0,
        updated: 0,
        skipped: 0,
        errors: 0
      };

      // Get banners that need URL format updates (remove /product/ prefix)
      const banners = await queryInterface.sequelize.query(`
        SELECT 
          id, 
          title,
          description,
          redirect_url
        FROM bannerimages 
        WHERE redirect_url IS NOT NULL 
          AND redirect_url != ''
          AND redirect_url LIKE '%/product/%'
        ORDER BY id ASC
      `, { type: Sequelize.QueryTypes.SELECT });

      console.log(`📊 Found ${banners.length} banners to process`);

      for (const banner of banners) {
        migrationStats.processed++;
        
        try {
          console.log(`\n🎯 Processing banner: "${banner.title}"`);
          console.log(`   Current URL: ${banner.redirect_url}`);
          
          // Generate new URL using frontend environment variable
          const newUrl = await generateEnvironmentUrl(banner, queryInterface);
          
          if (newUrl && newUrl !== banner.redirect_url) {
            // Update the redirect URL
            await queryInterface.sequelize.query(`
              UPDATE bannerimages 
              SET redirect_url = ?, updated_by = 2
              WHERE id = ?
            `, { 
              replacements: [newUrl, banner.id]
            });
            
            migrationStats.updated++;
            console.log(`   ✅ Updated to: ${newUrl}`);
          } else {
            migrationStats.skipped++;
            console.log(`   ⚠️ ${newUrl ? 'URL unchanged' : 'No new URL generated'} - keeping current URL`);
          }
          
        } catch (error) {
          migrationStats.errors++;
          console.error(`   ❌ Error processing banner ${banner.id}: ${error.message}`);
        }
      }

      // Generate report
      console.log('\n📊 BANNER REDIRECT URL → FRONTEND DOMAIN REPORT');
      console.log('================================================');
      console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000 (fallback)'}`);
      console.log(`Banners Processed: ${migrationStats.processed}`);
      console.log(`URLs Updated: ${migrationStats.updated}`);
      console.log(`Skipped (no change): ${migrationStats.skipped}`);
      console.log(`Errors: ${migrationStats.errors}`);
      console.log(`Success Rate: ${migrationStats.processed > 0 ? Math.round((migrationStats.updated / migrationStats.processed) * 100) : 0}%`);

    } catch (error) {
      console.error('❌ Error during banner redirect URL migration:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('⚠️ Banner redirect URL updates cannot be automatically reversed');
    console.log('💡 Manual restoration would be required');
  }
};


/**
 * Generate URL using environment variable for frontend
 */
async function generateEnvironmentUrl(banner, queryInterface) {
  try {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'; // Fallback
    const currentUrl = banner.redirect_url || '';
    const title = (banner.title || '').toLowerCase();
    const description = (banner.description || '').toLowerCase();
    
    // Try to extract product slug from current URL if it exists
    let productSlug = null;
    
    if (currentUrl.includes('/product/')) {
      // Extract slug from /product/slug-name format
      const match = currentUrl.match(/\/product\/([^\/\?#]+)/);
      if (match) {
        productSlug = match[1];
      }
    }
    
    // If we have a product slug, verify it exists in products table
    if (productSlug) {
      const products = await queryInterface.sequelize.query(`
        SELECT p.id, p.name, p.slug
        FROM products p
        WHERE p.slug = ?
          AND p.status = 'published'
        LIMIT 1
      `, { 
        replacements: [productSlug],
        type: queryInterface.sequelize.QueryTypes.SELECT 
      });

      if (products.length > 0) {
        const product = products[0];
        console.log(`   🎯 Found product: "${product.name}" with slug: "${product.slug}"`);
        // Generate URL without /product/ - direct slug access
        return `${frontendUrl}/${product.slug}`;
      } else {
        console.log(`   ⚠️ Product slug "${productSlug}" not found in products table`);
      }
    }
    
    // If no valid product found, try to match by banner title/description
    const allText = `${title} ${description}`.toLowerCase();
    
    // Define product matching patterns
    const productMatches = [
      { keywords: ['hayati pro max plus'], priority: 1 },
      { keywords: ['hayati pro ultra'], priority: 1 },
      { keywords: ['ivg smart max'], priority: 1 },
      { keywords: ['elux legend', 'elux nic salts'], priority: 1 },
      { keywords: ['crystal pro'], priority: 1 },
      { keywords: ['lost mary'], priority: 2 },
      { keywords: ['hayati'], priority: 2 },
      { keywords: ['elf bar'], priority: 2 },
      { keywords: ['ivg'], priority: 2 },
      { keywords: ['crystal'], priority: 3 },
      { keywords: ['pod kit'], priority: 4 },
      { keywords: ['disposable'], priority: 5 }
    ];

    let bestMatch = null;
    let bestPriority = 999;

    // Find the most specific match
    for (const match of productMatches) {
      for (const keyword of match.keywords) {
        if (allText.includes(keyword)) {
          if (match.priority < bestPriority) {
            bestPriority = match.priority;
            bestMatch = keyword;
          }
          break;
        }
      }
    }

    if (bestMatch) {
      // Build SQL condition based on the match
      let productCondition = `p.name LIKE '%${bestMatch.replace(/\s+/g, '%')}%'`;
      
      // Find the product
      const products = await queryInterface.sequelize.query(`
        SELECT p.id, p.name, p.slug
        FROM products p
        WHERE ${productCondition}
          AND p.status = 'published'
        ORDER BY p.id ASC
        LIMIT 1
      `, { type: queryInterface.sequelize.QueryTypes.SELECT });

      if (products.length > 0) {
        const product = products[0];
        console.log(`   🎯 Found product by content: "${product.name}" with slug: "${product.slug}"`);
        // Generate URL without /product/ - direct slug access
        return `${frontendUrl}/${product.slug}`;
      }
    }
    
    // Default to homepage
    console.log(`   🏠 Using homepage - no product match found`);
    return frontendUrl;
    
  } catch (error) {
    console.error(`❌ Error generating environment URL: ${error.message}`);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    return frontendUrl;
  }
}