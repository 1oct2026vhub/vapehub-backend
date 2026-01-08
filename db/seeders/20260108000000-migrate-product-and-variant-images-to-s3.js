'use strict';

const { uploadFiletToS3, generateUniqueFileName, generateCloudFrontUrlForS3, checkImageExists } = require('../../library/s3/s3Helper');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Progress tracking for failed downloads
let failedDownloads = [];
const progressFile = path.join(__dirname, '../../logs/product-images-s3-migration-progress.json');
const logFile = path.join(__dirname, '../../logs/product-images-s3-migration.log');

// Circuit breaker for 502 errors - SHARED SERVER configuration
let circuitBreaker = {
  consecutive502s: 0,
  totalErrors: 0,
  isOpen: false,
  lastErrorTime: null,
  cooldownPeriod: 900000 // 15 minutes for shared hosting
};

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      console.log('🚀 Starting PRODUCT & VARIANT IMAGE MIGRATION: Uploading images to S3...');
      
      const imageStats = {
        processed: 0,
        uploaded: 0,
        skipped: 0,
        errors: 0,
        updated: 0,
        retryable_errors: 0,
        product_images_processed: 0,
        product_images_updated: 0,
        variant_images_processed: 0,
        variant_images_updated: 0
      };

      // Load previous progress if exists
      loadProgress(imageStats);

      // MIGRATE PRODUCT IMAGES (URLs exist, need to upload to S3)
      console.log('📷 Migrating product images...');
      await migrateProductImages(queryInterface, Sequelize, imageStats);

      // MIGRATE PRODUCT VARIANT IMAGES
      console.log('📷 Migrating product variant images...');
      console.log('⏳ Waiting 3 seconds before starting variant image migration...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      await migrateVariantImages(queryInterface, Sequelize, imageStats);

      console.log('✅ Product & Variant image migration completed!');
      console.log(`📊 Statistics:
        - Total Processed: ${imageStats.processed}
        - Total Uploaded: ${imageStats.uploaded}
        - Total Skipped: ${imageStats.skipped}
        - Total Updated: ${imageStats.updated}
        - Total Errors: ${imageStats.errors}
        - Retryable Errors: ${imageStats.retryable_errors}
        - Product Images Processed: ${imageStats.product_images_processed}
        - Product Images Updated: ${imageStats.product_images_updated}
        - Variant Images Processed: ${imageStats.variant_images_processed}
        - Variant Images Updated: ${imageStats.variant_images_updated}`);

      // Save final progress and generate report
      saveProgress(imageStats);
      generateReport(imageStats);

      if (failedDownloads.length > 0) {
        console.log('\n⚠️  Some images failed to download. Failed URLs saved to logs/product-images-s3-migration-progress.json');
        console.log('💡 You can manually retry these or fix the source URLs and rerun the migration.');
      }

    } catch (error) {
      console.error('❌ Error during image migration:', error);
      // Save progress even on error
      saveProgress(imageStats);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    // This migration cannot be automatically reversed
    // Manual cleanup of S3 images would be required
    console.log('⚠️ Image migration cannot be automatically reversed');
    console.log('⚠️ Manual cleanup of S3 bucket would be required');
  }
};

/**
 * Smart image migration: Check if exists in S3, upload if needed, return correct URL
 */
async function smartImageMigration(imageUrl, folder = 'products', imageStats) {
  try {
    if (!imageUrl || imageUrl.trim() === '') {
      imageStats.skipped++;
      return null;
    }

    // Skip if already in S3/CloudFront
    if (imageUrl.includes('s3.amazonaws.com') || 
        imageUrl.includes('.cloudfront.net') || 
        (process.env.CLOUDFRONT_DOMAIN && imageUrl.includes(process.env.CLOUDFRONT_DOMAIN))) {
      console.log(`✅ Image already in S3/CloudFront: ${imageUrl}`);
      imageStats.skipped++;
      return imageUrl; // Return as-is
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
      const uniqueFileName = generateUniqueFileName(`image${fileExtension}`);
      s3Key = `${folder}/${uniqueFileName}`;
    }

    console.log(`🔍 Checking if image exists in S3: ${s3Key}`);
    
    // Check if image already exists in S3
    const imageExists = await checkImageExists(s3Key);
    
    if (imageExists) {
      console.log(`✅ Image already exists in S3: ${s3Key}`);
      imageStats.skipped++;
      needsUpload = false;
    } else {
      console.log(`📤 Image not found in S3, will upload: ${s3Key}`);
      imageStats.uploaded++;
      needsUpload = true;
    }

    // If image doesn't exist in S3, download and upload it
    if (needsUpload) {
      const uploadResult = await downloadAndUploadToS3(imageUrl, folder, s3Key, imageStats);
      if (!uploadResult) {
        return null; // Upload failed
      }
    }

    // Generate and return the correct URL (CloudFront or S3)
    const finalUrl = generateCloudFrontUrlForS3(s3Key);
    console.log(`🌐 Final URL: ${finalUrl}`);
    
    return finalUrl;

  } catch (error) {
    imageStats.errors++;
    console.error(`❌ Error in smart image migration for ${imageUrl}:`, error.message);
    return null;
  }
}

/**
 * Download image from URL and upload to S3 (helper function)
 */
async function downloadAndUploadToS3(imageUrl, folder = 'products', s3Key = null, imageStats) {
  try {
    if (!imageUrl || imageUrl.trim() === '') {
      imageStats.skipped++;
      return null;
    }

    // Check circuit breaker before attempting downloads
    if (await checkCircuitBreaker()) {
      logMessage(`🔌 Circuit breaker is open. Skipping download for: ${imageUrl}`);
      return null;
    }

    console.log(`📥 Downloading: ${imageUrl}`);

    let response;
    let retries = 3;
    let lastError;

    while (retries > 0) {
      try {
        response = await axios({
          method: 'GET',
          url: imageUrl,
          responseType: 'stream',
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.vapehub.co.uk/',
            'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        });
        
        // Reset circuit breaker on success
        resetCircuitBreaker();
        break; // Success, exit retry loop
        
      } catch (error) {
        lastError = error;
        retries--;
        
        const statusCode = error.response?.status;
        updateCircuitBreaker(statusCode);
        
        if (retries > 0) {
          logMessage(`⚠️ Download failed, retrying... (${retries} attempts left)`);
          const delay = statusCode === 502 ? 15000 : 5000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    if (!response) {
      const failedItem = {
        originalUrl: imageUrl,
        error: lastError?.message || 'Download failed',
        statusCode: lastError?.response?.status,
        timestamp: new Date().toISOString()
      };
      failedDownloads.push(failedItem);
      imageStats.errors++;
      return null;
    }

    // Get file extension from URL or content-type
    let fileExtension = path.extname(imageUrl).toLowerCase();
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
      const fileName = generateUniqueFileName(`image${fileExtension}`);
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
      return finalS3Key;
    } else {
      imageStats.errors++;
      console.error('❌ Upload to S3 did not return a Location for key:', finalS3Key);
      return null;
    }

  } catch (error) {
    imageStats.errors++;
    console.error(`❌ Error uploading image ${imageUrl}:`, error.message);
    return null;
  }
}

/**
 * Migrate product images from current DB URLs to S3
 */
async function migrateProductImages(queryInterface, Sequelize, imageStats) {
  try {
    // Get ALL product images with URLs (including those already in S3)
    const productImages = await queryInterface.sequelize.query(`
      SELECT id, product_id, image_url 
      FROM product_images 
      WHERE image_url IS NOT NULL 
      AND image_url != ''
      ORDER BY id
    `, {
      type: Sequelize.QueryTypes.SELECT
    });

    console.log(`📊 Found ${productImages.length} product images to process`);

    for (const productImage of productImages) {
      imageStats.processed++;
      imageStats.product_images_processed++;
      
      console.log(`🔄 Processing product image ID: ${productImage.id} (Product: ${productImage.product_id})`);

      // Smart migration: check if exists, upload if needed, get correct URL
      const finalUrl = await smartImageMigration(productImage.image_url, 'products', imageStats);
      
      if (finalUrl && finalUrl !== productImage.image_url) {
        await queryInterface.sequelize.query(`
          UPDATE product_images SET image_url = ?, updated_at = NOW() WHERE id = ?
        `, {
          replacements: [finalUrl, productImage.id]
        });
        
        imageStats.updated++;
        imageStats.product_images_updated++;
        console.log(`✅ Updated product image URL: ID ${productImage.id}`);
      } else if (finalUrl) {
        console.log(`⏭️ Product image already using S3 URL: ID ${productImage.id}`);
      } else {
        console.log(`❌ Failed to process product image: ID ${productImage.id}`);
      }
    
      // Add delay between processing to avoid rate limiting (SHARED SERVER - needs longer delays)
      if (imageStats.product_images_processed < productImages.length) {
        console.log(`⏳ Waiting 15 seconds before next image (shared server protection)...`);
        await new Promise(resolve => setTimeout(resolve, 15000));
      }
      
      // Save progress periodically (every 10 items)
      if (imageStats.product_images_processed % 10 === 0) {
        saveProgress(imageStats);
        logMessage(`💾 Progress saved (${imageStats.product_images_processed}/${productImages.length})`);
      }
    }

  } catch (error) {
    console.error('❌ Error migrating product images:', error);
    throw error;
  }
}

/**
 * Migrate product variant images from current DB URLs to S3
 */
async function migrateVariantImages(queryInterface, Sequelize, imageStats) {
  try {
    // Get ALL variant images with URLs (including those already in S3)
    const variantImages = await queryInterface.sequelize.query(`
      SELECT id, variant_id, image_url 
      FROM product_variant_images 
      WHERE image_url IS NOT NULL 
      AND image_url != ''
      ORDER BY id
    `, {
      type: Sequelize.QueryTypes.SELECT
    });

    console.log(`📊 Found ${variantImages.length} variant images to process`);

    for (const variantImage of variantImages) {
      imageStats.processed++;
      imageStats.variant_images_processed++;
      
      console.log(`🔄 Processing variant image ID: ${variantImage.id} (Variant: ${variantImage.variant_id})`);

      // Smart migration: check if exists, upload if needed, get correct URL
      const finalUrl = await smartImageMigration(variantImage.image_url, 'variants', imageStats);
      
      if (finalUrl && finalUrl !== variantImage.image_url) {
        await queryInterface.sequelize.query(`
          UPDATE product_variant_images SET image_url = ?, updated_at = NOW() WHERE id = ?
        `, {
          replacements: [finalUrl, variantImage.id]
        });
        
        imageStats.updated++;
        imageStats.variant_images_updated++;
        console.log(`✅ Updated variant image URL: ID ${variantImage.id}`);
      } else if (finalUrl) {
        console.log(`⏭️ Variant image already using S3 URL: ID ${variantImage.id}`);
      } else {
        console.log(`❌ Failed to process variant image: ID ${variantImage.id}`);
      }
    
      // Add delay between processing to avoid rate limiting
      if (imageStats.variant_images_processed < variantImages.length) {
        console.log(`⏳ Waiting 15 seconds before next image (shared server protection)...`);
        await new Promise(resolve => setTimeout(resolve, 15000));
      }
      
      // Save progress periodically (every 10 items)
      if (imageStats.variant_images_processed % 10 === 0) {
        saveProgress(imageStats);
        logMessage(`💾 Progress saved (${imageStats.variant_images_processed}/${variantImages.length})`);
      }
    }

  } catch (error) {
    console.error('❌ Error migrating variant images:', error);
    throw error;
  }
}

/**
 * Log message to both console and file
 */
function logMessage(message) {
  const timestamp = new Date().toISOString();
  const logMsg = `${timestamp}: ${message}`;
  
  console.log(message);
  
  try {
    const logsDir = path.dirname(logFile);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    fs.appendFileSync(logFile, logMsg + '\n');
  } catch (error) {
    console.error('⚠️ Could not write to log file:', error.message);
  }
}

/**
 * Load progress from previous run
 */
function loadProgress(imageStats) {
  try {
    if (fs.existsSync(progressFile)) {
      const data = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
      failedDownloads = data.failedDownloads || [];
      
      // Merge stats (don't overwrite current progress)
      Object.keys(imageStats).forEach(key => {
        if (data.stats && data.stats[key]) {
          imageStats[key] = Math.max(imageStats[key], data.stats[key]);
        }
      });
      
      console.log(`📂 Loaded ${failedDownloads.length} failed downloads from previous run`);
      logMessage(`Progress loaded: ${failedDownloads.length} previous failures`);
    }
  } catch (error) {
    console.error('⚠️ Could not load progress file:', error.message);
    logMessage(`Error loading progress: ${error.message}`);
  }
}

/**
 * Save progress to file
 */
function saveProgress(imageStats) {
  try {
    const progressData = {
      failedDownloads: failedDownloads,
      stats: imageStats,
      lastUpdated: new Date().toISOString()
    };
    
    const logsDir = path.dirname(progressFile);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    fs.writeFileSync(progressFile, JSON.stringify(progressData, null, 2));
    logMessage('Progress saved to file');
  } catch (error) {
    console.error('⚠️ Could not save progress file:', error.message);
    logMessage(`Error saving progress: ${error.message}`);
  }
}

/**
 * Generate detailed report
 */
function generateReport(imageStats) {
  const report = `
📊 DETAILED MIGRATION REPORT
============================
Migration completed at: ${new Date().toISOString()}

STATISTICS:
- Total Processed: ${imageStats.processed}
- Successfully Uploaded: ${imageStats.uploaded}
- Skipped (Already Exists): ${imageStats.skipped}
- Database Records Updated: ${imageStats.updated}
- Total Errors: ${imageStats.errors}
- Retryable Errors: ${imageStats.retryable_errors}

PRODUCT IMAGES:
- Processed: ${imageStats.product_images_processed}
- Updated: ${imageStats.product_images_updated}

VARIANT IMAGES:
- Processed: ${imageStats.variant_images_processed}
- Updated: ${imageStats.variant_images_updated}

FAILED DOWNLOADS: ${failedDownloads.length}

SUCCESS RATE: ${imageStats.processed > 0 ? 
  ((imageStats.uploaded + imageStats.skipped) / imageStats.processed * 100).toFixed(2)
  : 0}%

${failedDownloads.length > 0 ? 
  '\n⚠️  RECOVERY OPTIONS:\n' +
  '1. Check source server availability\n' +
  '2. Manually verify failed URLs\n' +
  '3. Rerun migration to retry failed downloads\n' +
  '4. Fix source URLs in database if needed\n'
  : '✅ ALL IMAGES SUCCESSFULLY MIGRATED!'}

Files Created:
- Progress Log: ${progressFile}
- Detailed Log: ${logFile}
`;

  console.log(report);
  logMessage(report);
  
  return report;
}

/**
 * Check circuit breaker status
 */
async function checkCircuitBreaker() {
  const now = Date.now();
  
  if (circuitBreaker.isOpen) {
    if (now - circuitBreaker.lastErrorTime > circuitBreaker.cooldownPeriod) {
      logMessage(`🔄 Circuit breaker cooldown period completed. Attempting to resume...`);
      circuitBreaker.isOpen = false;
      circuitBreaker.consecutive502s = 0;
      return false;
    }
    return true;
  }
  
  return false;
}

/**
 * Update circuit breaker on error
 */
function updateCircuitBreaker(statusCode) {
  circuitBreaker.totalErrors++;
  circuitBreaker.lastErrorTime = Date.now();
  
  if (statusCode === 502) {
    circuitBreaker.consecutive502s++;
    
    if (circuitBreaker.consecutive502s >= 3) {
      circuitBreaker.isOpen = true;
      logMessage(`🔌 Circuit breaker OPENED after ${circuitBreaker.consecutive502s} consecutive 502 errors. Pausing for ${circuitBreaker.cooldownPeriod/60000} minutes...`);
    }
  } else {
    circuitBreaker.consecutive502s = 0;
  }
}

/**
 * Reset circuit breaker on success
 */
function resetCircuitBreaker() {
  if (circuitBreaker.consecutive502s > 0 || circuitBreaker.isOpen) {
    logMessage(`✅ Circuit breaker reset after successful download`);
  }
  circuitBreaker.consecutive502s = 0;
  circuitBreaker.isOpen = false;
}

