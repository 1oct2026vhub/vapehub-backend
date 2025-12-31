'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Check blogs table structure
      const blogsTableDescription = await queryInterface.describeTable('blogs');

      // Add alt_text to blogs table if it doesn't exist
      if (!blogsTableDescription.alt_text) {
        await queryInterface.addColumn('blogs', 'alt_text', {
          type: Sequelize.STRING,
          allowNull: true,
        });
        console.log('Added alt_text column to blogs table');
      } else {
        console.log('alt_text column already exists in blogs table');
      }

      // Check blog_categories table structure
      const blogCategoriesTableDescription = await queryInterface.describeTable('blog_categories');

      // Add alt_text to blog_categories table if it doesn't exist
      if (!blogCategoriesTableDescription.alt_text) {
        await queryInterface.addColumn('blog_categories', 'alt_text', {
          type: Sequelize.STRING,
          allowNull: true,
        });
        console.log('Added alt_text column to blog_categories table');
      } else {
        console.log('alt_text column already exists in blog_categories table');
      }
    } catch (error) {
      console.error('Migration error (add alt_text to blogs/blog_categories):', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Check blogs table structure
      const blogsTableDescription = await queryInterface.describeTable('blogs');

      // Remove alt_text from blogs table if it exists
      if (blogsTableDescription.alt_text) {
        await queryInterface.removeColumn('blogs', 'alt_text');
        console.log('Removed alt_text column from blogs table');
      }

      // Check blog_categories table structure
      const blogCategoriesTableDescription = await queryInterface.describeTable('blog_categories');

      // Remove alt_text from blog_categories table if it exists
      if (blogCategoriesTableDescription.alt_text) {
        await queryInterface.removeColumn('blog_categories', 'alt_text');
        console.log('Removed alt_text column from blog_categories table');
      }
    } catch (error) {
      console.error('Migration rollback error (alt_text blogs/blog_categories):', error);
      throw error;
    }
  }
};

