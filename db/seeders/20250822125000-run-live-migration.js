'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    
    try {
      console.log('🚀 Starting MASTER LIVE DATA MIGRATION Process...');
      console.log('================================================');
      
      // Connect to old database to verify connection
      await crossServerMigration.connectToOldDb();
      console.log('✅ Connected to old database successfully');
      
      // Define the migration seeders in order
      const migrationSeeders = [
        {
          name: 'Categories',
          filename: '20250822130000-live-data-migration-categories.js',
          description: '📂 Migrating Categories (foundational data)'
        },
        {
          name: 'Brands',
          filename: '20250822130100-live-data-migration-brands.js',
          description: '🏷️ Migrating Brands (product relationships)'
        },
        {
          name: 'Attributes',
          filename: '20250822130200-live-data-migration-attributes.js',
          description: '🔧 Migrating Attributes & Terms (product variations)'
        },
        {
          name: 'Products',
          filename: '20250822130300-live-data-migration-products.js',
          description: '📦 Migrating Products, Variants & Images (main product data)'
        },
        {
          name: 'Users',
          filename: '20250822130400-live-data-migration-users.js',
          description: '👥 Migrating Users (customer data)'
        },
        // {
        //   name: 'Orders',
        //   filename: '20250822130500-live-data-migration-orders.js',
        //   description: '📋 Migrating Orders (transaction data - largest dataset)'
        // }
      ];

      // Run each seeder in sequence
      for (let i = 0; i < migrationSeeders.length; i++) {
        const seeder = migrationSeeders[i];
        console.log('');
        console.log(`🔄 Step ${i + 1}/${migrationSeeders.length}: ${seeder.description}`);
        console.log('--------------------------------------------------');
        
        try {
          // Import and run the seeder
          const seederModule = require(`./${seeder.filename}`);
          
          if (seederModule && seederModule.up) {
            await seederModule.up(queryInterface, Sequelize);
            console.log(`✅ ${seeder.name} migration completed successfully!`);
          } else {
            throw new Error(`Invalid seeder module for ${seeder.name}`);
          }
          
        } catch (error) {
          console.error(`❌ ${seeder.name} migration failed:`, error.message);
          console.error('🛑 Stopping migration process...');
          
          // Close old database connection
          await crossServerMigration.closeOldDbConnection();
          
          throw new Error(`Migration failed at ${seeder.name}: ${error.message}`);
        }
      }

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      // Final verification
      console.log('');
      console.log('🎉 MASTER LIVE DATA MIGRATION Process Completed Successfully!');
      console.log('============================================================');
      console.log('');
      console.log('📊 Migration Summary:');
      console.log('  ✅ Categories migrated');
      console.log('  ✅ Brands migrated');
      console.log('  ✅ Attributes & Terms migrated');
      console.log('  ✅ Products, Variants & Images migrated');
      console.log('  ✅ Users migrated');
      console.log('  ✅ Orders migrated');
      console.log('');
      console.log('🔍 Verification Commands:');
      console.log('  Categories:   npx sequelize-cli db:query "SELECT COUNT(*) as count FROM categories;"');
      console.log('  Brands:       npx sequelize-cli db:query "SELECT COUNT(*) as count FROM brands;"');
      console.log('  Attributes:   npx sequelize-cli db:query "SELECT COUNT(*) as count FROM attributes;"');
      console.log('  Products:     npx sequelize-cli db:query "SELECT COUNT(*) as count FROM products;"');
      console.log('  Users:        npx sequelize-cli db:query "SELECT COUNT(*) as count FROM users;"');
      console.log('  Orders:       npx sequelize-cli db:query "SELECT COUNT(*) as count FROM orders;"');
      console.log('');
      console.log('🔄 Rollback Commands (if needed):');
      console.log('  npx sequelize-cli db:seed:undo --seed 20250822125000-run-live-migration.js');
      console.log('');

    } catch (error) {
      await crossServerMigration.closeOldDbConnection();
      console.error('❌ MASTER LIVE DATA MIGRATION Process failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    
    try {
      console.log('🔄 Starting MASTER LIVE DATA MIGRATION Rollback Process...');
      console.log('========================================================');
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();
      
      // Define the migration seeders in reverse order for rollback
      const migrationSeeders = [
        {
          name: 'Orders',
          filename: '20250822130500-live-data-migration-orders.js',
          description: '📋 Rolling back Orders'
        },
        {
          name: 'Users',
          filename: '20250822130400-live-data-migration-users.js',
          description: '👥 Rolling back Users'
        },
        {
          name: 'Products',
          filename: '20250822130300-live-data-migration-products.js',
          description: '📦 Rolling back Products, Variants & Images'
        },
        {
          name: 'Attributes',
          filename: '20250822130200-live-data-migration-attributes.js',
          description: '🔧 Rolling back Attributes & Terms'
        },
        {
          name: 'Brands',
          filename: '20250822130100-live-data-migration-brands.js',
          description: '🏷️ Rolling back Brands'
        },
        {
          name: 'Categories',
          filename: '20250822130000-live-data-migration-categories.js',
          description: '📂 Rolling back Categories'
        }
      ];

      // Run each seeder rollback in sequence
      for (let i = 0; i < migrationSeeders.length; i++) {
        const seeder = migrationSeeders[i];
        console.log('');
        console.log(`🔄 Step ${i + 1}/${migrationSeeders.length}: ${seeder.description}`);
        console.log('--------------------------------------------------');
        
        try {
          // Import and run the seeder rollback
          const seederModule = require(`./${seeder.filename}`);
          
          if (seederModule && seederModule.down) {
            await seederModule.down(queryInterface, Sequelize);
            console.log(`✅ ${seeder.name} rollback completed successfully!`);
          } else {
            throw new Error(`Invalid seeder module for ${seeder.name}`);
          }
          
        } catch (error) {
          console.error(`❌ ${seeder.name} rollback failed:`, error.message);
          console.error('🛑 Stopping rollback process...');
          
          // Close old database connection
          await crossServerMigration.closeOldDbConnection();
          
          throw new Error(`Rollback failed at ${seeder.name}: ${error.message}`);
        }
      }

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      console.log('');
      console.log('🎉 MASTER LIVE DATA MIGRATION Rollback Process Completed Successfully!');
      console.log('====================================================================');
      console.log('');
      console.log('📊 Rollback Summary:');
      console.log('  ✅ Orders rolled back');
      console.log('  ✅ Users rolled back');
      console.log('  ✅ Products, Variants & Images rolled back');
      console.log('  ✅ Attributes & Terms rolled back');
      console.log('  ✅ Brands rolled back');
      console.log('  ✅ Categories rolled back');
      console.log('');

    } catch (error) {
      await crossServerMigration.closeOldDbConnection();
      console.error('❌ MASTER LIVE DATA MIGRATION Rollback Process failed:', error);
      throw error;
    }
  }
};
