'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add entity_type field (ENUM for product, brand, category)
    await queryInterface.addColumn('coupons', 'entity_type', {
      type: Sequelize.ENUM('product', 'brand', 'category'),
      allowNull: true,
      after: 'status'
    });

    // Add entity_id field (BIGINT to reference the entity)
    await queryInterface.addColumn('coupons', 'entity_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      after: 'entity_type'
    });

    // Add coupon_user field (INTEGER to reference the user)
    await queryInterface.addColumn('coupons', 'coupon_user', {
      type: Sequelize.INTEGER,
      allowNull: true,
      after: 'entity_id',
      references: {
        model: 'users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove the columns in reverse order
    await queryInterface.removeColumn('coupons', 'coupon_user');
    await queryInterface.removeColumn('coupons', 'entity_id');
    await queryInterface.removeColumn('coupons', 'entity_type');
    
    // Remove the ENUM type
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_coupons_entity_type;');
  }
}; 