'use strict';

const { Op } = require('sequelize');
const models = require('../../models');

module.exports = {
  async up(queryInterface, Sequelize) {
    return;
    const transaction = await queryInterface.sequelize.transaction();
    const logger = console;
    
    try {
      // Define the secondary tables to process
      const secondaryTables = [
        { model: 'Brand', type: 'brand', table: 'brands' },
        { model: 'Blog', type: 'blog', table: 'blogs' },
        { model: 'BlogCategory', type: 'blog_category', table: 'blog_categories' },
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

      // Process each secondary table
      for (const secondary of secondaryTables) {
        logger.log(`\nProcessing slug synchronization for ${secondary.type}...`);

        try {
          // Check if table has deleted_at column
          const secondaryTableInfo = await queryInterface.sequelize.query(
            `SHOW COLUMNS FROM ${secondary.table} LIKE 'deleted_at'`,
            { type: Sequelize.QueryTypes.SELECT }
          );
          
          const secondaryHasDeletedAt = secondaryTableInfo.length > 0;

          // Fetch all records from the secondary table that have slugs
          const secondaryRecords = await queryInterface.sequelize.query(
            `SELECT id, slug 
             FROM ${secondary.table} 
             WHERE slug IS NOT NULL
             ${secondaryHasDeletedAt ? ' AND deleted_at IS NULL' : ''}`,
            { type: Sequelize.QueryTypes.SELECT, transaction }
          );

          results.total += secondaryRecords.length;
          logger.log(`Found ${secondaryRecords.length} records in ${secondary.table}`);

          // Process each record in batches
          const batchSize = 100;
          for (let i = 0; i < secondaryRecords.length; i += batchSize) {
            const batch = secondaryRecords.slice(i, i + batchSize);
            
            // Get corresponding slug relations
            const secondaryIds = batch.map(record => record.id);
            const slugRelations = await queryInterface.sequelize.query(
              `SELECT entity_id, slug
               FROM slug_relations
               WHERE entity_type = :type
               AND entity_id IN (:ids)`,
              {
                replacements: { 
                  type: secondary.type,
                  ids: secondaryIds 
                },
                type: Sequelize.QueryTypes.SELECT,
                transaction
              }
            );

            // Create a map of slug relations for faster lookup
            const slugMap = new Map(slugRelations.map(relation => [relation.entity_id, relation]));

            // Process each record in the batch
            for (const secondaryRecord of batch) {
              try {
                const slugRelation = slugMap.get(secondaryRecord.id);
                
                if (!slugRelation) {
                  results.errors++;
                  results.details.push({
                    table: secondary.table,
                    id: secondaryRecord.id,
                    error: 'No matching slug relation found',
                    status: 'error'
                  });
                  logger.log(`❌ Error: No matching slug relation found for ${secondary.table} ID ${secondaryRecord.id}`);
                  continue;
                }

                // Check if the slug is wrong (doesn't match SlugRelation)
                if (slugRelation.slug !== secondaryRecord.slug) {
                  logger.log(`\n🔄 Updating wrong slug in ${secondary.table}:`);
                  logger.log(`   ID: ${secondaryRecord.id}`);
                  logger.log(`   Current (wrong) slug: ${secondaryRecord.slug}`);
                  logger.log(`   Correct slug: ${slugRelation.slug}`);

                  // Update the secondary record's slug to match the slug relation
                  await queryInterface.sequelize.query(
                    `UPDATE ${secondary.table} 
                     SET slug = :slug, updated_at = NOW() 
                     WHERE id = :id`,
                    {
                      replacements: {
                        slug: slugRelation.slug,
                        id: secondaryRecord.id
                      },
                      transaction
                    }
                  );

                  results.modified++;
                  results.details.push({
                    table: secondary.table,
                    id: secondaryRecord.id,
                    old_slug: secondaryRecord.slug,
                    new_slug: slugRelation.slug,
                    status: 'modified'
                  });
                } else {
                  logger.log(`✓ ${secondary.table} ID ${secondaryRecord.id}: Slug is correct (${secondaryRecord.slug})`);
                }

                results.processed++;
              } catch (error) {
                results.errors++;
                results.details.push({
                  table: secondary.table,
                  id: secondaryRecord.id,
                  error: error.message,
                  status: 'error'
                });
                logger.error(`❌ Error processing record ${secondaryRecord.id}:`, error.message);
              }
            }
          }
        } catch (error) {
          logger.error(`❌ Error processing table ${secondary.table}:`, error);
          results.errors++;
          results.details.push({
            table: secondary.table,
            error: error.message,
            status: 'error'
          });
        }
      }

      // Log final results
      logger.log('\n📊 Final Synchronization Results:');
      logger.log(`Total records found: ${results.total}`);
      logger.log(`Successfully processed: ${results.processed}`);
      logger.log(`Modified slugs: ${results.modified}`);
      logger.log(`Errors: ${results.errors}`);

      if (results.details.length > 0) {
        logger.log('\n📝 Detailed Results:');
        results.details.forEach(detail => {
          switch (detail.status) {
            case 'modified':
              logger.log(`🔄 Modified - ${detail.table} ID ${detail.id}: ${detail.old_slug} -> ${detail.new_slug}`);
              break;
            case 'error':
              logger.log(`❌ Error - ${detail.table}${detail.id ? ` ID ${detail.id}` : ''}: ${detail.error}`);
              break;
          }
        });
      }

      await transaction.commit();
      logger.log('\n✅ Synchronization completed successfully!');
    } catch (error) {
      await transaction.rollback();
      logger.error('❌ Synchronization failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    // No down migration needed as this is a data synchronization
    logger.log('No down migration needed for slug synchronization');
  }
}; 