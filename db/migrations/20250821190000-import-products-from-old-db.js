'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    
    try {
      console.log('Starting products migration from live database (cross-server)...');
      
      // Connect to old database
      await crossServerMigration.connectToOldDb();
      
      // Step 1: Extract products from old database
      console.log('Fetching products from old database...');
      const products = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          p.ID,
          p.post_title,
          p.post_name,
          p.post_content,
          p.post_status,
          p.post_date,
          p.post_modified,
          pm_price.meta_value as price,
          pm_sale_price.meta_value as sale_price,
          pm_stock.meta_value as stock
        FROM vh_posts p
        LEFT JOIN vh_postmeta pm_price ON p.ID = pm_price.post_id AND pm_price.meta_key = '_regular_price'
        LEFT JOIN vh_postmeta pm_sale_price ON p.ID = pm_sale_price.post_id AND pm_sale_price.meta_key = '_sale_price'
        LEFT JOIN vh_postmeta pm_stock ON p.ID = pm_stock.post_id AND pm_stock.meta_key = '_stock'
        WHERE p.post_type = 'product'
        AND p.post_status IN ('publish', 'draft', 'private')
        AND p.post_name IS NOT NULL 
        AND p.post_name != ''
      `);

      // Step 2: Insert products
      console.log(`Inserting ${products.length} products...`);
      for (const product of products) {
        await queryInterface.sequelize.query(`
          INSERT INTO products (name, slug, description, price, discount_price, stock_quantity, status, createdAt, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, {
          replacements: [
            product.post_title,
            product.post_name,
            product.post_content,
            parseFloat(product.price || 0),
            parseFloat(product.sale_price || 0),
            parseInt(product.stock || 0),
            product.post_status === 'publish' ? 'published' : product.post_status === 'draft' ? 'draft' : 'archived',
            product.post_date,
            product.post_modified
          ],
          transaction
        });
      }

      // Step 3: Extract product variants from old database
      console.log('Fetching product variants from old database...');
      const variants = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          pv.ID,
          pv.post_parent,
          pv.post_name,
          pv.post_content,
          pv.post_status,
          pv.post_date,
          pv.post_modified,
          p.post_name as parent_slug,
          pm_price.meta_value as price,
          pm_regular_price.meta_value as regular_price,
          pm_sale_price.meta_value as sale_price,
          pm_stock.meta_value as stock,
          pm_stock_status.meta_value as stock_status,
          pm_weight.meta_value as weight,
          pm_length.meta_value as length,
          pm_width.meta_value as width,
          pm_height.meta_value as height,
          pm_barcode.meta_value as barcode
        FROM vh_posts pv
        JOIN vh_posts p ON pv.post_parent = p.ID
        LEFT JOIN vh_postmeta pm_price ON pv.ID = pm_price.post_id AND pm_price.meta_key = '_price'
        LEFT JOIN vh_postmeta pm_regular_price ON pv.ID = pm_regular_price.post_id AND pm_regular_price.meta_key = '_regular_price'
        LEFT JOIN vh_postmeta pm_sale_price ON pv.ID = pm_sale_price.post_id AND pm_sale_price.meta_key = '_sale_price'
        LEFT JOIN vh_postmeta pm_stock ON pv.ID = pm_stock.post_id AND pm_stock.meta_key = '_stock'
        LEFT JOIN vh_postmeta pm_stock_status ON pv.ID = pm_stock_status.post_id AND pm_stock_status.meta_key = '_stock_status'
        LEFT JOIN vh_postmeta pm_weight ON pv.ID = pm_weight.post_id AND pm_weight.meta_key = '_weight'
        LEFT JOIN vh_postmeta pm_length ON pv.ID = pm_length.post_id AND pm_length.meta_key = '_length'
        LEFT JOIN vh_postmeta pm_width ON pv.ID = pm_width.post_id AND pm_width.meta_key = '_width'
        LEFT JOIN vh_postmeta pm_height ON pv.ID = pm_height.post_id AND pm_height.meta_key = '_height'
        LEFT JOIN vh_postmeta pm_barcode ON pv.ID = pm_barcode.post_id AND pm_barcode.meta_key = '_barcode'
        WHERE pv.post_type = 'product_variation'
        AND pv.post_status IN ('publish', 'draft', 'private')
      `);

      // Step 4: Insert product variants
      console.log(`Inserting ${variants.length} product variants...`);
      for (const variant of variants) {
        await queryInterface.sequelize.query(`
          INSERT INTO product_variants (product_id, slug, price, regular_price, discount_price, stock, stock_status, weight, length, width, height, description, barcode, status, created_at, updated_at)
          SELECT 
            prod.id as product_id,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          FROM products prod
          WHERE prod.slug = ?
        `, {
          replacements: [
            variant.post_name.substring(0, 100),
            parseFloat(variant.price || 0),
            parseFloat(variant.regular_price || 0),
            parseFloat(variant.sale_price || 0),
            parseInt(variant.stock || 0),
            variant.stock_status === 'instock' ? 'in_stock' : variant.stock_status === 'outofstock' ? 'out_of_stock' : 'backorder',
            parseFloat(variant.weight || 0),
            parseFloat(variant.length || 0),
            parseFloat(variant.width || 0),
            parseFloat(variant.height || 0),
            variant.post_content,
            variant.barcode,
            variant.post_status === 'publish' ? 'active' : 'inactive',
            variant.post_date,
            variant.post_modified,
            variant.parent_slug
          ],
          transaction
        });
      }

      // Step 5: Extract product images from old database
      console.log('Fetching product images from old database...');
      const productImages = await crossServerMigration.fetchFromOldDb(`
        SELECT 
          pm.post_id,
          pm.meta_value,
          pm.meta_key,
          p.post_name
        FROM vh_postmeta pm
        JOIN vh_posts p ON pm.post_id = p.ID
        WHERE pm.meta_key IN ('_thumbnail_id', '_product_image_gallery')
        AND pm.meta_value IS NOT NULL 
        AND pm.meta_value != ''
        AND p.post_type = 'product'
      `);

      // Step 6: Insert product images
      console.log(`Inserting ${productImages.length} product images...`);
      for (const image of productImages) {
        await queryInterface.sequelize.query(`
          INSERT INTO product_images (product_id, image_url, is_primary, createdAt, updatedAt)
          SELECT 
            p.id as product_id,
            ?,
            ?,
            NOW(),
            NOW()
          FROM products p
          WHERE p.slug = ?
        `, {
          replacements: [
            image.meta_value,
            image.meta_key === '_thumbnail_id' ? 1 : 0,
            image.post_name
          ],
          transaction
        });
      }

      // Step 7: Verification queries
      const [productsCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM products
      `, { transaction });

      const [variantsCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_variants
      `, { transaction });

      const [imagesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_images
      `, { transaction });

      console.log('Products migration completed successfully!');
      console.log(`Products migrated: ${productsCount[0].count}`);
      console.log(`Product variants migrated: ${variantsCount[0].count}`);
      console.log(`Product images migrated: ${imagesCount[0].count}`);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      await transaction.commit();
    } catch (error) {
      await crossServerMigration.closeOldDbConnection();
      await transaction.rollback();
      console.error('Products migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      await queryInterface.sequelize.query(`DELETE FROM product_images`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM product_variants`, { transaction });
      await queryInterface.sequelize.query(`DELETE FROM products`, { transaction });
      
      await transaction.commit();
      console.log('Products migration rolled back successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('Products migration rollback failed:', error);
      throw error;
    }
  }
};
