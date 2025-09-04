'use strict';

/**
 * Blog Images S3 Migration Seeder
 * 
 * Downloads blog images from external URLs and uploads them to S3,
 * then updates the database with CloudFront URLs.
 * 
 * Features:
 * - Non-blocking batch processing (server-friendly)
 * - Downloads blog post featured images
 * - Downloads blog category images  
 * - Uploads to S3 with organized folder structure
 * - Updates database with CloudFront URLs
 * - Progress tracking and error recovery
 * - Circuit breaker for shared server protection
 * - Minimal database connections for production use
 */

const { uploadFiletToS3, generateUniqueFileName, generateCloudFrontUrlForS3, checkImageExists } = require('../../library/s3/s3Helper');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Background processing configuration
const BATCH_SIZE = 5; // Process 5 images at a time
const BATCH_DELAY = 30000; // 30 seconds between batches
const IMAGE_DELAY = 8000; // 8 seconds between individual images

// Progress tracking
let failedDownloads = [];
const progressFile = path.join(__dirname, '../../logs/blog-image-migration-progress.json');
const logFile = path.join(__dirname, '../../logs/blog-image-migration.log');

// Circuit breaker for shared server protection
let circuitBreaker = {
  consecutive502s: 0,
  consecutive429s: 0, // Rate limiting errors
  totalErrors: 0,
  isOpen: false,
  lastErrorTime: null,
  cooldownPeriod: 1800000, // 30 minutes for shared servers
  maxErrorsPerHour: 10 // Conservative limit for shared hosting
};

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('📸 Starting BLOG IMAGES S3 MIGRATION...');
    
    // Check URL configuration
    const hasCloudFront = process.env.CLOUDFRONT_DOMAIN && process.env.CLOUDFRONT_DOMAIN.trim() !== '';
    console.log(`🌐 URL Configuration: ${hasCloudFront ? 'CloudFront + S3' : 'S3 Direct URLs'}`);
    if (hasCloudFront) {
      console.log(`   CloudFront Domain: ${process.env.CLOUDFRONT_DOMAIN}`);
    } else {
      console.log(`   S3 Bucket: ${process.env.AWS_S3_BUCKET || 'Not configured'}`);
      console.log(`   AWS Region: ${process.env.AWS_REGION || 'us-east-1 (default)'}`);
    }
    
    try {
      const migrationStats = {
        blogImages: { processed: 0, uploaded: 0, skipped: 0, errors: 0 },
        categoryImages: { processed: 0, uploaded: 0, skipped: 0, errors: 0 },
        totalImages: { processed: 0, uploaded: 0, skipped: 0, errors: 0 },
        urlType: hasCloudFront ? 'CloudFront' : 'S3 Direct'
      };

      // Load previous progress if exists
      loadProgress(migrationStats);

      // Step 1: Migrate blog post images in batches
      console.log('\n📝 Step 1: Migrating blog post images in server-friendly batches...');
      console.log(`⚙️ Configuration: ${BATCH_SIZE} images per batch, ${BATCH_DELAY/1000}s between batches, ${IMAGE_DELAY/1000}s between images`);
      await migrateBlogImagesInBatches(queryInterface, Sequelize, migrationStats);

      // Step 2: Migrate blog category images  
      console.log('\n📂 Step 2: Migrating blog category images...');
      await migrateCategoryImages(queryInterface, Sequelize, migrationStats);

      // Final report
      console.log('\n🎉 Blog images S3 migration completed!');
      generateMigrationReport(migrationStats);

      // Save final progress
      saveProgress(migrationStats);

      if (failedDownloads.length > 0) {
        console.log('\n⚠️  Some images failed to download. Failed URLs saved to logs/blog-image-migration-progress.json');
        console.log('💡 You can manually retry these images later.');
      }

    } catch (error) {
      console.error('❌ Error during blog images migration:', error);
      saveProgress(migrationStats);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('⚠️ Blog images S3 migration cannot be automatically reversed');
    console.log('💡 To rollback:');
    console.log('   1. Manually delete blog images from S3 bucket');
    console.log('   2. Restore original image URLs in database');
    console.log('   3. Run: UPDATE blogs SET image_url = original_url WHERE ...');
    console.log('   4. Run: UPDATE blog_categories SET image_url = original_url WHERE ...');
  }
};

/**
 * Migrate blog post images to S3 in server-friendly batches
 */
async function migrateBlogImagesInBatches(queryInterface, Sequelize, migrationStats) {
  try {
    // Get total count first
    const [totalResult] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count FROM blogs 
      WHERE image_url IS NOT NULL 
        AND image_url != ''
        AND image_url NOT LIKE '%cloudfront%'
        AND image_url NOT LIKE '%s3.amazonaws%'
        AND image_url NOT LIKE '%vapehub-dev.s3.%'
    `);
    
    const totalImages = totalResult[0].count;
    console.log(`📊 Found ${totalImages} blog posts with images to migrate`);
    
    if (totalImages === 0) return;
    
    let offset = 0;
    
    while (offset < totalImages) {
      // Get batch of images
      const [batch] = await queryInterface.sequelize.query(`
        SELECT id, title, image_url 
        FROM blogs 
        WHERE image_url IS NOT NULL 
          AND image_url != ''
          AND image_url NOT LIKE '%cloudfront%'
          AND image_url NOT LIKE '%s3.amazonaws%'
        AND image_url NOT LIKE '%vapehub-dev.s3.%'
        ORDER BY id ASC
        LIMIT ${BATCH_SIZE} OFFSET ${offset}
      `);
      
      if (batch.length === 0) break;
      
      console.log(`\n📦 Processing batch ${Math.floor(offset/BATCH_SIZE) + 1} of ${Math.ceil(totalImages/BATCH_SIZE)} (${batch.length} images)`);
      
      // Process each image in the batch
      for (const blog of batch) {
        migrationStats.blogImages.processed++;
        migrationStats.totalImages.processed++;
        
        try {
          logMessage(`📸 Processing blog image: ${blog.title}`);
          
          // Check circuit breaker
          if (await checkCircuitBreaker()) {
            logMessage(`🔌 Circuit breaker is open. Waiting for reset...`);
            await waitForCircuitBreaker();
          }

          // Migrate image to S3
          const cloudFrontUrl = await migrateImageToS3(blog.image_url, 'blog-images', migrationStats.blogImages);
          
          if (cloudFrontUrl) {
            // Update database with new CloudFront URL
            await queryInterface.sequelize.query(`
              UPDATE blogs 
              SET image_url = ? 
              WHERE id = ?
            `, {
              replacements: [cloudFrontUrl, blog.id],
              type: Sequelize.QueryTypes.UPDATE
            });

            logMessage(`✅ Updated blog image: ${blog.title} -> ${cloudFrontUrl}`);
            migrationStats.blogImages.uploaded++;
            migrationStats.totalImages.uploaded++;
          } else {
            migrationStats.blogImages.errors++;
            migrationStats.totalImages.errors++;
          }

          // Delay between individual images
          await new Promise(resolve => setTimeout(resolve, IMAGE_DELAY));

        } catch (error) {
          migrationStats.blogImages.errors++;
          migrationStats.totalImages.errors++;
          logMessage(`❌ Error processing blog image ${blog.title}: ${error.message}`);
        }
      }
      
      offset += BATCH_SIZE;
      saveProgress(migrationStats);
      
      // Longer delay between batches to allow server to handle other requests
      if (offset < totalImages) {
        console.log(`⏸️ Batch complete. Waiting ${BATCH_DELAY/1000} seconds before next batch to allow server processing...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    console.log(`📝 Blog images migration completed: ${migrationStats.blogImages.uploaded} uploaded, ${migrationStats.blogImages.skipped} skipped, ${migrationStats.blogImages.errors} errors`);

  } catch (error) {
    logMessage(`❌ Error in blog images migration: ${error.message}`);
    throw error;
  }
}

/**
 * Migrate blog category images to S3
 */
async function migrateCategoryImages(queryInterface, Sequelize, migrationStats) {
  try {
    // Get all categories with image URLs
    const [categories] = await queryInterface.sequelize.query(`
      SELECT id, name, image_url 
      FROM blog_categories 
      WHERE image_url IS NOT NULL 
        AND image_url != ''
        AND image_url NOT LIKE '%cloudfront%'
        AND image_url NOT LIKE '%s3.amazonaws%'
        AND image_url NOT LIKE '%vapehub-dev.s3.%'
      ORDER BY id ASC
    `);

    console.log(`📊 Found ${categories.length} blog categories with images to migrate`);

    for (const category of categories) {
      migrationStats.categoryImages.processed++;
      migrationStats.totalImages.processed++;
      
      try {
        logMessage(`📸 Processing category image: ${category.name}`);
        
        // Check circuit breaker
        if (await checkCircuitBreaker()) {
          logMessage(`🔌 Circuit breaker is open. Waiting for reset...`);
          await waitForCircuitBreaker();
        }

        // Migrate image to S3
        const cloudFrontUrl = await migrateImageToS3(category.image_url, 'blog-category-images', migrationStats.categoryImages);
        
        if (cloudFrontUrl) {
          // Update database with new CloudFront URL
          await queryInterface.sequelize.query(`
            UPDATE blog_categories 
            SET image_url = ? 
            WHERE id = ?
          `, {
            replacements: [cloudFrontUrl, category.id],
            type: Sequelize.QueryTypes.UPDATE
          });

          logMessage(`✅ Updated category image: ${category.name} -> ${cloudFrontUrl}`);
          migrationStats.categoryImages.uploaded++;
          migrationStats.totalImages.uploaded++;
        } else {
          migrationStats.categoryImages.errors++;
          migrationStats.totalImages.errors++;
        }

        // Delay between individual images
        await new Promise(resolve => setTimeout(resolve, IMAGE_DELAY));

      } catch (error) {
        migrationStats.categoryImages.errors++;
        migrationStats.totalImages.errors++;
        logMessage(`❌ Error processing category image ${category.name}: ${error.message}`);
      }
    }

    console.log(`📂 Category images migration completed: ${migrationStats.categoryImages.uploaded} uploaded, ${migrationStats.categoryImages.skipped} skipped, ${migrationStats.categoryImages.errors} errors`);

  } catch (error) {
    logMessage(`❌ Error in category images migration: ${error.message}`);
    throw error;
  }
}

/**
 * Migrate a single image to S3
 */
async function migrateImageToS3(imageUrl, folder, imageStats) {
  try {
    if (!imageUrl || imageUrl.trim() === '') {
      return null;
    }

    // Generate S3 key based on image URL
    const urlParts = imageUrl.split('/');
    const originalFileName = urlParts[urlParts.length - 1];
    const fileExtension = path.extname(originalFileName) || '.jpg';
    const uniqueFileName = generateUniqueFileName(`blog-image${fileExtension}`);
    const s3Key = `${folder}/${uniqueFileName}`;

    // Check if image already exists in S3
    const imageExists = await checkImageExists(s3Key);
    if (imageExists) {
      imageStats.skipped++;
      return generateImageUrl(s3Key);
    }

    // Download and upload to S3
    const uploadResult = await downloadAndUploadToS3(imageUrl, s3Key, imageStats);
    if (uploadResult) {
      return generateImageUrl(s3Key);
    }

    return null;

  } catch (error) {
    logMessage(`❌ Error migrating image ${imageUrl}: ${error.message}`);
    return null;
  }
}

/**
 * Generate image URL - CloudFront if available, otherwise S3 direct URL
 */
function generateImageUrl(s3Key) {
  try {
    // Try CloudFront first
    if (process.env.CLOUDFRONT_DOMAIN && process.env.CLOUDFRONT_DOMAIN.trim() !== '') {
      logMessage(`🌐 Using CloudFront URL for: ${s3Key}`);
      return generateCloudFrontUrlForS3(s3Key);
    }
    
    // Fallback to S3 direct URL
    const bucketName = process.env.AWS_S3_BUCKET;
    const region = process.env.AWS_REGION || 'us-east-1';
    
    // Use region-specific URL format for better performance
    let s3Url;
    if (region === 'us-east-1') {
      s3Url = `https://${bucketName}.s3.amazonaws.com/${s3Key}`;
    } else {
      s3Url = `https://${bucketName}.s3.${region}.amazonaws.com/${s3Key}`;
    }
    
    logMessage(`☁️ Using S3 direct URL for: ${s3Key}`);
    return s3Url;
    
  } catch (error) {
    logMessage(`❌ Error generating image URL for ${s3Key}: ${error.message}`);
    
    // Ultimate fallback - basic S3 URL construction
    const bucketName = process.env.AWS_S3_BUCKET || 'default-bucket';
    return `https://${bucketName}.s3.amazonaws.com/${s3Key}`;
  }
}

/**
 * Download image and upload to S3
 */
async function downloadAndUploadToS3(imageUrl, s3Key, imageStats) {
  try {
    logMessage(`📥 Downloading: ${imageUrl}`);

    // Create multiple fallback URLs to try (like the existing seeder)
    const fallbackUrls = generateFallbackUrls(imageUrl);
    
    let response;
    let lastError;
    let successUrl;

    // Try each fallback URL with retries
    for (const fallbackUrl of fallbackUrls) {
      logMessage(`📥 Attempting download: ${fallbackUrl}`);
      
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
            },
            maxContentLength: 10 * 1024 * 1024, // 10MB max file size
            validateStatus: function (status) {
              return status >= 200 && status < 300; // Only accept 2xx responses
            }
          });
          
          successUrl = fallbackUrl;
          logMessage(`✅ Successfully downloaded from: ${fallbackUrl}`);
          resetCircuitBreaker();
          break; // Success, exit retry loop
          
        } catch (error) {
          lastError = error;
          retries--;
          
          const statusCode = error.response?.status;
          
          if (retries > 0) {
            logMessage(`⚠️ Download failed (${statusCode}), retrying... (${retries} attempts left)`);
            // Enhanced backoff for server errors
            let delay = statusCode === 502 ? 15000 * Math.pow(2, 3 - retries) : 5000 * Math.pow(2, 3 - retries);
            delay = Math.min(delay, 120000); // Max 2 minutes
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
        attemptedSources: fallbackUrls
      };
      
      failedDownloads.push(failedItem);
      logMessage(`❌ All fallback URLs failed for: ${imageUrl}`);
      return null;
    }

    // Save to temporary file
    const tempDir = os.tmpdir();
    const tempFileName = generateUniqueFileName('blog-temp.jpg');
    const tempFile = path.join(tempDir, tempFileName);
    const writer = fs.createWriteStream(tempFile);

    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // Upload to S3
    const fileBuffer = fs.readFileSync(tempFile);
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: response.headers['content-type'] || 'image/jpeg',
      CacheControl: 'max-age=31536000' // 1 year cache
    };

    logMessage(`📤 Uploading to S3: ${s3Key}`);
    const uploadResult = await uploadFiletToS3(uploadParams);
    
    // Clean up temp file
    fs.unlinkSync(tempFile);

    if (uploadResult && uploadResult.Location) {
      logMessage(`✅ Successfully uploaded: ${s3Key}`);
      resetCircuitBreaker();
      return s3Key;
    }

    return null;

  } catch (error) {
    handleDownloadError(error, imageUrl);
    return null;
  }
}

/**
 * Handle download errors and circuit breaker for shared servers
 */
function handleDownloadError(error, imageUrl) {
  const statusCode = error.response?.status;
  
  circuitBreaker.totalErrors++;
  circuitBreaker.lastErrorTime = Date.now();
  
  // Handle server overload errors (common on shared hosting)
  if (statusCode === 502 || statusCode === 503 || statusCode === 504) {
    circuitBreaker.consecutive502s++;
    if (circuitBreaker.consecutive502s >= 2) { // More aggressive for shared servers
      circuitBreaker.isOpen = true;
      logMessage(`🔌 Circuit breaker opened after ${circuitBreaker.consecutive502s} consecutive server errors`);
    }
  }
  
  // Handle rate limiting (429 Too Many Requests)
  if (statusCode === 429) {
    circuitBreaker.consecutive429s++;
    if (circuitBreaker.consecutive429s >= 1) { // Immediate circuit break on rate limiting
      circuitBreaker.isOpen = true;
      logMessage(`🔌 Circuit breaker opened due to rate limiting (429 error)`);
    }
  }
  
  // Check total errors per hour for shared server protection
  if (circuitBreaker.totalErrors >= circuitBreaker.maxErrorsPerHour) {
    circuitBreaker.isOpen = true;
    logMessage(`🔌 Circuit breaker opened due to too many errors (${circuitBreaker.totalErrors}/${circuitBreaker.maxErrorsPerHour})`);
  }
  
  failedDownloads.push({
    url: imageUrl,
    error: error.message,
    statusCode: statusCode,
    timestamp: new Date().toISOString(),
    suggestion: getErrorSuggestion(statusCode)
  });
  
  logMessage(`❌ Download failed: ${imageUrl} - ${error.message} (Status: ${statusCode})`);
}

/**
 * Get suggestion based on error status code
 */
function getErrorSuggestion(statusCode) {
  switch (statusCode) {
    case 429:
      return 'Rate limited - increase delays between requests';
    case 502:
    case 503:
    case 504:
      return 'Server overloaded - try again later with longer delays';
    case 403:
      return 'Forbidden - check referrer and user agent headers';
    case 404:
      return 'Image not found - may have been moved or deleted';
    default:
      return 'Check network connectivity and server status';
  }
}

/**
 * Check circuit breaker status
 */
async function checkCircuitBreaker() {
  if (!circuitBreaker.isOpen) {
    return false;
  }
  
  const timeSinceLastError = Date.now() - circuitBreaker.lastErrorTime;
  if (timeSinceLastError > circuitBreaker.cooldownPeriod) {
    resetCircuitBreaker();
    logMessage(`🔌 Circuit breaker reset after cooldown period`);
    return false;
  }
  
  return true;
}

/**
 * Wait for circuit breaker to reset
 */
async function waitForCircuitBreaker() {
  if (!circuitBreaker.isOpen) return;
  
  const timeSinceLastError = Date.now() - circuitBreaker.lastErrorTime;
  if (timeSinceLastError < circuitBreaker.cooldownPeriod) {
    const waitTime = circuitBreaker.cooldownPeriod - timeSinceLastError;
    logMessage(`⏳ Waiting ${Math.round(waitTime/60000)} minutes for circuit breaker reset...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  resetCircuitBreaker();
  logMessage(`🔌 Circuit breaker reset`);
}

/**
 * Reset circuit breaker
 */
function resetCircuitBreaker() {
  circuitBreaker.consecutive502s = 0;
  circuitBreaker.consecutive429s = 0;
  circuitBreaker.isOpen = false;
  // Note: Don't reset totalErrors to maintain hour-based tracking
}

/**
 * Generate fallback URLs for better download success rate
 */
function generateFallbackUrls(originalUrl) {
  const fallbackUrls = [originalUrl];
  
  try {
    // Convert HTTPS to HTTP as fallback
    if (originalUrl.startsWith('https://')) {
      fallbackUrls.push(originalUrl.replace('https://', 'http://'));
    }
    
    // Try with www. prefix if not present
    if (!originalUrl.includes('www.')) {
      const withWww = originalUrl.replace('://', '://www.');
      fallbackUrls.push(withWww);
    }
    
    // Try without www. if present
    if (originalUrl.includes('www.')) {
      const withoutWww = originalUrl.replace('://www.', '://');
      fallbackUrls.push(withoutWww);
    }
    
  } catch (error) {
    logMessage(`⚠️ Error generating fallback URLs: ${error.message}`);
  }
  
  return [...new Set(fallbackUrls)]; // Remove duplicates
}

/**
 * Log message to console and file
 */
function logMessage(message) {
  console.log(message);
  try {
    const logsDir = path.dirname(logFile);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    fs.appendFileSync(logFile, `${new Date().toISOString()}: ${message}\n`);
  } catch (error) {
    // Ignore file write errors
  }
}

/**
 * Load previous progress
 */
function loadProgress(migrationStats) {
  try {
    if (fs.existsSync(progressFile)) {
      const data = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
      failedDownloads = data.failedDownloads || [];
      console.log(`📂 Loaded ${failedDownloads.length} failed downloads from previous run`);
    }
  } catch (error) {
    console.error('⚠️ Could not load progress file:', error.message);
  }
}

/**
 * Save progress to file
 */
function saveProgress(migrationStats) {
  try {
    const progressData = {
      failedDownloads: failedDownloads,
      stats: migrationStats,
      lastUpdated: new Date().toISOString()
    };
    
    const logsDir = path.dirname(progressFile);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    fs.writeFileSync(progressFile, JSON.stringify(progressData, null, 2));
  } catch (error) {
    console.error('⚠️ Could not save progress file:', error.message);
  }
}

/**
 * Generate migration report
 */
function generateMigrationReport(migrationStats) {
  const report = `
📊 BLOG IMAGES S3 MIGRATION REPORT
==================================
Blog Images: ${migrationStats.blogImages.uploaded}/${migrationStats.blogImages.processed} uploaded
Category Images: ${migrationStats.categoryImages.uploaded}/${migrationStats.categoryImages.processed} uploaded
Total Processed: ${migrationStats.totalImages.processed}
Total Uploaded: ${migrationStats.totalImages.uploaded}
Total Skipped: ${migrationStats.totalImages.skipped}
Total Errors: ${migrationStats.totalImages.errors}
Failed Downloads: ${failedDownloads.length}
Circuit Breaker Triggered: ${circuitBreaker.isOpen ? 'Yes' : 'No'}
⚠️  SHARED SERVER PROTECTION ACTIVE
- Batch processing: ${BATCH_SIZE} images per batch
- Individual delays: ${IMAGE_DELAY/1000}s between images
- Batch delays: ${BATCH_DELAY/1000}s between batches
- Circuit breaker: 30 minute cooldown on errors
- Max ${circuitBreaker.maxErrorsPerHour} errors per hour limit
- URL Type: ${migrationStats.urlType} URLs
`;

  console.log(report);
  logMessage(report);
}