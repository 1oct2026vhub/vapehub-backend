'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE slug_relations 
      MODIFY COLUMN entity_type 
      ENUM('brand', 'blog', 'blog_category', 'category', 'product', 'product_variant', 'attribute', 'attribute_term', 'deal')
      NOT NULL
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Note: PostgreSQL does not support removing enum values
    // We would need to create a new enum type without the value and update the column
    // This is complex and potentially dangerous, so we'll leave it as is
    console.log('Warning: Cannot remove enum value in PostgreSQL');
  }
}; 