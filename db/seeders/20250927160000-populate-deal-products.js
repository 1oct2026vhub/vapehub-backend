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
      const environment = process.env.NODE_ENV || 'local';
      const crossServerMigration = new CrossServerMigration(environment);
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
      let skipped = 0;

      for (const rule of wdrRules) {
        processed++;
        
        try {
          // Parse the filters JSON to extract product information
          let filters;
          try {
            filters = JSON.parse(rule.filters);
          } catch (e) {
            console.log(`⚠️ Skipping rule ${rule.id} - invalid filters JSON: ${e.message}`);
            errors++;
            continue;
          }

          // Debug: Log filter structure
          console.log(`\n🔍 Processing rule ${rule.id} (${rule.title})`);
          console.log(`📋 Filters structure:`, JSON.stringify(filters, null, 2));

          const productIds = new Set(); // Use Set to avoid duplicates

          // Handle different filter structures
          if (Array.isArray(filters)) {
            // Filters is an array
            for (const filter of filters) {
              await extractProductsFromFilter(filter, crossServerMigration, productIds, rule.id);
            }
          } else if (filters && typeof filters === 'object') {
            // Filters is an object with keys
            for (const key in filters) {
              const filter = filters[key];
              await extractProductsFromFilter(filter, crossServerMigration, productIds, rule.id);
            }
          }

          if (productIds.size === 0) {
            console.log(`⚠️ Skipping rule ${rule.id} - no products found in filters`);
            skipped++;
            continue;
          }

          console.log(`📦 Found ${productIds.size} unique products for rule ${rule.id}`);

          // Create deal-product relationships
          for (const productId of productIds) {
            try {
              // Check if this product ID exists in new database
              const newProduct = await queryInterface.sequelize.query(`
                SELECT id, name FROM products WHERE id = ?
              `, {
                replacements: [productId],
                type: Sequelize.QueryTypes.SELECT
              });

              if (newProduct.length === 0) {
                console.log(`⚠️ Product ${productId} not found in new database`);
                continue;
              }

              // Check if deal-product relationship already exists
              const existingRelation = await queryInterface.sequelize.query(`
                SELECT 1 FROM deal_products 
                WHERE deal_id = ? AND product_id = ?
              `, {
                replacements: [rule.id, productId],
                type: Sequelize.QueryTypes.SELECT
              });

              if (existingRelation.length > 0) {
                console.log(`⏭️ Deal-product relationship already exists: deal ${rule.id} -> product ${productId}`);
                continue;
              }

              // Create deal-product relationship
              await queryInterface.bulkInsert('deal_products', [{
                deal_id: rule.id,
                product_id: productId,
                createdAt: new Date(),
                updatedAt: new Date()
              }]);

              created++;
              console.log(`✅ Created deal-product relationship: deal ${rule.id} -> product ${productId} (${newProduct[0].name})`);

            } catch (error) {
              console.error(`❌ Error processing product ${productId}:`, error.message);
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

      console.log(`\n✅ Deal-product relationships population completed:`);
      console.log(`   - Rules processed: ${processed}`);
      console.log(`   - Relationships created: ${created}`);
      console.log(`   - Rules skipped (no products): ${skipped}`);
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

/**
 * Extract product IDs from a filter based on its type
 */
async function extractProductsFromFilter(filter, crossServerMigration, productIds, ruleId) {
  if (!filter || !filter.type) {
    return;
  }

  try {
    switch (filter.type) {
      case 'products':
        // Direct product IDs
        if (filter.value && Array.isArray(filter.value)) {
          filter.value.forEach(id => productIds.add(parseInt(id)));
          console.log(`  ✅ Found ${filter.value.length} direct product IDs`);
        } else if (filter.value) {
          productIds.add(parseInt(filter.value));
          console.log(`  ✅ Found 1 direct product ID`);
        }
        break;

      case 'product_tags':
        // Products via tags
        if (filter.value && Array.isArray(filter.value)) {
          for (const tagId of filter.value) {
            const taggedProducts = await crossServerMigration.fetchFromOldDb(`
              SELECT DISTINCT
                tr.object_id as old_product_id
              FROM vh_term_relationships tr
              JOIN vh_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
              JOIN vh_terms t ON tt.term_id = t.term_id
              JOIN vh_posts p ON tr.object_id = p.ID
              WHERE tt.term_id = ${parseInt(tagId)}
              AND tt.taxonomy = 'product_tag'
              AND p.post_type = 'product'
              AND p.post_status = 'publish'
            `);
            
            taggedProducts.forEach(p => productIds.add(parseInt(p.old_product_id)));
            console.log(`  ✅ Found ${taggedProducts.length} products via tag ${tagId}`);
          }
        }
        break;

      case 'product_categories':
        // Products via categories
        if (filter.value && Array.isArray(filter.value)) {
          for (const categoryId of filter.value) {
            const categoryProducts = await crossServerMigration.fetchFromOldDb(`
              SELECT DISTINCT
                tr.object_id as old_product_id
              FROM vh_term_relationships tr
              JOIN vh_term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
              JOIN vh_terms t ON tt.term_id = t.term_id
              JOIN vh_posts p ON tr.object_id = p.ID
              WHERE tt.term_id = ${parseInt(categoryId)}
              AND tt.taxonomy = 'product_cat'
              AND p.post_type = 'product'
              AND p.post_status = 'publish'
            `);
            
            categoryProducts.forEach(p => productIds.add(parseInt(p.old_product_id)));
            console.log(`  ✅ Found ${categoryProducts.length} products via category ${categoryId}`);
          }
        }
        break;

      case 'product_attributes':
        // Products via attributes (more complex, may need additional logic)
        if (filter.value && Array.isArray(filter.value)) {
          console.log(`  ⚠️ Product attributes filter found but not fully implemented: ${JSON.stringify(filter.value)}`);
          // TODO: Implement attribute-based product lookup if needed
        }
        break;

      default:
        console.log(`  ⚠️ Unknown filter type: ${filter.type}`);
        break;
    }
  } catch (error) {
    console.error(`  ❌ Error extracting products from filter type ${filter.type}:`, error.message);
  }
}
