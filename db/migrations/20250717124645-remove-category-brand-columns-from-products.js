'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if foreign key constraints exist before removing them
    try {
      await queryInterface.removeConstraint('products', 'products_category_id_fkey');
    } catch (error) {
      console.log('Constraint products_category_id_fkey does not exist, skipping...');
    }
    
    try {
      await queryInterface.removeConstraint('products', 'products_brand_id_fkey');
    } catch (error) {
      console.log('Constraint products_brand_id_fkey does not exist, skipping...');
    }
    
    // Remove the columns if they exist
    try {
      await queryInterface.removeColumn('products', 'category_id');
    } catch (error) {
      console.log('Column category_id does not exist, skipping...');
    }
    
    try {
      await queryInterface.removeColumn('products', 'brand_id');
    } catch (error) {
      console.log('Column brand_id does not exist, skipping...');
    }
  },

  async down(queryInterface, Sequelize) {
    // Add the columns back
    await queryInterface.addColumn('products', 'category_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'categories',
        key: 'id'
      }
    });

    await queryInterface.addColumn('products', 'brand_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'brands',
        key: 'id'
      }
    });
  }
}; 