'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if roleId column exists
    const tableInfo = await queryInterface.describeTable('users');
    
    if (!tableInfo.roleId) {
      console.log('roleId column does not exist in users, skipping foreign key creation');
      return;
    }
    
    // Check if roles table exists
    const rolesTableExists = await queryInterface.showAllTables().then(tables => 
      tables.some(table => table.tableName === 'roles')
    );
    
    if (!rolesTableExists) {
      console.log('roles table does not exist, skipping foreign key creation');
      return;
    }
    
    // Add index for roleId (with existence check)
    try {
      await queryInterface.addIndex('users', ['roleId']);
      console.log('Added roleId index to users');
    } catch (error) {
      console.log('roleId index might already exist:', error.message);
    }

    // Add foreign key constraint for roleId using raw SQL for better compatibility
    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE users 
        ADD CONSTRAINT users_roleId_fkey 
        FOREIGN KEY (roleId) 
        REFERENCES roles(id) 
        ON DELETE SET NULL 
        ON UPDATE CASCADE
      `);
      console.log('Added foreign key constraint for roleId');
    } catch (error) {
      console.log('Foreign key constraint might already exist:', error.message);
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove the foreign key constraint (with existence check)
    try {
      await queryInterface.sequelize.query(`
        ALTER TABLE users 
        DROP FOREIGN KEY users_roleId_fkey
      `);
      console.log('Removed foreign key constraint for roleId');
    } catch (error) {
      console.log('Foreign key constraint might not exist:', error.message);
    }
    
    // Remove the index (with existence check)
    try {
      await queryInterface.removeIndex('users', ['roleId']);
      console.log('Removed roleId index from users');
    } catch (error) {
      console.log('roleId index might not exist:', error.message);
    }
  }
}; 