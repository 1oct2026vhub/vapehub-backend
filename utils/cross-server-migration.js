const { Sequelize } = require('sequelize');
const oldDbConfig = require('../config/old-database');

class CrossServerMigration {
  constructor(environment = 'local') {
    this.environment = environment;
    this.oldDbConnection = null;
  }

  // Initialize connection to old database
  async connectToOldDb() {
    try {
      const config = oldDbConfig[this.environment];
      this.oldDbConnection = new Sequelize(config);
      
      // Test the connection
      await this.oldDbConnection.authenticate();
      console.log('✅ Connected to old database successfully');
      return this.oldDbConnection;
    } catch (error) {
      console.error('❌ Failed to connect to old database:', error.message);
      throw error;
    }
  }

  // Execute query on old database
  async queryOldDb(sql, options = {}) {
    if (!this.oldDbConnection) {
      await this.connectToOldDb();
    }
    return await this.oldDbConnection.query(sql, options);
  }

  // Fetch data from old database and return as array
  async fetchFromOldDb(sql, options = {}) {
    const [results] = await this.queryOldDb(sql, options);
    return results;
  }

  // Close old database connection
  async closeOldDbConnection() {
    if (this.oldDbConnection) {
      await this.oldDbConnection.close();
      console.log('🔌 Closed old database connection');
    }
  }

  // Batch process data from old database to avoid memory issues
  async batchProcessFromOldDb(sql, batchSize = 1000, processor) {
    const offsetSql = `${sql} LIMIT ${batchSize} OFFSET `;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const batchSql = offsetSql + offset;
      const batchData = await this.fetchFromOldDb(batchSql);
      
      if (batchData.length === 0) {
        hasMore = false;
      } else {
        await processor(batchData, offset);
        offset += batchSize;
        
        if (batchData.length < batchSize) {
          hasMore = false;
        }
      }
    }
  }

  // Create temporary table with data from old database
  async createTempTableFromOldDb(newDbQueryInterface, tempTableName, oldDbSql, transaction) {
    // First, create the temporary table structure
    await newDbQueryInterface.sequelize.query(`
      CREATE TEMPORARY TABLE ${tempTableName} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        data JSON
      )
    `, { transaction });

    // Fetch data from old database in batches
    await this.batchProcessFromOldDb(oldDbSql, 1000, async (batchData, offset) => {
      // Insert batch data into temporary table
      for (const row of batchData) {
        await newDbQueryInterface.sequelize.query(`
          INSERT INTO ${tempTableName} (data) VALUES (?)
        `, {
          replacements: [JSON.stringify(row)],
          transaction
        });
      }
    });
  }
}

module.exports = CrossServerMigration;
