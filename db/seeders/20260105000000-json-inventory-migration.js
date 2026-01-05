'use strict';

// Load environment variables
require('dotenv').config();

const fs = require('fs');
const path = require('path');

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('🚀 Starting JSON Inventory Report Migration...');
      console.log('================================================');
      
      // Get JSON path from environment variable or use default
      const defaultJsonPath = path.join(__dirname, '../../public/json/vapehub_inventory_data.json');
      const jsonPath = process.env.JSON_INVENTORY_PATH || defaultJsonPath;
      
      // Configuration for status updates
      const STATUS_CONFIG = {
        // Set status to 'published' if stock > 0 (for products)
        PUBLISH_IF_STOCK_GT: parseInt(process.env.JSON_PUBLISH_STOCK_THRESHOLD) || 0,
        // Set status to 'archived' if stock = 0 (for products)
        ARCHIVE_IF_STOCK_EQ: parseInt(process.env.JSON_ARCHIVE_STOCK_THRESHOLD) || 0,
        // Set status to 'active' if stock > 0 (for variants)
        ACTIVATE_VARIANT_IF_STOCK_GT: parseInt(process.env.JSON_ACTIVATE_VARIANT_STOCK_THRESHOLD) || 0,
        // Set status to 'inactive' if stock = 0 (for variants)
        DEACTIVATE_VARIANT_IF_STOCK_EQ: parseInt(process.env.JSON_DEACTIVATE_VARIANT_STOCK_THRESHOLD) || 0,
        // Only update status if product is currently published (set to false to update all)
        ONLY_UPDATE_PUBLISHED: process.env.JSON_ONLY_UPDATE_PUBLISHED === 'true' || false
      };
      
      console.log('📋 Status Update Configuration:');
      console.log(`   - Publish products with stock > ${STATUS_CONFIG.PUBLISH_IF_STOCK_GT}`);
      console.log(`   - Archive products with stock = ${STATUS_CONFIG.ARCHIVE_IF_STOCK_EQ}`);
      console.log(`   - Activate variants with stock > ${STATUS_CONFIG.ACTIVATE_VARIANT_IF_STOCK_GT}`);
      console.log(`   - Deactivate variants with stock = ${STATUS_CONFIG.DEACTIVATE_VARIANT_IF_STOCK_EQ}`);
      console.log(`   - Only update published products: ${STATUS_CONFIG.ONLY_UPDATE_PUBLISHED}`);
      
      // Check if JSON file exists
      if (!fs.existsSync(jsonPath)) {
        console.error(`❌ JSON file not found at: ${jsonPath}`);
        if (!process.env.JSON_INVENTORY_PATH) {
          console.log('💡 Using default path. If JSON is in a different location, set JSON_INVENTORY_PATH in .env file');
        } else {
          console.log('💡 Please check the JSON_INVENTORY_PATH in your .env file');
        }
        throw new Error(`JSON file not found: ${jsonPath}`);
      }

      console.log(`\n📄 Reading JSON from: ${jsonPath}`);
      const jsonData = fs.readFileSync(jsonPath, 'utf8');
      const inventoryItems = JSON.parse(jsonData);
      
      if (!Array.isArray(inventoryItems)) {
        throw new Error('JSON file must contain an array of inventory items');
      }
      
      console.log(`📦 Found ${inventoryItems.length} inventory items in JSON`);
      
      // Get existing products from database for matching
      const existingProducts = await queryInterface.sequelize.query(`
        SELECT id, name, sku, slug, stock_quantity, status
        FROM products
        WHERE deletedAt IS NULL
        ${STATUS_CONFIG.ONLY_UPDATE_PUBLISHED ? "AND status = 'published'" : ''}
      `, { type: Sequelize.QueryTypes.SELECT });
      
      console.log(`🔍 Found ${existingProducts.length} existing products in database`);
      
      // Get existing product variants from database for matching
      const existingVariants = await queryInterface.sequelize.query(`
        SELECT id, slug, stock, status
        FROM product_variants
        WHERE deleted_at IS NULL
        ${STATUS_CONFIG.ONLY_UPDATE_PUBLISHED ? "AND status = 'active'" : ''}
      `, { type: Sequelize.QueryTypes.SELECT });
      
      console.log(`🔍 Found ${existingVariants.length} existing product variants in database`);
      
      // Create lookup maps for products
      const productByName = new Map();
      const productBySku = new Map();
      const productBySlug = new Map();
      
      existingProducts.forEach(product => {
        if (product.name) {
          const normalizedName = normalizeProductName(product.name);
          if (!productByName.has(normalizedName)) {
            productByName.set(normalizedName, []);
          }
          productByName.get(normalizedName).push(product);
        }
        if (product.sku) {
          productBySku.set(product.sku.toLowerCase().trim(), product);
        }
        if (product.slug) {
          productBySlug.set(product.slug.toLowerCase().trim(), product);
        }
      });
      
      // Create lookup map for variants (by slug only, as variants typically use slug for matching)
      const variantBySlug = new Map();
      existingVariants.forEach(variant => {
        if (variant.slug) {
          variantBySlug.set(variant.slug.toLowerCase().trim(), variant);
        }
      });
      
      // Match and update products and variants
      let matchedProductCount = 0;
      let matchedVariantCount = 0;
      let productStockUpdatedCount = 0;
      let variantStockUpdatedCount = 0;
      let productStatusUpdatedCount = 0;
      let variantStatusUpdatedCount = 0;
      let publishedCount = 0;
      let archivedCount = 0;
      let activatedCount = 0;
      let deactivatedCount = 0;
      let notFoundCount = 0;
      const notFoundProducts = [];
      const statusChanges = [];
      
      console.log('\n🔄 Processing inventory items...');
      
      for (const item of inventoryItems) {
        // Try to match variant first (by slug - most reliable for variants)
        let matchedVariant = null;
        let matchedProduct = null;
        
        // Priority 1: Try to match variant by slug
        if (item.slug) {
          matchedVariant = variantBySlug.get(item.slug.toLowerCase().trim());
        }
        
        // Priority 2: If no variant match, try to match product
        if (!matchedVariant) {
          if (item.slug) {
            matchedProduct = productBySlug.get(item.slug.toLowerCase().trim());
          }
          
          if (!matchedProduct && item.sku) {
            matchedProduct = productBySku.get(item.sku.toLowerCase().trim());
          }
          
          if (!matchedProduct && item.full_name) {
            matchedProduct = findMatchingProduct(
              item.full_name,
              productByName,
              productBySku,
              productBySlug
            );
          }
        }
        
        // Update variant if matched
        if (matchedVariant) {
          matchedVariantCount++;
          
          const newStock = parseInt(item.stock) || 0;
          const oldStock = matchedVariant.stock || 0;
          const oldStatus = matchedVariant.status;
          
          // Determine new status based on stock
          let newStatus = oldStatus;
          if (newStock > STATUS_CONFIG.ACTIVATE_VARIANT_IF_STOCK_GT) {
            newStatus = 'active';
          } else if (newStock === STATUS_CONFIG.DEACTIVATE_VARIANT_IF_STOCK_EQ) {
            newStatus = 'inactive';
          }
          
          // Check if updates are needed
          const needsStockUpdate = oldStock !== newStock;
          const needsStatusUpdate = oldStatus !== newStatus;
          
          if (needsStockUpdate || needsStatusUpdate) {
            // Build update query for variant
            const updateFields = [];
            const replacements = { variantId: matchedVariant.id };
            
            if (needsStockUpdate) {
              updateFields.push('stock = :stock');
              replacements.stock = newStock;
              variantStockUpdatedCount++;
            }
            
            if (needsStatusUpdate) {
              updateFields.push('status = :status');
              replacements.status = newStatus;
              variantStatusUpdatedCount++;
              
              if (newStatus === 'active') {
                activatedCount++;
              } else if (newStatus === 'inactive') {
                deactivatedCount++;
              }
              
              statusChanges.push({
                type: 'variant',
                id: matchedVariant.id,
                slug: item.slug,
                oldStatus: oldStatus,
                newStatus: newStatus,
                stock: newStock
              });
            }
            
            updateFields.push('updated_at = NOW()');
            
            await queryInterface.sequelize.query(`
              UPDATE product_variants 
              SET ${updateFields.join(', ')}
              WHERE id = :variantId
            `, { replacements });
            
            if ((variantStockUpdatedCount + variantStatusUpdatedCount) % 50 === 0) {
              console.log(`  ✅ Updated ${variantStockUpdatedCount} variant stock + ${variantStatusUpdatedCount} variant status...`);
            }
          }
        }
        // Update product if matched (and no variant was matched)
        else if (matchedProduct) {
          matchedProductCount++;
          
          const newStock = parseInt(item.stock) || 0;
          const oldStock = matchedProduct.stock_quantity || 0;
          const oldStatus = matchedProduct.status;
          
          // Determine new status based on stock
          let newStatus = oldStatus;
          if (newStock > STATUS_CONFIG.PUBLISH_IF_STOCK_GT) {
            newStatus = 'published';
          } else if (newStock === STATUS_CONFIG.ARCHIVE_IF_STOCK_EQ) {
            newStatus = 'archived';
          }
          
          // Check if updates are needed
          const needsStockUpdate = oldStock !== newStock;
          const needsStatusUpdate = oldStatus !== newStatus;
          
          if (needsStockUpdate || needsStatusUpdate) {
            // Build update query
            const updateFields = [];
            const replacements = { productId: matchedProduct.id };
            
            if (needsStockUpdate) {
              updateFields.push('stock_quantity = :stock');
              replacements.stock = newStock;
              productStockUpdatedCount++;
            }
            
            if (needsStatusUpdate) {
              updateFields.push('status = :status');
              replacements.status = newStatus;
              productStatusUpdatedCount++;
              
              if (newStatus === 'published') {
                publishedCount++;
              } else if (newStatus === 'archived') {
                archivedCount++;
              }
              
              statusChanges.push({
                type: 'product',
                id: matchedProduct.id,
                name: matchedProduct.name,
                oldStatus: oldStatus,
                newStatus: newStatus,
                stock: newStock
              });
            }
            
            updateFields.push('updatedAt = NOW()');
            
            await queryInterface.sequelize.query(`
              UPDATE products 
              SET ${updateFields.join(', ')}
              WHERE id = :productId
            `, { replacements });
            
            if ((productStockUpdatedCount + productStatusUpdatedCount) % 50 === 0) {
              console.log(`  ✅ Updated ${productStockUpdatedCount} product stock + ${productStatusUpdatedCount} product status...`);
            }
          }
        } else {
          notFoundCount++;
          const productName = item.full_name || item.slug || item.sku || 'Unknown';
          notFoundProducts.push(productName);
          
          // Log first 10 not found products as examples
          if (notFoundCount <= 10) {
            console.log(`  ⚠️  Product/Variant not found: "${productName}" (Stock: ${item.stock}, Slug: ${item.slug || 'N/A'}, SKU: ${item.sku || 'N/A'})`);
          }
        }
      }
      
      console.log('\n📊 Migration Summary:');
      console.log('================================================');
      console.log(`✅ Total items in JSON: ${inventoryItems.length}`);
      console.log(`✅ Matched products: ${matchedProductCount}`);
      console.log(`✅ Matched variants: ${matchedVariantCount}`);
      console.log(`✅ Product stock quantities updated: ${productStockUpdatedCount}`);
      console.log(`✅ Variant stock quantities updated: ${variantStockUpdatedCount}`);
      console.log(`✅ Product statuses updated: ${productStatusUpdatedCount}`);
      console.log(`✅ Variant statuses updated: ${variantStatusUpdatedCount}`);
      console.log(`   - Products Published: ${publishedCount}`);
      console.log(`   - Products Archived: ${archivedCount}`);
      console.log(`   - Variants Activated: ${activatedCount}`);
      console.log(`   - Variants Deactivated: ${deactivatedCount}`);
      console.log(`⚠️  Products/Variants not found: ${notFoundCount}`);
      
      if (statusChanges.length > 0) {
        console.log('\n📋 Status Changes (first 20):');
        statusChanges.slice(0, 20).forEach((change, idx) => {
          if (change.type === 'variant') {
            console.log(`   ${idx + 1}. Variant (ID: ${change.id}, Slug: ${change.slug})`);
            console.log(`      ${change.oldStatus} → ${change.newStatus} (Stock: ${change.stock})`);
          } else {
            console.log(`   ${idx + 1}. Product "${change.name}" (ID: ${change.id})`);
            console.log(`      ${change.oldStatus} → ${change.newStatus} (Stock: ${change.stock})`);
          }
        });
        if (statusChanges.length > 20) {
          console.log(`   ... and ${statusChanges.length - 20} more status changes`);
        }
      }
      
      if (notFoundProducts.length > 0) {
        console.log('\n💡 Products/Variants not found in database (first 20):');
        notFoundProducts.slice(0, 20).forEach((name, idx) => {
          console.log(`   ${idx + 1}. ${name}`);
        });
        if (notFoundProducts.length > 20) {
          console.log(`   ... and ${notFoundProducts.length - 20} more`);
        }
      }
      
      console.log('\n🎉 JSON inventory migration completed successfully!');
      
    } catch (error) {
      console.error('❌ Error during JSON migration:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('⚠️  Rolling back JSON inventory migration...');
    console.log('💡 Note: Stock quantities and statuses cannot be automatically restored.');
    console.log('💡 You may need to restore from a backup if needed.');
  }
};

/**
 * Normalize product name for matching
 */
function normalizeProductName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Find matching product using multiple strategies
 */
function findMatchingProduct(productName, productByName, productBySku, productBySlug) {
  if (!productName) return null;
  
  // Strategy 1: Exact match by normalized name
  const normalized = normalizeProductName(productName);
  const nameMatches = productByName.get(normalized);
  if (nameMatches && nameMatches.length > 0) {
    return nameMatches[0]; // Return first match
  }
  
  // Strategy 2: Partial match (product name contains JSON name or vice versa)
  for (const [dbName, products] of productByName.entries()) {
    if (normalized.includes(dbName) || dbName.includes(normalized)) {
      return products[0];
    }
  }
  
  // Strategy 3: Match by SKU if product name looks like SKU
  const skuMatch = productBySku.get(normalized);
  if (skuMatch) {
    return skuMatch;
  }
  
  // Strategy 4: Try matching by slug (extract potential slug from name)
  const potentialSlug = productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  
  const slugMatch = productBySlug.get(potentialSlug);
  if (slugMatch) {
    return slugMatch;
  }
  
  // Strategy 5: Fuzzy match - check if any part of the name matches
  const nameParts = normalized.split(/[-_\s]+/).filter(p => p.length > 2);
  for (const part of nameParts) {
    for (const [dbName, products] of productByName.entries()) {
      if (dbName.includes(part) || part.includes(dbName)) {
        return products[0];
      }
    }
  }
  
  return null;
}
