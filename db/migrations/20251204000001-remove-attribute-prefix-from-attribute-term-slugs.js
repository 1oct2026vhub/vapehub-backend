'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Starting migration to update attribute term slugs (removing attribute prefix)...');
      
      // Step 1: Get all attribute terms with their attribute slugs
      const terms = await queryInterface.sequelize.query(`
        SELECT 
          at.id as term_id,
          at.slug as current_slug,
          a.slug as attribute_slug
        FROM attribute_terms at
        INNER JOIN attributes a ON at.attribute_id = a.id
        WHERE at.slug LIKE CONCAT(a.slug, '-%')
        AND at.deleted_at IS NULL
        ORDER BY at.id ASC
      `, {
        type: Sequelize.QueryTypes.SELECT,
        transaction
      });

      console.log(`📊 Found ${terms.length} terms to update`);

      if (terms.length === 0) {
        console.log('✅ No terms found with attribute prefix in slug. Migration complete.');
        await transaction.commit();
        return;
      }

      // Step 2: Process each term and update slugs
      let updatedCount = 0;
      let skippedCount = 0;
      let conflictResolvedCount = 0;

      for (const term of terms) {
        try {
          // Remove the attribute slug prefix (e.g., "color-red" -> "red")
          const newSlug = term.current_slug.replace(new RegExp(`^${term.attribute_slug}-`), '');
          
          // Skip if the slug is empty or unchanged
          if (!newSlug || newSlug === term.current_slug) {
            console.log(`⚠️  Skipping term ID ${term.term_id}: slug unchanged or empty`);
            skippedCount++;
            continue;
          }

          // Step 3: Check if the new slug exists in slug_relations for any other attribute_term
          const [existingSlugRelation] = await queryInterface.sequelize.query(`
            SELECT entity_id 
            FROM slug_relations 
            WHERE entity_type = 'attribute_term' 
            AND slug = :newSlug 
            AND entity_id != :termId
            LIMIT 1
          `, {
            replacements: { newSlug, termId: term.term_id },
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });

          let finalSlug = newSlug;

          // Step 4: If conflict exists, make the slug unique
          if (existingSlugRelation) {
            // Generate unique slug by appending term_id
            finalSlug = `${newSlug}-${term.term_id}`;
            
            // Double-check this unique slug doesn't exist either
            let counter = 1;
            let [uniqueCheck] = await queryInterface.sequelize.query(`
              SELECT entity_id 
              FROM slug_relations 
              WHERE entity_type = 'attribute_term' 
              AND slug = :checkSlug 
              AND entity_id != :termId
              LIMIT 1
            `, {
              replacements: { checkSlug: finalSlug, termId: term.term_id },
              type: Sequelize.QueryTypes.SELECT,
              transaction
            });

            // If still exists, try with counter suffix
            while (uniqueCheck) {
              finalSlug = `${newSlug}-${term.term_id}-${counter}`;
              [uniqueCheck] = await queryInterface.sequelize.query(`
                SELECT entity_id 
                FROM slug_relations 
                WHERE entity_type = 'attribute_term' 
                AND slug = :checkSlug 
                AND entity_id != :termId
                LIMIT 1
              `, {
                replacements: { checkSlug: finalSlug, termId: term.term_id },
                type: Sequelize.QueryTypes.SELECT,
                transaction
              });
              counter++;
            }

            conflictResolvedCount++;
            console.log(`🔧 Term ID ${term.term_id}: Conflict resolved. Changed "${term.current_slug}" -> "${finalSlug}"`);
          } else {
            console.log(`✅ Term ID ${term.term_id}: No conflict. Changed "${term.current_slug}" -> "${finalSlug}"`);
          }

          // Step 5: Update the slug in attribute_terms table
          await queryInterface.sequelize.query(`
            UPDATE attribute_terms 
            SET slug = :finalSlug, updated_at = NOW()
            WHERE id = :termId
          `, {
            replacements: { finalSlug, termId: term.term_id },
            transaction
          });

          // Step 6: Update the slug in slug_relations table
          await queryInterface.sequelize.query(`
            UPDATE slug_relations 
            SET slug = :finalSlug, updated_at = NOW()
            WHERE entity_type = 'attribute_term' AND entity_id = :termId
          `, {
            replacements: { finalSlug, termId: term.term_id },
            transaction
          });

          updatedCount++;

        } catch (error) {
          console.error(`❌ Error processing term ID ${term.term_id}:`, error.message);
          // Continue with next term instead of failing entire migration
          skippedCount++;
        }
      }

      console.log(`\n📊 Migration Summary:`);
      console.log(`   ✅ Successfully updated: ${updatedCount} terms`);
      console.log(`   🔧 Conflicts resolved: ${conflictResolvedCount} terms`);
      console.log(`   ⚠️  Skipped: ${skippedCount} terms`);
      
      await transaction.commit();
      console.log('🎉 Migration completed successfully!');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back term slug updates...');
      
      // Get all terms and restore the original format: attribute_slug-term_slug
      // We need to identify which terms were modified by checking if they don't match the pattern
      const terms = await queryInterface.sequelize.query(`
        SELECT 
          at.id as term_id,
          at.slug as current_slug,
          a.slug as attribute_slug
        FROM attribute_terms at
        INNER JOIN attributes a ON at.attribute_id = a.id
        WHERE at.slug NOT LIKE CONCAT(a.slug, '-%')
        AND at.deleted_at IS NULL
        ORDER BY at.id ASC
      `, {
        type: Sequelize.QueryTypes.SELECT,
        transaction
      });

      console.log(`📊 Found ${terms.length} terms to restore`);

      if (terms.length === 0) {
        console.log('✅ No terms found to restore. Rollback complete.');
        await transaction.commit();
        return;
      }

      let restoredCount = 0;
      let skippedCount = 0;

      for (const term of terms) {
        try {
          // Try to restore original format: attribute_slug-term_slug
          // If current slug contains term_id suffix (from conflict resolution), remove it first
          let baseSlug = term.current_slug;
          
          // Remove term_id suffix if present (e.g., "red-123" -> "red")
          const termIdSuffixPattern = new RegExp(`-${term.term_id}(-\\d+)?$`);
          if (termIdSuffixPattern.test(baseSlug)) {
            baseSlug = baseSlug.replace(termIdSuffixPattern, '');
          }

          const originalSlug = `${term.attribute_slug}-${baseSlug}`;
          
          // Check if original slug already exists
          const [existingTerm] = await queryInterface.sequelize.query(`
            SELECT id FROM attribute_terms 
            WHERE slug = :originalSlug AND id != :termId
            LIMIT 1
          `, {
            replacements: { originalSlug, termId: term.term_id },
            type: Sequelize.QueryTypes.SELECT,
            transaction
          });

          if (existingTerm) {
            console.log(`⚠️  Skipping term ID ${term.term_id}: slug "${originalSlug}" already exists`);
            skippedCount++;
            continue;
          }

          // Restore the original slug format
          await queryInterface.sequelize.query(`
            UPDATE attribute_terms 
            SET slug = :originalSlug, updated_at = NOW()
            WHERE id = :termId
          `, {
            replacements: { originalSlug, termId: term.term_id },
            transaction
          });

          await queryInterface.sequelize.query(`
            UPDATE slug_relations 
            SET slug = :originalSlug, updated_at = NOW()
            WHERE entity_type = 'attribute_term' AND entity_id = :termId
          `, {
            replacements: { originalSlug, termId: term.term_id },
            transaction
          });

          restoredCount++;
          console.log(`✅ Term ID ${term.term_id}: Restored "${term.current_slug}" -> "${originalSlug}"`);

        } catch (error) {
          console.error(`❌ Error restoring term ID ${term.term_id}:`, error.message);
          skippedCount++;
        }
      }

      console.log(`\n📊 Rollback Summary:`);
      console.log(`   ✅ Successfully restored: ${restoredCount} terms`);
      console.log(`   ⚠️  Skipped: ${skippedCount} terms`);
      
      await transaction.commit();
      console.log('✅ Rollback completed successfully!');
      
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
};

