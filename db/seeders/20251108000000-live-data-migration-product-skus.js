'use strict';

console.log('[Seeder] Loading 20251108000000-live-data-migration-product-skus.js');

const CrossServerMigration = require('../../utils/cross-server-migration');

const timestamp = () => new Date().toISOString();
const info = message => console.log(`[${timestamp()}] ${message}`);
const warn = message => console.warn(`[${timestamp()}] ${message}`);
const errorLog = message => console.error(`[${timestamp()}] ${message}`);

const getTableName = (baseName) => {
  const prefix = process.env.OLD_DB_TABLE_PREFIX || 'vh_';
  return `${prefix}${baseName}`;
};

module.exports = {
  async up(queryInterface) {
    let crossServerMigration;
    let transaction;

    try {
      const configuredEnv = process.env.OLD_DB_ENVIRONMENT || process.env.NODE_ENV || 'local';
      info(`Initializing CrossServerMigration helper with environment: ${configuredEnv}`);
      crossServerMigration = new CrossServerMigration(configuredEnv);
      info('CrossServerMigration initialized successfully');

      info('🚀 LIVE DATA MIGRATION: Starting product SKU sync from old database...');
      info('Connecting to old database...');

      await crossServerMigration.connectToOldDb();
      info('✅ Connected to old database');

      const productMetaLookupTable = getTableName('wc_product_meta_lookup');

      const skuRows = await crossServerMigration.fetchFromOldDb(`
        SELECT DISTINCT
          product_id,
          TRIM(sku) AS sku
        FROM ${productMetaLookupTable}
        WHERE sku IS NOT NULL
          AND sku <> ''
        ORDER BY product_id ASC
      `);

      info(`✅ Found ${skuRows.length} SKU record(s) to process`);

      transaction = await queryInterface.sequelize.transaction();

      let updatedCount = 0;
      let skippedMissingProduct = 0;
      let skippedBlankSku = 0;
      let variantsUpdated = 0;

      for (const [index, row] of skuRows.entries()) {
        const productId = row.product_id;
        const sku = row.sku ? row.sku.trim() : null;

        if (!sku) {
          skippedBlankSku++;
          warn(`Skipping record ${index + 1}: product_id=${productId} has blank SKU after trim`);
          continue;
        }

        info(`Processing record ${index + 1}/${skuRows.length}: product_id=${productId}, sku=${sku}`);

        const [productUpdateResult] = await queryInterface.sequelize.query(
          `
            UPDATE products
            SET sku = ?, updatedAt = NOW()
            WHERE id = ?
          `,
          {
            replacements: [sku, productId],
            transaction
          }
        );

        const productAffectedRows =
          typeof productUpdateResult?.affectedRows === 'number'
            ? productUpdateResult.affectedRows
            : typeof productUpdateResult === 'number'
              ? productUpdateResult
              : productUpdateResult?.rowCount || 0;

        if (productAffectedRows > 0) {
          updatedCount += productAffectedRows;
          info(`✔️  Updated product_id=${productId} with sku=${sku}`);
        } else {
          skippedMissingProduct++;
          warn(`⚠️  No matching product found locally for product_id=${productId}; SKU skipped`);
          continue;
        }

        const [variantUpdateResult] = await queryInterface.sequelize.query(
          `
            UPDATE product_variants
            SET sku = ?, updated_at = NOW()
            WHERE product_id = ?
          `,
          {
            replacements: [sku, productId],
            transaction
          }
        );

        const variantAffectedRows =
          typeof variantUpdateResult?.affectedRows === 'number'
            ? variantUpdateResult.affectedRows
            : typeof variantUpdateResult === 'number'
              ? variantUpdateResult
              : variantUpdateResult?.rowCount || 0;

        if (variantAffectedRows > 0) {
          variantsUpdated += variantAffectedRows;
          info(`    ↳ Applied sku=${sku} to ${variantAffectedRows} variant(s) for product_id=${productId}`);
        }
      }

      await transaction.commit();

      info('📊 PRODUCT SKU SYNC SUMMARY');
      info(`   • Products updated: ${updatedCount}`);
      info(`   • SKUs skipped (blank after trim): ${skippedBlankSku}`);
      info(`   • SKUs skipped (product missing locally): ${skippedMissingProduct}`);
      info(`   • Variants updated with fallback SKU: ${variantsUpdated}`);
      info('🎉 LIVE DATA MIGRATION: Product SKU sync completed successfully!');
    } catch (error) {
      if (transaction) {
        await transaction.rollback();
      }
      errorLog('❌ LIVE DATA MIGRATION: Product SKU sync failed:');
      errorLog(error.stack || error.message || error);
      throw error;
    } finally {
      if (crossServerMigration) {
        try {
          info('Closing connection to old database...');
          await crossServerMigration.closeOldDbConnection();
          info('✅ Old database connection closed');
        } catch (closeError) {
          errorLog('⚠️  Failed to close old database connection cleanly:');
          errorLog(closeError.stack || closeError.message || closeError);
        }
      }
    }
  },

  async down(queryInterface) {
    let transaction;

    try {
      transaction = await queryInterface.sequelize.transaction();

      info('🔄 Rolling back LIVE DATA MIGRATION: clearing product SKUs...');

      await queryInterface.sequelize.query(
        `
          UPDATE products
          SET sku = NULL,
              updatedAt = NOW()
        `,
        { transaction }
      );

      await queryInterface.sequelize.query(
        `
          UPDATE product_variants
          SET sku = NULL,
              updated_at = NOW()
        `,
        { transaction }
      );

      await transaction.commit();
      info('✅ Product SKUs cleared successfully');
    } catch (error) {
      if (transaction) {
        await transaction.rollback();
      }
      errorLog('❌ Failed to clear product SKUs:');
      errorLog(error.stack || error.message || error);
      throw error;
    }
  },
};