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
 *    - product/ → product
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

      // Strip all leading protocol+host segments (fixes doubled/staging URLs), return path only
      const normalizeUrlTo = (url) => {
        if (!url) return null;
        let normalized = String(url).trim();
        while (/^https?:\/\/[^/]+/.test(normalized)) {
          normalized = normalized.replace(/^https?:\/\/[^/]+/, '');
        }
        if (!normalized.startsWith('/')) normalized = '/' + normalized;
        normalized = normalized.replace(/\/$/, '') || '/';
        return normalized;
      };

      const extractSlug = (path) => {
        if (!path) return null;
        return String(path).trim().replace(/^\/+/, '').replace(/\/+$/, '');
      };

      const getLastPathSegment = (path) => {
        const s = extractSlug(path);
        if (!s) return null;
        const parts = String(s).split('/').filter(Boolean);
        return parts.length ? parts[parts.length - 1] : null;
      };

      // Only replace /product-tag/ with /product-deals/ in url_to (no other changes)
      const replaceProductTagInUrl = (url) => {
        if (!url) return url;
        return String(url).replace(/\/product-tag\//g, '/product-deals/');
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
        
        if (normalized.includes('product-tag/') || normalized.includes('product-deals/')) {
          entityType = 'deal';
          slug = normalized
            .replace(/.*(product-tag|product-deals)\//, '')
            .replace(/\/$/, '')
            .replace(/\/amp\/?$/, '');
        } else if (normalized.includes('product-category/')) {
          entityType = 'category';
          slug = normalized.replace(/.*product-category\//, '').replace(/\/$/, '').replace(/\/amp\/?$/, '');
        } else if (normalized.includes('brand/')) {
          entityType = 'brand';
          slug = normalized.replace(/.*brand\//, '').replace(/\/$/, '').replace(/\/amp\/?$/, '');
        } else if (normalized.includes('blog/')) {
          entityType = 'blog';
          slug = normalized.replace(/.*blog\//, '').replace(/\/$/, '').replace(/\/amp\/?$/, '');
        } else if (normalized.includes('product/')) {
          entityType = 'product';
          slug = normalized.replace(/.*product\//, '').replace(/\/$/, '').replace(/\/amp\/?$/, '');
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

      const productSlugMap = new Map();
      const productSlugRelations = await SlugRelation.findAll({
        where: { entity_type: 'product' },
        attributes: ['slug', 'entity_id'],
        transaction
      });
      productSlugRelations.forEach(sr => {
        if (sr.slug) productSlugMap.set(sr.slug.toLowerCase(), sr.entity_id);
      });
      console.log(`   Products: ${productSlugMap.size} mapped`);

      const isSlugInRelations = (slug) => {
        if (!slug) return false;
        const key = String(slug).toLowerCase();
        return (
          dealSlugMap.has(key) ||
          categorySlugMap.has(key) ||
          brandSlugMap.has(key) ||
          blogSlugMap.has(key) ||
          productSlugMap.has(key)
        );
      };

      // Process redirects
      const redirectsToInsert = [];
      const seenSourceUrls = new Set();
      const duplicatesLog = [];
      const urlToNotInSlugRelationsLog = [];
      const stats = {
        total: 0,
        deals: 0,
        categories: 0,
        brands: 0,
        blogs: 0,
        products: 0,
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
            console.warn('⚠️  Skipping pattern: invalid/empty source URL', {
              rank_math_id: oldRedirect.id,
              pattern,
              url_to: oldRedirect.url_to
            });
            continue;
          }

          // Skip duplicates
          if (seenSourceUrls.has(sourceUrl)) {
            stats.skipped_duplicate++;
            duplicatesLog.push({
              rank_math_id: oldRedirect.id,
              pattern,
              sources: sourceUrl,
              url_to: oldRedirect.url_to
            });
            continue;
          }
          seenSourceUrls.add(sourceUrl);

          // Parse pattern to get entity type and slug
          const parsed = parsePattern(pattern);
          
          let entityType = parsed?.entityType || null;
          let patternSlug = parsed?.slug || null;

          // Fallback: if RankMath pattern doesn't match known prefixes, default to product using last segment.
          if ((!entityType || !patternSlug) && sourceUrl) {
            const fallbackSlug = getLastPathSegment(sourceUrl);
            if (fallbackSlug) {
              if (!entityType) entityType = 'product';
              if (!patternSlug) patternSlug = fallbackSlug;
              console.warn('⚠️  Pattern did not match known prefixes; defaulting to product', {
                rank_math_id: oldRedirect.id,
                pattern,
                sources: sourceUrl,
                url_to: oldRedirect.url_to,
                fallback_entity_type: entityType,
                fallback_slug: patternSlug
              });
            }
          }

          if (!entityType || !patternSlug) {
            stats.skipped_no_entity++;
            console.warn('⚠️  Skipping pattern: could not determine entity_type/slug', {
              rank_math_id: oldRedirect.id,
              pattern,
              sources: sourceUrl,
              url_to: oldRedirect.url_to,
              parsed
            });
            continue;
          }

          // Try to find entity_id by slug
          let entityId = null;
          let finalSlug = patternSlug;

          switch (entityType) {
            case 'deal':
              entityId = dealSlugMap.get(patternSlug.toLowerCase());
              // Also try destination slug if pattern slug doesn't match
              // Note: destSlug can be a full path; only last segment is useful for most entity types.
              if (!entityId) {
                const destCandidate = getLastPathSegment(urlTo);
                if (destCandidate) {
                  entityId = dealSlugMap.get(destCandidate.toLowerCase());
                  if (entityId) finalSlug = destCandidate;
                }
              }
              break;
            case 'category':
              entityId = categorySlugMap.get(patternSlug.toLowerCase());
              if (!entityId) {
                const destCandidate = getLastPathSegment(urlTo);
                if (destCandidate) {
                  entityId = categorySlugMap.get(destCandidate.toLowerCase());
                  if (entityId) finalSlug = destCandidate;
                }
              }
              break;
            case 'brand': {
              // slug_relations stores brand slug only (e.g. geekvape), not full path (e.g. geekvape/geekvape-kits)
              const brandLookupSlug = getBrandSlugForLookup(patternSlug) || patternSlug;
              entityId = brandSlugMap.get(patternSlug.toLowerCase()) || brandSlugMap.get(brandLookupSlug.toLowerCase());
              if (entityId) finalSlug = brandLookupSlug;
              if (!entityId) {
                const parsedUrlTo = parsePattern(urlTo);
                const urlToBrandPath = parsedUrlTo?.entityType === 'brand' ? parsedUrlTo.slug : extractSlug(urlTo);
                const destBrandSlug = getBrandSlugForLookup(urlToBrandPath) || urlToBrandPath;
                entityId = brandSlugMap.get(String(urlToBrandPath || '').toLowerCase()) || brandSlugMap.get(String(destBrandSlug || '').toLowerCase());
                if (entityId) finalSlug = destBrandSlug;
              }
              break;
            }
            case 'blog':
              entityId = blogSlugMap.get(patternSlug.toLowerCase());
              if (!entityId) {
                const destCandidate = getLastPathSegment(urlTo);
                if (destCandidate) {
                  entityId = blogSlugMap.get(destCandidate.toLowerCase());
                  if (entityId) finalSlug = destCandidate;
                }
              }
              break;
            case 'product':
              entityId = productSlugMap.get(patternSlug.toLowerCase());
              if (!entityId) {
                const destCandidate = getLastPathSegment(urlTo);
                if (destCandidate) {
                  entityId = productSlugMap.get(destCandidate.toLowerCase());
                  if (entityId) finalSlug = destCandidate;
                }
              }
              break;
            default: {
              // Unknown entity types should be treated as product (never drop the record for this).
              const productCandidate = getLastPathSegment(urlTo) || patternSlug;
              entityType = 'product';
              finalSlug = productCandidate || finalSlug;
              entityId = productCandidate ? productSlugMap.get(String(productCandidate).toLowerCase()) : null;
              break;
            }
          }

          // Validate url_to against slug_relations (warning only, never skip)
          const parsedUrlTo = parsePattern(urlTo);
          let urlToSlugForLookup = null;
          if (parsedUrlTo?.entityType === 'brand') {
            urlToSlugForLookup = getBrandSlugForLookup(parsedUrlTo.slug) || getLastPathSegment(parsedUrlTo.slug);
          } else if (parsedUrlTo?.slug) {
            urlToSlugForLookup = parsedUrlTo.slug;
          } else {
            urlToSlugForLookup = getLastPathSegment(urlTo);
          }

          const urlToFoundInSlugRelations = isSlugInRelations(urlToSlugForLookup);
          if (!urlToFoundInSlugRelations) {
            stats.skipped_no_slug_match++;
            urlToNotInSlugRelationsLog.push({
              rank_math_id: oldRedirect.id,
              pattern,
              sources: sourceUrl,
              url_to: oldRedirect.url_to,
              normalized_url_to: urlTo,
              url_to_slug_checked: urlToSlugForLookup,
              entity_type: entityType,
              slug: finalSlug
            });
          }

          // Build redirect record
          // sources: Save the original old database source pattern (the old used slug)
          // url_to: Normalized path (no staging/doubled URLs); only replace /product-tag/ → /product-deals/ in the path.
          const finalUrlTo = replaceProductTagInUrl(urlTo);
          
          // Safely prepare meta_data JSON - ensure strings are properly formatted
          // Note: bulkInsert requires JSON.stringify() for JSON columns (bypasses model layer)
          const prepareMetaData = () => {
            const meta = {
              imported_from: 'vh_rank_math_redirections',
              rank_math_id: oldRedirect.id,
              pattern_slug: patternSlug,
              original_pattern: pattern
            };
            
            // Store PHP serialized string as string (truncate if extremely long to avoid JSON issues)
            if (oldRedirect.sources) {
              const sourcesStr = String(oldRedirect.sources);
              // MySQL JSON column can handle large strings, but truncate if > 1MB to be safe
              meta.sources_raw = sourcesStr.length > 1000000 ? sourcesStr.substring(0, 1000000) + '...[truncated]' : sourcesStr;
            } else {
              meta.sources_raw = null;
            }
            
            if (oldRedirect.url_to) {
              meta.url_to_raw = String(oldRedirect.url_to);
            } else {
              meta.url_to_raw = null;
            }
            
            if (oldRedirect.created) meta.created = oldRedirect.created;
            if (oldRedirect.updated) meta.updated = oldRedirect.updated;
            
            // bulkInsert requires explicit JSON.stringify() for JSON columns
            return JSON.stringify(meta);
          };
          
          const redirectRecord = {
            sources: sourceUrl, // Original pattern from Rank Math (normalized)
            url_to: finalUrlTo,  // Path with /product-tag/ → /product-deals/ only
            header_code: oldRedirect.header_code || 301,
            status: oldRedirect.status === 'active' ? 'active' : 'inactive',
            entity_type: entityType,
            slug: finalSlug,
            meta_data: prepareMetaData(), // Already stringified JSON string
            createdAt: oldRedirect.created ? new Date(oldRedirect.created) : new Date(),
            updatedAt: oldRedirect.updated ? new Date(oldRedirect.updated) : new Date()
          };

          redirectsToInsert.push(redirectRecord);

          console.log('↪ Imported redirect (prepared)', {
            rank_math_id: oldRedirect.id,
            sources: sourceUrl,
            url_to: finalUrlTo,
            entity_type: entityType,
            slug: finalSlug,
            url_to_slug_checked: urlToSlugForLookup,
            url_to_found_in_slug_relations: urlToFoundInSlugRelations,
            entity_id_found: Boolean(entityId)
          });

          // Update stats
          switch (entityType) {
            case 'deal': stats.deals++; break;
            case 'category': stats.categories++; break;
            case 'brand': stats.brands++; break;
            case 'blog': stats.blogs++; break;
            case 'product': stats.products++; break;
          }
        }
      }

      if (redirectsToInsert.length === 0) {
        console.log('⚠️  No valid redirects to insert after processing.');
        console.log('\n📊 Processing Statistics:');
        console.log(`   Total patterns processed: ${stats.total}`);
        console.log(`   Skipped (no entity): ${stats.skipped_no_entity}`);
        console.log(`   Skipped (duplicate): ${stats.skipped_duplicate}`);
        console.log(`   Warnings (url_to not found in slug_relations): ${stats.skipped_no_slug_match}`);
        if (duplicatesLog.length > 0) {
          console.log('\n📋 Duplicates (skipped):');
          duplicatesLog.forEach((entry, i) => console.log(`   ${i + 1}.`, JSON.stringify(entry)));
        }
        if (urlToNotInSlugRelationsLog.length > 0) {
          console.log('\n📋 url_to not found in slug_relations (warning only):');
          urlToNotInSlugRelationsLog.forEach((entry, i) => console.log(`   ${i + 1}.`, JSON.stringify(entry)));
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
      console.log(`   Products: ${stats.products}`);
      console.log(`\n📊 Processing Statistics:`);
      console.log(`   Total patterns processed: ${stats.total}`);
      console.log(`   Skipped (no entity): ${stats.skipped_no_entity}`);
      console.log(`   Skipped (duplicate): ${stats.skipped_duplicate}`);
      console.log(`   Warnings (url_to not found in slug_relations): ${stats.skipped_no_slug_match}`);
      if (duplicatesLog.length > 0) {
        console.log('\n📋 Duplicates (skipped):');
        duplicatesLog.forEach((entry, i) => console.log(`   ${i + 1}.`, JSON.stringify(entry)));
      }
      if (urlToNotInSlugRelationsLog.length > 0) {
        console.log('\n📋 url_to not found in slug_relations (warning only):');
        urlToNotInSlugRelationsLog.forEach((entry, i) => console.log(`   ${i + 1}.`, JSON.stringify(entry)));
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