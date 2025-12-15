'use strict';

/**
 * Coupons Data Migration from Old Database
 *
 * This seeder migrates coupons from an old database into the current schema.
 * It supports both WooCommerce-style coupons (wp_posts/vh_posts with post_type = 'shop_coupon')
 * and a legacy/custom coupons table. Duplicate coupons (by code) are skipped.
 */

const CrossServerMigration = require('../../utils/cross-server-migration');

module.exports = {
  async up(queryInterface, Sequelize) {
    const environment = process.env.NODE_ENV || 'local';
    console.log(`🔧 Using environment: ${environment}`);
    const crossServerMigration = new CrossServerMigration(environment);

    try {
      console.log('🚀 Starting COUPONS DATA MIGRATION from old database...');

      const migrationStats = {
        coupons: { processed: 0, created: 0, updated: 0, errors: 0 }
      };

      // Connect to old database
      await crossServerMigration.connectToOldDb();

      // Detect source
      const couponsDataExists = await checkCouponsDataExists(crossServerMigration);
      if (!couponsDataExists.hasCouponsData) {
        console.log('⚠️  No coupons data found in old database. Skipping coupons migration.');
        console.log(
          '💡 Available tables:',
          couponsDataExists.availableTables.slice(0, 10).join(', ') + '...'
        );
        await crossServerMigration.closeOldDbConnection();
        return;
      }

      console.log(`✅ Found coupons data source: ${couponsDataExists.dataSource}`);
      console.log(`📊 Coupons available: ${couponsDataExists.couponCount}`);

      // Migrate
      console.log('\n🎯 Step: Migrating coupons...');
      if (couponsDataExists.dataSource === 'woocommerce') {
        await migrateWooCommerceCoupons(crossServerMigration, queryInterface, Sequelize, migrationStats);
      } else {
        await migrateCoupons(crossServerMigration, queryInterface, Sequelize, migrationStats);
      }

      await crossServerMigration.closeOldDbConnection();

      console.log('\n✅ Coupons data migration completed!');
      generateMigrationReport(migrationStats);
    } catch (error) {
      console.error('❌ Error during coupons migration:', error);
      await crossServerMigration.closeOldDbConnection();
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🧹 Removing migrated coupons data...');
    console.log('⚠️  Down migration not implemented. Remove migrated coupons manually if required.');
  }
};

/**
 * Detect if coupons data exists and the source table type.
 */
async function checkCouponsDataExists(crossServerMigration) {
  try {
    const tables = await crossServerMigration.fetchFromOldDb('SHOW TABLES');
    const tableNames = tables.map(table => Object.values(table)[0].toLowerCase());

    // WooCommerce coupons (wp_posts/vh_posts or wp_post/vh_post - handles both singular and plural)
    const postsTableName = tableNames.find(
      name => (name.includes('posts') || (name.includes('post') && !name.includes('meta'))) && 
              (name.startsWith('wp_') || name.startsWith('vh_'))
    );
    if (postsTableName) {
      // Get actual table name with correct case
      const actualTableName = tables.find(
        t => Object.values(t)[0].toLowerCase() === postsTableName
      );
      const tableName = actualTableName ? Object.values(actualTableName)[0] : postsTableName;
      
      let couponCount = 0;
      try {
        const couponCountResult = await crossServerMigration.fetchFromOldDb(
          `SELECT COUNT(*) as count FROM \`${tableName}\` WHERE post_type = 'shop_coupon' AND post_status != 'trash'`
        );
        couponCount = couponCountResult[0]?.count || 0;
      } catch (e) {
        console.log('⚠️  Could not count WooCommerce coupons:', e.message);
      }
      if (couponCount > 0) {
        return {
          hasCouponsData: true,
          dataSource: 'woocommerce',
          couponCount,
          postsTableName: tableName, // Return actual table name with correct case
          availableTables: tableNames
        };
      }
    }

    // Custom coupons table
    const hasCouponsTable = tableNames.includes('coupons');
    if (hasCouponsTable) {
      let couponCount = 0;
      try {
        const couponCountResult = await crossServerMigration.fetchFromOldDb(
          'SELECT COUNT(*) as count FROM coupons WHERE deleted_at IS NULL OR deleted_at IS NULL'
        );
        couponCount = couponCountResult[0]?.count || 0;
      } catch (e) { /* ignore */ }
      return {
        hasCouponsData: couponCount > 0,
        dataSource: 'coupons',
        couponCount,
        availableTables: tableNames
      };
    }

    return {
      hasCouponsData: false,
      dataSource: 'none',
      couponCount: 0,
      availableTables: tableNames
    };
  } catch (error) {
    console.error('Error checking coupons data:', error);
    return {
      hasCouponsData: false,
      dataSource: 'error',
      couponCount: 0,
      availableTables: []
    };
  }
}

/**
 * Migrate WooCommerce coupons (wp_posts/vh_posts with post_type = shop_coupon).
 */
async function migrateWooCommerceCoupons(crossServerMigration, queryInterface, Sequelize, migrationStats) {
  try {
    const postsTableName = await getWooCommercePostsTableName(crossServerMigration);
    
    // Handle both wp_post/wp_postmeta and wp_posts/wp_postmeta
    let metaTableName;
    if (postsTableName.toLowerCase().endsWith('posts')) {
      metaTableName = postsTableName.replace('posts', 'postmeta');
    } else if (postsTableName.toLowerCase().endsWith('post')) {
      metaTableName = postsTableName + 'meta';
    } else {
      // Fallback
      metaTableName = postsTableName.replace('post', 'postmeta');
    }
    
    console.log(`📋 Using posts table: ${postsTableName}`);
    console.log(`📋 Using meta table: ${metaTableName}`);

    // Create temporary mapping table for coupon IDs
    await queryInterface.sequelize.query(`DROP TABLE IF EXISTS temp_coupon_id_mapping`);
    await queryInterface.sequelize.query(`
      CREATE TABLE temp_coupon_id_mapping (
        old_coupon_id BIGINT,
        new_coupon_id BIGINT,
        coupon_code VARCHAR(255),
        INDEX idx_old_coupon_id (old_coupon_id),
        INDEX idx_coupon_code (coupon_code)
      ) ENGINE=MEMORY
    `);

    const oldCoupons = await crossServerMigration.fetchFromOldDb(`
      SELECT 
        p.ID as id,
        p.post_title as code,
        p.post_excerpt as description,
        p.post_date as created_at,
        p.post_modified as updated_at,
        p.post_status
      FROM \`${postsTableName}\` p
      WHERE p.post_type = 'shop_coupon'
        AND p.post_status != 'trash'
      ORDER BY p.ID
    `);

    console.log(`📊 Found ${oldCoupons.length} WooCommerce coupons to migrate`);

    for (const oldCoupon of oldCoupons) {
      migrationStats.coupons.processed++;
      try {
        // Normalize coupon code first
        const normalizedCode = oldCoupon.code ? oldCoupon.code.toUpperCase().trim() : null;
        
        if (!normalizedCode) {
          console.log(`⚠️ Skipping coupon ID ${oldCoupon.id} - missing coupon code`);
          migrationStats.coupons.errors++;
          continue;
        }

        // Skip duplicates by normalized code
        const existingCoupon = await queryInterface.sequelize.query(
          'SELECT id FROM coupons WHERE code = ?',
          { replacements: [normalizedCode], type: Sequelize.QueryTypes.SELECT }
        );
        if (existingCoupon.length > 0) {
          console.log(`⏭️ Coupon already exists: ${normalizedCode} (ID: ${existingCoupon[0].id})`);
          // Still store mapping for existing coupon
          await queryInterface.sequelize.query(`
            INSERT IGNORE INTO temp_coupon_id_mapping (old_coupon_id, new_coupon_id, coupon_code)
            VALUES (?, ?, ?)
          `, {
            replacements: [oldCoupon.id, existingCoupon[0].id, normalizedCode]
          });
          continue;
        }

        const couponMeta = await crossServerMigration.fetchFromOldDb(
          `
            SELECT meta_key, meta_value 
            FROM \`${metaTableName}\` 
            WHERE post_id = ?
          `,
          { replacements: [oldCoupon.id] }
        );

        const meta = {};
        couponMeta.forEach(item => {
          meta[item.meta_key] = item.meta_value;
        });

        const discountType = meta.discount_type === 'percent' ? 'percentage' : 'fixed_amount';
        const discountValue = parseFloat(meta.coupon_amount || meta.discount_amount || 0);
        const minimumPurchase = meta.minimum_amount ? parseFloat(meta.minimum_amount) : null;
        const maximumDiscount = meta.maximum_amount ? parseFloat(meta.maximum_amount) : null;
        const usageLimit = meta.usage_limit ? parseInt(meta.usage_limit, 10) : null;
        const usageCount = meta.usage_count ? parseInt(meta.usage_count, 10) : 0;
        const isSingleUse = meta.individual_use === 'yes';

        // Dates
        const startDate = oldCoupon.created_at ? new Date(oldCoupon.created_at) : new Date();
        let endDate = null;
        if (meta.date_expires) {
          const expiresTs = parseInt(meta.date_expires, 10);
          if (!Number.isNaN(expiresTs) && expiresTs > 0) {
            endDate = new Date(expiresTs * 1000);
          }
        } else if (meta.expiry_date) {
          const parsed = new Date(meta.expiry_date);
          if (!Number.isNaN(parsed.getTime())) endDate = parsed;
        }

        // Status
        let status = 'active';
        if (oldCoupon.post_status === 'draft' || oldCoupon.post_status === 'pending') {
          status = 'inactive';
        } else if ((endDate && endDate < new Date()) || (usageLimit && usageCount >= usageLimit)) {
          status = 'expired';
        }

        // Required fields check - Allow discountValue to be 0 (free shipping coupons)
        if (!normalizedCode) {
          console.log(`⚠️ Skipping coupon ID ${oldCoupon.id} - missing required fields`);
          migrationStats.coupons.errors++;
          continue;
        }

        // Use raw query to get the inserted ID
        const [insertResult] = await queryInterface.sequelize.query(`
          INSERT INTO coupons (
            code, description, discount_type, discount_value, minimum_purchase,
            maximum_discount, usage_limit, usage_count, is_single_use,
            start_date, end_date, status, entity_type, entity_id, coupon_user,
            created_by, updated_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, {
          replacements: [
            normalizedCode,
            oldCoupon.description || null,
            discountType,
            discountValue,
            minimumPurchase,
            maximumDiscount,
            usageLimit,
            usageCount,
            isSingleUse,
            startDate,
            endDate,
            status,
            null, null, null, null, null,
            oldCoupon.created_at || new Date(),
            oldCoupon.updated_at || new Date()
          ]
        });

        // Get the new coupon ID
        const [newCoupon] = await queryInterface.sequelize.query(
          'SELECT id FROM coupons WHERE code = ? ORDER BY id DESC LIMIT 1',
          { replacements: [normalizedCode], type: Sequelize.QueryTypes.SELECT }
        );

        if (newCoupon.length > 0) {
          const newCouponId = newCoupon[0].id;
          
          // Store mapping: old WooCommerce coupon ID -> new coupon ID
          await queryInterface.sequelize.query(`
            INSERT INTO temp_coupon_id_mapping (old_coupon_id, new_coupon_id, coupon_code)
            VALUES (?, ?, ?)
          `, {
            replacements: [oldCoupon.id, newCouponId, normalizedCode]
          });

          migrationStats.coupons.created++;
          console.log(
            `✅ Created coupon: ${normalizedCode} (ID: ${newCouponId}, Discount: ${discountValue}${discountType === 'percentage' ? '%' : ''})`
          );
        } else {
          console.error(`❌ Failed to retrieve new coupon ID for: ${normalizedCode}`);
          migrationStats.coupons.errors++;
        }
      } catch (error) {
        console.error(`❌ Error creating coupon ${oldCoupon.code || oldCoupon.id}:`, error.message);
        console.error('   Full error:', error);
        migrationStats.coupons.errors++;
      }
    }

    // Log mapping completion
    const [mappingCount] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) as count FROM temp_coupon_id_mapping'
    );
    console.log(`\n✅ Coupon ID mapping created: ${mappingCount[0].count} coupons mapped`);

    console.log(
      `✅ WooCommerce coupons migration completed: ${migrationStats.coupons.created} created, ${migrationStats.coupons.errors} errors`
    );
  } catch (error) {
    console.error('❌ Error in WooCommerce coupons migration:', error);
    console.error('Stack trace:', error.stack);
    throw error;
  }
}

async function getWooCommercePostsTableName(crossServerMigration) {
  const tables = await crossServerMigration.fetchFromOldDb('SHOW TABLES');
  const tableNames = tables.map(table => Object.values(table)[0]);
  
  // Try to find posts table (handles both singular 'post' and plural 'posts')
  const found = tableNames.find(
    name => {
      const lower = name.toLowerCase();
      return (lower.includes('post') && !lower.includes('meta')) &&
             (lower.startsWith('wp_') || lower.startsWith('vh_'));
    }
  );
  
  if (found) {
    console.log(`✅ Found posts table: ${found}`);
    return found;
  }
  
  // Fallback: try common names in order
  const commonNames = ['wp_posts', 'wp_post', 'vh_posts', 'vh_post'];
  for (const commonName of commonNames) {
    if (tableNames.some(t => t.toLowerCase() === commonName.toLowerCase())) {
      const actual = tableNames.find(t => t.toLowerCase() === commonName.toLowerCase());
      console.log(`✅ Found posts table (fallback): ${actual}`);
      return actual;
    }
  }
  
  console.log('⚠️  Posts table not found, defaulting to wp_posts');
  return 'wp_posts';
}

/**
 * Migrate coupons from a legacy/custom coupons table.
 */
async function migrateCoupons(crossServerMigration, queryInterface, Sequelize, migrationStats) {
  try {
    const oldCoupons = await crossServerMigration.fetchFromOldDb(`
      SELECT 
        id,
        code,
        description,
        discount_type,
        discount_value,
        minimum_purchase,
        maximum_discount,
        usage_limit,
        usage_count,
        is_single_use,
        start_date,
        end_date,
        status,
        entity_type,
        entity_id,
        coupon_user,
        created_by,
        updated_by,
        created_at,
        updated_at,
        deleted_at
      FROM coupons 
      WHERE deleted_at IS NULL
      ORDER BY id ASC
    `);

    console.log(`📊 Found ${oldCoupons.length} coupons to migrate`);

    for (const oldCoupon of oldCoupons) {
      migrationStats.coupons.processed++;
      try {
        if (!oldCoupon.code || !oldCoupon.discount_type || !oldCoupon.discount_value || !oldCoupon.start_date) {
          console.log(`⚠️ Skipping coupon ${oldCoupon.code || oldCoupon.id} - missing required fields`);
          migrationStats.coupons.errors++;
          continue;
        }

        // Skip duplicates
        const existingCoupon = await queryInterface.sequelize.query(
          'SELECT id FROM coupons WHERE code = ?',
          { replacements: [oldCoupon.code], type: Sequelize.QueryTypes.SELECT }
        );
        if (existingCoupon.length > 0) {
          console.log(`⏭️ Coupon already exists: ${oldCoupon.code} (ID: ${existingCoupon[0].id})`);
          continue;
        }

        // Normalize discount_type
        let discountType = oldCoupon.discount_type;
        if (discountType === 'percent' || discountType === 'percentage') discountType = 'percentage';
        else if (discountType === 'fixed' || discountType === 'fixed_amount') discountType = 'fixed_amount';

        // Normalize status
        let status = oldCoupon.status || 'active';
        if (!['active', 'inactive', 'expired'].includes(status)) {
          if ((oldCoupon.end_date && new Date(oldCoupon.end_date) < new Date()) ||
              (oldCoupon.usage_limit && oldCoupon.usage_count >= oldCoupon.usage_limit)) {
            status = 'expired';
          } else {
            status = 'active';
          }
        }

        await queryInterface.bulkInsert('coupons', [{
          code: oldCoupon.code.toUpperCase().trim(),
          description: oldCoupon.description || null,
          discount_type: discountType,
          discount_value: parseFloat(oldCoupon.discount_value),
          minimum_purchase: oldCoupon.minimum_purchase ? parseFloat(oldCoupon.minimum_purchase) : null,
          maximum_discount: oldCoupon.maximum_discount ? parseFloat(oldCoupon.maximum_discount) : null,
          usage_limit: oldCoupon.usage_limit ? parseInt(oldCoupon.usage_limit, 10) : null,
          usage_count: oldCoupon.usage_count ? parseInt(oldCoupon.usage_count, 10) : 0,
          is_single_use: oldCoupon.is_single_use === 1 || oldCoupon.is_single_use === true,
          start_date: new Date(oldCoupon.start_date),
          end_date: oldCoupon.end_date ? new Date(oldCoupon.end_date) : null,
          status,
          entity_type: oldCoupon.entity_type || null,
          entity_id: oldCoupon.entity_id || null,
          coupon_user: oldCoupon.coupon_user || null,
          created_by: oldCoupon.created_by || null,
          updated_by: oldCoupon.updated_by || null,
          created_at: oldCoupon.created_at || new Date(),
          updated_at: oldCoupon.updated_at || new Date()
        }]);

        migrationStats.coupons.created++;
        console.log(
          `✅ Created coupon: ${oldCoupon.code} (Discount: ${oldCoupon.discount_value}${discountType === 'percentage' ? '%' : ''})`
        );
      } catch (error) {
        console.error(`❌ Error creating coupon ${oldCoupon.code || oldCoupon.id}:`, error.message);
        migrationStats.coupons.errors++;
      }
    }

    console.log(
      `✅ Coupons migration completed: ${migrationStats.coupons.created} created, ${migrationStats.coupons.errors} errors`
    );
  } catch (error) {
    console.error('❌ Error in coupons migration:', error);
    throw error;
  }
}

function generateMigrationReport(migrationStats) {
  const report = `
🎉 COUPONS MIGRATION REPORT
===========================
Coupons Processed: ${migrationStats.coupons.processed}
Coupons Created: ${migrationStats.coupons.created}
Coupons Updated: ${migrationStats.coupons.updated}
Coupons Errors: ${migrationStats.coupons.errors}

Total Coupons Migrated: ${migrationStats.coupons.created}
`;

  console.log(report);
}

