'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface /*, Sequelize */) {
    // Convert all TEXT columns in the current MySQL database to LONGTEXT
    const [columns] = await queryInterface.sequelize.query(`
      SELECT
        TABLE_NAME,
        COLUMN_NAME,
        IS_NULLABLE,
        CONCAT(
          'ALTER TABLE \`', TABLE_NAME, '\` MODIFY COLUMN \`', COLUMN_NAME, '\` LONGTEXT ',
          CASE WHEN IS_NULLABLE = 'NO' THEN 'NOT NULL' ELSE 'NULL' END,
          ';'
        ) AS alter_sql
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND DATA_TYPE = 'text'
        AND TABLE_NAME NOT IN ('SequelizeMeta')
    `);

    for (const col of columns) {
      // Uncomment for debugging to see generated SQL:
      // console.log('Executing:', col.alter_sql);
      await queryInterface.sequelize.query(col.alter_sql);
    }
  },

  async down(queryInterface /*, Sequelize */) {
    // Revert LONGTEXT columns back to TEXT
    // NOTE: This will convert *all* LONGTEXT columns (except SequelizeMeta) to TEXT,
    // including any that might have been LONGTEXT before this migration.
    const [columns] = await queryInterface.sequelize.query(`
      SELECT
        TABLE_NAME,
        COLUMN_NAME,
        IS_NULLABLE,
        CONCAT(
          'ALTER TABLE \`', TABLE_NAME, '\` MODIFY COLUMN \`', COLUMN_NAME, '\` TEXT ',
          CASE WHEN IS_NULLABLE = 'NO' THEN 'NOT NULL' ELSE 'NULL' END,
          ';'
        ) AS alter_sql
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND DATA_TYPE = 'longtext'
        AND TABLE_NAME NOT IN ('SequelizeMeta')
    `);

    for (const col of columns) {
      await queryInterface.sequelize.query(col.alter_sql);
    }
  }
};


