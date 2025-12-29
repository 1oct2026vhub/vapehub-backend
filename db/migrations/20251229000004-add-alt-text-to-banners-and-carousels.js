'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Check BannerImages table structure
      const bannerImagesTableDescription = await queryInterface.describeTable('BannerImages');

      // Add alt_text to BannerImages table if it doesn't exist
      if (!bannerImagesTableDescription.alt_text) {
        await queryInterface.addColumn('BannerImages', 'alt_text', {
          type: Sequelize.STRING,
          allowNull: true,
        });
        console.log('Added alt_text column to BannerImages table');
      } else {
        console.log('alt_text column already exists in BannerImages table');
      }

      // Check Carousels table structure
      const carouselsTableDescription = await queryInterface.describeTable('Carousels');

      // Add alt_text to Carousels table if it doesn't exist
      if (!carouselsTableDescription.alt_text) {
        await queryInterface.addColumn('Carousels', 'alt_text', {
          type: Sequelize.STRING,
          allowNull: true,
        });
        console.log('Added alt_text column to Carousels table');
      } else {
        console.log('alt_text column already exists in Carousels table');
      }
    } catch (error) {
      console.error('Migration error (add alt_text to BannerImages/Carousels):', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Check BannerImages table structure
      const bannerImagesTableDescription = await queryInterface.describeTable('BannerImages');

      // Remove alt_text from BannerImages table if it exists
      if (bannerImagesTableDescription.alt_text) {
        await queryInterface.removeColumn('BannerImages', 'alt_text');
        console.log('Removed alt_text column from BannerImages table');
      }

      // Check Carousels table structure
      const carouselsTableDescription = await queryInterface.describeTable('Carousels');

      // Remove alt_text from Carousels table if it exists
      if (carouselsTableDescription.alt_text) {
        await queryInterface.removeColumn('Carousels', 'alt_text');
        console.log('Removed alt_text column from Carousels table');
      }
    } catch (error) {
      console.error('Migration rollback error (alt_text BannerImages/Carousels):', error);
      throw error;
    }
  }
};

