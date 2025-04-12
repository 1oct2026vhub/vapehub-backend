'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Change the enum type
    if (queryInterface.sequelize.options.dialect === 'postgres') {
      // For PostgreSQL
      await queryInterface.sequelize.query(`
        ALTER TYPE "enum_orders_status" ADD VALUE IF NOT EXISTS 'packed';
        ALTER TYPE "enum_orders_status" ADD VALUE IF NOT EXISTS 'out_for_delivery';
      `);
    } else {
      // For MySQL
      await queryInterface.sequelize.query(`
        ALTER TABLE orders 
        MODIFY COLUMN status ENUM(
          'draft',
          'pending',
          'processing',
          'packed',
          'shipped',
          'out_for_delivery',
          'delivered',
          'completed',
          'fail',
          'cancel',
          'return_requested',
          'return_approved',
          'return_received',
          'refunded'
        ) NOT NULL DEFAULT 'draft';
      `);
    }
  },

  down: async (queryInterface, Sequelize) => {
    // First, update any orders using the new statuses to appropriate old statuses
    await queryInterface.sequelize.query(`
      UPDATE orders 
      SET status = 'processing' 
      WHERE status IN ('packed', 'out_for_delivery');
    `);

    if (queryInterface.sequelize.options.dialect === 'postgres') {
      // For PostgreSQL - Note: PostgreSQL cannot remove enum values
      // We'll need to create a new type and swap it
      await queryInterface.sequelize.query(`
        -- Create a new enum type
        CREATE TYPE "enum_orders_status_new" AS ENUM (
          'draft',
          'pending',
          'processing',
          'shipped',
          'delivered',
          'completed',
          'fail',
          'cancel',
          'return_requested',
          'return_approved',
          'return_received',
          'refunded'
        );
        
        -- Alter the column to use the new enum type
        ALTER TABLE orders 
        ALTER COLUMN status TYPE "enum_orders_status_new" 
        USING status::text::"enum_orders_status_new";
        
        -- Drop the old enum type
        DROP TYPE "enum_orders_status";
        
        -- Rename the new enum type to the original name
        ALTER TYPE "enum_orders_status_new" 
        RENAME TO "enum_orders_status";
      `);
    } else {
      // For MySQL
      await queryInterface.sequelize.query(`
        ALTER TABLE orders 
        MODIFY COLUMN status ENUM(
          'draft',
          'pending',
          'processing',
          'shipped',
          'delivered',
          'completed',
          'fail',
          'cancel',
          'return_requested',
          'return_approved',
          'return_received',
          'refunded'
        ) NOT NULL DEFAULT 'draft';
      `);
    }
  }
}; 