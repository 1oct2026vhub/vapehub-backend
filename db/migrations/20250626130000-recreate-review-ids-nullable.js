'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Remove foreign key constraints if they exist
    try { await queryInterface.removeConstraint('reviews', 'reviews_user_id_users_fk'); } catch (e) {}
    try { await queryInterface.removeConstraint('reviews', 'reviews_order_id_orders_fk'); } catch (e) {}
    try { await queryInterface.removeConstraint('reviews', 'reviews_product_id_products_fk'); } catch (e) {}

    // Remove the columns
    await queryInterface.removeColumn('reviews', 'user_id');
    await queryInterface.removeColumn('reviews', 'order_id');
    await queryInterface.removeColumn('reviews', 'product_id');

    // Add them back as nullable with foreign key constraints
    await queryInterface.addColumn('reviews', 'user_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });
    await queryInterface.addColumn('reviews', 'order_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'orders',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });
    await queryInterface.addColumn('reviews', 'product_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'products',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });
    // Add user_name column
    await queryInterface.addColumn('reviews', 'user_name', {
      type: Sequelize.STRING,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove the columns
    await queryInterface.removeColumn('reviews', 'user_id');
    await queryInterface.removeColumn('reviews', 'order_id');
    await queryInterface.removeColumn('reviews', 'product_id');
    // Remove user_name column
    await queryInterface.removeColumn('reviews', 'user_name');

    // Add them back as NOT NULL (original state)
    await queryInterface.addColumn('reviews', 'user_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });
    await queryInterface.addColumn('reviews', 'order_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'orders',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });
    await queryInterface.addColumn('reviews', 'product_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: 'products',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });
  }
}; 