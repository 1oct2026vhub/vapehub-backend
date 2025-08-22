'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Step 1: Insert all products from old database
      await queryInterface.sequelize.query(`
        INSERT INTO products (name, slug, description, price, discount_price, stock_quantity, status, createdAt, updatedAt)
        SELECT 
            p.post_title as name,
            p.post_name as slug,
            p.post_content as description,
            COALESCE(NULLIF(pm_price.meta_value, ''), 0) as price,
            COALESCE(NULLIF(pm_sale_price.meta_value, ''), 0) as discount_price,
            COALESCE(NULLIF(pm_stock.meta_value, ''), 0) as stock_quantity,
            CASE 
                WHEN p.post_status = 'publish' THEN 'published'
                WHEN p.post_status = 'draft' THEN 'draft'
                ELSE 'archived'
            END as status,
            p.post_date as createdAt,
            p.post_modified as updatedAt
        FROM ${process.env.OLD_DB_NAME}.vh_posts p
        LEFT JOIN ${process.env.OLD_DB_NAME}.vh_postmeta pm_price ON p.ID = pm_price.post_id AND pm_price.meta_key = '_regular_price'
        LEFT JOIN ${process.env.OLD_DB_NAME}.vh_postmeta pm_sale_price ON p.ID = pm_sale_price.post_id AND pm_sale_price.meta_key = '_sale_price'
        LEFT JOIN ${process.env.OLD_DB_NAME}.vh_postmeta pm_stock ON p.ID = pm_stock.post_id AND pm_stock.meta_key = '_stock'
                 WHERE p.post_type = 'product'
         AND p.post_status IN ('publish', 'draft', 'private')
         AND p.post_name IS NOT NULL
         AND p.post_name != ''
      `, { transaction });

      // Step 2: Insert product images
      await queryInterface.sequelize.query(`
        INSERT INTO product_images (product_id, image_url, is_primary, createdAt, updatedAt)
        SELECT 
            p.id as product_id,
            pm.meta_value as image_url,
            CASE WHEN pm.meta_key = '_thumbnail_id' THEN 1 ELSE 0 END as is_primary,
            NOW(),
            NOW()
        FROM ${process.env.OLD_DB_NAME}.vh_postmeta pm
        JOIN ${process.env.OLD_DB_NAME}.vh_posts old_p ON pm.post_id = old_p.ID
        JOIN products p ON old_p.post_name COLLATE utf8mb4_unicode_ci = p.slug COLLATE utf8mb4_unicode_ci
        WHERE pm.meta_key IN ('_thumbnail_id', '_product_image_gallery')
        AND pm.meta_value IS NOT NULL
        AND pm.meta_value != ''
      `, { transaction });

      // Step 3: Insert product variants (if any)
      await queryInterface.sequelize.query(`
        INSERT INTO product_variants (product_id, slug, price, regular_price, discount_price, stock, stock_status, weight, length, width, height, description, barcode, status, created_at, updated_at)
        SELECT 
            p.id as product_id,
            SUBSTRING(pv.post_name, 1, 100) as slug,
            COALESCE(NULLIF(pm_price.meta_value, ''), 0) as price,
            COALESCE(NULLIF(pm_regular_price.meta_value, ''), 0) as regular_price,
            COALESCE(NULLIF(pm_sale_price.meta_value, ''), 0) as discount_price,
            COALESCE(NULLIF(pm_stock.meta_value, ''), 0) as stock,
            CASE 
                WHEN pm_stock_status.meta_value = 'instock' THEN 'in_stock'
                WHEN pm_stock_status.meta_value = 'outofstock' THEN 'out_of_stock'
                ELSE 'backorder'
            END as stock_status,
            COALESCE(NULLIF(pm_weight.meta_value, ''), 0) as weight,
            COALESCE(NULLIF(pm_length.meta_value, ''), 0) as length,
            COALESCE(NULLIF(pm_width.meta_value, ''), 0) as width,
            COALESCE(NULLIF(pm_height.meta_value, ''), 0) as height,
            pv.post_content as description,
            pm_barcode.meta_value as barcode,
            CASE 
                WHEN pv.post_status = 'publish' THEN 'active'
                ELSE 'inactive'
            END as status,
            pv.post_date as created_at,
            pv.post_modified as updated_at
        FROM ${process.env.OLD_DB_NAME}.vh_posts pv
        JOIN ${process.env.OLD_DB_NAME}.vh_posts parent ON pv.post_parent = parent.ID
        JOIN products p ON parent.post_name COLLATE utf8mb4_unicode_ci = p.slug COLLATE utf8mb4_unicode_ci
        LEFT JOIN ${process.env.OLD_DB_NAME}.vh_postmeta pm_price ON pv.ID = pm_price.post_id AND pm_price.meta_key = '_price'
        LEFT JOIN ${process.env.OLD_DB_NAME}.vh_postmeta pm_regular_price ON pv.ID = pm_regular_price.post_id AND pm_regular_price.meta_key = '_regular_price'
        LEFT JOIN ${process.env.OLD_DB_NAME}.vh_postmeta pm_sale_price ON pv.ID = pm_sale_price.post_id AND pm_sale_price.meta_key = '_sale_price'
        LEFT JOIN ${process.env.OLD_DB_NAME}.vh_postmeta pm_stock ON pv.ID = pm_stock.post_id AND pm_stock.meta_key = '_stock'
        LEFT JOIN ${process.env.OLD_DB_NAME}.vh_postmeta pm_stock_status ON pv.ID = pm_stock_status.post_id AND pm_stock_status.meta_key = '_stock_status'
        LEFT JOIN ${process.env.OLD_DB_NAME}.vh_postmeta pm_weight ON pv.ID = pm_weight.post_id AND pm_weight.meta_key = '_weight'
        LEFT JOIN ${process.env.OLD_DB_NAME}.vh_postmeta pm_length ON pv.ID = pm_length.post_id AND pm_length.meta_key = '_length'
        LEFT JOIN ${process.env.OLD_DB_NAME}.vh_postmeta pm_width ON pv.ID = pm_width.post_id AND pm_width.meta_key = '_width'
        LEFT JOIN ${process.env.OLD_DB_NAME}.vh_postmeta pm_height ON pv.ID = pm_height.post_id AND pm_height.meta_key = '_height'
        LEFT JOIN ${process.env.OLD_DB_NAME}.vh_postmeta pm_barcode ON pv.ID = pm_barcode.post_id AND pm_barcode.meta_key = '_barcode'
        WHERE pv.post_type = 'product_variation'
        AND pv.post_status IN ('publish', 'draft', 'private')
        AND pv.post_name IS NOT NULL
        AND pv.post_name != ''
      `, { transaction });

      // Step 4: Skip product-attribute relationships for now (can be added later)
      console.log('Skipping product-attribute relationships - can be migrated separately');

      // Step 5: Skip variant-attribute relationships for now (can be added later)
      console.log('Skipping variant-attribute relationships - can be migrated separately');

      // Step 6: Skip variant images for now (can be added later)
      console.log('Skipping variant images - can be migrated separately');

      // Step 7: Verify the migration
      const [productsCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM products
      `, { transaction });

      const [variantsCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_variants
      `, { transaction });

      const [imagesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_images
      `, { transaction });

      const [productAttributesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_attribute_terms
      `, { transaction });

      const [variantAttributesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_variant_attributes
      `, { transaction });

      const [variantImagesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM product_variant_images
      `, { transaction });

      // Step 8: Get detailed results
      const [sampleProducts] = await queryInterface.sequelize.query(`
        SELECT name, slug, price, status FROM products LIMIT 10
      `, { transaction });

      const [productsWithVariants] = await queryInterface.sequelize.query(`
        SELECT 
            p.name as product_name,
            COUNT(pv.id) as variant_count
        FROM products p
        LEFT JOIN product_variants pv ON p.id = pv.product_id
        GROUP BY p.id, p.name
        ORDER BY variant_count DESC
        LIMIT 10
      `, { transaction });

      const [productsWithAttributes] = await queryInterface.sequelize.query(`
        SELECT 
            p.name as product_name,
            GROUP_CONCAT(DISTINCT a.name SEPARATOR ', ') as attributes
        FROM products p
        LEFT JOIN product_attribute_terms pat ON p.id = pat.product_id
        LEFT JOIN attributes a ON pat.attribute_id = a.id
        GROUP BY p.id, p.name
        ORDER BY p.name
        LIMIT 10
      `, { transaction });

      console.log('Products migration completed successfully!');
      console.log(`Products migrated: ${productsCount[0].count}`);
      console.log(`Product variants migrated: ${variantsCount[0].count}`);
      console.log(`Product images migrated: ${imagesCount[0].count}`);
      console.log(`Product-attribute relationships: ${productAttributesCount[0].count}`);
      console.log(`Variant-attribute relationships: ${variantAttributesCount[0].count}`);
      console.log(`Variant images migrated: ${variantImagesCount[0].count}`);

      console.log('\nSample products:');
      sampleProducts.forEach(product => {
        console.log(`- ${product.name} (${product.slug}): £${product.price || 0}, ${product.status}`);
      });

      console.log('\nProducts with variants:');
      productsWithVariants.forEach(product => {
        console.log(`- ${product.product_name}: ${product.variant_count} variants`);
      });

      console.log('\nProducts with attributes:');
      productsWithAttributes.forEach(product => {
        console.log(`- ${product.product_name}: ${product.attributes || 'No attributes'}`);
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error('Products migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      // Remove all imported product data in reverse order
      await queryInterface.sequelize.query(`
        DELETE FROM product_variant_images 
        WHERE created_at >= (SELECT MAX(created_at) FROM product_variant_images) - INTERVAL 1 HOUR
      `, { transaction });

      await queryInterface.sequelize.query(`
        DELETE FROM product_variant_attributes 
        WHERE created_at >= (SELECT MAX(created_at) FROM product_variant_attributes) - INTERVAL 1 HOUR
      `, { transaction });

      await queryInterface.sequelize.query(`
        DELETE FROM product_attribute_terms 
        WHERE created_at >= (SELECT MAX(created_at) FROM product_attribute_terms) - INTERVAL 1 HOUR
      `, { transaction });

      await queryInterface.sequelize.query(`
        DELETE FROM product_variants 
        WHERE created_at >= (SELECT MAX(created_at) FROM product_variants) - INTERVAL 1 HOUR
      `, { transaction });

      await queryInterface.sequelize.query(`
        DELETE FROM product_images 
        WHERE createdAt >= (SELECT MAX(createdAt) FROM product_images) - INTERVAL 1 HOUR
      `, { transaction });

      await queryInterface.sequelize.query(`
        DELETE FROM products 
        WHERE createdAt >= (SELECT MAX(createdAt) FROM products) - INTERVAL 1 HOUR
      `, { transaction });

      await transaction.commit();
      console.log('Products migration rolled back successfully!');
    } catch (error) {
      await transaction.rollback();
      console.error('Products migration rollback failed:', error);
      throw error;
    }
  }
};
