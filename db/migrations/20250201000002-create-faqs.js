'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'FAQs' || table.tableName === 'faqs')
    );
    
    if (tableExists) {
      console.log('FAQs table already exists, skipping creation');
      return;
    }
    
    console.log('Creating FAQs table...');
    await queryInterface.createTable('FAQs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
      },
      entity_type: {
        type: Sequelize.STRING,
        allowNull: true,
        comment: 'Type of entity (e.g., product, category, brand, variant, common)'
      },
      entity_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'ID of the related entity'
      },
      question: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'FAQ question'
      },
      answer: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'FAQ answer'
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
      await queryInterface.addIndex('FAQs', ['entity_type']);
      console.log('Added entity_type index to FAQs');
    } catch (error) {
      console.log('entity_type index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('FAQs', ['entity_id']);
      console.log('Added entity_id index to FAQs');
    } catch (error) {
      console.log('entity_id index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('FAQs', ['deletedAt']);
      console.log('Added deletedAt index to FAQs');
    } catch (error) {
      console.log('deletedAt index might already exist:', error.message);
    }
    
    // Add composite index for entity lookups
    try {
      await queryInterface.addIndex('FAQs', ['entity_type', 'entity_id']);
      console.log('Added composite index to FAQs');
    } catch (error) {
      console.log('Composite index might already exist:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('FAQs');
  }
};
