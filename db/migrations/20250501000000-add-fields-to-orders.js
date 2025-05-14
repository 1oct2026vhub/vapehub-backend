'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('orders', 'referrer_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'referrals',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('orders', 'sub_total', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0
    });

    await queryInterface.addColumn('orders', 'discount_type', {
      type: Sequelize.ENUM('percentage', 'fixed', 'referral'),
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('orders', 'discount_type');
    await queryInterface.removeColumn('orders', 'sub_total');
    await queryInterface.removeColumn('orders', 'referrer_id');
    
    // Drop the ENUM type as well in down migration
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_orders_discount_type";');
  }
}; 