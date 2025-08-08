'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'testimonials' || table.tableName === 'Testimonials')
    );
    
    if (tableExists) {
      console.log('testimonials table already exists, skipping creation');
      return;
    }
    
    console.log('Creating testimonials table...');
    await queryInterface.createTable('testimonials', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'User who wrote this testimonial'
      },
      product_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'products',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Product this testimonial is about (optional)'
      },
      rating: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: 'Rating from 1 to 5'
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Testimonial content'
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      },
      deletedAt: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    // Add indexes for better query performance (with existence checks)
    try {
      await queryInterface.addIndex('testimonials', ['user_id']);
      console.log('Added user_id index to testimonials');
    } catch (error) {
      console.log('user_id index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('testimonials', ['product_id']);
      console.log('Added product_id index to testimonials');
    } catch (error) {
      console.log('product_id index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('testimonials', ['rating']);
      console.log('Added rating index to testimonials');
    } catch (error) {
      console.log('rating index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('testimonials', ['deletedAt']);
      console.log('Added deletedAt index to testimonials');
    } catch (error) {
      console.log('deletedAt index might already exist:', error.message);
    }
    
    // Add composite index for product testimonials
    try {
      await queryInterface.addIndex('testimonials', ['product_id', 'rating']);
      console.log('Added composite index to testimonials');
    } catch (error) {
      console.log('Composite index might already exist:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('testimonials');
  }
};
