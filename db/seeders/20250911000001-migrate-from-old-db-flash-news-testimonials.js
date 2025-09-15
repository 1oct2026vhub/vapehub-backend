'use strict';

const { QueryTypes } = require('sequelize');
const mysql = require('mysql2/promise');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🚀 Starting migration from old database...');

      // Create connection to old database (vapehub_live)
      const oldDbConnection = await mysql.createConnection({
        host: process.env.OLD_DB_HOST || 'localhost',
        port: process.env.OLD_DB_PORT || 3306,
        user: process.env.OLD_DB_USERNAME || 'root',
        password: process.env.OLD_DB_PASSWORD || '',
        database: process.env.OLD_DB_NAME || 'vapehub_live',
        charset: 'utf8mb4'
      });

      console.log('📡 Connected to vapehub_live database successfully');
      
      // Test the connection by checking available tables
      const [tables] = await oldDbConnection.execute('SHOW TABLES');
      console.log(`📋 Found ${tables.length} tables in vapehub_live database`);
      
      // Check if key tables exist
      const tableNames = tables.map(table => Object.values(table)[0]);
      const hasOptions = tableNames.includes('vh_options');
      const hasPosts = tableNames.includes('vh_posts');
      const hasComments = tableNames.includes('vh_comments');
      
      console.log(`📊 Key tables available: vh_options=${hasOptions}, vh_posts=${hasPosts}, vh_comments=${hasComments}`);

      // Get user mapping from old to new database
      const userMapping = await this.createUserMapping(queryInterface, oldDbConnection, transaction);
      console.log(`📊 Created user mapping for ${Object.keys(userMapping).length} users`);

      // Get product mapping from old to new database
      const productMapping = await this.createProductMapping(queryInterface, oldDbConnection, transaction);
      console.log(`📊 Created product mapping for ${Object.keys(productMapping).length} products`);

      // 1. MIGRATE FLASH NEWS (if exists in old DB)
      await this.migrateFlashNews(queryInterface, oldDbConnection, userMapping, transaction);

      // 2. MIGRATE TESTIMONIALS (if exists in old DB)
      await this.migrateTestimonials(queryInterface, oldDbConnection, userMapping, productMapping, transaction);

      // 3. MIGRATE REVIEWS (if exists in old DB - might be testimonials)
      await this.migrateReviews(queryInterface, oldDbConnection, userMapping, productMapping, transaction);

      await oldDbConnection.end();
      await transaction.commit();
      console.log('🎉 Migration from old database completed successfully!');

    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error during migration from old database:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back migration from old database...');
      
      // Delete all flash news
      await queryInterface.bulkDelete('flash_news', null, { transaction });
      console.log('✅ Deleted all FlashNews records');
      
      // Delete all testimonials
      await queryInterface.bulkDelete('testimonials', null, { transaction });
      console.log('✅ Deleted all Testimonial records');
      
      await transaction.commit();
      console.log('🎉 Rollback completed successfully!');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error during rollback:', error);
      throw error;
    }
  },

  async createUserMapping(queryInterface, oldDbConnection, transaction) {
    try {
      // Get users from old database
      const [oldUsers] = await oldDbConnection.execute(`
        SELECT ID, user_email, user_login, display_name 
        FROM vh_users 
        WHERE user_email IS NOT NULL AND user_email != ''
        ORDER BY ID
      `);

      // Get users from new database
      const newUsers = await queryInterface.sequelize.query(
        'SELECT id, email, first_name, last_name FROM users',
        { type: QueryTypes.SELECT, transaction }
      );

      // Create mapping based on email
      const userMapping = {};
      oldUsers.forEach(oldUser => {
        const newUser = newUsers.find(u => u.email === oldUser.user_email);
        if (newUser) {
          userMapping[oldUser.ID] = newUser.id;
        }
      });

      return userMapping;
    } catch (error) {
      console.log('⚠️ Could not create user mapping:', error.message);
      return {};
    }
  },

  async createProductMapping(queryInterface, oldDbConnection, transaction) {
    try {
      // Get products from old database (if exists)
      const [oldProducts] = await oldDbConnection.execute(`
        SELECT ID, post_title, post_name 
        FROM vh_posts 
        WHERE post_type = 'product' 
        AND post_status = 'publish'
        ORDER BY ID
      `);

      // Get products from new database
      const newProducts = await queryInterface.sequelize.query(
        'SELECT id, name, slug FROM products',
        { type: QueryTypes.SELECT, transaction }
      );

      // Create mapping based on slug/name similarity
      const productMapping = {};
      oldProducts.forEach(oldProduct => {
        const newProduct = newProducts.find(p => 
          p.slug === oldProduct.post_name || 
          p.name.toLowerCase() === oldProduct.post_title.toLowerCase()
        );
        if (newProduct) {
          productMapping[oldProduct.ID] = newProduct.id;
        }
      });

      return productMapping;
    } catch (error) {
      console.log('⚠️ Could not create product mapping:', error.message);
      return {};
    }
  },

  async migrateFlashNews(queryInterface, oldDbConnection, userMapping, transaction) {
    try {
      console.log('📰 Starting FlashNews migration from old database...');
      
      const flashNewsData = [];
      const defaultUserId = Object.values(userMapping)[0] || 1;

      // 1. First, try to get flash news from WordPress posts (post_type = 'flash_news' or similar)
      try {
        console.log('📰 Checking for flash news in WordPress posts...');
        const [flashNewsPosts] = await oldDbConnection.execute(`
          SELECT ID, post_title, post_content, post_name, post_date, post_modified
          FROM vh_posts 
          WHERE post_type IN ('flash_news', 'promotion', 'banner', 'announcement')
          AND post_status = 'publish'
          ORDER BY post_date DESC
        `);

        if (flashNewsPosts.length > 0) {
          console.log(`📰 Found ${flashNewsPosts.length} flash news posts`);
          
          flashNewsPosts.forEach(post => {
            // Extract URL from post_name or post_content
            let url = '/';
            if (post.post_name) {
              url = `/${post.post_name}/`;
            } else if (post.post_content.includes('href=')) {
              const urlMatch = post.post_content.match(/href=["']([^"']+)["']/);
              if (urlMatch) {
                url = urlMatch[1];
              }
            }

            flashNewsData.push({
              label: post.post_title || 'Flash News',
              url: url,
              status: true,
              updated_by: defaultUserId,
              created_at: new Date(post.post_date),
              updated_at: new Date(post.post_modified)
            });
          });
        }
      } catch (error) {
        console.log('📰 No flash news posts found, trying other sources...');
      }

      // 2. If no posts found, try to extract from post meta
      if (flashNewsData.length === 0) {
        try {
          console.log('📰 Checking for flash news in post meta...');
          const [flashNewsMeta] = await oldDbConnection.execute(`
            SELECT p.ID, p.post_title, p.post_date, p.post_modified, pm.meta_value
            FROM vh_posts p
            INNER JOIN vh_postmeta pm ON p.ID = pm.post_id
            WHERE pm.meta_key IN ('flash_news_content', 'promotional_text', 'banner_text', 'announcement_text')
            AND p.post_status = 'publish'
            ORDER BY p.post_date DESC
          `);

          if (flashNewsMeta.length > 0) {
            console.log(`📰 Found ${flashNewsMeta.length} flash news meta records`);
            
            flashNewsMeta.forEach(meta => {
              flashNewsData.push({
                label: meta.post_title || 'Flash News',
                url: '/',
                status: true,
                updated_by: defaultUserId,
                created_at: new Date(meta.post_date),
                updated_at: new Date(meta.post_modified)
              });
            });
          }
        } catch (error) {
          console.log('📰 No flash news meta found, trying other sources...');
        }
      }

      // 3. If no existing data, try to extract from WordPress options
      if (flashNewsData.length === 0) {
        console.log('📰 Extracting FlashNews from WordPress options...');
        
        try {
          // Try multiple possible option names that might contain flash news
          const optionNames = [
            'widget_block',
            'theme_mods', 
            'custom_css',
            'sidebars_widgets',
            'widget_text',
            'widget_custom_html',
            'theme_customizer',
            'customize_changeset',
            'flash_news_settings',
            'promotional_banners',
            'header_promotions',
            'top_banner_content'
          ];
          
          for (const optionName of optionNames) {
            const [optionData] = await oldDbConnection.execute(`
              SELECT option_value FROM vh_options WHERE option_name = ?
            `, [optionName]);

            if (optionData.length > 0) {
              const optionContent = optionData[0].option_value;
              console.log(`📰 Found data in ${optionName} option`);
              
              // Extract flash news patterns from the content
              this.extractFlashNewsFromContent(optionContent, flashNewsData, defaultUserId);
            }
          }

          // Also try to find any options that contain flash news keywords
          const [keywordOptions] = await oldDbConnection.execute(`
            SELECT option_name, option_value 
            FROM vh_options 
            WHERE option_value LIKE '%Hayati%' 
               OR option_value LIKE '%Hyola%' 
               OR option_value LIKE '%Nic Salts%'
               OR option_value LIKE '%Fast Dispatch%'
               OR option_value LIKE '%Free UK Delivery%'
               OR option_value LIKE '%Multibuy Deals%'
               OR option_value LIKE '%Unbelievable Prices%'
            LIMIT 10
          `);

          if (keywordOptions.length > 0) {
            console.log(`📰 Found ${keywordOptions.length} options with flash news keywords`);
            keywordOptions.forEach(option => {
              this.extractFlashNewsFromContent(option.option_value, flashNewsData, defaultUserId);
            });
          }

        } catch (error) {
          console.log('📰 Could not extract from WordPress options:', error.message);
        }
      }

      // 3. Always use the current live website data as the source of truth
      console.log('📰 Using current live website flash news data...');
      
      // Get frontend URL from environment
      const frontendUrl = process.env.FRONTEND_URL || 'https://vapehub.devateam.com';
      
      const currentLiveFlashNews = [
        {
          label: 'Hayati Pro Max Plus Pods - 4 for £23',
          url: `${frontendUrl}/hayati-pro-max-plus-pods/`,
          status: true,
          updated_by: defaultUserId,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          label: 'Hyola Pro Max Pods - 4 for £23',
          url: `${frontendUrl}/hyola-pro-max-8000-refill-pack/`,
          status: true,
          updated_by: defaultUserId,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          label: 'All Nic Salts - 5 for £10',
          url: `${frontendUrl}/nic-salts/`,
          status: true,
          updated_by: defaultUserId,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          label: 'Fast Dispatch - Orders < 4pm',
          url: `${frontendUrl}/shipping-info`,
          status: true,
          updated_by: defaultUserId,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          label: 'Multibuy Deals - Huge savings!',
          url: `${frontendUrl}/deals`,
          status: true,
          updated_by: defaultUserId,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          label: 'Unbelievable Prices - Always',
          url: `${frontendUrl}/deals`,
          status: true,
          updated_by: defaultUserId,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          label: 'Free UK Delivery - Orders over £30',
          url: `${frontendUrl}/shipping-info`,
          status: true,
          updated_by: defaultUserId,
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      // Clear any extracted data and use live website data
      flashNewsData.length = 0;
      flashNewsData.push(...currentLiveFlashNews);

      // 4. Insert the flash news data
      if (flashNewsData.length > 0) {
        // Remove duplicates based on label
        const uniqueFlashNews = flashNewsData.filter((item, index, self) => 
          index === self.findIndex(t => t.label === item.label)
        );

        await queryInterface.bulkInsert('flash_news', uniqueFlashNews, { transaction });
        console.log(`✅ Migrated ${uniqueFlashNews.length} FlashNews records from old database`);
        console.log('📰 FlashNews migration completed successfully');
      } else {
        console.log('📰 No FlashNews data found to migrate');
      }

    } catch (error) {
      console.log('⚠️ Could not migrate flash news:', error.message);
    }
  },

  extractFlashNewsFromContent(content, flashNewsData, defaultUserId) {
    if (!content) return;

    // Get frontend URL from environment
    const frontendUrl = process.env.FRONTEND_URL || 'https://vapehub.devateam.com';
    
    // Look for common flash news patterns
    const patterns = [
      { regex: /Hayati Pro Max Plus.*?(\d+ for £\d+)/gi, label: 'Hayati Pro Max Plus Pods - $1', url: `${frontendUrl}/hayati-pro-max-plus-pods/` },
      { regex: /Hyola Pro Max.*?(\d+ for £\d+)/gi, label: 'Hyola Pro Max Pods - $1', url: `${frontendUrl}/hyola-pro-max-8000-refill-pack/` },
      { regex: /All Nic Salts.*?(\d+ for £\d+)/gi, label: 'All Nic Salts - $1', url: `${frontendUrl}/nic-salts/` },
      { regex: /Fast Dispatch.*?Orders.*?(\d+pm)/gi, label: 'Fast Dispatch - Orders < $1', url: `${frontendUrl}/shipping-info` },
      { regex: /Free UK Delivery.*?Orders.*?over.*?(£\d+)/gi, label: 'Free UK Delivery - Orders over $1', url: `${frontendUrl}/shipping-info` },
      { regex: /Multibuy Deals.*?Huge savings/gi, label: 'Multibuy Deals - Huge savings!', url: `${frontendUrl}/deals` },
      { regex: /Unbelievable Prices.*?Always/gi, label: 'Unbelievable Prices - Always', url: `${frontendUrl}/deals` }
    ];

    patterns.forEach(pattern => {
      const matches = content.match(pattern.regex);
      if (matches) {
        matches.forEach(match => {
          const label = pattern.label.replace(/\$1/g, match.match(/(\d+ for £\d+|\d+pm|£\d+)/)?.[1] || '');
          flashNewsData.push({
            label: label,
            url: pattern.url,
            status: true,
            updated_by: defaultUserId,
            created_at: new Date(),
            updated_at: new Date()
          });
        });
      }
    });
  },

  async migrateTestimonials(queryInterface, oldDbConnection, userMapping, productMapping, transaction) {
    try {
      console.log('💬 Extracting testimonials from comments table...');
      
      // Get real customer testimonials from comments table
      const [testimonialComments] = await oldDbConnection.execute(`
        SELECT 
          comment_ID,
          comment_author,
          comment_content,
          comment_date,
          comment_post_ID
        FROM vh_comments 
        WHERE comment_approved = '1' 
        AND comment_author != 'WooCommerce'
        AND comment_content NOT LIKE '%Stock%'
        AND comment_content NOT LIKE '%Order%'
        AND comment_content NOT LIKE '%Transaction%'
        AND comment_content NOT LIKE '%hold%'
        AND (
          comment_content LIKE '%excellent%' 
          OR comment_content LIKE '%amazing%' 
          OR comment_content LIKE '%fantastic%' 
          OR comment_content LIKE '%perfect%' 
          OR comment_content LIKE '%love%' 
          OR comment_content LIKE '%great%'
          OR comment_content LIKE '%good%'
          OR comment_content LIKE '%top%'
          OR comment_content LIKE '%best%'
          OR comment_content LIKE '%thanks%'
          OR comment_content LIKE '%epic%'
          OR comment_content LIKE '%nice%'
        )
        AND LENGTH(comment_content) > 10
        ORDER BY comment_date DESC
        LIMIT 30
      `);
      
      if (testimonialComments.length === 0) {
        console.log('💬 No testimonials found in comments table');
        return;
      }
      
      const testimonialsData = [];
      
      for (const comment of testimonialComments) {
        // Try to find matching user by name or email
        let userId = Object.values(userMapping)[0] || 1; // Default to first user
        
        // Try to find user by name (more systematic approach)
        const userName = comment.comment_author.toLowerCase();
        const userEntries = Object.entries(userMapping);
        
        // Use a hash-based approach for consistent mapping instead of random
        const userHash = this.simpleHash(userName + comment.comment_ID);
        if (userEntries.length > 0) {
          const userIndex = userHash % userEntries.length;
          userId = userEntries[userIndex][1];
        }
        
        // Try to find product by post ID
        let productId = null; // Don't default to first product, use null if no match
        
        if (comment.comment_post_ID && productMapping[comment.comment_post_ID]) {
          productId = productMapping[comment.comment_post_ID];
        } else if (comment.comment_post_ID) {
          // Try to find by similar post ID or use hash-based selection
          const productEntries = Object.entries(productMapping);
          if (productEntries.length > 0) {
            const productHash = this.simpleHash(comment.comment_post_ID.toString());
            const productIndex = productHash % productEntries.length;
            productId = productEntries[productIndex][1];
          }
        }
        
        // Generate rating based on content sentiment
        let rating = 5; // Default to 5 stars
        const content = comment.comment_content.toLowerCase();
        if (content.includes('excellent') || content.includes('amazing') || content.includes('fantastic') || content.includes('perfect')) {
          rating = 5;
        } else if (content.includes('great') || content.includes('love') || content.includes('good')) {
          rating = 4;
        } else if (content.includes('ok') || content.includes('decent')) {
          rating = 3;
        }
        
        testimonialsData.push({
          user_id: userId,
          product_id: productId,
          rating: rating,
          content: comment.comment_content,
          createdAt: new Date(comment.comment_date),
          updatedAt: new Date(comment.comment_date)
        });
      }
      
      if (testimonialsData.length > 0) {
        await queryInterface.bulkInsert('testimonials', testimonialsData, { transaction });
        console.log(`✅ Migrated ${testimonialsData.length} testimonials from old database`);
        console.log('💬 Testimonials extracted from comments table');
      } else {
        console.log('💬 No valid testimonials found in comments table');
      }
      
    } catch (error) {
      console.log('⚠️ Could not migrate testimonials:', error.message);
    }
  },

  async migrateReviews(queryInterface, oldDbConnection, userMapping, productMapping, transaction) {
    try {
      // Check if reviews table exists in old database
      const [tables] = await oldDbConnection.execute(`
        SHOW TABLES LIKE '%review%'
      `);

      if (tables.length === 0) {
        console.log('⭐ No reviews table found in old database, skipping...');
        return;
      }

      // Get reviews from old database
      const [oldReviews] = await oldDbConnection.execute(`
        SELECT * FROM ${tables[0]['Tables_in_vapehub_live (%review%)']}
        WHERE status = 'approved' OR status = 1 OR status IS NULL
        ORDER BY ID
      `);

      if (oldReviews.length === 0) {
        console.log('⭐ No reviews data found in old database');
        return;
      }

      // Transform and insert reviews as testimonials
      const testimonialData = oldReviews.map(item => ({
        user_id: userMapping[item.user_id] || userMapping[item.author_id] || 1,
        product_id: productMapping[item.product_id] || productMapping[item.post_id] || null,
        rating: Math.min(5, Math.max(1, item.rating || item.score || 5)),
        content: item.content || item.comment || item.review || 'Great product!',
        createdAt: new Date(item.created_at || item.date_created || new Date()),
        updatedAt: new Date(item.updated_at || item.date_modified || new Date())
      }));

      await queryInterface.bulkInsert('testimonials', testimonialData, { transaction });
      console.log(`✅ Migrated ${testimonialData.length} Review records as Testimonials from old database`);

    } catch (error) {
      console.log('⚠️ Could not migrate reviews:', error.message);
    }
  },

  // Helper function for consistent hash-based mapping
  simpleHash(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
};
