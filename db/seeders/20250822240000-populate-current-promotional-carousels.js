'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🎯 Starting to populate current promotional carousels from old database...');
      
      // Initialize cross-server migration utility
      const crossServerMigration = new CrossServerMigration();
      await crossServerMigration.connectToOldDb();
      console.log('✅ Connected to old database successfully');
      
      // Disable foreign key checks
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
      
      console.log('📋 Step 1: Fetching current promotional banners from old database...');
      
      // Get current promotional banner images (2025) that should be carousels
      const promotionalBanners = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          ID,
          post_title,
          post_date,
          guid as image_url
        FROM vh_posts
        WHERE post_type = 'attachment'
          AND post_date >= '2025-01-01'
          AND (
            post_title LIKE '%desktop-banner%' OR
            post_title LIKE '%mobile-banner%' OR
            post_title LIKE '%hayati-pro-max%' OR
            post_title LIKE '%ivg-smart-max%' OR
            post_title LIKE '%carousel%' OR
            post_title LIKE '%slider%'
          )
        ORDER BY post_date DESC
      `);
      
      console.log(`✅ Found ${promotionalBanners.length} current promotional banners`);
      
      if (promotionalBanners.length === 0) {
        console.log('⚠️ No current promotional banners found');
        if (crossServerMigration.oldDbConnection) {
          await crossServerMigration.oldDbConnection.close();
        }
        return;
      }
      
      console.log('📊 Step 2: Processing promotional banners and creating carousel entries...');
      
      let carouselImages = [];
      let displayOrder = 1;
      
      // Define promotional banner mappings with proper titles and descriptions
      const bannerMappings = {
        'ivg-smart-max-desktop-banner-updated-version': {
          title: 'IVG Smart Max - 10K Puffs | Advanced Technology | Better Value',
          description: 'Experience the ultimate vaping with IVG Smart Max featuring 10,000 puffs, advanced technology, and unbeatable value.',
          redirect_url: 'https://www.vapehub.co.uk/ivg-smart-max-vape-kit/'
        },
        'ivg-smart-max-desktop-banner-updated': {
          title: 'IVG Smart Max - Premium Vaping Experience',
          description: 'Discover the advanced IVG Smart Max with cutting-edge technology and exceptional performance.',
          redirect_url: 'https://www.vapehub.co.uk/ivg-smart-max-vape-kit/'
        },
        'ivg-smart-max-desktop-banner': {
          title: 'IVG Smart Max - Revolutionary Vape Kit',
          description: 'The revolutionary IVG Smart Max delivers unparalleled vaping satisfaction with smart technology.',
          redirect_url: 'https://www.vapehub.co.uk/ivg-smart-max-vape-kit/'
        },
        'hayati-pro-max-plus-pods': {
          title: 'HAYATI PRO MAX+ 6000 - New Chapter New Classic',
          description: 'Introducing the successor to the HAYATI PRO MAX. New Chapter, New Classic with up to 6000 puffs.',
          redirect_url: 'https://www.vapehub.co.uk/hayati-pro-max-plus/'
        },
        'hayati-pro-mini-plus-coming-soon': {
          title: 'HAYATI Pro Mini Plus - Coming Soon',
          description: 'Get ready for the next generation HAYATI Pro Mini Plus - compact power, maximum performance.',
          redirect_url: 'https://www.vapehub.co.uk/brand/hayati/'
        },
        'hayati-pro-mini-plus-pods-coming-soon': {
          title: 'HAYATI Pro Mini Plus Pods - Coming Soon',
          description: 'Revolutionary HAYATI Pro Mini Plus replacement pods - enhanced flavor, longer lasting.',
          redirect_url: 'https://www.vapehub.co.uk/brand/hayati/'
        }
      };
      
      // Process each promotional banner
      for (const banner of promotionalBanners) {
        // Extract base name for mapping
        const baseName = banner.post_title.replace(/\.(webp|jpg|jpeg|png)$/i, '');
        const mapping = bannerMappings[baseName];
        
        if (mapping) {
          // Create high-priority carousel entry for main promotional banners
          carouselImages.push({
            display_order: displayOrder++,
            image_url: banner.image_url,
            image_url_mid: banner.image_url,
            image_url_low: banner.image_url,
            title: mapping.title,
            description: mapping.description,
            redirect_url: mapping.redirect_url,
            updated_by: 2
          });
        } else if (banner.post_title.includes('desktop-banner') || banner.post_title.includes('mobile-banner')) {
          // Create generic entry for other promotional banners
          const productName = banner.post_title
            .replace(/-desktop-banner.*$/i, '')
            .replace(/-mobile-banner.*$/i, '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
          
          carouselImages.push({
            display_order: displayOrder++,
            image_url: banner.image_url,
            image_url_mid: banner.image_url,
            image_url_low: banner.image_url,
            title: `${productName} - Premium Vaping Experience`,
            description: `Discover the exceptional ${productName} with advanced features and superior performance.`,
            redirect_url: 'https://www.vapehub.co.uk/',
            updated_by: 2
          });
        }
      }
      
      console.log(`✅ Created ${carouselImages.length} promotional carousel entries`);
      
      if (carouselImages.length === 0) {
        console.log('⚠️ No promotional carousel entries created');
        if (crossServerMigration.oldDbConnection) {
          await crossServerMigration.oldDbConnection.close();
        }
        return;
      }
      
      console.log('🔗 Step 3: Inserting promotional carousel images...');
      
      // Insert carousel images
      let insertedCount = 0;
      
      for (const carousel of carouselImages) {
        try {
          await queryInterface.sequelize.query(`
            INSERT INTO carousels 
            (display_order, image_url, image_url_mid, image_url_low, title, description, redirect_url, updated_by, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
          `, {
            replacements: [
              carousel.display_order,
              carousel.image_url,
              carousel.image_url_mid,
              carousel.image_url_low,
              carousel.title,
              carousel.description,
              carousel.redirect_url,
              carousel.updated_by
            ],
            transaction
          });
          
          insertedCount++;
          console.log(`✅ Inserted promotional carousel: ${carousel.title}`);
        } catch (error) {
          console.error(`❌ Error inserting carousel ${carousel.title}:`, error.message);
        }
      }
      
      // Re-enable foreign key checks
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
      
      console.log('📊 Step 4: Verification and cleanup...');
      
      // Get final counts for verification
      const totalRecords = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM carousels
      `, { type: Sequelize.QueryTypes.SELECT });
      
      const currentPromotionalCarousels = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM carousels 
        WHERE title LIKE '%IVG%' OR title LIKE '%HAYATI%' OR title LIKE '%Smart Max%'
      `, { type: Sequelize.QueryTypes.SELECT });
      
      // Close old database connection
      if (crossServerMigration.oldDbConnection) {
        await crossServerMigration.oldDbConnection.close();
      }
      
      await transaction.commit();
      
      console.log('🎉 Current promotional carousels population completed successfully!');
      console.log('📊 Migration Summary:');
      console.log(`   • Successfully inserted: ${insertedCount}`);
      console.log(`   • Total carousel records: ${totalRecords[0].count}`);
      console.log(`   • Current promotional carousels: ${currentPromotionalCarousels[0].count}`);
      console.log(`   • Promotional banners processed: ${promotionalBanners.length}`);
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error during promotional carousel migration:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      console.log('🗑️ Rolling back promotional carousel migration...');
      
      // Delete promotional carousel records
      await queryInterface.sequelize.query(`
        DELETE FROM carousels 
        WHERE title LIKE '%IVG%' OR title LIKE '%HAYATI%' OR title LIKE '%Smart Max%'
      `);
      
      console.log('✅ Promotional carousel migration rollback completed');
      
    } catch (error) {
      console.error('❌ Error during promotional carousel migration rollback:', error);
      throw error;
    }
  }
};
