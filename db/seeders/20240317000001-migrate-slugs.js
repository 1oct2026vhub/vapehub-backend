'use strict';

const { Op } = require('sequelize');
const SlugManager = require('../../utils/slugManager');
const models = require('../../models');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const slugManager = new SlugManager(models.SlugRelation);
    const logger = console;

    try {
      // Define the entities to process with their correct table names
      const entities = [
        { model: 'Brand', type: 'brand', table: 'brands' },
        { model: 'Blog', type: 'blog', table: 'blogs' },
        { model: 'Category', type: 'category', table: 'categories' },
        { model: 'Product', type: 'product', table: 'products' },
        { model: 'ProductVariant', type: 'product_variant', table: 'product_variants' }
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

        // Fetch all records for the current entity
        const records = await queryInterface.sequelize.query(
          `SELECT id, slug FROM ${entity.table} WHERE slug IS NOT NULL`,
          { type: Sequelize.QueryTypes.SELECT, transaction }
        );

        results.total += records.length;

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
                  // Update the original record with the modified slug
                  await queryInterface.sequelize.query(
                    `UPDATE ${entity.table} SET slug = :slug WHERE id = :id`,
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
                    new_slug: currentSlug
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
              throw new Error(`Failed to generate unique slug after ${maxAttempts} attempts`);
            }
          } catch (error) {
            results.errors++;
            results.details.push({
              entity_type: entity.type,
              entity_id: record.id,
              error: error.message
            });
            logger.error(`Error processing ${entity.type} ID ${record.id}:`, error);
          }
        }
      }

      // Log results
      logger.log('\nMigration Results:');
      logger.log(`Total records processed: ${results.total}`);
      logger.log(`Successfully processed: ${results.processed}`);
      logger.log(`Modified slugs: ${results.modified}`);
      logger.log(`Errors: ${results.errors}`);

      if (results.details.length > 0) {
        logger.log('\nDetailed Results:');
        results.details.forEach(detail => {
          if (detail.error) {
            logger.log(`Error - ${detail.entity_type} ID ${detail.entity_id}: ${detail.error}`);
          } else {
            logger.log(`Modified - ${detail.entity_type} ID ${detail.entity_id}: ${detail.original_slug} -> ${detail.new_slug}`);
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