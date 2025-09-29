'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('🔗 Starting deal slug relations population...');

      // Get all deals with slugs
      const deals = await queryInterface.sequelize.query(`
        SELECT id, slug, createdAt, updatedAt 
        FROM deals 
        WHERE slug IS NOT NULL AND slug != ''
        ORDER BY id
      `, { type: Sequelize.QueryTypes.SELECT });

      console.log(`📊 Found ${deals.length} deals with slugs to add to slug_relations`);

      let created = 0;
      let errors = 0;

      for (const deal of deals) {
        try {
          // Check if slug relation already exists
          const existingSlugRelation = await queryInterface.sequelize.query(`
            SELECT 1 FROM slug_relations 
            WHERE entity_type = 'deal' AND entity_id = ?
          `, {
            replacements: [deal.id],
            type: Sequelize.QueryTypes.SELECT
          });

          if (existingSlugRelation.length > 0) {
            console.log(`⏭️ Deal slug relation already exists: deal ${deal.id}`);
            continue;
          }

          // Check if slug is already used by another entity
          const existingSlug = await queryInterface.sequelize.query(`
            SELECT 1 FROM slug_relations 
            WHERE slug = ?
          `, {
            replacements: [deal.slug],
            type: Sequelize.QueryTypes.SELECT
          });

          if (existingSlug.length > 0) {
            console.log(`⚠️ Skipping deal ${deal.id} - slug '${deal.slug}' already exists`);
            errors++;
            continue;
          }

          // Create slug relation
          await queryInterface.bulkInsert('slug_relations', [{
            entity_type: 'deal',
            entity_id: deal.id,
            slug: deal.slug,
            created_at: deal.createdAt || new Date(),
            updated_at: deal.updatedAt || new Date()
          }]);

          created++;
          console.log(`✅ Created deal slug relation: ${deal.slug} -> deal ${deal.id}`);

        } catch (error) {
          console.error(`❌ Error creating deal slug relation for deal ${deal.id}:`, error.message);
          errors++;
        }
      }

      console.log(`✅ Deal slug relations population completed: ${created} created, ${errors} errors`);

    } catch (error) {
      console.error('❌ Error in deal slug relations population:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    try {
      console.log('🗑️ Removing deal slug relations...');
      await queryInterface.sequelize.query('DELETE FROM slug_relations WHERE entity_type = \'deal\'');
      console.log('✅ Deal slug relations removed');
    } catch (error) {
      console.error('❌ Error removing deal slug relations:', error);
      throw error;
    }
  }
};
