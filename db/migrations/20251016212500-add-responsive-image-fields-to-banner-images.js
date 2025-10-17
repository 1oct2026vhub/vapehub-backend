'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('BannerImages', 'image_url_desktop_wide', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Desktop Wide Hero Banner (3240x540) - Large desktop / wide hero banner'
    });

    await queryInterface.addColumn('BannerImages', 'image_url_desktop', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Desktop (2020x340) - Medium desktop'
    });

    await queryInterface.addColumn('BannerImages', 'image_url_laptop', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Laptop (1620x270) - Small desktop / laptop'
    });

    await queryInterface.addColumn('BannerImages', 'image_url_tablet_landscape', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Tablet Landscape (1010x170) - Tablet landscape'
    });

    await queryInterface.addColumn('BannerImages', 'image_url_tablet_portrait', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Tablet Portrait (960x160) - Tablet portrait / small laptop'
    });

    await queryInterface.addColumn('BannerImages', 'image_url_mobile', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Mobile (480x80) - Mobile devices'
    });

    await queryInterface.addColumn('BannerImages', 'responsive_urls', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'JSON object containing all responsive image URLs'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('BannerImages', 'image_url_desktop_wide');
    await queryInterface.removeColumn('BannerImages', 'image_url_desktop');
    await queryInterface.removeColumn('BannerImages', 'image_url_laptop');
    await queryInterface.removeColumn('BannerImages', 'image_url_tablet_landscape');
    await queryInterface.removeColumn('BannerImages', 'image_url_tablet_portrait');
    await queryInterface.removeColumn('BannerImages', 'image_url_mobile');
    await queryInterface.removeColumn('BannerImages', 'responsive_urls');
  }
};
