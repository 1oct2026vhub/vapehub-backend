'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('seo_meta', 'description_text', {
      type: Sequelize.TEXT('long'),
      allowNull: true,
      comment: 'Additional description text for SEO purposes'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('seo_meta', 'description_text');
  }
};
