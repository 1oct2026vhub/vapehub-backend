'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('🚀 Starting SLUG RELATIONS POPULATION...');
      
      // Step 1: Clear existing slug relations
      console.log('🧹 Clearing existing slug relations...');
      await queryInterface.sequelize.query(`DELETE FROM slug_relations`);
      
             // Step 2: Populate Categories
       console.log('📂 Populating Categories...');
       const categories = await queryInterface.sequelize.query(`
         SELECT id, name, slug, createdAt, updatedAt
         FROM categories
         WHERE slug IS NOT NULL AND slug != ''
       `, { type: Sequelize.QueryTypes.SELECT });
       
               for (const category of categories) {
          await queryInterface.sequelize.query(`
            INSERT IGNORE INTO slug_relations (entity_type, entity_id, slug, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
          `, {
            replacements: ['category', category.id, category.slug, category.createdAt, category.updatedAt]
          });
        }
      console.log(`✅ Categories populated: ${categories.length}`);
      
             // Step 3: Populate Brands
       console.log('🏷️ Populating Brands...');
       const brands = await queryInterface.sequelize.query(`
         SELECT id, name, slug, createdAt, updatedAt
         FROM brands
         WHERE slug IS NOT NULL AND slug != ''
       `, { type: Sequelize.QueryTypes.SELECT });
       
               for (const brand of brands) {
          await queryInterface.sequelize.query(`
            INSERT IGNORE INTO slug_relations (entity_type, entity_id, slug, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
          `, {
            replacements: ['brand', brand.id, brand.slug, brand.createdAt, brand.updatedAt]
          });
        }
      console.log(`✅ Brands populated: ${brands.length}`);
      
             // Step 4: Populate Products
       console.log('📦 Populating Products...');
       const products = await queryInterface.sequelize.query(`
         SELECT id, name, slug, createdAt, updatedAt
         FROM products
         WHERE slug IS NOT NULL AND slug != ''
       `, { type: Sequelize.QueryTypes.SELECT });
       
               for (const product of products) {
          await queryInterface.sequelize.query(`
            INSERT IGNORE INTO slug_relations (entity_type, entity_id, slug, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
          `, {
            replacements: ['product', product.id, product.slug, product.createdAt, product.updatedAt]
          });
        }
      console.log(`✅ Products populated: ${products.length}`);
      
             // Step 5: Populate Product Variants
       console.log('🔄 Populating Product Variants...');
               const variants = await queryInterface.sequelize.query(`
          SELECT id, product_id, slug, created_at, updated_at
          FROM product_variants
          WHERE slug IS NOT NULL AND slug != ''
        `, { type: Sequelize.QueryTypes.SELECT });
       
               for (const variant of variants) {
          await queryInterface.sequelize.query(`
            INSERT IGNORE INTO slug_relations (entity_type, entity_id, slug, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
          `, {
            replacements: ['product_variant', variant.id, variant.slug, variant.created_at, variant.updated_at]
          });
        }
             console.log(`✅ Product Variants populated: ${variants.length}`);
       
               // Step 6: Populate Attributes
        console.log('🏷️ Populating Attributes...');
                 const attributes = await queryInterface.sequelize.query(`
           SELECT id, name, slug, created_at, updated_at
           FROM attributes
           WHERE slug IS NOT NULL AND slug != ''
         `, { type: Sequelize.QueryTypes.SELECT });
        
                 for (const attribute of attributes) {
                       await queryInterface.sequelize.query(`
              INSERT IGNORE INTO slug_relations (entity_type, entity_id, slug, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)
            `, {
              replacements: ['attribute', attribute.id, attribute.slug, attribute.created_at, attribute.updated_at]
            });
         }
       console.log(`✅ Attributes populated: ${attributes.length}`);
       
               // Step 7: Populate Attribute Terms
        console.log('📝 Populating Attribute Terms...');
                 const attributeTerms = await queryInterface.sequelize.query(`
           SELECT id, attribute_id, name, slug, created_at, updated_at
           FROM attribute_terms
           WHERE slug IS NOT NULL AND slug != ''
         `, { type: Sequelize.QueryTypes.SELECT });
        
                 for (const term of attributeTerms) {
                       await queryInterface.sequelize.query(`
              INSERT IGNORE INTO slug_relations (entity_type, entity_id, slug, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)
            `, {
              replacements: ['attribute_term', term.id, term.slug, term.created_at, term.updated_at]
            });
         }
       console.log(`✅ Attribute Terms populated: ${attributeTerms.length}`);
       
       // Step 8: Verification
      console.log('📊 Verification...');
      const [totalCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as total FROM slug_relations
      `);
      
      const [categoryCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM slug_relations WHERE entity_type = 'category'
      `);
      
      const [brandCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM slug_relations WHERE entity_type = 'brand'
      `);
      
      const [productCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM slug_relations WHERE entity_type = 'product'
      `);
      
             const [variantCount] = await queryInterface.sequelize.query(`
         SELECT COUNT(*) as count FROM slug_relations WHERE entity_type = 'product_variant'
       `);
       
       const [attributeCount] = await queryInterface.sequelize.query(`
         SELECT COUNT(*) as count FROM slug_relations WHERE entity_type = 'attribute'
       `);
       
       const [attributeTermCount] = await queryInterface.sequelize.query(`
         SELECT COUNT(*) as count FROM slug_relations WHERE entity_type = 'attribute_term'
       `);
       
       console.log('🎉 SLUG RELATIONS POPULATION COMPLETED!');
       console.log(`📊 Total slug relations: ${totalCount[0].total}`);
       console.log(`📂 Categories: ${categoryCount[0].count}`);
       console.log(`🏷️ Brands: ${brandCount[0].count}`);
       console.log(`📦 Products: ${productCount[0].count}`);
       console.log(`🔄 Product Variants: ${variantCount[0].count}`);
       console.log(`🏷️ Attributes: ${attributeCount[0].count}`);
       console.log(`📝 Attribute Terms: ${attributeTermCount[0].count}`);
      
    } catch (error) {
      console.error('❌ SLUG RELATIONS POPULATION FAILED:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      console.log('🔄 Rolling back SLUG RELATIONS POPULATION...');
      
      // Remove all slug relations
      await queryInterface.sequelize.query(`DELETE FROM slug_relations`);
      
      console.log('✅ SLUG RELATIONS POPULATION rolled back successfully!');
    } catch (error) {
      console.error('❌ SLUG RELATIONS POPULATION rollback failed:', error);
      throw error;
    }
  }
};
