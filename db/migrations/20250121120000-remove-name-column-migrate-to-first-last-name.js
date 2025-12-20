'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Starting migration to remove name column and ensure first_name/last_name exist...');
      
      // Get current table structure
      const tableDescription = await queryInterface.describeTable('users');
      const hasNameColumn = !!tableDescription.name;
      const hasFirstNameColumn = !!tableDescription.first_name;
      const hasLastNameColumn = !!tableDescription.last_name;
      
      console.log(`📊 Current schema status:
        - name column exists: ${hasNameColumn}
        - first_name column exists: ${hasFirstNameColumn}
        - last_name column exists: ${hasLastNameColumn}`);
      
      // Step 1: Ensure first_name and last_name columns exist
      if (!hasFirstNameColumn) {
        console.log('➕ Adding first_name column...');
        await queryInterface.addColumn('users', 'first_name', {
          type: Sequelize.STRING,
          allowNull: true
        }, { transaction });
        console.log('✅ Added first_name column');
      } else {
        console.log('ℹ️  first_name column already exists');
      }
      
      if (!hasLastNameColumn) {
        console.log('➕ Adding last_name column...');
        await queryInterface.addColumn('users', 'last_name', {
          type: Sequelize.STRING,
          allowNull: true
        }, { transaction });
        console.log('✅ Added last_name column');
      } else {
        console.log('ℹ️  last_name column already exists');
      }
      
      // Step 2: If name column exists, migrate data to first_name/last_name
      if (hasNameColumn) {
        console.log('🔄 Migrating data from name column to first_name/last_name...');
        
        // Get all users with name column
        const usersWithName = await queryInterface.sequelize.query(`
          SELECT id, name 
          FROM users 
          WHERE name IS NOT NULL 
            AND name != ''
            AND (first_name IS NULL OR last_name IS NULL)
        `, {
          type: queryInterface.sequelize.QueryTypes.SELECT,
          transaction
        });
        
        console.log(`📝 Found ${usersWithName.length} users with name to migrate`);
        
        // Migrate each user's name data
        for (const user of usersWithName) {
          const fullName = (user.name || '').trim();
          let firstName = fullName;
          let lastName = '';
          
          // Split name on first space
          if (fullName.includes(' ')) {
            const spaceIndex = fullName.indexOf(' ');
            firstName = fullName.substring(0, spaceIndex).trim();
            lastName = fullName.substring(spaceIndex + 1).trim();
          }
          
          // Only update if first_name or last_name is currently null/empty
          await queryInterface.sequelize.query(`
            UPDATE users 
            SET first_name = COALESCE(NULLIF(first_name, ''), :firstName),
                last_name = COALESCE(NULLIF(last_name, ''), :lastName)
            WHERE id = :userId
          `, {
            replacements: {
              firstName: firstName || null,
              lastName: lastName || null,
              userId: user.id
            },
            transaction
          });
        }
        
        console.log('✅ Data migration completed');
        
        // Step 3: Remove name column
        console.log('🗑️  Removing name column...');
        await queryInterface.removeColumn('users', 'name', { transaction });
        console.log('✅ Removed name column');
      } else {
        console.log('ℹ️  name column does not exist, nothing to migrate');
      }
      
      await transaction.commit();
      console.log('🎉 Migration completed successfully!');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back name column migration...');
      
      const tableDescription = await queryInterface.describeTable('users');
      const hasNameColumn = !!tableDescription.name;
      const hasFirstNameColumn = !!tableDescription.first_name;
      const hasLastNameColumn = !!tableDescription.last_name;
      
      // Step 1: Add name column back if it doesn't exist
      if (!hasNameColumn && (hasFirstNameColumn || hasLastNameColumn)) {
        console.log('➕ Adding name column back...');
        await queryInterface.addColumn('users', 'name', {
          type: Sequelize.STRING,
          allowNull: true
        }, { transaction });
        console.log('✅ Added name column back');
        
        // Step 2: Populate name column from first_name and last_name
        console.log('🔄 Populating name column from first_name/last_name...');
        await queryInterface.sequelize.query(`
          UPDATE users 
          SET name = TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')))
          WHERE (first_name IS NOT NULL OR last_name IS NOT NULL)
        `, { transaction });
        console.log('✅ Populated name column');
      } else if (hasNameColumn) {
        console.log('ℹ️  name column already exists, skipping');
      }
      
      await transaction.commit();
      console.log('✅ Rollback completed successfully!');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
};
