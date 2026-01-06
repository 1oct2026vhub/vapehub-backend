'use strict';

const fs = require('fs');
const path = require('path');

module.exports = {
  async up(queryInterface, Sequelize) {
    const CHUNK_SIZE = 1000;
    const JSON_FILE_PATH = path.join(__dirname, '../../public/json/vh_orders_export.json');

    try {
      console.log('🚀 Starting JSON orders import...');

      // Step 1: Read and parse JSON file
      console.log('📖 Reading JSON file...');
      if (!fs.existsSync(JSON_FILE_PATH)) {
        throw new Error(`JSON file not found at: ${JSON_FILE_PATH}`);
      }

      const jsonContent = fs.readFileSync(JSON_FILE_PATH, 'utf8');
      const jsonData = JSON.parse(jsonContent);

      // Extract data array (skip header and metadata)
      let orderData = [];
      for (const item of jsonData) {
        if (item.type === 'table' && item.data) {
          orderData = item.data;
          break;
        }
      }

      if (orderData.length === 0) {
        console.log('⚠️ No order data found in JSON file');
        return;
      }

      console.log(`📊 Found ${orderData.length} order items in JSON file`);

      // Step 2: Normalize data - group by order_id to get unique orders
      console.log('🔄 Normalizing data (grouping by order_id)...');
      const ordersMap = new Map();
      const orderItemsMap = new Map(); // order_id -> array of items

      for (const row of orderData) {
        const orderId = row.order_id;

        // Store order data (will be overwritten with same data, but that's fine)
        if (!ordersMap.has(orderId)) {
          const orderDate = row.order_date || new Date().toISOString();
          const dateStr = orderDate.substring(0, 10).replace(/-/g, '');
          
          ordersMap.set(orderId, {
            id: parseInt(orderId),
            order_date: orderDate,
            date_updated_gmt: row.date_updated_gmt || orderDate,
            order_status: row.order_status,
            customer_id: row.customer_id === '0' || !row.customer_id ? null : parseInt(row.customer_id),
            order_total: parseFloat(row.order_total) || 0,
            order_tax: parseFloat(row.order_tax) || 0,
            billing_email: row.billing_email,
            billing_first_name: row.billing_first_name,
            billing_last_name: row.billing_last_name,
            billing_company: row.billing_company,
            billing_country: row.billing_country,
            billing_address_1: row.billing_address_1,
            billing_address_2: row.billing_address_2,
            billing_city: row.billing_city,
            billing_state: row.billing_state,
            billing_postcode: row.billing_postcode,
            billing_phone: row.billing_phone,
            order_code: `ORD-${orderId}-${dateStr}`,
            order_unique_id: `ORD-${orderId}-${dateStr}`
          });
        }

        // Store order items
        if (!orderItemsMap.has(orderId)) {
          orderItemsMap.set(orderId, []);
        }

        orderItemsMap.get(orderId).push({
          order_item_id: parseInt(row.order_item_id),
          order_item_name: row.order_item_name,
          order_item_type: row.order_item_type,
          product_id: row.product_id ? parseInt(row.product_id) : null,
          variation_id: row.variation_id ? parseInt(row.variation_id) : null,
          quantity: parseInt(row.quantity) || 1,
          line_total: parseFloat(row.line_total) || 0,
          line_subtotal: parseFloat(row.line_subtotal) || null
        });
      }

      const uniqueOrders = Array.from(ordersMap.values());
      console.log(`✅ Normalized to ${uniqueOrders.length} unique orders`);

      // Step 3: Check for already migrated orders using primary key id
      console.log('🔍 Checking for already migrated orders...');
      const [migratedOrderIds] = await queryInterface.sequelize.query(`
        SELECT id FROM orders WHERE id IS NOT NULL
      `);

      const migratedIds = new Set(migratedOrderIds.map(row => row.id.toString()));
      console.log(`📋 Found ${migratedIds.size} already migrated orders`);

      // Filter out already migrated orders
      const ordersToMigrate = uniqueOrders.filter(order => {
        return !migratedIds.has(order.id.toString());
      });

      console.log(`📦 ${ordersToMigrate.length} new orders to migrate`);

      if (ordersToMigrate.length === 0) {
        console.log('✅ All orders already migrated!');
        return;
      }

      // Step 4: Skip - We'll use JSON product IDs directly to check against new database
      console.log('✅ Using JSON product IDs directly (no mapping tables needed)');

      // Step 5: Process orders in chunks
      const totalChunks = Math.ceil(ordersToMigrate.length / CHUNK_SIZE);
      console.log(`🔄 Processing ${ordersToMigrate.length} orders in ${totalChunks} chunks...`);

      // Track skipped orders and items with reasons
      const skipStats = {
        orders: {
          duplicate: 0, // Already exists in database
          noMapping: 0 // Order wasn't inserted (shouldn't happen with INSERT IGNORE)
        },
        items: {
          productNotFound: 0,
          variantNotFound: 0,
          productIdNull: 0,
          orderMappingNotFound: 0,
          insertError: 0
        }
      };

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const startIdx = chunkIndex * CHUNK_SIZE;
        const endIdx = Math.min(startIdx + CHUNK_SIZE, ordersToMigrate.length);
        const chunk = ordersToMigrate.slice(startIdx, endIdx);
        const transaction = await queryInterface.sequelize.transaction();

        try {
          console.log(`📦 Processing chunk ${chunkIndex + 1}/${totalChunks} (${chunk.length} orders)...`);

          // Step 5a: Create temporary table for orders
          await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_orders_chunk`, { transaction });
          await queryInterface.sequelize.query(`
            CREATE TEMPORARY TABLE temp_orders_chunk (
              id BIGINT,
              user_id BIGINT,
              total DECIMAL(10,2),
              discount_price DECIMAL(10,2),
              status VARCHAR(50),
              date_created_gmt DATETIME,
              date_updated_gmt DATETIME,
              billing_email VARCHAR(255),
              billing_phone VARCHAR(255),
              order_unique_id VARCHAR(255),
              order_code VARCHAR(255),
              sub_total DECIMAL(10,2)
            )
          `, { transaction });

          // Step 5b: Map users and insert orders into temp table
          for (const order of chunk) {
            let mappedUserId = null;

            // Try to map user by customer_id
            if (order.customer_id) {
              const [user] = await queryInterface.sequelize.query(`
                SELECT id FROM users WHERE id = ?
              `, { replacements: [order.customer_id] });
              if (user.length > 0) {
                mappedUserId = user[0].id;
              }
            }

            // Fallback: try email mapping
            if (!mappedUserId && order.billing_email) {
              const [user] = await queryInterface.sequelize.query(`
                SELECT id FROM users WHERE email = ?
              `, { replacements: [order.billing_email] });
              if (user.length > 0) {
                mappedUserId = user[0].id;
              }
            }

            await queryInterface.sequelize.query(`
              INSERT INTO temp_orders_chunk (
                id, user_id, total, discount_price, status,
                date_created_gmt, date_updated_gmt, billing_email,
                billing_phone, order_unique_id, order_code, sub_total
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, {
              replacements: [
                order.id,
                mappedUserId,
                order.order_total,
                order.order_tax,
                order.order_status,
                order.order_date,
                order.date_updated_gmt,
                order.billing_email,
                order.billing_phone,
                order.order_unique_id,
                order.order_code,
                order.order_total // sub_total same as total for now
              ],
              transaction
            });
          }

          // Step 5c: Insert orders (using INSERT IGNORE to prevent duplicates by primary key)
          await queryInterface.sequelize.query(`SET FOREIGN_KEY_CHECKS = 0`, { transaction });

          // Count orders before insert
          const [ordersBeforeCount] = await queryInterface.sequelize.query(`
            SELECT COUNT(*) as count FROM temp_orders_chunk
          `, { transaction });

          await queryInterface.sequelize.query(`
            INSERT IGNORE INTO orders (
              id, user_id, coupon_id, total, discount_price, status, shipping_method_id,
              createdAt, updatedAt, deletedAt, shipping_address_id, billing_address_id,
              order_unique_id, deals_discount, applicable_deals, shipping_cost, order_code,
              email, phone, order_shipping_address_id, order_billing_address_id, referral_id,
              sub_total, discount_type, payment_method_id, shipstation_order_id, loyalty_flag,
              loyalty_discount, mailSubscription_discount, ordered
            )
            SELECT 
              id,
              user_id,
              NULL as coupon_id,
              total,
              discount_price,
              CASE 
                WHEN status = 'wc-completed' THEN 'completed'
                WHEN status = 'wc-processing' THEN 'processing'
                WHEN status = 'wc-pending' THEN 'pending'
                WHEN status = 'wc-cancelled' THEN 'cancel'
                WHEN status = 'wc-failed' THEN 'fail'
                WHEN status = 'wc-refunded' THEN 'refunded'
                WHEN status = 'wc-on-hold' THEN 'pending'
                WHEN status = 'completed' THEN 'completed'
                WHEN status = 'processing' THEN 'processing'
                WHEN status = 'pending' THEN 'pending'
                WHEN status = 'cancelled' THEN 'cancel'
                WHEN status = 'failed' THEN 'fail'
                WHEN status = 'refunded' THEN 'refunded'
                WHEN status = 'on-hold' THEN 'pending'
                ELSE 'pending'
              END as status,
              1 as shipping_method_id,
              date_created_gmt as createdAt,
              date_updated_gmt as updatedAt,
              CASE WHEN status IN ('wc-cancelled', 'wc-failed', 'cancelled', 'failed') 
                THEN date_updated_gmt ELSE NULL END as deletedAt,
              NULL as shipping_address_id,
              NULL as billing_address_id,
              order_unique_id,
              0.00 as deals_discount,
              NULL as applicable_deals,
              0.00 as shipping_cost,
              order_code,
              billing_email as email,
              billing_phone as phone,
              NULL as order_shipping_address_id,
              NULL as order_billing_address_id,
              NULL as referral_id,
              sub_total,
              NULL as discount_type,
              1 as payment_method_id,
              NULL as shipstation_order_id,
              0 as loyalty_flag,
              0.00 as loyalty_discount,
              0.00 as mailSubscription_discount,
              CASE WHEN status IN ('wc-completed', 'completed') THEN 1 ELSE 0 END as ordered
            FROM temp_orders_chunk
          `, { transaction });

          // Count how many orders were actually inserted vs skipped (duplicates)
          const [ordersAfterCount] = await queryInterface.sequelize.query(`
            SELECT COUNT(*) as count 
            FROM temp_orders_chunk toc
            INNER JOIN orders o ON o.id = toc.id
          `, { transaction });

          const duplicateCount = parseInt(ordersBeforeCount[0].count) - parseInt(ordersAfterCount[0].count);
          skipStats.orders.duplicate += duplicateCount;
          
          if (duplicateCount > 0) {
            console.log(`   ⚠️ Skipped ${duplicateCount} duplicate orders (already exist in database)`);
          }

          // Step 5d: Create order mapping using primary key id
          await queryInterface.sequelize.query(`
            CREATE TEMPORARY TABLE temp_order_mapping_chunk AS
            SELECT old_o.id as old_order_id, new_o.id as new_order_id
            FROM temp_orders_chunk old_o
            INNER JOIN orders new_o ON new_o.id = old_o.id
          `, { transaction });

          // Step 5e: Insert order addresses
          for (const order of chunk) {
            const [orderMapping] = await queryInterface.sequelize.query(`
              SELECT om.new_order_id, o.user_id 
              FROM temp_order_mapping_chunk om
              INNER JOIN orders o ON o.id = om.new_order_id
              WHERE om.old_order_id = ?
            `, { 
              replacements: [order.id],
              transaction 
            });

            if (orderMapping.length > 0) {
              const newOrderId = orderMapping[0].new_order_id;
              const userId = orderMapping[0].user_id;
              const customerName = order.billing_first_name || 
                (order.billing_email ? order.billing_email.split('@')[0] : 'Customer');

              await queryInterface.sequelize.query(`
                INSERT INTO order_addresses (
                  order_id, user_id, name, last_name, company_name, country, street,
                  apartment, town, county, region, post_code, phone, token, created_at, updated_at, deleted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NULL)
              `, {
                replacements: [
                  newOrderId,
                  userId,
                  customerName,
                  order.billing_last_name || null,
                  order.billing_company || null,
                  order.billing_country || null,
                  order.billing_address_1 || null,
                  order.billing_address_2 || null,
                  order.billing_city || null,
                  order.billing_state || null,
                  null, // region
                  order.billing_postcode || null,
                  order.billing_phone || null,
                  null  // token
                ],
                transaction
              });
            }
          }

          // Step 5f: Update order address references
          await queryInterface.sequelize.query(`
            UPDATE orders o
            INNER JOIN temp_order_mapping_chunk om ON o.id = om.new_order_id
            INNER JOIN order_addresses oa ON oa.order_id = om.new_order_id
            SET o.order_billing_address_id = oa.id, o.order_shipping_address_id = oa.id
            WHERE oa.deleted_at IS NULL
          `, { transaction });

          // Step 5g: Insert order items with detailed skip tracking
          let successfulItems = 0;
          let failedItems = 0;
          const skippedItemsDetails = [];

          for (const order of chunk) {
            const items = orderItemsMap.get(order.id.toString()) || [];
            const [orderMapping] = await queryInterface.sequelize.query(`
              SELECT new_order_id FROM temp_order_mapping_chunk WHERE old_order_id = ?
            `, { 
              replacements: [order.id],
              transaction 
            });

            if (orderMapping.length === 0) {
              skipStats.items.orderMappingNotFound += items.length;
              skippedItemsDetails.push({
                orderId: order.id,
                itemCount: items.length,
                reason: 'Order mapping not found (order was not inserted)'
              });
              continue;
            }

            const newOrderId = orderMapping[0].new_order_id;

            for (const item of items) {
              try {
                // Try to get product/variant IDs directly from new database using JSON IDs
                let productId = null;
                let variantId = null;
                let skipReason = null;

                if (!item.product_id) {
                  skipReason = 'Product ID is NULL in JSON';
                  skipStats.items.productIdNull++;
                } else {
                  // Direct lookup: check if product_id from JSON exists in new database
                  const [productCheck] = await queryInterface.sequelize.query(`
                    SELECT id FROM products WHERE id = ? LIMIT 1
                  `, { replacements: [item.product_id], transaction });
                  
                  if (productCheck.length > 0) {
                    productId = productCheck[0].id;
                  } else {
                    skipReason = `Product ID ${item.product_id} not found in new database`;
                    skipStats.items.productNotFound++;
                  }
                }

                if (item.variation_id && !skipReason) {
                  // Direct lookup: check if variation_id from JSON exists in new database
                  const [variantCheck] = await queryInterface.sequelize.query(`
                    SELECT id, product_id FROM product_variants WHERE id = ? LIMIT 1
                  `, { replacements: [item.variation_id], transaction });
                  
                  if (variantCheck.length > 0) {
                    variantId = variantCheck[0].id;
                    // If product wasn't found by product_id, use product_id from variant
                    if (!productId) {
                      productId = variantCheck[0].product_id;
                      skipReason = null; // Clear skip reason if variant provides product
                    }
                  } else {
                    // Variant not found, but we can still proceed if product is found
                    if (!productId) {
                      skipReason = `Variant ID ${item.variation_id} not found in new database`;
                      skipStats.items.variantNotFound++;
                    }
                  }
                }

                // Try name-based matching as fallback
                if (!productId && item.order_item_name) {
                  const [nameMatch] = await queryInterface.sequelize.query(`
                    SELECT id FROM products WHERE name LIKE ? LIMIT 1
                  `, { 
                    replacements: [`%${item.order_item_name.split(' - ')[0]}%`],
                    transaction 
                  });
                  if (nameMatch.length > 0) {
                    productId = nameMatch[0].id;
                    skipReason = null; // Clear skip reason if name match found
                  }
                }

                // Only insert order item if product_id is found (product_id is NOT NULL in schema)
                if (productId) {
                  await queryInterface.sequelize.query(`
                    INSERT INTO order_items (
                      order_id, product_id, variant_id, unit, unit_price, quantity,
                      discount_price, total, createdAt, updatedAt, deletedAt
                    )
                    VALUES (?, ?, ?, 'piece', ?, ?, ?, ?, ?, ?, ?)
                  `, {
                    replacements: [
                      newOrderId,
                      productId,
                      variantId,
                      item.line_total || 0,
                      item.quantity || 1,
                      item.line_subtotal || null,
                      item.line_total || 0,
                      order.order_date || new Date(),
                      order.date_updated_gmt || new Date(),
                      order.order_status && ['wc-cancelled', 'wc-failed', 'cancelled', 'failed'].includes(order.order_status)
                        ? (order.date_updated_gmt || new Date()) : null
                    ],
                    transaction
                  });
                  successfulItems++;
                } else {
                  // Track skipped item with reason
                  skippedItemsDetails.push({
                    orderId: order.id,
                    itemName: item.order_item_name,
                    productId: item.product_id,
                    variationId: item.variation_id,
                    reason: skipReason || 'Product not found (no ID match and name match failed)'
                  });
                }
              } catch (error) {
                failedItems++;
                skipStats.items.insertError++;
                console.error(`⚠️ Failed to insert order item for order ${order.id}: ${error.message}`);
              }
            }
          }

          console.log(`📊 Order items: ${successfulItems} successful, ${failedItems} failed`);
          
          // Log skipped items summary for this chunk
          if (skippedItemsDetails.length > 0) {
            console.log(`   ⚠️ Skipped ${skippedItemsDetails.length} order items in this chunk`);
            // Log first 5 skipped items as examples
            skippedItemsDetails.slice(0, 5).forEach(skipped => {
              console.log(`      - Order ${skipped.orderId}: ${skipped.reason}${skipped.itemName ? ` (${skipped.itemName})` : ''}`);
            });
            if (skippedItemsDetails.length > 5) {
              console.log(`      ... and ${skippedItemsDetails.length - 5} more`);
            }
          }

          // Step 5h: Insert order logs
          await queryInterface.sequelize.query(`
            INSERT INTO order_logs (
              order_id, user_id, status, label, additional_info, createdAt, updatedAt
            )
            SELECT 
              om.new_order_id as order_id,
              o.user_id,
              o.status,
              CONCAT('Order ', o.status, ' from JSON import') as label,
              CONCAT('Imported from JSON order ID: ', om.old_order_id) as additional_info,
              o.createdAt,
              o.updatedAt
            FROM orders o
            INNER JOIN temp_order_mapping_chunk om ON o.id = om.new_order_id
          `, { transaction });

          await queryInterface.sequelize.query(`SET FOREIGN_KEY_CHECKS = 1`, { transaction });

          // Cleanup
          await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_orders_chunk`, { transaction });
          await queryInterface.sequelize.query(`DROP TEMPORARY TABLE IF EXISTS temp_order_mapping_chunk`, { transaction });

          await transaction.commit();
          console.log(`✅ Chunk ${chunkIndex + 1}/${totalChunks} completed`);

        } catch (error) {
          await transaction.rollback();
          console.error(`❌ Error in chunk ${chunkIndex + 1}:`, error.message);
          throw error;
        }
      }

      // Final summary
      const [finalOrdersCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM orders WHERE id IS NOT NULL
      `);
      const [finalItemsCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM order_items
      `);
      const [finalAddressesCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM order_addresses
      `);
      const [finalLogsCount] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM order_logs WHERE additional_info LIKE '%JSON import%'
      `);

      console.log('\n📊 Import Summary:');
      console.log(`   📈 Total orders: ${finalOrdersCount[0].count}`);
      console.log(`   🛍️ Total order items: ${finalItemsCount[0].count}`);
      console.log(`   📍 Total order addresses: ${finalAddressesCount[0].count}`);
      console.log(`   📝 Total order logs: ${finalLogsCount[0].count}`);
      console.log(`   ✅ New orders imported: ${ordersToMigrate.length}`);

      console.log('\n⚠️ Skip Statistics:');
      console.log(`   📦 Skipped Orders:`);
      console.log(`      - Duplicate (already exist): ${skipStats.orders.duplicate}`);
      console.log(`      - No mapping found: ${skipStats.orders.noMapping}`);
      console.log(`   🛍️ Skipped Order Items:`);
      console.log(`      - Product not found: ${skipStats.items.productNotFound}`);
      console.log(`      - Variant not found: ${skipStats.items.variantNotFound}`);
      console.log(`      - Product ID is NULL: ${skipStats.items.productIdNull}`);
      console.log(`      - Order mapping not found: ${skipStats.items.orderMappingNotFound}`);
      console.log(`      - Insert error: ${skipStats.items.insertError}`);
      const totalSkippedItems = skipStats.items.productNotFound + skipStats.items.variantNotFound + 
                                skipStats.items.productIdNull + skipStats.items.orderMappingNotFound + 
                                skipStats.items.insertError;
      console.log(`   📊 Total skipped items: ${totalSkippedItems}`);

      console.log('🎉 JSON orders import completed successfully!');

    } catch (error) {
      console.error('❌ JSON orders import failed:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction();
    
    try {
      console.log('🔄 Rolling back JSON orders import...');
      
      await queryInterface.sequelize.query(
        `DELETE FROM order_logs WHERE additional_info LIKE '%JSON import%'`, 
        { transaction }
      );
      
      // Get order IDs from JSON to delete specific orders
      // Note: This is a simplified rollback - you may want to store order IDs during import
      await queryInterface.sequelize.query(
        `DELETE FROM order_items WHERE order_id IN (
          SELECT id FROM orders WHERE order_code LIKE 'ORD-%' 
          AND createdAt >= DATE_SUB(NOW(), INTERVAL 1 DAY)
        )`, 
        { transaction }
      );
      
      await queryInterface.sequelize.query(
        `DELETE FROM order_addresses WHERE order_id IN (
          SELECT id FROM orders WHERE order_code LIKE 'ORD-%' 
          AND createdAt >= DATE_SUB(NOW(), INTERVAL 1 DAY)
        )`, 
        { transaction }
      );
      
      await queryInterface.sequelize.query(
        `DELETE FROM orders WHERE order_code LIKE 'ORD-%' 
         AND createdAt >= DATE_SUB(NOW(), INTERVAL 1 DAY)`, 
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
