'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if table already exists
    const tableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'referrals' || table.tableName === 'Referrals')
    );
    
    if (tableExists) {
      console.log('referrals table already exists, skipping creation');
      return;
    }
    
    console.log('Creating referrals table...');
    await queryInterface.createTable('referrals', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            referrer_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            referred_user_id: {
                type: Sequelize.INTEGER,
                allowNull: false,
                references: {
                    model: 'users',
                    key: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE'
            },
            referral_code: {
                type: Sequelize.STRING(15),
                allowNull: false
            },
            points_awarded: {
                type: Sequelize.INTEGER,
                allowNull: false,
                defaultValue: 0
            },
            status: {
                type: Sequelize.ENUM('pending', 'completed', 'failed'),
                defaultValue: 'pending'
            },
            created_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            updated_at: {
                type: Sequelize.DATE,
                allowNull: false,
                defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
            },
            deleted_at: {
                type: Sequelize.DATE,
                allowNull: true
            }
        });

        // Add indexes for better query performance (with existence checks)
        try {
            await queryInterface.addIndex('referrals', ['referrer_id']);
            console.log('Added referrer_id index to referrals');
        } catch (error) {
            console.log('referrer_id index might already exist:', error.message);
        }
        
        try {
            await queryInterface.addIndex('referrals', ['referred_user_id']);
            console.log('Added referred_user_id index to referrals');
        } catch (error) {
            console.log('referred_user_id index might already exist:', error.message);
        }
        
        try {
            await queryInterface.addIndex('referrals', ['status']);
            console.log('Added status index to referrals');
        } catch (error) {
            console.log('status index might already exist:', error.message);
        }
        
        try {
            await queryInterface.addIndex('referrals', ['deleted_at']);
            console.log('Added deleted_at index to referrals');
        } catch (error) {
            console.log('deleted_at index might already exist:', error.message);
        }

        // Add unique constraint for referred_user_id (with existence check)
        try {
            await queryInterface.addConstraint('referrals', {
                fields: ['referred_user_id'],
                type: 'unique',
                name: 'unique_referred_user'
            });
            console.log('Added unique constraint for referred_user_id');
        } catch (error) {
            console.log('unique constraint might already exist:', error.message);
        }
    },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('referrals');
  }
}; 