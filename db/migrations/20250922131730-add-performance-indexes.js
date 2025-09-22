'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('Adding performance optimization indexes...');

    // 1. Critical composite index for product_variants - most important for performance
    try {
      await queryInterface.addIndex('product_variants', 
        ['product_id', 'status', 'deleted_at', 'price'], 
        {
          name: 'idx_product_variants_performance',
          where: {
            deleted_at: null,
            status: 'active',
            price: {
              [Sequelize.Op.gt]: 0
            }
          }
        }
      );
      console.log('✓ Added idx_product_variants_performance index');
    } catch (error) {
      console.log('⚠ idx_product_variants_performance index might already exist:', error.message);
    }

    // 2. Composite index for products filtering
    try {
      await queryInterface.addIndex('products', 
        ['status', 'deletedAt', 'createdAt'], 
        {
          name: 'idx_products_status_deleted_created',
          where: {
            deleted_at: null,
            status: 'published'
          }
        }
      );
      console.log('✓ Added idx_products_status_deleted_created index');
    } catch (error) {
      console.log('⚠ idx_products_status_deleted_created index might already exist:', error.message);
    }

    // 3. Composite index for product_categories
    try {
      await queryInterface.addIndex('product_categories', 
        ['category_id', 'product_id', 'is_primary'], 
        {
          name: 'idx_product_categories_composite'
        }
      );
      console.log('✓ Added idx_product_categories_composite index');
    } catch (error) {
      console.log('⚠ idx_product_categories_composite index might already exist:', error.message);
    }

    // 4. Composite index for product_brands
    try {
      await queryInterface.addIndex('product_brands', 
        ['brand_id', 'product_id', 'is_primary'], 
        {
          name: 'idx_product_brands_composite'
        }
      );
      console.log('✓ Added idx_product_brands_composite index');
    } catch (error) {
      console.log('⚠ idx_product_brands_composite index might already exist:', error.message);
    }

    // 5. Composite index for product_attribute_terms
    try {
      await queryInterface.addIndex('product_attribute_terms', 
        ['attribute_id', 'term_id', 'product_id', 'deleted_at'], 
        {
          name: 'idx_product_attribute_terms_composite',
          where: {
            deleted_at: null
          }
        }
      );
      console.log('✓ Added idx_product_attribute_terms_composite index');
    } catch (error) {
      console.log('⚠ idx_product_attribute_terms_composite index might already exist:', error.message);
    }

    // 6. Additional index for product_variants price filtering
    try {
      await queryInterface.addIndex('product_variants', 
        ['price', 'status', 'deleted_at'], 
        {
          name: 'idx_product_variants_price_filter',
          where: {
            deleted_at: null,
            status: 'active',
            price: {
              [Sequelize.Op.gt]: 0
            }
          }
        }
      );
      console.log('✓ Added idx_product_variants_price_filter index');
    } catch (error) {
      console.log('⚠ idx_product_variants_price_filter index might already exist:', error.message);
    }

    // 7. Index for deal_products table
    try {
      await queryInterface.addIndex('deal_products', 
        ['product_id', 'deal_id'], 
        {
          name: 'idx_deal_products_composite'
        }
      );
      console.log('✓ Added idx_deal_products_composite index');
    } catch (error) {
      console.log('⚠ idx_deal_products_composite index might already exist:', error.message);
    }

    // 8. Index for deals table
    try {
      await queryInterface.addIndex('deals', 
        ['is_active', 'is_deleted', 'valid_from', 'valid_to'], 
        {
          name: 'idx_deals_active_valid',
          where: {
            is_active: true,
            is_deleted: false
          }
        }
      );
      console.log('✓ Added idx_deals_active_valid index');
    } catch (error) {
      console.log('⚠ idx_deals_active_valid index might already exist:', error.message);
    }

    console.log('✅ Performance indexes migration completed!');
  },

  async down(queryInterface, Sequelize) {
    console.log('Removing performance optimization indexes...');

    const indexes = [
      'idx_product_variants_performance',
      'idx_products_status_deleted_created',
      'idx_product_categories_composite',
      'idx_product_brands_composite',
      'idx_product_attribute_terms_composite',
      'idx_product_variants_price_filter',
      'idx_deal_products_composite',
      'idx_deals_active_valid'
    ];

    for (const indexName of indexes) {
      try {
        await queryInterface.removeIndex('product_variants', indexName);
        console.log(`✓ Removed ${indexName} from product_variants`);
      } catch (error) {
        try {
          await queryInterface.removeIndex('products', indexName);
          console.log(`✓ Removed ${indexName} from products`);
        } catch (error2) {
          try {
            await queryInterface.removeIndex('product_categories', indexName);
            console.log(`✓ Removed ${indexName} from product_categories`);
          } catch (error3) {
            try {
              await queryInterface.removeIndex('product_brands', indexName);
              console.log(`✓ Removed ${indexName} from product_brands`);
            } catch (error4) {
              try {
                await queryInterface.removeIndex('product_attribute_terms', indexName);
                console.log(`✓ Removed ${indexName} from product_attribute_terms`);
              } catch (error5) {
                try {
                  await queryInterface.removeIndex('deal_products', indexName);
                  console.log(`✓ Removed ${indexName} from deal_products`);
                } catch (error6) {
                  try {
                    await queryInterface.removeIndex('deals', indexName);
                    console.log(`✓ Removed ${indexName} from deals`);
                  } catch (error7) {
                    console.log(`⚠ Could not remove ${indexName}:`, error7.message);
                  }
                }
              }
            }
          }
        }
      }
    }

    console.log('✅ Performance indexes rollback completed!');
  }
};
