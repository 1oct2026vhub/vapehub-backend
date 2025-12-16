'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Check if table already exists
      const tableExists = await queryInterface.showAllTables().then(tables => 
        tables.some(table => table.tableName === 'order_items' || table.tableName === 'OrderItems')
      );
      
      if (tableExists) {
        console.log('order_items table already exists, checking id column type...');
        
        // Get table description to check current id column type
        const tableDescription = await queryInterface.describeTable('order_items');
        
        // Check if id column is INTEGER and needs to be changed to BIGINT
        if (tableDescription.id && tableDescription.id.type === 'INTEGER') {
          console.log('Converting id column from INTEGER to BIGINT...');
          
          // Use raw SQL to alter the column type from INTEGER to BIGINT
          await queryInterface.sequelize.query(
            'ALTER TABLE `order_items` MODIFY COLUMN `id` BIGINT NOT NULL AUTO_INCREMENT;',
            { transaction }
          );
          
          console.log('✅ Successfully converted id column to BIGINT');
        } else if (tableDescription.id && tableDescription.id.type === 'BIGINT') {
          console.log('ℹ️  id column is already BIGINT, skipping...');
        } else {
          console.log('⚠️  id column type is:', tableDescription.id?.type || 'unknown');
        }
      } else {
        console.log('order_items table does not exist, creating with BIGINT id...');
        // If table doesn't exist (shouldn't happen if migrations run in order), create it
        await queryInterface.createTable('order_items', {
          id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
          },
          order_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'orders',
              key: 'id',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
          product_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'products',
              key: 'id',
            },
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
          variant_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            references: {
              model: 'product_variants',
              key: 'id',
            },
            onDelete: 'SET NULL',
            onUpdate: 'CASCADE',
          },
          unit: {
            type: Sequelize.STRING,
            allowNull: false,
          },
          unit_price: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
          },
          quantity: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1,
          },
          discount_price: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
          },
          total: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
          },
          createdAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          },
          updatedAt: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
          },
        }, { transaction });
        
        console.log('✅ Created order_items table with BIGINT id');
      }
      
      await transaction.commit();
      console.log('🎉 Migration completed successfully!');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Migration failed:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Check if table exists
      const tableExists = await queryInterface.showAllTables().then(tables => 
        tables.some(table => table.tableName === 'order_items' || table.tableName === 'OrderItems')
      );
      
      if (tableExists) {
        const tableDescription = await queryInterface.describeTable('order_items');
        
        // If id is BIGINT, revert it back to INTEGER
        if (tableDescription.id && tableDescription.id.type === 'BIGINT') {
          console.log('Reverting id column from BIGINT to INTEGER...');
          
          await queryInterface.sequelize.query(
            'ALTER TABLE `order_items` MODIFY COLUMN `id` INTEGER NOT NULL AUTO_INCREMENT;',
            { transaction }
          );
          
          console.log('✅ Reverted id column to INTEGER');
        }
      }
      
      await transaction.commit();
      console.log('✅ Rollback completed successfully!');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  },
};
