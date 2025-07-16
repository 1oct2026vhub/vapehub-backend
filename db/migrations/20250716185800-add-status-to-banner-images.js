'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('BannerImages', 'status', {
      type: Sequelize.ENUM('active', 'inactive'),
      allowNull: false,
      defaultValue: 'active',
      after: 'redirect_url'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('BannerImages', 'status');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_BannerImages_status";');
  }
}; 