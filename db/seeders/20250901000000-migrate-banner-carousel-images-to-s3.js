'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');
const { uploadFiletToS3, generateUniqueFileName, generateCloudFrontUrlForS3, checkImageExists } = require('../../library/s3/s3Helper');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Progress tracking for failed downloads
let failedDownloads = [];
const progressFile = path.join(__dirname, '../../logs/banner-carousel-migration-progress.json');
const logFile = path.join(__dirname, '../../logs/banner-carousel-migration.log');

// Circuit breaker for 502 errors - SHARED SERVER configuration
let circuitBreaker = {
  consecutive502s: 0,
  totalErrors: 0,
  isOpen: false,
  lastErrorTime: null,
  cooldownPeriod: 900000 // 15 minutes for shared hosting (servers need more recovery time)
};

module.exports = {
  async up(queryInterface, Sequelize) {
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    
    try {
      console.log('🚀 Starting BANNER & CAROUSEL IMAGE MIGRATION: Uploading images to S3...');
      
      const imageStats = {
        processed: 0,
        uploaded: 0,
        skipped: 0,
        updated: 0,
        errors: 0,
        retryable_errors: 0
      };

      // Load previous progress if exists
      loadProgress(imageStats);

      // MIGRATE BANNER IMAGES
      console.log('📷 Migrating banner images...');
      await migrateBannerImages(crossServerMigration, queryInterface, Sequelize, imageStats);

      // MIGRATE CAROUSEL IMAGES
      console.log('📷 Migrating carousel images...');
      await migrateCarouselImages(crossServerMigration, queryInterface, Sequelize, imageStats);



      console.log('✅ All website image migration completed!');
      console.log(`📊 Statistics:
        - Processed: ${imageStats.processed}
        - Uploaded: ${imageStats.uploaded}
        - Skipped: ${imageStats.skipped}
        - Updated: ${imageStats.updated}
        - Errors: ${imageStats.errors}
        - Retryable Errors: ${imageStats.retryable_errors}`);

      // Save final progress and generate report
      saveProgress(imageStats);
      generateReport(imageStats);

      if (failedDownloads.length > 0) {
        console.log('\n⚠️  Some images failed to download. Failed URLs saved to logs/banner-carousel-migration-progress.json');
        console.log('💡 You can manually retry these or fix the source URLs and rerun the migration.');
      }
      
    } catch (error) {
      console.error('❌ Error during banner & carousel image migration:', error);
      // Save progress even on error
      saveProgress(imageStats);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    // This migration cannot be automatically reversed
    // Manual cleanup of S3 images would be required
    console.log('⚠️ Banner & Carousel image migration cannot be automatically reversed');
    console.log('⚠️ Manual cleanup of S3 bucket would be required');
  }
};

/**
 * Smart image migration: Check if exists in S3, upload if needed, return correct URL
 */
async function smartImageMigration(imageUrl, folder = 'banners', imageStats) {
  try {
    if (!imageUrl || imageUrl.trim() === '') {
      imageStats.skipped++;
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
 * Download image from URL and upload to S3 (helper function) - Enhanced with fallback URLs
 */
async function downloadAndUploadToS3(imageUrl, folder = 'banners', s3Key = null, imageStats) {
  try {
    if (!imageUrl || imageUrl.trim() === '') {
      imageStats.skipped++;
      return null;
    }

    // Create multiple fallback URLs to try
    const fallbackUrls = generateFallbackUrls(imageUrl);
    
    let response;
    let lastError;
    let successUrl;

    // Check circuit breaker before attempting downloads
    if (await checkCircuitBreaker()) {
      logMessage(`🔌 Circuit breaker is open. Skipping download for: ${imageUrl}`);
      return null;
    }

    // Try each fallback URL
    for (const fallbackUrl of fallbackUrls) {
      logMessage(`📥 Attempting download: ${fallbackUrl}`);
      
      // Quick validation before attempting download
      if (!isValidImageUrl(fallbackUrl)) {
        logMessage(`⚠️ Skipping invalid URL: ${fallbackUrl}`);
        continue;
      }
      
      let retries = 3;

      while (retries > 0) {
        try {
          response = await axios({
            method: 'GET',
            url: fallbackUrl,
            responseType: 'stream',
            timeout: 30000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': 'https://www.vapehub.co.uk/',
              'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              'DNT': '1',
              'Connection': 'keep-alive',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache',
              'X-Forwarded-For': '127.0.0.1',
              'X-Real-IP': '127.0.0.1'
            }
          });
          
          successUrl = fallbackUrl;
          logMessage(`✅ Successfully downloaded from: ${fallbackUrl}`);
          // Reset circuit breaker on success
          resetCircuitBreaker();
          break; // Success, exit retry loop
          
        } catch (error) {
          lastError = error;
          retries--;
          
          const statusCode = error.response?.status;
          const errorType = categorizeError(error.message, statusCode);
          
          // Update circuit breaker on errors
          updateCircuitBreaker(statusCode);
          
          if (retries > 0) {
            logMessage(`⚠️ Download failed (${errorType}), retrying... (${retries} attempts left)`);
            // Enhanced backoff for 502 errors - SHARED SERVER needs much longer delays
            let delay;
            if (statusCode === 502) {
              delay = Math.min(15000 * Math.pow(2, 3 - retries), 120000); // 30s, 60s, 120s for 502s on shared hosting
            } else {
              delay = Math.min(5000 * Math.pow(2, 3 - retries), 30000); // 10s, 20s, 30s for other errors
            }
            logMessage(`⏳ Waiting ${delay}ms before retry (${errorType})...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          } else {
            logMessage(`❌ All retries failed for ${fallbackUrl}: ${error.message}`);
          }
        }
      }
      
      if (response) {
        break; // Success with this URL, no need to try others
      }
    }

    // If all URLs failed, log it and return null
    if (!response) {
      const failedItem = {
        originalUrl: imageUrl,
        error: lastError?.message || 'All sources failed',
        statusCode: lastError?.response?.status,
        timestamp: new Date().toISOString(),
        attemptedSources: fallbackUrls,
        errorType: categorizeError(lastError?.message, lastError?.response?.status)
      };
      
      failedDownloads.push(failedItem);
      
      if (isRetryableError(failedItem.errorType)) {
        imageStats.retryable_errors++;
        logMessage(`🔄 Retryable error logged for: ${imageUrl}`);
      } else {
        imageStats.errors++;
        logMessage(`❌ Non-retryable error for: ${imageUrl}`);
      }
      
      return null;
    }

    // Get file extension from URL or content-type
    let fileExtension = path.extname(successUrl).toLowerCase();
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
      logMessage(`✅ Uploaded to S3: ${finalS3Key}`);
      return finalS3Key;
    } else {
      logMessage(`❌ Upload to S3 failed for: ${finalS3Key}`);
      return null;
    }

  } catch (error) {
    logMessage(`❌ Error processing image: ${error.message}`);
    return null;
  }
}

/**
 * Migrate banner images from current DB URLs to S3
 */
async function migrateBannerImages(crossServerMigration, queryInterface, Sequelize, imageStats) {
  try {
    // Get ALL banner images (including those already in S3)
    const bannersWithImages = await queryInterface.sequelize.query(`
      SELECT id, title, image_url 
      FROM BannerImages 
      WHERE image_url IS NOT NULL 
      AND image_url != ''
      ORDER BY id
    `, {
      type: Sequelize.QueryTypes.SELECT
    });

    console.log(`📊 Found ${bannersWithImages.length} banner images to process`);

    for (const banner of bannersWithImages) {
      imageStats.processed++;
      
      console.log(`🔄 Processing banner: ${banner.title || `ID ${banner.id}`}`);
      
      // Smart migration: check if exists, upload if needed, get correct URL
      const finalUrl = await smartImageMigration(banner.image_url, 'banners', imageStats);
      
      if (finalUrl) {
        await queryInterface.sequelize.query(`
          UPDATE BannerImages SET image_url = ?, updatedAt = NOW() WHERE id = ?
        `, {
          replacements: [finalUrl, banner.id]
        });
        
        imageStats.updated++;
        console.log(`✅ Updated banner image URL: ${banner.title || `ID ${banner.id}`}`);
      } else {
        console.log(`❌ Failed to process banner image: ${banner.title || `ID ${banner.id}`}`);
      }
      
      // Add delay between processing to avoid rate limiting (SHARED SERVER - needs longer delays)
      if (imageStats.processed < bannersWithImages.length) {
        console.log(`⏳ Waiting 15 seconds before next image (shared server protection)...`);
        await new Promise(resolve => setTimeout(resolve, 15000));
      }
      
      // Save progress periodically (every 10 items)
      if (imageStats.processed % 10 === 0) {
        saveProgress(imageStats);
        logMessage(`💾 Progress saved (${imageStats.processed}/${bannersWithImages.length})`);
      }
    }

  } catch (error) {
    console.error('❌ Error migrating banner images:', error);
    throw error;
  }
}

/**
 * Migrate carousel images from current DB URLs to S3
 */
async function migrateCarouselImages(crossServerMigration, queryInterface, Sequelize, imageStats) {
  try {
    // Get ALL carousel images (including those already in S3)
    const carouselsWithImages = await queryInterface.sequelize.query(`
      SELECT id, title, image_url 
      FROM Carousels 
      WHERE image_url IS NOT NULL 
      AND image_url != ''
      ORDER BY id
    `, {
      type: Sequelize.QueryTypes.SELECT
    });

    console.log(`📊 Found ${carouselsWithImages.length} carousel images to process`);

    for (const carousel of carouselsWithImages) {
      imageStats.processed++;
      
      console.log(`🔄 Processing carousel: ${carousel.title || `ID ${carousel.id}`}`);
      
      // Smart migration: check if exists, upload if needed, get correct URL
      const finalUrl = await smartImageMigration(carousel.image_url, 'carousels', imageStats);
      
      if (finalUrl) {
        await queryInterface.sequelize.query(`
          UPDATE Carousels SET image_url = ?, updatedAt = NOW() WHERE id = ?
        `, {
          replacements: [finalUrl, carousel.id]
        });
        
        imageStats.updated++;
        console.log(`✅ Updated carousel image URL: ${carousel.title || `ID ${carousel.id}`}`);
      } else {
        console.log(`❌ Failed to process carousel image: ${carousel.title || `ID ${carousel.id}`}`);
      }
      
      // Add delay between processing to avoid rate limiting (SHARED SERVER - needs longer delays)
      if (imageStats.processed < carouselsWithImages.length) {
        console.log(`⏳ Waiting 15 seconds before next image (shared server protection)...`);
        await new Promise(resolve => setTimeout(resolve, 15000));
      }
      
      // Save progress periodically (every 10 items)
      if (imageStats.processed % 10 === 0) {
        saveProgress(imageStats);
        logMessage(`💾 Progress saved (${imageStats.processed}/${carouselsWithImages.length})`);
      }
    }

  } catch (error) {
    console.error('❌ Error migrating carousel images:', error);
    throw error;
  }
}

/**
 * Generate multiple fallback URLs for failed downloads
 */
function generateFallbackUrls(imageUrl) {
  const fallbackUrls = [];
  
  // Original URL
  if (imageUrl.startsWith('http')) {
    fallbackUrls.push(imageUrl);
  }
  
  // If it's already an S3 URL, don't try to convert it to WordPress URLs
  if (imageUrl.includes('s3') || imageUrl.includes('cloudfront')) {
    return fallbackUrls; // Just return the original URL
  }
  
  // Clean the URL - remove any WordPress upload path prefixes
  const cleanUrl = imageUrl.replace(/^.*\/wp-content\/uploads\//, '').replace(/^.*\/uploads\//, '');
  
  // Standard WordPress uploads path variations
  fallbackUrls.push(`https://www.vapehub.co.uk/wp-content/uploads/${cleanUrl}`);
  fallbackUrls.push(`https://vapehub.co.uk/wp-content/uploads/${cleanUrl}`);
  
  // Alternative CDN/backup domains (common for WordPress sites)
  fallbackUrls.push(`https://cdn.vapehub.co.uk/wp-content/uploads/${cleanUrl}`);
  fallbackUrls.push(`https://static.vapehub.co.uk/wp-content/uploads/${cleanUrl}`);
  fallbackUrls.push(`https://media.vapehub.co.uk/wp-content/uploads/${cleanUrl}`);
  
  // Try with different upload structure (some WP sites reorganize)
  fallbackUrls.push(`https://www.vapehub.co.uk/uploads/${cleanUrl}`);
  fallbackUrls.push(`https://vapehub.co.uk/uploads/${cleanUrl}`);
  
  // Try with media folder structure
  fallbackUrls.push(`https://www.vapehub.co.uk/media/${cleanUrl}`);
  fallbackUrls.push(`https://vapehub.co.uk/media/${cleanUrl}`);
  
  // Protocol variations
  if (imageUrl.startsWith('//')) {
    fallbackUrls.push(`https:${imageUrl}`);
    fallbackUrls.push(`http:${imageUrl}`);
  }
  
  // Force HTTPS variations
  if (imageUrl.startsWith('http:')) {
    fallbackUrls.push(imageUrl.replace('http:', 'https:'));
  }
  
  // HTTP fallback for older images (sometimes HTTPS isn't available)
  if (imageUrl.startsWith('https:')) {
    fallbackUrls.push(imageUrl.replace('https:', 'http:'));
  }
  
  // Remove duplicates while preserving order
  return fallbackUrls.filter((url, index, arr) => arr.indexOf(url) === index);
}

/**
 * Categorize error types for better handling
 */
function categorizeError(errorMessage, statusCode) {
  if (!errorMessage) return 'unknown';
  
  const error = errorMessage.toLowerCase();
  
  if (statusCode === 502 || error.includes('502') || error.includes('bad gateway')) return 'server_error_502';
  if (statusCode === 503 || error.includes('503') || error.includes('service unavailable')) return 'server_error_503';
  if (statusCode === 404 || error.includes('404') || error.includes('not found')) return 'not_found';
  if (statusCode === 403 || error.includes('403') || error.includes('forbidden')) return 'forbidden';
  if (error.includes('timeout')) return 'timeout';
  if (error.includes('network')) return 'network';
  if (error.includes('dns')) return 'dns';
  if (error.includes('enotfound')) return 'dns';
  if (error.includes('econnrefused')) return 'connection_refused';
  
  return 'other';
}

/**
 * Check if an error type is worth retrying
 */
function isRetryableError(errorType) {
  const retryableErrors = [
    'server_error_502',
    'server_error_503', 
    'timeout',
    'network',
    'dns',
    'connection_refused'
  ];
  
  return retryableErrors.includes(errorType);
}

/**
 * Log message to both console and file
 */
function logMessage(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp}: ${message}`;
  
  console.log(message);
  
  try {
    // Ensure logs directory exists
    const logsDir = path.dirname(logFile);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    fs.appendFileSync(logFile, logMessage + '\n');
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
    
    // Ensure logs directory exists
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
📊 BANNER & CAROUSEL MIGRATION REPORT
====================================
Migration completed at: ${new Date().toISOString()}

STATISTICS:
- Total Processed: ${imageStats.processed}
- Successfully Uploaded: ${imageStats.uploaded}
- Skipped (Already Exists): ${imageStats.skipped}
- Database Records Updated: ${imageStats.updated}
- Total Errors: ${imageStats.errors}
- Retryable Errors: ${imageStats.retryable_errors}

FAILED DOWNLOADS: ${failedDownloads.length}
${failedDownloads.length > 0 ? 
  '\nFailed URLs by Error Type:\n' + getFailuresByType().map(([type, count]) => `- ${type}: ${count}`).join('\n')
  : ''}

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
 * Get failure statistics by error type
 */
function getFailuresByType() {
  const typeCount = {};
  
  failedDownloads.forEach(failure => {
    const type = failure.errorType || 'unknown';
    typeCount[type] = (typeCount[type] || 0) + 1;
  });
  
  return Object.entries(typeCount).sort(([,a], [,b]) => b - a);
}

/**
 * Validate if URL is a valid image URL
 */
function isValidImageUrl(url) {
  try {
    const urlObj = new URL(url);
    
    // Allow S3 and CloudFront URLs
    if (urlObj.hostname.includes('s3') || urlObj.hostname.includes('cloudfront')) {
      const path = urlObj.pathname.toLowerCase();
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
      return imageExtensions.some(ext => path.endsWith(ext));
    }
    
    // Check if domain is reasonable for WordPress URLs
    if (!urlObj.hostname.includes('vapehub.co.uk')) {
      return false;
    }
    
    // Check if path looks like an image
    const path = urlObj.pathname.toLowerCase();
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
    const hasImageExtension = imageExtensions.some(ext => path.endsWith(ext));
    
    if (!hasImageExtension) {
      return false;
    }
    
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check circuit breaker status
 */
async function checkCircuitBreaker() {
  const now = Date.now();
  
  // If circuit breaker is open, check if cooldown period has passed
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
    
    // Open circuit breaker if too many consecutive 502s (shared server = lower threshold)
    if (circuitBreaker.consecutive502s >= 3) {
      circuitBreaker.isOpen = true;
      logMessage(`🔌 Circuit breaker OPENED after ${circuitBreaker.consecutive502s} consecutive 502 errors (shared server protection). Pausing for ${circuitBreaker.cooldownPeriod/60000} minutes...`);
    }
  } else {
    // Reset 502 counter on different error types
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


