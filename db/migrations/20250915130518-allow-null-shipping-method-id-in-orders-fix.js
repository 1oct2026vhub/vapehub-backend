'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('🔧 Allowing NULL values for shipping_method_id in orders table...');
      
      // Check if orders table exists
      const tables = await queryInterface.showAllTables();
      const tableExists = tables.some(table => {
        const tableName = typeof table === 'string' ? table : table.tableName || Object.values(table)[0];
        return tableName === 'orders';
      });
      
      if (!tableExists) {
        console.log('orders table does not exist, skipping constraint fix');
        return;
      }
      
      // First, drop the existing foreign key constraint using raw SQL
      try {
        await queryInterface.sequelize.query('ALTER TABLE orders DROP FOREIGN KEY orders_ibfk_3');
        console.log('✅ Dropped existing foreign key constraint');
      } catch (error) {
        console.log('⚠️  Foreign key constraint might not exist or have different name:', error.message);
      }

      // Modify the shipping_method_id column to allow NULL values using raw SQL
      await queryInterface.sequelize.query('ALTER TABLE orders MODIFY COLUMN shipping_method_id INT NULL');
      console.log('✅ Modified shipping_method_id column to allow NULL');

      // Recreate the foreign key constraint with SET NULL on delete using raw SQL
      await queryInterface.sequelize.query(`
        ALTER TABLE orders 
        ADD CONSTRAINT orders_ibfk_3 
        FOREIGN KEY (shipping_method_id) REFERENCES shipping_methods(id) 
        ON DELETE SET NULL ON UPDATE CASCADE
      `);
      console.log('✅ Recreated foreign key constraint with SET NULL');

      console.log('✅ shipping_method_id column now allows NULL values with proper foreign key constraint');
    } catch (error) {
      console.error('❌ Failed to modify shipping_method_id column:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      console.log('🔄 Reverting shipping_method_id column to NOT NULL...');
      
      // Check if orders table exists
      const tables = await queryInterface.showAllTables();
      const tableExists = tables.some(table => {
        const tableName = typeof table === 'string' ? table : table.tableName || Object.values(table)[0];
        return tableName === 'orders';
      });
      
      if (!tableExists) {
        console.log('orders table does not exist, skipping rollback');
        return;
      }
      
      // First, drop the current foreign key constraint using raw SQL
      try {
        await queryInterface.sequelize.query('ALTER TABLE orders DROP FOREIGN KEY orders_ibfk_3');
        console.log('✅ Dropped current foreign key constraint');
      } catch (error) {
        console.log('⚠️  Foreign key constraint might not exist:', error.message);
      }

      // Update any NULL values to prevent constraint violation
      // First, find a valid shipping_method_id to use as default
      const [validShippingMethod] = await queryInterface.sequelize.query(
        'SELECT id FROM shipping_methods ORDER BY id LIMIT 1',
        { type: Sequelize.QueryTypes.SELECT }
      );
      
      if (validShippingMethod && validShippingMethod.id) {
        await queryInterface.sequelize.query(
          `UPDATE orders SET shipping_method_id = ${validShippingMethod.id} WHERE shipping_method_id IS NULL`
        );
        console.log(`✅ Updated NULL values to prevent constraint violation using shipping_method_id = ${validShippingMethod.id}`);
      } else {
        // If no shipping methods exist, delete orders with NULL shipping_method_id
        await queryInterface.sequelize.query(
          'DELETE FROM orders WHERE shipping_method_id IS NULL'
        );
        console.log('✅ Deleted orders with NULL shipping_method_id (no valid shipping methods found)');
      }

      // Revert the column to NOT NULL using raw SQL
      await queryInterface.sequelize.query('ALTER TABLE orders MODIFY COLUMN shipping_method_id INT NOT NULL');
      console.log('✅ Reverted shipping_method_id column to NOT NULL');

      // Recreate the foreign key constraint with CASCADE on delete using raw SQL
      await queryInterface.sequelize.query(`
        ALTER TABLE orders 
        ADD CONSTRAINT orders_ibfk_3 
        FOREIGN KEY (shipping_method_id) REFERENCES shipping_methods(id) 
        ON DELETE CASCADE ON UPDATE CASCADE
      `);
      console.log('✅ Recreated foreign key constraint with CASCADE');

      console.log('✅ shipping_method_id column reverted to NOT NULL with CASCADE constraint');
    } catch (error) {
      console.error('❌ Failed to revert shipping_method_id column:', error);
      throw error;
    }
  }
};