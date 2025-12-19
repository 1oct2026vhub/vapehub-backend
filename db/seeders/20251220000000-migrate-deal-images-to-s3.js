'use strict';

/**
 * Deal Images S3 Migration Seeder
 * 
 * Downloads deal images from external URLs or old database and uploads them to S3,
 * then updates the database with CloudFront URLs.
 * 
 * Features:
 * - Non-blocking batch processing (server-friendly)
 * - Downloads deal images from old database or external URLs
 * - Uploads to S3 with organized folder structure
 * - Updates database with CloudFront URLs
 * - Progress tracking and error recovery
 * - Handles both old database sources and external URLs
 */

const CrossServerMigration = require('../../utils/cross-server-migration');
const { uploadFiletToS3, generateUniqueFileName, generateCloudFrontUrlForS3, checkImageExists } = require('../../library/s3/s3Helper');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Background processing configuration
const BATCH_SIZE = 3; // Process 3 images at a time
const BATCH_DELAY = 60000; // 60 seconds between batches
const IMAGE_DELAY = 15000; // 15 seconds between individual images

// Progress tracking
let failedDownloads = [];
const progressFile = path.join(__dirname, '../../logs/deal-image-migration-progress.json');
const logFile = path.join(__dirname, '../../logs/deal-image-migration.log');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const environment = process.env.NODE_ENV || 'local';
    console.log(`🔧 Using environment: ${environment}`);
    const crossServerMigration = new CrossServerMigration(environment);
    
    console.log('📸 Starting DEAL IMAGES S3 MIGRATION...');
    
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
        dealImages: { processed: 0, uploaded: 0, skipped: 0, errors: 0 },
        totalImages: { processed: 0, uploaded: 0, skipped: 0, errors: 0 },
        urlType: hasCloudFront ? 'CloudFront' : 'S3 Direct'
      };

      // Load previous progress if exists
      loadProgress(migrationStats);

      // Connect to old database
      await crossServerMigration.connectToOldDb();

      // Step 1: Migrate deal images from old database (if available)
      console.log('\n📝 Step 1: Migrating deal images from old database...');
      await migrateDealImagesFromOldDb(crossServerMigration, queryInterface, Sequelize, migrationStats);

      // Step 2: Migrate deal images from current database (external URLs)
      console.log('\n📝 Step 2: Migrating deal images from current database (external URLs)...');
      await migrateDealImagesFromCurrentDb(queryInterface, Sequelize, migrationStats);

      // Close old database connection
      await crossServerMigration.closeOldDbConnection();

      // Final report
      console.log('\n🎉 Deal images S3 migration completed!');
      generateMigrationReport(migrationStats);

      // Save final progress
      saveProgress(migrationStats);

      if (failedDownloads.length > 0) {
        console.log('\n⚠️  Some images failed to download. Failed URLs saved to logs/deal-image-migration-progress.json');
        console.log('💡 You can manually retry these images later.');
      }

    } catch (error) {
      console.error('❌ Error during deal images migration:', error);
      await crossServerMigration.closeOldDbConnection();
      saveProgress(migrationStats);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('⚠️ Deal images S3 migration cannot be automatically reversed');
    console.log('💡 To rollback:');
    console.log('   1. Manually delete deal images from S3 bucket');
    console.log('   2. Restore original image URLs in database');
    console.log('   3. Run: UPDATE deals SET image_url = original_url WHERE ...');
  }
};

/**
 * Migrate deal images from old database
 */
async function migrateDealImagesFromOldDb(crossServerMigration, queryInterface, Sequelize, migrationStats) {
  try {
    // Check if old deals table exists and has image_url
    const tables = await crossServerMigration.fetchFromOldDb('SHOW TABLES');
    const tableNames = tables.map(table => Object.values(table)[0].toLowerCase());
    
    const hasDealsTable = tableNames.includes('deals');
    if (!hasDealsTable) {
      console.log('⚠️  Old deals table not found. Skipping old database image migration.');
      return;
    }

    // Get deals with image URLs from old database
    const oldDeals = await crossServerMigration.fetchFromOldDb(`
      SELECT 
        id,
        name,
        image_url
      FROM deals 
      WHERE image_url IS NOT NULL 
        AND image_url != ''
        AND image_url NOT LIKE '%cloudfront%'
        AND image_url NOT LIKE '%s3.amazonaws%'
      ORDER BY id ASC
    `);

    console.log(`📊 Found ${oldDeals.length} deals with images in old database`);

    if (oldDeals.length === 0) return;

    // Get current deals to match by ID
    const [currentDeals] = await queryInterface.sequelize.query(`
      SELECT id, name, image_url 
      FROM deals 
      ORDER BY id ASC
    `, { type: Sequelize.QueryTypes.SELECT });

    const currentDealsMap = new Map(currentDeals.map(d => [d.id, d]));

    for (const oldDeal of oldDeals) {
      migrationStats.dealImages.processed++;
      migrationStats.totalImages.processed++;

      try {
        // Check if deal exists in new database
        const currentDeal = currentDealsMap.get(oldDeal.id);
        if (!currentDeal) {
          console.log(`⚠️ Deal ${oldDeal.id} (${oldDeal.name}) not found in new database. Skipping.`);
          migrationStats.dealImages.skipped++;
          migrationStats.totalImages.skipped++;
          continue;
        }

        // Skip if already migrated (has CloudFront or S3 URL)
        if (currentDeal.image_url && 
            (currentDeal.image_url.includes('cloudfront') || 
             currentDeal.image_url.includes('s3.amazonaws'))) {
          console.log(`⏭️ Deal ${oldDeal.id} already has S3/CloudFront image. Skipping.`);
          migrationStats.dealImages.skipped++;
          migrationStats.totalImages.skipped++;
          continue;
        }

        logMessage(`📸 Processing deal image from old DB: ${oldDeal.name} (ID: ${oldDeal.id})`);

        // Migrate image to S3
        const cloudFrontUrl = await migrateImageToS3(oldDeal.image_url, 'deals', migrationStats.dealImages);

        if (cloudFrontUrl) {
          // Update database with new CloudFront URL
          await queryInterface.sequelize.query(`
            UPDATE deals 
            SET image_url = ? 
            WHERE id = ?
          `, {
            replacements: [cloudFrontUrl, oldDeal.id],
            type: Sequelize.QueryTypes.UPDATE
          });

          logMessage(`✅ Updated deal image: ${oldDeal.name} -> ${cloudFrontUrl}`);
          migrationStats.dealImages.uploaded++;
          migrationStats.totalImages.uploaded++;
        } else {
          migrationStats.dealImages.errors++;
          migrationStats.totalImages.errors++;
        }

        // Delay between individual images
        await new Promise(resolve => setTimeout(resolve, IMAGE_DELAY));

      } catch (error) {
        migrationStats.dealImages.errors++;
        migrationStats.totalImages.errors++;
        logMessage(`❌ Error processing deal image ${oldDeal.name}: ${error.message}`);
      }
    }

    console.log(`📝 Old database deal images migration completed: ${migrationStats.dealImages.uploaded} uploaded, ${migrationStats.dealImages.skipped} skipped, ${migrationStats.dealImages.errors} errors`);

  } catch (error) {
    logMessage(`❌ Error in old database deal images migration: ${error.message}`);
    throw error;
  }
}

/**
 * Migrate deal images from current database (external URLs)
 */
async function migrateDealImagesFromCurrentDb(queryInterface, Sequelize, migrationStats) {
  try {
    // Get total count first
    const [totalResult] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count FROM deals 
      WHERE image_url IS NOT NULL 
        AND image_url != ''
        AND image_url NOT LIKE '%cloudfront%'
        AND image_url NOT LIKE '%s3.amazonaws%'
        AND image_url NOT LIKE '%vapehub-dev.s3.%'
    `);

    const totalImages = totalResult[0].count;
    console.log(`📊 Found ${totalImages} deals with external image URLs to migrate`);

    if (totalImages === 0) return;

    let offset = 0;

    while (offset < totalImages) {
      // Get batch of images
      const [batch] = await queryInterface.sequelize.query(`
        SELECT id, name, image_url 
        FROM deals 
        WHERE image_url IS NOT NULL 
          AND image_url != ''
          AND image_url NOT LIKE '%cloudfront%'
          AND image_url NOT LIKE '%s3.amazonaws%'
          AND image_url NOT LIKE '%vapehub-dev.s3.%'
        ORDER BY id ASC
        LIMIT ${BATCH_SIZE} OFFSET ${offset}
      `);

      if (batch.length === 0) break;

      console.log(`\n📦 Processing batch ${Math.floor(offset / BATCH_SIZE) + 1} of ${Math.ceil(totalImages / BATCH_SIZE)} (${batch.length} images)`);

      // Process each image in the batch
      for (const deal of batch) {
        migrationStats.dealImages.processed++;
        migrationStats.totalImages.processed++;

        try {
          logMessage(`📸 Processing deal image: ${deal.name} (ID: ${deal.id})`);

          // Migrate image to S3
          const cloudFrontUrl = await migrateImageToS3(deal.image_url, 'deals', migrationStats.dealImages);

          if (cloudFrontUrl) {
            // Update database with new CloudFront URL
            await queryInterface.sequelize.query(`
              UPDATE deals 
              SET image_url = ? 
              WHERE id = ?
            `, {
              replacements: [cloudFrontUrl, deal.id],
              type: Sequelize.QueryTypes.UPDATE
            });

            logMessage(`✅ Updated deal image: ${deal.name} -> ${cloudFrontUrl}`);
            migrationStats.dealImages.uploaded++;
            migrationStats.totalImages.uploaded++;
          } else {
            migrationStats.dealImages.errors++;
            migrationStats.totalImages.errors++;
          }

          // Delay between individual images
          await new Promise(resolve => setTimeout(resolve, IMAGE_DELAY));

        } catch (error) {
          migrationStats.dealImages.errors++;
          migrationStats.totalImages.errors++;
          logMessage(`❌ Error processing deal image ${deal.name}: ${error.message}`);
        }
      }

      offset += BATCH_SIZE;
      saveProgress(migrationStats);

      // Longer delay between batches
      if (offset < totalImages) {
        console.log(`⏸️ Batch complete. Waiting ${BATCH_DELAY / 1000} seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
      }
    }

    console.log(`📝 Current database deal images migration completed: ${migrationStats.dealImages.uploaded} uploaded, ${migrationStats.dealImages.skipped} skipped, ${migrationStats.dealImages.errors} errors`);

  } catch (error) {
    logMessage(`❌ Error in current database deal images migration: ${error.message}`);
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
    const uniqueFileName = generateUniqueFileName(`deal-image${fileExtension}`);
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

    // Use region-specific URL format
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

    // Ultimate fallback
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

    // Create multiple fallback URLs to try
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
              'User-Agent': 'Mozilla/5.0 (compatible; ImageBot/1.0)',
              'Accept': 'image/*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Connection': 'keep-alive'
            },
            maxContentLength: 10 * 1024 * 1024, // 10MB max file size
            validateStatus: function (status) {
              return status >= 200 && status < 300;
            }
          });

          successUrl = fallbackUrl;
          logMessage(`✅ Successfully downloaded from: ${fallbackUrl}`);
          break; // Success, exit retry loop

        } catch (error) {
          lastError = error;
          retries--;

          const statusCode = error.response?.status;

          if (retries > 0) {
            logMessage(`⚠️ Download failed (${statusCode}), retrying... (${retries} attempts left)`);
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
    const tempFileName = generateUniqueFileName('deal-temp.jpg');
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
      return s3Key;
    }

    return null;

  } catch (error) {
    handleDownloadError(error, imageUrl);
    return null;
  }
}

/**
 * Handle download errors
 */
function handleDownloadError(error, imageUrl) {
  const statusCode = error.response?.status;

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

    // WordPress uploads path variations
    if (originalUrl.includes('wp-content/uploads/')) {
      const cleanUrl = originalUrl.replace(/^.*\/wp-content\/uploads\//, '');
      fallbackUrls.push(`https://www.vapehub.co.uk/wp-content/uploads/${cleanUrl}`);
      fallbackUrls.push(`https://vapehub.co.uk/wp-content/uploads/${cleanUrl}`);
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
📊 DEAL IMAGES S3 MIGRATION REPORT
==================================
Deal Images Processed: ${migrationStats.dealImages.processed}
Deal Images Uploaded: ${migrationStats.dealImages.uploaded}
Deal Images Skipped: ${migrationStats.dealImages.skipped}
Deal Images Errors: ${migrationStats.dealImages.errors}

Total Processed: ${migrationStats.totalImages.processed}
Total Uploaded: ${migrationStats.totalImages.uploaded}
Total Skipped: ${migrationStats.totalImages.skipped}
Total Errors: ${migrationStats.totalImages.errors}
Failed Downloads: ${failedDownloads.length}
URL Type: ${migrationStats.urlType} URLs

⚠️  SERVER-FRIENDLY PROCESSING
- Batch processing: ${BATCH_SIZE} images per batch
- Individual delays: ${IMAGE_DELAY / 1000}s between images
- Batch delays: ${BATCH_DELAY / 1000}s between batches
`;

  console.log(report);
  logMessage(report);
}
