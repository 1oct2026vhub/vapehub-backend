'use strict';

const { Sequelize } = require('sequelize');
const { uploadFiletToS3, generateUniqueFileName, generateCloudFrontUrlForS3, checkImageExists } = require('../library/s3/s3Helper');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const dbConfig = require('../config/database');

/**
 * CRON JOB: Migrate Product Images to S3
 * 
 * This cron job processes product images in batches to avoid memory issues
 * and can handle large amounts of data efficiently.
 * 
 * Features:
 * - Smart migration: Check S3 first, upload only if needed
 * - Batch processing: Process images in configurable chunks
 * - Progress tracking: Save progress to resume if interrupted
 * - Error handling: Continue processing even if some images fail
 * - Rate limiting: Respectful delays to avoid overwhelming servers
 * 
 * Usage:
 * - Add to cron: every 30 minutes
 * - Or run manually: node cron/migrate-product-images-to-s3.js
 */

// Configuration
const CONFIG = {
  BATCH_SIZE: 15,           // Process 15 images per batch (safer for shared hosting)
  DELAY_BETWEEN_IMAGES: 400, // 400ms between individual images
  DELAY_BETWEEN_BATCHES: 15000, // 15 seconds between batches
  MAX_RETRIES: 3,           // Max retry attempts for failed downloads
  PROGRESS_FILE: './logs/product-migration-progress.json', // Progress tracking
  LOG_FILE: './logs/product-migration.log' // Detailed logging
};

// Global statistics
let globalStats = {
  totalProcessed: 0,
  totalUploaded: 0,
  totalSkipped: 0,
  totalUpdated: 0,
  totalErrors: 0,
  startTime: null,
  lastBatchTime: null,
  currentBatch: 0,
  totalBatches: 0
};

/**
 * Main execution function
 */
async function migrateProductImagesToS3() {
  const startTime = new Date();
  globalStats.startTime = startTime;
  
  console.log('🚀 Starting PRODUCT IMAGE MIGRATION CRON JOB');
  console.log(`⏰ Started at: ${startTime.toISOString()}`);
  console.log(`📊 Batch size: ${CONFIG.BATCH_SIZE}`);
  
  try {
    // Initialize database connection
    const environment = process.env.NODE_ENV || 'local';
    const config = dbConfig[environment];
    const sequelize = new Sequelize({
      ...config,
      pool: { max: 1, min: 0, idle: 10000 }
    });
    
    // Test the connection
    await sequelize.authenticate();
    console.log('✅ Connected to database successfully');
    
    // Load progress if exists
    const progress = loadProgress();
    if (progress) {
      console.log(`📈 Resuming from previous run: ${progress.currentBatch}/${progress.totalBatches} batches`);
      globalStats.currentBatch = progress.currentBatch;
    }
    
    // Get total count of products with images
    const totalProducts = await getTotalProductCount(sequelize);
    globalStats.totalBatches = Math.ceil(totalProducts / CONFIG.BATCH_SIZE);
    
    console.log(`📊 Total product images: ${totalProducts}`);
    console.log(`📦 Total batches to process: ${globalStats.totalBatches}`);
    
    // Process in batches
    for (let batchNum = globalStats.currentBatch; batchNum < globalStats.totalBatches; batchNum++) {
      const batchStartTime = new Date();
      globalStats.currentBatch = batchNum;
      globalStats.lastBatchTime = batchStartTime;
      
      console.log(`\n🔄 Processing batch ${batchNum + 1}/${globalStats.totalBatches}`);
      console.log(`⏰ Batch started at: ${batchStartTime.toISOString()}`);
      
      // Process current batch
      const batchStats = await processBatch(sequelize, batchNum);
      
      // Update global stats
      globalStats.totalProcessed += batchStats.processed;
      globalStats.totalUploaded += batchStats.uploaded;
      globalStats.totalSkipped += batchStats.skipped;
      globalStats.totalUpdated += batchStats.updated;
      globalStats.totalErrors += batchStats.errors;
      
      // Log batch results
      const batchEndTime = new Date();
      const batchDuration = (batchEndTime - batchStartTime) / 1000;
      console.log(`✅ Batch ${batchNum + 1} completed in ${batchDuration.toFixed(2)}s`);
      console.log(`📊 Batch stats: ${batchStats.processed} processed, ${batchStats.uploaded} uploaded, ${batchStats.errors} errors`);
      
      // Save progress
      saveProgress();
      
      // Delay between batches (except for last batch)
      if (batchNum < globalStats.totalBatches - 1) {
        console.log(`⏳ Waiting ${CONFIG.DELAY_BETWEEN_BATCHES / 1000}s before next batch...`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_BATCHES));
      }
    }
    
    // Final summary
    const endTime = new Date();
    const totalDuration = (endTime - startTime) / 1000;
    
    console.log('\n🎉 PRODUCT IMAGE MIGRATION COMPLETED!');
    console.log(`⏰ Total duration: ${totalDuration.toFixed(2)}s`);
    console.log(`📊 Final Statistics:`);
    console.log(`   - Total processed: ${globalStats.totalProcessed}`);
    console.log(`   - Total uploaded: ${globalStats.totalUploaded}`);
    console.log(`   - Total skipped: ${globalStats.totalSkipped}`);
    console.log(`   - Total updated: ${globalStats.totalUpdated}`);
    console.log(`   - Total errors: ${globalStats.totalErrors}`);
    
    // Clean up progress file
    cleanupProgress();
    
    // Close database connection
    await sequelize.close();
    console.log('🔌 Closed database connection');
    
  } catch (error) {
    console.error('❌ CRITICAL ERROR in product image migration:', error);
    console.error('Stack trace:', error.stack);
    
    // Save progress for resume
    saveProgress();
    
    // Log error
    logError(error);
    
    throw error;
  }
}

/**
 * Process a single batch of products
 */
async function processBatch(sequelize, batchNum) {
  const batchStats = {
    processed: 0,
    uploaded: 0,
    skipped: 0,
    updated: 0,
    errors: 0
  };
  
  try {
    // Get products for this batch
    const products = await getProductsBatch(sequelize, batchNum);
    console.log(`📦 Processing ${products.length} product images in batch ${batchNum + 1}`);
    
    // Process each product image in the batch
    for (let i = 0; i < products.length; i++) {
      const productImage = products[i];
      batchStats.processed++;
      
      try {
        console.log(`🔄 Processing product image ${i + 1}/${products.length}: ${productImage.product_name || `ID ${productImage.id}`}`);
        
        // Migrate product image
        const finalUrl = await smartImageMigration(productImage.image_url, 'products', batchStats);
        
        if (finalUrl) {
          // Update database
          await updateProductImageUrl(sequelize, productImage.id, finalUrl);
          batchStats.updated++;
          console.log(`✅ Updated product image URL: ${productImage.product_name || `ID ${productImage.id}`}`);
        } else {
          console.log(`❌ Failed to process product image: ${productImage.product_name || `ID ${productImage.id}`}`);
        }
        
        // Delay between images (except for last image in batch)
        if (i < products.length - 1) {
          await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_IMAGES));
        }
        
      } catch (error) {
        batchStats.errors++;
        console.error(`❌ Error processing product image ${productImage.id}:`, error.message);
        
        // Continue with next product image instead of failing entire batch
        continue;
      }
    }
    
  } catch (error) {
    console.error(`❌ Error processing batch ${batchNum + 1}:`, error);
    throw error;
  }
  
  return batchStats;
}

/**
 * Smart image migration: Check if exists in S3, upload if needed, return correct URL
 */
async function smartImageMigration(imageUrl, folder = 'products', batchStats) {
  try {
    if (!imageUrl || imageUrl.trim() === '') {
      batchStats.skipped++;
      return null;
    }

    // Generate S3 key based on image URL or create a unique one
    let s3Key;
    let needsUpload = false;
    
    // Try to extract filename from URL
    const urlParts = imageUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];
    
    if (fileName && fileName.includes('.')) {
      // Use original filename if available
      s3Key = `${folder}/${fileName}`;
    } else {
      // Generate unique filename
      const fileExtension = '.jpg'; // Default extension
      const uniqueFileName = generateUniqueFileName(`product${fileExtension}`);
      s3Key = `${folder}/${uniqueFileName}`;
    }

    console.log(`🔍 Checking if image exists in S3: ${s3Key}`);
    
    // Check if image already exists in S3
    const imageExists = await checkImageExists(s3Key);
    
    if (imageExists) {
      console.log(`✅ Image already exists in S3: ${s3Key}`);
      batchStats.skipped++;
      needsUpload = false;
    } else {
      console.log(`📤 Image not found in S3, will upload: ${s3Key}`);
      batchStats.uploaded++;
      needsUpload = true;
    }

    // If image doesn't exist in S3, download and upload it
    if (needsUpload) {
      const uploadResult = await downloadAndUploadToS3(imageUrl, folder, s3Key, batchStats);
      if (!uploadResult) {
        return null; // Upload failed
      }
    }

    // Generate and return the S3 URL for database update
    const finalUrl = generateCloudFrontUrlForS3(s3Key);
    console.log(`🌐 Final URL (S3): ${finalUrl}`);
    return finalUrl;

  } catch (error) {
    batchStats.errors++;
    console.error(`❌ Error in smart image migration for ${imageUrl}:`, error.message);
    return null;
  }
}

/**
 * Download image from URL and upload to S3
 */
async function downloadAndUploadToS3(imageUrl, folder = 'products', s3Key = null, batchStats) {
  try {
    if (!imageUrl || imageUrl.trim() === '') {
      batchStats.skipped++;
      return null;
    }

    // Use the image URL directly from database for downloading
    const fullUrl = imageUrl;

    console.log(`📥 Downloading: ${fullUrl}`);

    // Download the image with improved headers and retry logic
    let response;
    let retries = CONFIG.MAX_RETRIES;
    let lastError;

    while (retries > 0) {
      try {
        response = await axios({
          method: 'GET',
          url: fullUrl,
          responseType: 'stream',
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'image',
            'Sec-Fetch-Mode': 'no-cors',
            'Sec-Fetch-Site': 'same-origin'
          }
        });
        break; // Success, exit retry loop
      } catch (error) {
        lastError = error;
        retries--;
        
        if (retries > 0) {
          console.log(`⚠️ Download failed, retrying... (${retries} attempts left)`);
          // Exponential backoff: 1s, 2s, 3s
          const delay = (CONFIG.MAX_RETRIES - retries) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    if (!response) {
      throw lastError;
    }

    // Get file extension from URL or content-type
    let fileExtension = path.extname(fullUrl).toLowerCase();
    if (!fileExtension && response.headers['content-type']) {
      const mimeType = response.headers['content-type'];
      if (mimeType.includes('jpeg') || mimeType.includes('jpg')) fileExtension = '.jpg';
      else if (mimeType.includes('png')) fileExtension = '.png';
      else if (mimeType.includes('gif')) fileExtension = '.gif';
      else if (mimeType.includes('webp')) fileExtension = '.webp';
      else fileExtension = '.jpg'; // default
    }

    // Use provided s3Key or generate unique filename
    let finalS3Key = s3Key;
    if (!finalS3Key) {
      const fileName = generateUniqueFileName(`product${fileExtension}`);
      finalS3Key = `${folder}/${fileName}`;
    }

    // Create temporary file
    const tempDir = os.tmpdir();
    const tempFileName = generateUniqueFileName(`temp${fileExtension}`);
    const tempFile = path.join(tempDir, tempFileName);
    const writer = fs.createWriteStream(tempFile);

    // Pipe image data to temporary file
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // Read file and upload to S3
    const fileBuffer = fs.readFileSync(tempFile);
    
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: finalS3Key,
      Body: fileBuffer,
      ContentType: response.headers['content-type'] || 'image/jpeg'
    };

    const uploadResult = await uploadFiletToS3(uploadParams);
    
    // Clean up temporary file
    fs.unlinkSync(tempFile);
    
    if (uploadResult && uploadResult.Location) {
      console.log(`✅ Uploaded to S3: ${finalS3Key}`);
      
      // Return the S3 key for the calling function to generate URL
      return finalS3Key;
    } else {
      batchStats.errors++;
      console.error('❌ Upload to S3 did not return a Location for key:', finalS3Key);
      return null;
    }

  } catch (error) {
    batchStats.errors++;
    console.error(`❌ Error uploading image ${imageUrl}:`, error.message);
    return null;
  }
}

/**
 * Get total count of product images
 */
async function getTotalProductCount(sequelize) {
  try {
    const [result] = await sequelize.query(`
      SELECT COUNT(*) as total 
      FROM product_images 
      WHERE image_url IS NOT NULL AND image_url != ''
    `, {
      type: Sequelize.QueryTypes.SELECT
    });
    
    return result.total;
  } catch (error) {
    console.error('❌ Error getting product image count:', error);
    throw error;
  }
}

/**
 * Get product images for a specific batch
 */
async function getProductsBatch(sequelize, batchNum) {
  try {
    const offset = batchNum * CONFIG.BATCH_SIZE;
    
    const productImages = await sequelize.query(`
      SELECT pi.id, pi.image_url, p.name as product_name
      FROM product_images pi
      JOIN products p ON pi.product_id = p.id
      WHERE pi.image_url IS NOT NULL AND pi.image_url != ''
      ORDER BY pi.id
      LIMIT ? OFFSET ?
    `, {
      replacements: [CONFIG.BATCH_SIZE, offset],
      type: Sequelize.QueryTypes.SELECT
    });
    
    return productImages;
  } catch (error) {
    console.error(`❌ Error getting product images for batch ${batchNum}:`, error);
    throw error;
  }
}

/**
 * Update product image URL in database
 */
async function updateProductImageUrl(sequelize, productImageId, newUrl) {
  try {
    await sequelize.query(`
      UPDATE product_images 
      SET image_url = ?, updatedAt = NOW() 
      WHERE id = ?
    `, {
      replacements: [newUrl, productImageId]
    });
    
    return true;
  } catch (error) {
    console.error(`❌ Error updating product image ${productImageId}:`, error);
    throw error;
  }
}

/**
 * Load progress from file
 */
function loadProgress() {
  try {
    if (fs.existsSync(CONFIG.PROGRESS_FILE)) {
      const progressData = fs.readFileSync(CONFIG.PROGRESS_FILE, 'utf8');
      return JSON.parse(progressData);
    }
  } catch (error) {
    console.warn('⚠️ Could not load progress file:', error.message);
  }
  return null;
}

/**
 * Save progress to file
 */
function saveProgress() {
  try {
    const progressData = {
      currentBatch: globalStats.currentBatch,
      totalBatches: globalStats.totalBatches,
      totalProcessed: globalStats.totalProcessed,
      totalUploaded: globalStats.totalUploaded,
      totalSkipped: globalStats.totalSkipped,
      totalUpdated: globalStats.totalUpdated,
      totalErrors: globalStats.totalErrors,
      lastUpdated: new Date().toISOString()
    };
    
    // Ensure logs directory exists
    const logsDir = path.dirname(CONFIG.PROGRESS_FILE);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    fs.writeFileSync(CONFIG.PROGRESS_FILE, JSON.stringify(progressData, null, 2));
  } catch (error) {
    console.warn('⚠️ Could not save progress file:', error.message);
  }
}

/**
 * Clean up progress file
 */
function cleanupProgress() {
  try {
    if (fs.existsSync(CONFIG.PROGRESS_FILE)) {
      fs.unlinkSync(CONFIG.PROGRESS_FILE);
      console.log('🧹 Progress file cleaned up');
    }
  } catch (error) {
    console.warn('⚠️ Could not clean up progress file:', error.message);
  }
}

/**
 * Log error to file
 */
function logError(error) {
  try {
    const errorLog = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      stats: globalStats
    };
    
    // Ensure logs directory exists
    const logsDir = path.dirname(CONFIG.LOG_FILE);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    fs.appendFileSync(CONFIG.LOG_FILE, JSON.stringify(errorLog, null, 2) + '\n---\n');
  } catch (logError) {
    console.error('❌ Could not log error to file:', logError.message);
  }
}

/**
 * Handle graceful shutdown
 */
process.on('SIGINT', () => {
  console.log('\n⚠️ Received SIGINT, saving progress and shutting down gracefully...');
  saveProgress();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⚠️ Received SIGTERM, saving progress and shutting down gracefully...');
  saveProgress();
  process.exit(0);
});

// If running directly (not imported), execute the migration
if (require.main === module) {
  migrateProductImagesToS3()
    .then(() => {
      console.log('✅ Product image migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Product image migration failed:', error);
      process.exit(1);
    });
}

module.exports = {
  migrateProductImagesToS3,
  CONFIG
};
