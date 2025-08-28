'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🎯 Starting to populate current promotional banners from old database...');
      
      // Initialize cross-server migration utility
      const crossServerMigration = new CrossServerMigration();
      await crossServerMigration.connectToOldDb();
      console.log('✅ Connected to old database successfully');
      
      // Disable foreign key checks
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
      
      console.log('📋 Step 1: Clearing old banner content and fetching current promotional banners...');
      
      // Clear existing banner content
      await queryInterface.sequelize.query('DELETE FROM BannerImages', { transaction });
      console.log('🗑️ Cleared existing banner content');
      
      // Get current promotional banner images (2025) that should be banners
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
            post_title LIKE '%homepage-banner%' OR
            post_title LIKE '%hayati-pro-max%' OR
            post_title LIKE '%ivg-smart-max%' OR
            post_title LIKE '%banner%' OR
            post_title LIKE '%promo%' OR
            post_title LIKE '%promotion%'
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
      
      console.log('📊 Step 2: Processing promotional banners and creating banner entries...');
      
      let bannerImages = [];
      let displayOrder = 1;
      
      // Define promotional banner mappings with proper titles and descriptions
      const bannerMappings = {
        'ivg-smart-max-desktop-banner-updated-version': {
          title: 'IVG Smart Max - 10K Puffs | Advanced Technology | Better Value',
          description: 'Experience the ultimate vaping with IVG Smart Max featuring 10,000 puffs, advanced technology, and unbeatable value for money.',
          redirect_url: 'https://www.vapehub.co.uk/ivg-smart-max-vape-kit/',
          status: 'active'
        },
        'ivg-smart-max-mobile-banner-updated-version': {
          title: 'IVG Smart Max Mobile - Advanced Vaping Technology',
          description: 'The mobile-optimized banner for IVG Smart Max showcasing cutting-edge vaping technology.',
          redirect_url: 'https://www.vapehub.co.uk/ivg-smart-max-vape-kit/',
          status: 'active'
        },
        'ivg-smart-max-desktop-banner-updated': {
          title: 'IVG Smart Max - Premium Vaping Experience',
          description: 'Discover the advanced IVG Smart Max with cutting-edge technology and exceptional performance.',
          redirect_url: 'https://www.vapehub.co.uk/ivg-smart-max-vape-kit/',
          status: 'active'
        },
        'ivg-smart-max-mobile-banner-updated': {
          title: 'IVG Smart Max Mobile - Revolutionary Design',
          description: 'Mobile banner featuring the revolutionary IVG Smart Max design and features.',
          redirect_url: 'https://www.vapehub.co.uk/ivg-smart-max-vape-kit/',
          status: 'active'
        },
        'ivg-smart-max-desktop-banner': {
          title: 'IVG Smart Max - Revolutionary Vape Kit',
          description: 'The revolutionary IVG Smart Max delivers unparalleled vaping satisfaction with smart technology.',
          redirect_url: 'https://www.vapehub.co.uk/ivg-smart-max-vape-kit/',
          status: 'active'
        },
        'hayati-pro-max-plus-pods': {
          title: 'HAYATI PRO MAX+ 6000 - New Chapter New Classic',
          description: 'Introducing the successor to the HAYATI PRO MAX. New Chapter, New Classic with up to 6000 puffs and legal compliance.',
          redirect_url: 'https://www.vapehub.co.uk/hayati-pro-max-plus/',
          status: 'active'
        },
        'hayati-pro-max-plus-homepage-banner': {
          title: 'HAYATI PRO MAX+ Homepage - Premium Experience',
          description: 'Homepage banner showcasing the premium HAYATI PRO MAX+ experience with enhanced features.',
          redirect_url: 'https://www.vapehub.co.uk/hayati-pro-max-plus/',
          status: 'active'
        },
        'hayati-pro-ultra-plus-25000': {
          title: 'HAYATI Pro Ultra Plus 25000 - Ultimate Performance',
          description: 'Experience ultimate performance with HAYATI Pro Ultra Plus featuring up to 25,000 puffs.',
          redirect_url: 'https://www.vapehub.co.uk/hayati-pro-ultra-plus-25000/',
          status: 'active'
        },
        'ban-proof-legal-big-puff-vapes-homepage-banner': {
          title: 'Ban Proof Vapes - Legal Big Puff Alternatives',
          description: 'Discover legal ban-proof vape alternatives that comply with new regulations without compromising quality.',
          redirect_url: 'https://www.vapehub.co.uk/ban-proof-big-puffs/',
          status: 'active'
        },
        'elux-nic-salts-homepage-banner-updated': {
          title: 'Elux Nic Salts - 5 for £10 Deal',
          description: 'Premium Elux Nic Salts with an incredible 5 bottles for £10 deal. Perfect for refillable pod kits.',
          redirect_url: 'https://www.vapehub.co.uk/elux-legend-nic-salts/',
          status: 'active'
        },
        'refillable-pod-kits-homepage-banner': {
          title: 'Refillable Pod Kits - Eco-Friendly Alternative',
          description: 'Sustainable refillable pod kits providing an excellent alternative to disposable vapes.',
          redirect_url: 'https://www.vapehub.co.uk/pod-kits/refillable-pod-kits/',
          status: 'active'
        }
      };
      
      // Process each promotional banner
      for (const banner of promotionalBanners) {
        // Extract base name for mapping
        const baseName = banner.post_title.replace(/\.(webp|jpg|jpeg|png)$/i, '');
        const mapping = bannerMappings[baseName];
        
        if (mapping) {
          // Create high-priority banner entry for main promotional banners
          bannerImages.push({
            display_order: displayOrder++,
            image_url: banner.image_url,
            title: mapping.title,
            description: mapping.description,
            redirect_url: mapping.redirect_url,
            status: mapping.status,
            updated_by: 2
          });
        } else if (banner.post_title.includes('banner') || banner.post_title.includes('promo')) {
          // Create generic entry for other promotional banners
          const productName = banner.post_title
            .replace(/-banner.*$/i, '')
            .replace(/-promo.*$/i, '')
            .replace(/-desktop.*$/i, '')
            .replace(/-mobile.*$/i, '')
            .replace(/-homepage.*$/i, '')
            .replace(/-/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
          
          bannerImages.push({
            display_order: displayOrder++,
            image_url: banner.image_url,
            title: `${productName} - Premium Vaping Experience`,
            description: `Discover the exceptional ${productName} with advanced features and superior performance.`,
            redirect_url: 'https://www.vapehub.co.uk/',
            status: 'active',
            updated_by: 2
          });
        }
      }
      
      console.log(`✅ Created ${bannerImages.length} promotional banner entries`);
      
      if (bannerImages.length === 0) {
        console.log('⚠️ No promotional banner entries created');
        if (crossServerMigration.oldDbConnection) {
          await crossServerMigration.oldDbConnection.close();
        }
        return;
      }
      
      console.log('🔗 Step 3: Inserting promotional banner images...');
      
      // Insert banner images
      let insertedCount = 0;
      
      for (const banner of bannerImages) {
        try {
          await queryInterface.sequelize.query(`
            INSERT INTO BannerImages 
            (display_order, image_url, title, description, redirect_url, status, updated_by, createdAt, updatedAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
          `, {
            replacements: [
              banner.display_order,
              banner.image_url,
              banner.title,
              banner.description,
              banner.redirect_url,
              banner.status,
              banner.updated_by
            ],
            transaction
          });
          
          insertedCount++;
          console.log(`✅ Inserted promotional banner: ${banner.title}`);
        } catch (error) {
          console.error(`❌ Error inserting banner ${banner.title}:`, error.message);
        }
      }
      
      // Re-enable foreign key checks
      await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
      
      console.log('📊 Step 4: Verification and cleanup...');
      
      // Get final counts for verification
      const totalRecords = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM BannerImages
      `, { type: Sequelize.QueryTypes.SELECT });
      
      const activeBanners = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM BannerImages WHERE status = 'active'
      `, { type: Sequelize.QueryTypes.SELECT });
      
      const currentPromotionalBanners = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM BannerImages 
        WHERE title LIKE '%IVG%' OR title LIKE '%HAYATI%' OR title LIKE '%Smart Max%'
      `, { type: Sequelize.QueryTypes.SELECT });
      
      // Close old database connection
      if (crossServerMigration.oldDbConnection) {
        await crossServerMigration.oldDbConnection.close();
      }
      
      await transaction.commit();
      
      console.log('🎉 Current promotional banners population completed successfully!');
      console.log('📊 Migration Summary:');
      console.log(`   • Successfully inserted: ${insertedCount}`);
      console.log(`   • Total banner records: ${totalRecords[0].count}`);
      console.log(`   • Active banners: ${activeBanners[0].count}`);
      console.log(`   • Current promotional banners: ${currentPromotionalBanners[0].count}`);
      console.log(`   • Promotional banners processed: ${promotionalBanners.length}`);
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error during promotional banner migration:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      console.log('🗑️ Rolling back promotional banner migration...');
      
      // Delete promotional banner records
      await queryInterface.sequelize.query(`
        DELETE FROM BannerImages 
        WHERE title LIKE '%IVG%' OR title LIKE '%HAYATI%' OR title LIKE '%Smart Max%'
      `);
      
      console.log('✅ Promotional banner migration rollback completed');
      
    } catch (error) {
      console.error('❌ Error during promotional banner migration rollback:', error);
      throw error;
    }
  }
};
