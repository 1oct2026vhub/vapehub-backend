'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('blog_categories', 'parent_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'blog_categories',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('blog_categories', 'status', {
      type: Sequelize.ENUM('active', 'inactive'),
      defaultValue: 'active',
      allowNull: false
    });

    // Add indexes for better query performance
    await queryInterface.addIndex('blog_categories', ['parent_id']);
    await queryInterface.addIndex('blog_categories', ['status']);
  },

  down: async (queryInterface, Sequelize) => {
    // Remove indexes first
    await queryInterface.removeIndex('blog_categories', ['parent_id']);
    await queryInterface.removeIndex('blog_categories', ['status']);

    // Remove columns
    await queryInterface.removeColumn('blog_categories', 'parent_id');
    await queryInterface.removeColumn('blog_categories', 'status');

    // Remove the ENUM type
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_blog_categories_status;');
  }
}; 