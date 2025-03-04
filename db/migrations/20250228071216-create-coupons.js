'use strict';

/** @type {import('sequelize-cli').Migration} */
const createCouponTable = async (queryInterface, Sequelize) => {
    await queryInterface.createTable("coupons", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.BIGINT,
      },
      code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      description: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      discount_type: {
        type: Sequelize.ENUM("percentage", "fixed_amount"),
        allowNull: false,
      },
      discount_value: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      minimum_purchase: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },
      maximum_discount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },
      usage_limit: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      usage_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
      },
      is_single_use: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM("active", "inactive", "expired"),
        defaultValue: "active",
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      created_by: {
        type: Sequelize.INTEGER,
        references: {
          model: "users",
          key: "id",
        },
        onDelete: "SET NULL",
      },
      updated_by: {
        type: Sequelize.INTEGER,
        references: {
          model: "users",
          key: "id",
        },
        onDelete: "SET NULL",
      },
    });
  
    // Add indexes for better performance
    await queryInterface.addIndex("coupons", ["status"]);
    await queryInterface.addIndex("coupons", ["start_date", "end_date"]);
  };
  
  const dropCouponTable = async (queryInterface, Sequelize) => {
    // Remove indexes
    await queryInterface.removeIndex("coupons", ["status"]);
    await queryInterface.removeIndex("coupons", ["start_date", "end_date"]);
  
    // Drop ENUM types
    await queryInterface.sequelize.query("DROP TYPE IF EXISTS enum_coupons_discount_type;");
    await queryInterface.sequelize.query("DROP TYPE IF EXISTS enum_coupons_status;");
  
    // Drop the table
    await queryInterface.dropTable("coupons");
  };
  
  module.exports = {
    up: createCouponTable,
    down: dropCouponTable,
  };