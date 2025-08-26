'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('🚀 Adding deleted_at field to attribute_terms table...');
      
      await queryInterface.addColumn('attribute_terms', 'deleted_at', {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null
      });

      console.log('✅ deleted_at field added successfully to attribute_terms table!');
    } catch (error) {
      console.error('❌ Failed to add deleted_at field to attribute_terms table:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      console.log('🔄 Removing deleted_at field from attribute_terms table...');
      
      await queryInterface.removeColumn('attribute_terms', 'deleted_at');

      console.log('✅ deleted_at field removed successfully from attribute_terms table!');
    } catch (error) {
      console.error('❌ Failed to remove deleted_at field from attribute_terms table:', error);
      throw error;
    }
  }
};
