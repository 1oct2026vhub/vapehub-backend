'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TABLE seo_meta
      MODIFY COLUMN entityType ENUM(
        'page', 'product', 'category', 'brand', 'blog_category', 'blog_post', 'deals'
      ) NOT NULL
    `);
  },

  async down(queryInterface, Sequelize) {
    // Remove deals rows before removing enum value (optional: delete where entityType = 'deals')
    await queryInterface.sequelize.query(`
      DELETE FROM seo_meta WHERE entityType = 'deals'
    `);
    await queryInterface.sequelize.query(`
      ALTER TABLE seo_meta
      MODIFY COLUMN entityType ENUM(
        'page', 'product', 'category', 'brand', 'blog_category', 'blog_post'
      ) NOT NULL
    `);
  }
};
