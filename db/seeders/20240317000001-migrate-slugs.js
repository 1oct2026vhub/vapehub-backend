'use strict';

const { Op } = require('sequelize');
const SlugManager = require('../../utils/slugManager');
const models = require('../../models');

module.exports = {
  async up(queryInterface, Sequelize) {
    return;
    const transaction = await queryInterface.sequelize.transaction();
    const slugManager = new SlugManager(models.SlugRelation);
    const logger = console;

    try {
      // Define the entities to process with their correct table names
      const entities = [
        { model: 'Brand', type: 'brand', table: 'brands' },
        { model: 'Blog', type: 'blog', table: 'blogs' },
        { model: 'BlogCategory', type: 'blog_category', table: 'blog_categories' },
        { model: 'Category', type: 'category', table: 'categories' },
        { model: 'Product', type: 'product', table: 'products' },
        { model: 'ProductVariant', type: 'product_variant', table: 'product_variants' },
        { model: 'Attribute', type: 'attribute', table: 'attributes' },
        { model: 'AttributeTerm', type: 'attribute_term', table: 'attribute_terms' }
      ];

      const results = {
        total: 0,
        processed: 0,
        modified: 0,
        errors: 0,
        details: []
      };

      // Process each entity type
      for (const entity of entities) {
        logger.log(`Processing ${entity.type} slugs...`);

        try {
          // Check if table has deleted_at column
          const tableInfo = await queryInterface.sequelize.query(
            `SHOW COLUMNS FROM ${entity.table} LIKE 'deleted_at'`,
            { type: Sequelize.QueryTypes.SELECT }
          );
          
          const hasDeletedAt = tableInfo.length > 0;
          
          // Fetch all records for the current entity
          const records = await queryInterface.sequelize.query(
            `SELECT id, slug FROM ${entity.table} WHERE slug IS NOT NULL${hasDeletedAt ? ' AND deleted_at IS NULL' : ''}`,
            { type: Sequelize.QueryTypes.SELECT, transaction }
          );

          results.total += records.length;
          logger.log(`Found ${records.length} records for ${entity.type}`);

          // Process each record
          for (const record of records) {
            try {
              let currentSlug = record.slug;
              let attempts = 0;
              const maxAttempts = 10;

              while (attempts < maxAttempts) {
                try {
                  // Try to create the slug relation
                  await slugManager.createOrUpdateSlug(
                    currentSlug,
                    entity.type,
                    record.id,
                    transaction
                  );

                  // If we get here, the slug was successfully created
                  if (attempts > 0) {
                    // Check if table has updated_at or updatedAt column
                    const tableInfo = await queryInterface.sequelize.query(
                      `SHOW COLUMNS FROM ${entity.table} WHERE FIELD IN ('updated_at', 'updatedAt')`,
                      { type: Sequelize.QueryTypes.SELECT }
                    );
                    
                    const updateTimestampField = tableInfo.length > 0 ? tableInfo[0].Field : null;
                    
                    // Update the original record with the modified slug
                    await queryInterface.sequelize.query(
                      `UPDATE ${entity.table} SET slug = :slug${updateTimestampField ? `, ${updateTimestampField} = NOW()` : ''} WHERE id = :id`,
                      {
                        replacements: { slug: currentSlug, id: record.id },
                        transaction
                      }
                    );
                    results.modified++;
                    results.details.push({
                      entity_type: entity.type,
                      entity_id: record.id,
                      original_slug: record.slug,
                      new_slug: currentSlug,
                      status: 'modified'
                    });
                  } else {
                    results.details.push({
                      entity_type: entity.type,
                      entity_id: record.id,
                      slug: currentSlug,
                      status: 'migrated'
                    });
                  }

                  results.processed++;
                  break;
                } catch (error) {
                  if (error.message.includes('already taken')) {
                    attempts++;
                    // Generate a new slug by appending a random number
                    currentSlug = `${record.slug}-${Math.floor(Math.random() * 1000)}`;
                  } else {
                    throw error;
                  }
                }
              }

              if (attempts >= maxAttempts) {
                throw new Error(`Failed to generate unique slug after ${maxAttempts} attempts for ${entity.type} ID ${record.id}`);
              }
            } catch (error) {
              results.errors++;
              results.details.push({
                entity_type: entity.type,
                entity_id: record.id,
                error: error.message,
                status: 'error'
              });
              logger.error(`Error processing ${entity.type} ID ${record.id}:`, error.message);
            }
          }
        } catch (error) {
          logger.error(`Error processing ${entity.type}:`, error);
          results.errors++;
          results.details.push({
            entity_type: entity.type,
            error: error.message,
            status: 'error'
          });
        }
      }

      // Log results
      logger.log('\nMigration Results:');
      logger.log(`Total records found: ${results.total}`);
      logger.log(`Successfully processed: ${results.processed}`);
      logger.log(`Modified slugs: ${results.modified}`);
      logger.log(`Errors: ${results.errors}`);

      if (results.details.length > 0) {
        logger.log('\nDetailed Results:');
        results.details.forEach(detail => {
          switch (detail.status) {
            case 'modified':
              logger.log(`Modified - ${detail.entity_type} ID ${detail.entity_id}: ${detail.original_slug} -> ${detail.new_slug}`);
              break;
            case 'migrated':
              logger.log(`Migrated - ${detail.entity_type} ID ${detail.entity_id}: ${detail.slug}`);
              break;
            case 'error':
              logger.log(`Error - ${detail.entity_type}${detail.entity_id ? ` ID ${detail.entity_id}` : ''}: ${detail.error}`);
              break;
          }
        });
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      logger.error('Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    return;
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // Remove all slug relations
      await queryInterface.bulkDelete('slug_relations', null, { transaction });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}; 