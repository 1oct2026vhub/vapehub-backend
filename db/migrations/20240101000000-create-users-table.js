'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'users' || table.tableName === 'Users')
    );
    
    if (tableExists) {
      console.log('users table already exists, skipping creation');
      return;
    }
    
    console.log('Creating users table...');
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        unique: true,
        allowNull: false
      },
      updated_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      first_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      last_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      phone: {
        type: Sequelize.STRING,
        allowNull: true
      },
      email_verified_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      password: {
        type: Sequelize.STRING,
        allowNull: false
      },
      profile_pic_url: {
        type: Sequelize.STRING,
        allowNull: true
      },
      gender: {
        type: Sequelize.STRING,
        allowNull: true
      },
      dob: {
        type: Sequelize.DATE,
        allowNull: true
      },
      token: {
        type: Sequelize.STRING,
        allowNull: true
      },
      token_expiry: {
        type: Sequelize.DATE,
        allowNull: true
      },
      remember_token: {
        type: Sequelize.STRING,
        allowNull: true
      },
      int_field: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      referral_code: {
        type: Sequelize.STRING(15),
        allowNull: true,
        unique: true
      },

      loyalty_points: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total loyalty points earned by the user'
      },
      receive_promotions: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      blocked: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      super_user: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
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
      await queryInterface.addIndex('users', ['email']);
      console.log('Added email index to users');
    } catch (error) {
      console.log('email index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('users', ['phone']);
      console.log('Added phone index to users');
    } catch (error) {
      console.log('phone index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('users', ['referral_code']);
      console.log('Added referral_code index to users');
    } catch (error) {
      console.log('referral_code index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('users', ['loyalty_points']);
      console.log('Added loyalty_points index to users');
    } catch (error) {
      console.log('loyalty_points index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('users', ['blocked']);
      console.log('Added blocked index to users');
    } catch (error) {
      console.log('blocked index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('users', ['super_user']);
      console.log('Added super_user index to users');
    } catch (error) {
      console.log('super_user index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('users', ['receive_promotions']);
      console.log('Added receive_promotions index to users');
    } catch (error) {
      console.log('receive_promotions index might already exist:', error.message);
    }
    
    try {
      await queryInterface.addIndex('users', ['deleted_at']);
      console.log('Added deleted_at index to users');
    } catch (error) {
      console.log('deleted_at index might already exist:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('users');
  }
}; 