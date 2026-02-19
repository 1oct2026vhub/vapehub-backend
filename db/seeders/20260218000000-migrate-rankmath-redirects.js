'use strict';

/**
 * Migrate Rank Math Redirects from Old Database
 * 
 * This seeder:
 * 1. Reads from vh_rank_math_redirections table in old database
 * 2. Extracts patterns from PHP serialized sources field
 * 3. Maps entity types:
 *    - product-tag/ → deal
 *    - product-category/ → category
 *    - brand/ → brand
 *    - blog/ → blog
 * 4. Extracts slugs from patterns and destination URLs
 * 5. Maps slugs to entity_ids by querying slug_relations table (canonical slug source)
 * 6. Inserts into redirects table
 */

const CrossServerMigration = require('../../utils/cross-server-migration');
const { SlugRelation } = require('../../models');

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    const environment = process.env.NODE_ENV || 'local';
    const crossServerMigration = new CrossServerMigration(environment);

    try {
      console.log('🚀 Starting Rank Math redirects migration from old database...');

      // Connect to old database
      await crossServerMigration.connectToOldDb();

      // Check if Rank Math redirections table exists
      const [tables] = await crossServerMigration.queryOldDb("SHOW TABLES LIKE 'vh_rank_math_redirections'");
      
      if (tables.length === 0) {
        console.log('⚠️  vh_rank_math_redirections table not found. Skipping migration.');
        await crossServerMigration.closeOldDbConnection();
        await transaction.commit();
        return;
      }

      console.log('✅ Found vh_rank_math_redirections table');

      // Helper functions
      const normalizeSourceUrl = (url) => {
        if (!url) return null;
        let normalized = String(url).trim();
        if (!normalized.startsWith('/')) normalized = '/' + normalized;
        normalized = normalized.replace(/\/$/, '') || '/';
        normalized = normalized.replace(/\/amp\/?$/, '');
        return normalized;
      };

      const normalizeUrlTo = (url) => {
        if (!url) return null;
        let normalized = String(url).trim();
        normalized = normalized.replace(/^https?:\/\/[^\/]+/, '');
        if (!normalized.startsWith('/')) normalized = '/' + normalized;
        normalized = normalized.replace(/\/$/, '') || '/';
        return normalized;
      };

      const extractSlug = (path) => {
        if (!path) return null;
        return String(path).trim().replace(/^\/+/, '').replace(/\/+$/, '');
      };

      // Build new url_to path for deals only (required format for new app)
      // e.g. deal: /product-tag/slug (old) → /product-deals/slug (new)
      // Other entity types keep the same URL format as old database
      const buildNewUrlToForDeal = (slug) => {
        if (!slug) return null;
        const s = String(slug).trim().replace(/^\/+|\/+$/g, '');
        if (!s) return null;
        return `/product-deals/${s}`;
      };

      // Extract patterns from PHP serialized string
      const extractPatterns = (serializedData) => {
        const patterns = [];
        if (!serializedData) return patterns;
        
        // Try with quotes: s:7:"pattern";s:XX:"pattern_value";
        let regex = /s:7:"pattern";s:\d+:"([^"]+)"/g;
        let match;
        while ((match = regex.exec(serializedData)) !== null) {
          patterns.push(match[1]);
        }
        
        // If no matches, try without quotes: s:7:pattern;s:XX:pattern_value;
        if (patterns.length === 0) {
          regex = /s:7:pattern;s:\d+:(.+?);/g;
          while ((match = regex.exec(serializedData)) !== null) {
            const value = match[1].replace(/^["']|["']$/g, '').trim();
            if (value) patterns.push(value);
          }
        }
        
        return patterns;
      };

      // Determine entity type and extract slug from pattern
      const parsePattern = (pattern) => {
        if (!pattern) return null;
        
        const normalized = String(pattern).toLowerCase().trim();
        let entityType = null;
        let slug = null;
        
        if (normalized.includes('product-tag/')) {
          entityType = 'deal';
          slug = normalized.replace(/.*product-tag\//, '').replace(/\/$/, '').replace(/\/amp\/?$/, '');
        } else if (normalized.includes('product-category/')) {
          entityType = 'category';
          slug = normalized.replace(/.*product-category\//, '').replace(/\/$/, '').replace(/\/amp\/?$/, '');
        } else if (normalized.includes('brand/')) {
          entityType = 'brand';
          slug = normalized.replace(/.*brand\//, '').replace(/\/$/, '').replace(/\/amp\/?$/, '');
        } else if (normalized.includes('blog/')) {
          entityType = 'blog';
          slug = normalized.replace(/.*blog\//, '').replace(/\/$/, '').replace(/\/amp\/?$/, '');
        }
        
        return { entityType, slug: slug || null };
      };

      // For brand only: slug_relations has the brand slug (e.g. "geekvape"), not full path (e.g. "geekvape/geekvape-kits")
      const getBrandSlugForLookup = (pathAfterBrand) => {
        if (!pathAfterBrand) return null;
        const s = String(pathAfterBrand).trim().replace(/\/+$/, '');
        const first = s.split('/')[0];
        return first || null;
      };

      // Fetch redirects from old database
      console.log('📥 Fetching redirects from vh_rank_math_redirections...');
      const oldRedirects = await crossServerMigration.fetchFromOldDb(`
        SELECT id, sources, url_to, header_code, status, created, updated
        FROM vh_rank_math_redirections
        WHERE status = 'active'
        AND sources IS NOT NULL
        AND sources != ''
        AND url_to IS NOT NULL
        AND url_to != ''
      `);

      console.log(`📊 Found ${oldRedirects.length} active redirects`);

      if (oldRedirects.length === 0) {
        console.log('⚠️  No redirects found to migrate.');
        await crossServerMigration.closeOldDbConnection();
        await transaction.commit();
        return;
      }

      // Build slug-to-entity_id maps for each entity type using slug_relations (canonical source)
      console.log('📥 Building entity slug maps from slug_relations...');
      
      const dealSlugMap = new Map();
      const dealSlugRelations = await SlugRelation.findAll({
        where: { entity_type: 'deal' },
        attributes: ['slug', 'entity_id'],
        transaction
      });
      dealSlugRelations.forEach(sr => {
        if (sr.slug) dealSlugMap.set(sr.slug.toLowerCase(), sr.entity_id);
      });
      console.log(`   Deals: ${dealSlugMap.size} mapped`);

      const categorySlugMap = new Map();
      const categorySlugRelations = await SlugRelation.findAll({
        where: { entity_type: 'category' },
        attributes: ['slug', 'entity_id'],
        transaction
      });
      categorySlugRelations.forEach(sr => {
        if (sr.slug) categorySlugMap.set(sr.slug.toLowerCase(), sr.entity_id);
      });
      console.log(`   Categories: ${categorySlugMap.size} mapped`);

      const brandSlugMap = new Map();
      const brandSlugRelations = await SlugRelation.findAll({
        where: { entity_type: 'brand' },
        attributes: ['slug', 'entity_id'],
        transaction
      });
      brandSlugRelations.forEach(sr => {
        if (sr.slug) brandSlugMap.set(sr.slug.toLowerCase(), sr.entity_id);
      });
      console.log(`   Brands: ${brandSlugMap.size} mapped`);

      const blogSlugMap = new Map();
      const blogSlugRelations = await SlugRelation.findAll({
        where: { entity_type: 'blog' },
        attributes: ['slug', 'entity_id'],
        transaction
      });
      blogSlugRelations.forEach(sr => {
        if (sr.slug) blogSlugMap.set(sr.slug.toLowerCase(), sr.entity_id);
      });
      console.log(`   Blogs: ${blogSlugMap.size} mapped`);

      // Process redirects
      const redirectsToInsert = [];
      const seenSourceUrls = new Set();
      const stats = {
        total: 0,
        deals: 0,
        categories: 0,
        brands: 0,
        blogs: 0,
        skipped_no_entity: 0,
        skipped_duplicate: 0,
        skipped_no_slug_match: 0
      };

      for (const oldRedirect of oldRedirects) {
        const patterns = extractPatterns(oldRedirect.sources);
        const urlTo = normalizeUrlTo(oldRedirect.url_to);
        const destSlug = extractSlug(urlTo);

        for (const pattern of patterns) {
          stats.total++;
          
          const sourceUrl = normalizeSourceUrl(pattern);
          if (!sourceUrl || sourceUrl === '/') {
            stats.skipped_no_entity++;
            continue;
          }

          // Skip duplicates
          if (seenSourceUrls.has(sourceUrl)) {
            stats.skipped_duplicate++;
            continue;
          }
          seenSourceUrls.add(sourceUrl);

          // Parse pattern to get entity type and slug
          const parsed = parsePattern(pattern);
          
          if (!parsed.entityType || !parsed.slug) {
            stats.skipped_no_entity++;
            continue;
          }

          // Try to find entity_id by slug
          let entityId = null;
          let finalSlug = parsed.slug;

          switch (parsed.entityType) {
            case 'deal':
              entityId = dealSlugMap.get(parsed.slug.toLowerCase());
              // Also try destination slug if pattern slug doesn't match
              if (!entityId && destSlug) {
                entityId = dealSlugMap.get(destSlug.toLowerCase());
                if (entityId) finalSlug = destSlug;
              }
              break;
            case 'category':
              entityId = categorySlugMap.get(parsed.slug.toLowerCase());
              if (!entityId && destSlug) {
                entityId = categorySlugMap.get(destSlug.toLowerCase());
                if (entityId) finalSlug = destSlug;
              }
              break;
            case 'brand': {
              // slug_relations stores brand slug only (e.g. geekvape), not full path (e.g. geekvape/geekvape-kits)
              const brandLookupSlug = getBrandSlugForLookup(parsed.slug) || parsed.slug;
              entityId = brandSlugMap.get(parsed.slug.toLowerCase()) || brandSlugMap.get(brandLookupSlug.toLowerCase());
              if (entityId) finalSlug = brandLookupSlug;
              if (!entityId && destSlug) {
                const destBrandSlug = getBrandSlugForLookup(destSlug) || destSlug;
                entityId = brandSlugMap.get(destSlug.toLowerCase()) || brandSlugMap.get(destBrandSlug.toLowerCase());
                if (entityId) finalSlug = destBrandSlug;
              }
              break;
            }
            case 'blog':
              entityId = blogSlugMap.get(parsed.slug.toLowerCase());
              if (!entityId && destSlug) {
                entityId = blogSlugMap.get(destSlug.toLowerCase());
                if (entityId) finalSlug = destSlug;
              }
              break;
          }

          if (!entityId) {
            stats.skipped_no_slug_match++;
            console.warn(`⚠️  [NO SLUG MATCH] Slug not found in slug_relations: entity_type=${parsed.entityType}, slug="${parsed.slug}", source=${sourceUrl}`);
            continue;
          }

          // Build redirect record
          // sources: Save the original old database source pattern (the old used slug)
          // url_to: For deals only, use new format (/product-deals/slug). Others keep old DB format.
          const finalUrlTo = parsed.entityType === 'deal' 
            ? (buildNewUrlToForDeal(finalSlug) || urlTo)
            : urlTo;
          const redirectRecord = {
            sources: sourceUrl, // Original pattern from Rank Math (normalized)
            url_to: finalUrlTo,  // New format for deals (/product-deals/slug), old format for others
            header_code: oldRedirect.header_code || 301,
            status: oldRedirect.status === 'active' ? 'active' : 'inactive',
            entity_type: parsed.entityType,
            slug: finalSlug,
            meta_data: {
              imported_from: 'vh_rank_math_redirections',
              rank_math_id: oldRedirect.id,
              pattern_slug: parsed.slug,
              original_pattern: pattern, // Original pattern before normalization
              sources_raw: oldRedirect.sources || null, // Raw PHP serialized string
              url_to_raw: oldRedirect.url_to || null,
              created: oldRedirect.created || null,
              updated: oldRedirect.updated || null
            },
            createdAt: oldRedirect.created ? new Date(oldRedirect.created) : new Date(),
            updatedAt: oldRedirect.updated ? new Date(oldRedirect.updated) : new Date()
          };

          redirectsToInsert.push(redirectRecord);

          // Update stats
          switch (parsed.entityType) {
            case 'deal': stats.deals++; break;
            case 'category': stats.categories++; break;
            case 'brand': stats.brands++; break;
            case 'blog': stats.blogs++; break;
          }
        }
      }

      if (redirectsToInsert.length === 0) {
        console.log('⚠️  No valid redirects to insert after processing.');
        console.log('\n📊 Processing Statistics:');
        console.log(`   Total patterns processed: ${stats.total}`);
        console.log(`   Skipped (no entity): ${stats.skipped_no_entity}`);
        console.log(`   Skipped (duplicate): ${stats.skipped_duplicate}`);
        console.log(`   Skipped (no slug match): ${stats.skipped_no_slug_match}`);
        if (stats.skipped_no_slug_match > 0) {
          console.warn(`\n⚠️  WARNING: ${stats.skipped_no_slug_match} redirect(s) skipped — slug not found in slug_relations. Check logs above for details.`);
        }
        await crossServerMigration.closeOldDbConnection();
        await transaction.commit();
        return;
      }

      // Check for existing redirects
      const existingRedirects = await queryInterface.sequelize.query(
        'SELECT sources FROM redirects WHERE deletedAt IS NULL',
        { type: Sequelize.QueryTypes.SELECT, transaction }
      );
      const existingSourceUrls = new Set(existingRedirects.map(r => r.sources));

      const finalRedirects = redirectsToInsert.filter(r => !existingSourceUrls.has(r.sources));

      if (finalRedirects.length === 0) {
        console.log('✅ All redirects already exist in database.');
        await crossServerMigration.closeOldDbConnection();
        await transaction.commit();
        return;
      }

      // Insert in batches
      const BATCH_SIZE = 500;
      let inserted = 0;

      for (let i = 0; i < finalRedirects.length; i += BATCH_SIZE) {
        const batch = finalRedirects.slice(i, i + BATCH_SIZE);
        await queryInterface.bulkInsert('redirects', batch, { transaction });
        inserted += batch.length;
        console.log(`✅ Inserted batch: ${inserted}/${finalRedirects.length} redirects`);
      }

      console.log(`\n🎉 Successfully imported ${inserted} redirects!`);
      console.log('\n📊 Import Statistics:');
      console.log(`   Deals: ${stats.deals}`);
      console.log(`   Categories: ${stats.categories}`);
      console.log(`   Brands: ${stats.brands}`);
      console.log(`   Blogs: ${stats.blogs}`);
      console.log(`\n📊 Processing Statistics:`);
      console.log(`   Total patterns processed: ${stats.total}`);
      console.log(`   Skipped (no entity): ${stats.skipped_no_entity}`);
      console.log(`   Skipped (duplicate): ${stats.skipped_duplicate}`);
      console.log(`   Skipped (no slug match): ${stats.skipped_no_slug_match}`);
      if (stats.skipped_no_slug_match > 0) {
        console.warn(`\n⚠️  WARNING: ${stats.skipped_no_slug_match} redirect(s) skipped — slug not found in slug_relations. Check logs above for details.`);
      }

      await crossServerMigration.closeOldDbConnection();
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      await crossServerMigration.closeOldDbConnection();
      console.error('❌ Migration failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back Rank Math redirects import...');
      
      await queryInterface.sequelize.query(
        `DELETE FROM redirects 
         WHERE meta_data IS NOT NULL 
         AND JSON_EXTRACT(meta_data, '$.imported_from') = 'vh_rank_math_redirections'`,
        { transaction }
      );
      
      await transaction.commit();
      console.log('✅ Rollback completed');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Rollback failed:', error);
      throw error;
    }
  }
};