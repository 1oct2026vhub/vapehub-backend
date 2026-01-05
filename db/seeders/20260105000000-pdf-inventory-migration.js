'use strict';

// Load environment variables
require('dotenv').config();

const fs = require('fs');
const path = require('path');
// Handle different export patterns for pdf-parse
const pdfParseModule = require('pdf-parse');
const pdfParse = typeof pdfParseModule === 'function' ? pdfParseModule : (pdfParseModule.default || pdfParseModule);

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('🚀 Starting PDF Inventory Report Migration...');
      console.log('================================================');
      
      // Get PDF path from environment variable or use default
      const defaultPdfPath = path.join(__dirname, '../../public/pdfs/VapeHub-atum-inventory-report-2026-01-05.pdf');
      const pdfPath = process.env.PDF_INVENTORY_PATH || defaultPdfPath;
      
      // Configuration for status updates
      const STATUS_CONFIG = {
        // Set status to 'published' if stock > 0
        PUBLISH_IF_STOCK_GT: parseInt(process.env.PDF_PUBLISH_STOCK_THRESHOLD) || 0,
        // Set status to 'archived' if stock = 0
        ARCHIVE_IF_STOCK_EQ: parseInt(process.env.PDF_ARCHIVE_STOCK_THRESHOLD) || 0,
        // Only update status if product is currently published (set to false to update all)
        ONLY_UPDATE_PUBLISHED: process.env.PDF_ONLY_UPDATE_PUBLISHED === 'true' || false
      };
      
      console.log('📋 Status Update Configuration:');
      console.log(`   - Publish products with stock > ${STATUS_CONFIG.PUBLISH_IF_STOCK_GT}`);
      console.log(`   - Archive products with stock = ${STATUS_CONFIG.ARCHIVE_IF_STOCK_EQ}`);
      console.log(`   - Only update published products: ${STATUS_CONFIG.ONLY_UPDATE_PUBLISHED}`);
      
      // Check if PDF exists
      if (!fs.existsSync(pdfPath)) {
        console.error(`❌ PDF file not found at: ${pdfPath}`);
        if (!process.env.PDF_INVENTORY_PATH) {
          console.log('💡 Using default path. If PDF is in a different location, set PDF_INVENTORY_PATH in .env file');
        } else {
          console.log('💡 Please check the PDF_INVENTORY_PATH in your .env file');
        }
        throw new Error(`PDF file not found: ${pdfPath}`);
      }

      console.log(`\n📄 Reading PDF from: ${pdfPath}`);
      const dataBuffer = fs.readFileSync(pdfPath);
      const pdfData = await pdfParse(dataBuffer);
      
      console.log(`📊 PDF Info: ${pdfData.numpages} pages, ${pdfData.text.length} characters`);
      
      // Parse products from PDF text
      const inventoryItems = parseInventoryFromPDF(pdfData.text);
      
      console.log(`📦 Found ${inventoryItems.length} inventory items in PDF`);
      
      // Get existing products from database for matching
      const existingProducts = await queryInterface.sequelize.query(`
        SELECT id, name, sku, slug, stock_quantity, status
        FROM products
        WHERE deletedAt IS NULL
        ${STATUS_CONFIG.ONLY_UPDATE_PUBLISHED ? "AND status = 'published'" : ''}
      `, { type: Sequelize.QueryTypes.SELECT });
      
      console.log(`🔍 Found ${existingProducts.length} existing products in database`);
      
      // Create lookup maps for faster matching
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
      
      // Match and update products
      let matchedCount = 0;
      let stockUpdatedCount = 0;
      let statusUpdatedCount = 0;
      let publishedCount = 0;
      let archivedCount = 0;
      let notFoundCount = 0;
      const notFoundProducts = [];
      const statusChanges = [];
      
      console.log('\n🔄 Processing inventory items...');
      
      for (const item of inventoryItems) {
        const matchedProduct = findMatchingProduct(
          item.productName,
          productByName,
          productBySku,
          productBySlug
        );
        
        if (matchedProduct) {
          matchedCount++;
          
          const newStock = parseInt(item.currentStock) || 0;
          const oldStock = matchedProduct.stock_quantity || 0;
          const oldStatus = matchedProduct.status;
          
          // Determine new status based on stock
          let newStatus = oldStatus;
          if (newStock > STATUS_CONFIG.PUBLISH_IF_STOCK_GT) {
            newStatus = 'published';
          } else if (newStock === STATUS_CONFIG.ARCHIVE_IF_STOCK_EQ) {
            newStatus = 'archived';
          }
          // If stock is between thresholds, keep current status (or set to draft if needed)
          
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
              stockUpdatedCount++;
            }
            
            if (needsStatusUpdate) {
              updateFields.push('status = :status');
              replacements.status = newStatus;
              statusUpdatedCount++;
              
              if (newStatus === 'published') {
                publishedCount++;
              } else if (newStatus === 'archived') {
                archivedCount++;
              }
              
              statusChanges.push({
                productId: matchedProduct.id,
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
            
            if ((stockUpdatedCount + statusUpdatedCount) % 50 === 0) {
              console.log(`  ✅ Updated ${stockUpdatedCount} stock + ${statusUpdatedCount} status...`);
            }
          }
        } else {
          notFoundCount++;
          notFoundProducts.push(item.productName);
          
          // Log first 10 not found products as examples
          if (notFoundCount <= 10) {
            console.log(`  ⚠️  Product not found: "${item.productName}" (Stock: ${item.currentStock})`);
          }
        }
      }
      
      console.log('\n📊 Migration Summary:');
      console.log('================================================');
      console.log(`✅ Total items in PDF: ${inventoryItems.length}`);
      console.log(`✅ Matched products: ${matchedCount}`);
      console.log(`✅ Stock quantities updated: ${stockUpdatedCount}`);
      console.log(`✅ Statuses updated: ${statusUpdatedCount}`);
      console.log(`   - Published: ${publishedCount}`);
      console.log(`   - Archived: ${archivedCount}`);
      console.log(`⚠️  Products not found: ${notFoundCount}`);
      
      if (statusChanges.length > 0) {
        console.log('\n📋 Status Changes (first 20):');
        statusChanges.slice(0, 20).forEach((change, idx) => {
          console.log(`   ${idx + 1}. "${change.name}" (ID: ${change.productId})`);
          console.log(`      ${change.oldStatus} → ${change.newStatus} (Stock: ${change.stock})`);
        });
        if (statusChanges.length > 20) {
          console.log(`   ... and ${statusChanges.length - 20} more status changes`);
        }
      }
      
      if (notFoundProducts.length > 0) {
        console.log('\n💡 Products not found in database (first 20):');
        notFoundProducts.slice(0, 20).forEach((name, idx) => {
          console.log(`   ${idx + 1}. ${name}`);
        });
        if (notFoundProducts.length > 20) {
          console.log(`   ... and ${notFoundProducts.length - 20} more`);
        }
      }
      
      console.log('\n🎉 PDF inventory migration completed successfully!');
      
    } catch (error) {
      console.error('❌ Error during PDF migration:', error);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('⚠️  Rolling back PDF inventory migration...');
    console.log('💡 Note: Stock quantities and statuses cannot be automatically restored.');
    console.log('💡 You may need to restore from a backup if needed.');
  }
};

/**
 * Parse inventory data from PDF text
 * Handles the table structure: Product Name | Product Type | Current Stock | Sales last 28 days | Stock will Last
 */
function parseInventoryFromPDF(pdfText) {
  const items = [];
  const lines = pdfText.split('\n');
  
  // Skip header rows - look for the actual data
  let inDataSection = false;
  let headerFound = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Detect header row
    if (line.includes('Product Name') || line.includes('Current Stock')) {
      headerFound = true;
      inDataSection = true;
      continue;
    }
    
    // Skip empty lines
    if (!line || line.length < 2) {
      continue;
    }
    
    // Start parsing after header is found
    if (headerFound && inDataSection) {
      // Parse table row
      const product = parseInventoryRow(line);
      if (product && product.productName) {
        items.push(product);
      }
    }
  }
  
  return items;
}

/**
 * Parse a single inventory row
 * Handles various formats like "Product Name | Stock | Sales | Days"
 */
function parseInventoryRow(line) {
  // Split by common delimiters (tabs, multiple spaces, or pipe)
  const parts = line.split(/\s{2,}|\t|\|/).map(p => p.trim()).filter(p => p);
  
  if (parts.length < 2) {
    return null;
  }
  
  // First part is usually product name
  let productName = parts[0];
  
  // Find current stock - look for numeric values or "0 | -" pattern
  let currentStock = null;
  let salesLast28Days = null;
  let stockWillLast = null;
  
  // Try to identify columns
  // Pattern: Product Name | [icon/type] | Current Stock | Sales | Days
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    
    // Skip icon/type indicators (non-numeric, short strings)
    if (part.length <= 2 && !/^\d+$/.test(part)) {
      continue;
    }
    
    // Current Stock pattern: "3", "0 | -", "5", etc.
    if (currentStock === null) {
      const stockMatch = part.match(/^(\d+)/);
      if (stockMatch) {
        currentStock = stockMatch[1];
        continue;
      }
      // Handle "0 | -" pattern
      if (part.includes('|') && part.match(/^\d+/)) {
        currentStock = part.split('|')[0].trim();
        continue;
      }
    }
    
    // Sales last 28 days: numeric or "-"
    if (salesLast28Days === null && /^-?\d+$/.test(part)) {
      salesLast28Days = part;
      continue;
    } else if (salesLast28Days === null && part === '-') {
      salesLast28Days = '0';
      continue;
    }
    
    // Stock will Last: numeric, ">30", or "-"
    if (stockWillLast === null) {
      if (/^>?\d+$/.test(part)) {
        stockWillLast = part;
      } else if (part === '-') {
        stockWillLast = '0';
      }
    }
  }
  
  // If we couldn't parse properly, try a simpler approach
  // Look for product name (usually first substantial text) and stock (first number)
  if (currentStock === null) {
    const numbers = line.match(/\d+/g);
    if (numbers && numbers.length > 0) {
      // Product name is everything before the first significant number
      const firstNumIndex = line.search(/\d/);
      if (firstNumIndex > 0) {
        productName = line.substring(0, firstNumIndex).trim();
        currentStock = numbers[0];
      }
    }
  }
  
  // Clean product name
  productName = productName
    .replace(/\s{2,}/g, ' ')
    .replace(/[|•]/g, '')
    .trim();
  
  // Skip if product name is too short or looks like a header
  if (productName.length < 2 || 
      productName.toLowerCase().includes('product name') ||
      productName.toLowerCase().includes('stock counters')) {
    return null;
  }
  
  return {
    productName: productName,
    currentStock: currentStock || '0',
    salesLast28Days: salesLast28Days || '0',
    stockWillLast: stockWillLast || '0'
  };
}

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
  
  // Strategy 2: Partial match (product name contains PDF name or vice versa)
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

