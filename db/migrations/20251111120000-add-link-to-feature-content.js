'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('feature_content', 'link', {
      type: Sequelize.STRING(1024),
      allowNull: true,
      comment: 'Optional external link for the feature content'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('feature_content', 'link');
  }
};
