'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'mail_subscription' || table.tableName === 'MailSubscription')
    );
    
    if (tableExists) {
      console.log('mail_subscription table already exists, skipping creation');
      return;
    }
    
    console.log('Creating mail_subscription table...');
    await queryInterface.createTable('mail_subscription', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false
      },


      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    // Add indexes for better query performance (with existence checks)
    try {
      await queryInterface.addIndex('mail_subscription', ['user_id']);
      console.log('Added user_id index to mail_subscription');
    } catch (error) {
      console.log('user_id index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('mail_subscription', ['email']);
      console.log('Added email index to mail_subscription');
    } catch (error) {
      console.log('email index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('mail_subscription', ['deleted_at']);
      console.log('Added deleted_at index to mail_subscription');
    } catch (error) {
      console.log('deleted_at index might already exist:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('mail_subscription');
  }
};
