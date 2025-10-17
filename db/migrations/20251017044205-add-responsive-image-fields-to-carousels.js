'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Carousels', 'image_url_desktop_wide', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Desktop Wide (3240x540) - Ultra-wide displays'
    });
    
    await queryInterface.addColumn('Carousels', 'image_url_desktop', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Desktop (2020x340) - Standard desktop screens'
    });
    
    await queryInterface.addColumn('Carousels', 'image_url_laptop', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Laptop (1620x270) - Laptop screens'
    });
    
    await queryInterface.addColumn('Carousels', 'image_url_tablet_landscape', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Tablet Landscape (1010x170) - Tablets landscape'
    });
    
    await queryInterface.addColumn('Carousels', 'image_url_tablet_portrait', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Tablet Portrait (960x160) - Tablets portrait'
    });
    
    await queryInterface.addColumn('Carousels', 'image_url_mobile', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Mobile (480x80) - Mobile devices'
    });
    
    await queryInterface.addColumn('Carousels', 'responsive_urls', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'JSON object containing all responsive image URLs'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Carousels', 'image_url_desktop_wide');
    await queryInterface.removeColumn('Carousels', 'image_url_desktop');
    await queryInterface.removeColumn('Carousels', 'image_url_laptop');
    await queryInterface.removeColumn('Carousels', 'image_url_tablet_landscape');
    await queryInterface.removeColumn('Carousels', 'image_url_tablet_portrait');
    await queryInterface.removeColumn('Carousels', 'image_url_mobile');
    await queryInterface.removeColumn('Carousels', 'responsive_urls');
  }
};