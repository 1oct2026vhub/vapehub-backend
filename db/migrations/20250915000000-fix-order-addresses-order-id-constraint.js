'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🔧 Fixing order_addresses order_id constraint...');
    
    try {
      // Check if table exists
      const tables = await queryInterface.showAllTables();
      const tableExists = tables.some(table => {
        const tableName = typeof table === 'string' ? table : table.tableName || Object.values(table)[0];
        return tableName === 'order_addresses';
      });
      
      if (!tableExists) {
        console.log('order_addresses table does not exist, skipping constraint fix');
        return;
      }
      
      // First, drop the existing foreign key constraint
      try {
        await queryInterface.removeConstraint('order_addresses', 'order_addresses_ibfk_1');
        console.log('✅ Dropped existing foreign key constraint');
      } catch (error) {
        console.log('⚠️  Foreign key constraint might not exist or have different name:', error.message);
      }

      // Modify the order_id column to allow NULL values
      await queryInterface.changeColumn('order_addresses', 'order_id', {
        type: Sequelize.INTEGER,
        allowNull: true, // Allow NULL values
      });

      // Recreate the foreign key constraint with SET NULL on delete
      await queryInterface.addConstraint('order_addresses', {
        fields: ['order_id'],
        type: 'foreign key',
        name: 'order_addresses_ibfk_1',
        references: {
          table: 'orders',
          field: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      
      console.log('✅ order_addresses order_id constraint fixed successfully!');
      
    } catch (error) {
      console.error('❌ Error fixing order_addresses constraint:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      console.log('🔄 Reverting order_id column to NOT NULL...');
      
      // First, drop the current foreign key constraint
      try {
        await queryInterface.removeConstraint('order_addresses', 'order_addresses_ibfk_1');
        console.log('✅ Dropped current foreign key constraint');
      } catch (error) {
        console.log('⚠️  Foreign key constraint might not exist:', error.message);
      }

      // Update any NULL values to prevent constraint violation
      // First, find a valid order_id to use as default
      const [validOrder] = await queryInterface.sequelize.query(
        'SELECT id FROM orders ORDER BY id LIMIT 1',
        { type: Sequelize.QueryTypes.SELECT }
      );
      
      if (validOrder && validOrder.id) {
        await queryInterface.sequelize.query(
          `UPDATE order_addresses SET order_id = ${validOrder.id} WHERE order_id IS NULL`,
          { type: Sequelize.QueryTypes.UPDATE }
        );
        console.log(`✅ Updated NULL values to prevent constraint violation using order_id = ${validOrder.id}`);
      } else {
        // If no orders exist, delete NULL order_addresses records
        await queryInterface.sequelize.query(
          'DELETE FROM order_addresses WHERE order_id IS NULL',
          { type: Sequelize.QueryTypes.DELETE }
        );
        console.log('✅ Deleted order_addresses records with NULL order_id (no valid orders found)');
      }

      // Revert the column to NOT NULL
      await queryInterface.changeColumn('order_addresses', 'order_id', {
        type: Sequelize.INTEGER,
        allowNull: false, // Revert to NOT NULL
      });

      // Recreate the foreign key constraint with CASCADE on delete
      await queryInterface.addConstraint('order_addresses', {
        fields: ['order_id'],
        type: 'foreign key',
        name: 'order_addresses_ibfk_1',
        references: {
          table: 'orders',
          field: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      });

      console.log('✅ order_id column reverted to NOT NULL with CASCADE constraint');
    } catch (error) {
      console.error('❌ Failed to revert order_id column:', error);
      throw error;
    }
  }
};
