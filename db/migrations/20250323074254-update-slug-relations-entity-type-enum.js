'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // First, remove the existing enum constraint
    await queryInterface.sequelize.query(
      `ALTER TABLE slug_relations MODIFY COLUMN entity_type VARCHAR(255);`
    );

    // Update any existing records to ensure they match the new enum values
    await queryInterface.sequelize.query(
      `UPDATE slug_relations SET entity_type = 'attribute_term' WHERE entity_type = 'attribute_term';`
    );

    // Add the new enum constraint with updated values
    await queryInterface.sequelize.query(
      `ALTER TABLE slug_relations MODIFY COLUMN entity_type ENUM('brand', 'blog', 'blog_category', 'category', 'product', 'product_variant', 'attribute', 'attribute_term') NOT NULL;`
    );
  },

  async down(queryInterface, Sequelize) {
    // First, remove the enum constraint
    await queryInterface.sequelize.query(
      `ALTER TABLE slug_relations MODIFY COLUMN entity_type VARCHAR(255);`
    );

    // Add back the original enum constraint
    await queryInterface.sequelize.query(
      `ALTER TABLE slug_relations MODIFY COLUMN entity_type ENUM('brand', 'blog', 'blog_category', 'category', 'product', 'product_variant') NOT NULL;`
    );
  }
};
