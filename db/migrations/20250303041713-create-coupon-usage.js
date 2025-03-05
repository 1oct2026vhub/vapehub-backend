'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("coupon_usages", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      coupon_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: "coupons",
          key: "id",
        },
        onDelete: "CASCADE",
      },
      order_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "orders",
          key: "id",
        },
        onDelete: "SET NULL",
      },
      used_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    // Enforce single-use coupon per user if needed
    await queryInterface.addConstraint("coupon_usages", {
      fields: ["user_id", "coupon_id"],
      type: "unique",
      name: "unique_user_coupon_usage",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("coupon_usages");
  },
};
