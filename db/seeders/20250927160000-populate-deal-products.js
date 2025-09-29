'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('🔗 Starting deal-product relationships population...');

      // Clear existing deal-product relationships first
      console.log('🧹 Clearing existing deal-product relationships...');
      await queryInterface.sequelize.query('DELETE FROM deal_products');
      console.log('✅ Existing deal-product relationships cleared');

      // Initialize cross-server migration
      const crossServerMigration = new CrossServerMigration();
      await crossServerMigration.connectToOldDb();

      // Get all WooCommerce discount rules with product filters
      const wdrRules = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          id,
          title,
          filters
        FROM vh_wdr_rules 
        WHERE enabled = 1 AND deleted = 0 AND filters IS NOT NULL AND filters != '[]'
        ORDER BY id
      `);

      console.log(`📊 Found ${wdrRules.length} WooCommerce rules with product filters`);

      let processed = 0;
      let created = 0;
      let errors = 0;

      for (const rule of wdrRules) {
        processed++;
        
        try {
          // Parse the filters JSON to extract product information
          let filters;
          try {
            filters = JSON.parse(rule.filters);
          } catch (e) {
            console.log(`⚠️ Skipping rule ${rule.id} - invalid filters JSON`);
            errors++;
            continue;
          }

          // Extract product tags from filters
          const productTags = [];
          if (filters && typeof filters === 'object') {
            for (const key in filters) {
              const filter = filters[key];
              if (filter && filter.type === 'product_tags' && filter.value && Array.isArray(filter.value)) {
                productTags.push(...filter.value);
              }
            }
          }

          if (productTags.length === 0) {
            console.log(`⚠️ Skipping rule ${rule.id} - no product tags found`);
            continue;
          }

          console.log(`🔍 Rule ${rule.id} (${rule.title}) has product tags: ${productTags.join(', ')}`);

          // Find products with these tags in the new database
          for (const tagId of productTags) {
            try {
          // Get products tagged with this specific tag from old database
          const taggedProducts = await crossServerMigration.fetchFromOldDb(`
            SELECT DISTINCT
              tr.object_id as old_product_id,
              p.post_title as product_name,
              t.name as tag_name
            FROM vh_term_relationships tr
            JOIN vh_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
            JOIN vh_terms t ON tt.term_id = t.term_id
            JOIN vh_posts p ON tr.object_id = p.ID
            WHERE tt.term_id = ${tagId}
            AND p.post_type = 'product'
            AND p.post_status = 'publish'
            ORDER BY tr.object_id
          `);

          console.log(`📦 Found ${taggedProducts.length} products tagged with tag ${tagId}`);

          // Map old product IDs to new product IDs
          for (const taggedProduct of taggedProducts) {
            try {
              // Check if this old product ID exists in new database
              const newProduct = await queryInterface.sequelize.query(`
                SELECT id, name FROM products WHERE id = ?
              `, {
                replacements: [taggedProduct.old_product_id],
                type: Sequelize.QueryTypes.SELECT
              });

              if (newProduct.length === 0) {
                console.log(`⚠️ Product ${taggedProduct.old_product_id} (${taggedProduct.product_name}) not found in new database`);
                continue;
              }

              // Check if deal-product relationship already exists
              const existingRelation = await queryInterface.sequelize.query(`
                SELECT 1 FROM deal_products 
                WHERE deal_id = ? AND product_id = ?
              `, {
                replacements: [rule.id, taggedProduct.old_product_id],
                type: Sequelize.QueryTypes.SELECT
              });

              if (existingRelation.length > 0) {
                console.log(`⏭️ Deal-product relationship already exists: deal ${rule.id} -> product ${taggedProduct.old_product_id}`);
                continue;
              }

              // Create deal-product relationship
              await queryInterface.bulkInsert('deal_products', [{
                deal_id: rule.id,
                product_id: taggedProduct.old_product_id,
                createdAt: new Date(),
                updatedAt: new Date()
              }]);

              created++;
              console.log(`✅ Created deal-product relationship: deal ${rule.id} -> product ${taggedProduct.old_product_id} (${newProduct[0].name})`);

            } catch (error) {
              console.error(`❌ Error processing product ${taggedProduct.old_product_id}:`, error.message);
              errors++;
            }
          }


            } catch (error) {
              console.error(`❌ Error processing tag ${tagId} for rule ${rule.id}:`, error.message);
              errors++;
            }
          }

        } catch (error) {
          console.error(`❌ Error processing rule ${rule.id}:`, error.message);
          errors++;
        }
      }

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      console.log(`✅ Deal-product relationships population completed:`);
      console.log(`   - Rules processed: ${processed}`);
      console.log(`   - Relationships created: ${created}`);
      console.log(`   - Errors: ${errors}`);

    } catch (error) {
      console.error('❌ Error in deal-product relationships population:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      console.log('🗑️ Removing deal-product relationships...');
      await queryInterface.sequelize.query('DELETE FROM deal_products');
      console.log('✅ Deal-product relationships removed');
    } catch (error) {
      console.error('❌ Error removing deal-product relationships:', error);
      throw error;
    }
  }
};
