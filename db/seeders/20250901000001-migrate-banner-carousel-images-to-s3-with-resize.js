'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');
const { uploadImageToS3WithResize, generateUniqueFileName, generateCloudFrontUrlForS3, checkImageExists } = require('../../library/s3/s3Helper');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

// SAFETY CONFIGURATIONS TO PREVENT SERVER HANG
const SAFETY_CONFIG = {
  // Memory limits
  maxImageSize: 50 * 1024 * 1024, // 50MB max per image
  maxConcurrentProcessing: 1, // Process one image at a time
  
  // Timeout limits (OPTIMIZED)
  downloadTimeout: 30000, // 30 seconds max download (optimized)
  processingTimeout: 60000, // 1 minute max processing per image (optimized)
  uploadTimeout: 30000, // 30 seconds max upload (optimized)
  
  // Rate limiting (OPTIMIZED)
  delayBetweenImages: 3000, // 3 seconds between images (optimized)
  delayAfterError: 10000, // 10 seconds after error (optimized)
  
  // Batch processing (OPTIMIZED)
  batchSize: 10, // Process 10 images then break (optimized)
  breakDuration: 15000, // 15 seconds break between batches (optimized)
  
  // Memory cleanup (OPTIMIZED)
  forceGarbageCollection: true,
  memoryCheckInterval: 5, // Check memory every 5 images (optimized)
};

// Progress tracking for failed downloads
let failedDownloads = [];
const progressFile = path.join(__dirname, '../../logs/banner-carousel-resize-migration-progress.json');
const logFile = path.join(__dirname, '../../logs/banner-carousel-resize-migration.log');

// Vapehub Image resize configurations for different content types and sizes
const RESIZE_CONFIGS = {
  // Banner Images - Multiple sizes
  banners: {
    // Original/High resolution: 1920 x 700 px
    high: {
      width: 1920,
      height: 700,
      quality: 92,
      format: 'jpeg',
      maintainAspectRatio: true
    },
    // Mid resolution: 1200 x 438 px (scaled down proportionally)
    mid: {
      width: 1200,
      height: 438,
      quality: 88,
      format: 'jpeg',
      maintainAspectRatio: true
    },
    // Low resolution: 800 x 292 px (scaled down proportionally)
    low: {
      width: 800,
      height: 292,
      quality: 85,
      format: 'jpeg',
      maintainAspectRatio: true
    }
  },
  // Carousel Images - Multiple sizes
  carousels: {
    // Original/High resolution: 1920 x 700 px
    high: {
      width: 1920,
      height: 700,
      quality: 92,
      format: 'jpeg',
      maintainAspectRatio: true
    },
    // Mid resolution: 1200 x 438 px (scaled down proportionally)
    mid: {
      width: 1200,
      height: 438,
      quality: 88,
      format: 'jpeg',
      maintainAspectRatio: true
    },
    // Low resolution: 800 x 292 px (scaled down proportionally)
    low: {
      width: 800,
      height: 292,
      quality: 85,
      format: 'jpeg',
      maintainAspectRatio: true
    }
  },
  // Other image types for future use
  category_slider: {
    width: 236,
    height: 204,
    quality: 88,
    format: 'jpeg',
    maintainAspectRatio: true
  },
  brand_cards: {
    width: 150,
    height: 150,
    quality: 85,
    format: 'jpeg',
    maintainAspectRatio: true
  },
  product_cards: {
    width: 245,
    height: 234,
    quality: 88,
    format: 'jpeg',
    maintainAspectRatio: true
  },
  deal_cards: {
    width: 312,
    height: 258,
    quality: 88,
    format: 'jpeg',
    maintainAspectRatio: true
  },
  promotion_banners: {
    width: 662,
    height: 573,
    quality: 90,
    format: 'jpeg',
    maintainAspectRatio: true
  },
  category_banners: {
    width: 437,
    height: 162,
    quality: 88,
    format: 'jpeg',
    maintainAspectRatio: true
  },
  // General fallback configuration
  general: {
    maxWidth: 1920,
    maxHeight: 1080,
    quality: 90,
    format: 'jpeg',
    maintainAspectRatio: true
  }
};

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
      console.log('🚀 Starting SAFE ENHANCED BANNER & CAROUSEL IMAGE MIGRATION with anti-hang protections...');
      
      // Check available memory before starting
      const initialMemory = process.memoryUsage();
      console.log(`🧠 Initial Memory Usage: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
      
      const imageStats = {
        processed: 0,
        uploaded: 0,
        resized: 0,
        skipped: 0,
        updated: 0,
        errors: 0,
        retryable_errors: 0,
        memory_warnings: 0,
        timeouts: 0,
        size_reduction: {
          original_total: 0,
          processed_total: 0
        }
      };

      // Load previous progress if exists
      loadProgress(imageStats);

      // MIGRATE BANNER IMAGES WITH RESIZE
      console.log('📷 Migrating banner images with optimization...');
      await migrateBannerImagesWithResize(crossServerMigration, queryInterface, Sequelize, imageStats);

      // MIGRATE CAROUSEL IMAGES WITH RESIZE
      console.log('📷 Migrating carousel images with optimization...');
      await migrateCarouselImagesWithResize(crossServerMigration, queryInterface, Sequelize, imageStats);

      console.log('✅ Safe enhanced image migration completed!');
      console.log(`📊 Final Statistics:
        - Processed: ${imageStats.processed}
        - Uploaded: ${imageStats.uploaded}
        - Resized: ${imageStats.resized}
        - Skipped: ${imageStats.skipped}
        - Updated: ${imageStats.updated}
        - Errors: ${imageStats.errors}
        - Timeouts: ${imageStats.timeouts}
        - Memory Warnings: ${imageStats.memory_warnings}
        - Size Reduction: ${imageStats.size_reduction.original_total > 0 ? 
          ((1 - imageStats.size_reduction.processed_total / imageStats.size_reduction.original_total) * 100).toFixed(2) + '%' : 'N/A'}`);

      // Final memory check
      const finalMemory = process.memoryUsage();
      console.log(`🧠 Final Memory Usage: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);

      // Save final progress and generate report
      saveProgress(imageStats);
      generateSafetyReport(imageStats);

      if (failedDownloads.length > 0) {
        console.log('\n⚠️  Some images failed to download. Failed URLs saved to logs/banner-carousel-resize-migration-progress.json');
        console.log('💡 You can manually retry these or fix the source URLs and rerun the migration.');
      }
      
    } catch (error) {
      console.error('❌ Error during enhanced banner & carousel image migration:', error);
      // Save progress even on error
      saveProgress(imageStats);
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    // This migration cannot be automatically reversed
    // Manual cleanup of S3 images would be required
    console.log('⚠️ Enhanced banner & carousel image migration cannot be automatically reversed');
    console.log('⚠️ Manual cleanup of S3 bucket would be required');
  }
};

/**
 * Safe image migration with multiple sizes and timeout protection
 * Now supports resizing images already in S3 bucket with anti-hang safeguards
 */
async function smartImageMigrationWithMultipleSizes(imageUrl, folder = 'banners', imageStats, resizeConfigs = null, forceResize = false) {
  return new Promise(async (resolve, reject) => {
    // Set overall timeout for the entire operation
    const timeoutId = setTimeout(() => {
      imageStats.timeouts++;
      logMessage(`⏱️ TIMEOUT: Image processing exceeded ${SAFETY_CONFIG.processingTimeout}ms for: ${imageUrl}`);
      resolve({ high: null, mid: null, low: null });
    }, SAFETY_CONFIG.processingTimeout);
    try {
      if (!imageUrl || imageUrl.trim() === '') {
        imageStats.skipped++;
        clearTimeout(timeoutId);
        return resolve({ high: null, mid: null, low: null });
      }

      // Memory check before processing
      if (!checkMemoryUsage(imageStats)) {
        clearTimeout(timeoutId);
        return resolve({ high: null, mid: null, low: null });
      }

      // Use provided configs or default
      const configs = resizeConfigs || RESIZE_CONFIGS.banners;
      const results = { high: null, mid: null, low: null };

      // Determine if this is an S3 URL that needs resizing
      const isS3Url = imageUrl.includes('s3') || imageUrl.includes('cloudfront');
      let sourceImageBuffer = null;

      // If it's an S3 URL and we need to resize, download it first
      if (isS3Url && forceResize) {
        console.log(`📥 Downloading image from S3 for resizing: ${imageUrl}`);
        sourceImageBuffer = await downloadImageFromS3WithTimeout(imageUrl);
        if (!sourceImageBuffer) {
          console.log(`❌ Failed to download image from S3: ${imageUrl}`);
          clearTimeout(timeoutId);
          return resolve({ high: null, mid: null, low: null });
        }
      }

      // Process each size (high, mid, low) sequentially to avoid memory issues
      for (const [size, config] of Object.entries(configs)) {
        if (size === 'high' || size === 'mid' || size === 'low') {
          console.log(`🔄 Processing ${size} resolution for: ${imageUrl}`);
          
          // Memory check before each resize
          if (!checkMemoryUsage(imageStats)) {
            break;
          }
          
          // Generate S3 key for this size
          const urlParts = imageUrl.split('/');
          let fileName = urlParts[urlParts.length - 1];
          
          // Add size suffix to filename
          if (fileName && fileName.includes('.')) {
            const nameParts = fileName.split('.');
            const extension = nameParts.pop();
            const baseName = nameParts.join('.');
            fileName = `${baseName}-${size}.${extension}`;
          } else {
            const fileExtension = '.jpg';
            fileName = generateUniqueFileName(`image-${size}${fileExtension}`);
          }
          
          const s3Key = `${folder}/${fileName}`;
          
          // Check if this size already exists in S3
          const imageExists = await checkImageExists(s3Key);
          
          if (imageExists && !forceResize) {
            console.log(`✅ ${size} resolution already exists in S3: ${s3Key}`);
            imageStats.skipped++;
            results[size] = generateCloudFrontUrlForS3(s3Key);
          } else {
            console.log(`📤 ${size} resolution ${imageExists ? 'will be recreated' : 'not found'} in S3, will process and upload: ${s3Key}`);
            
            // Download, resize and upload this size with timeout protection
            const uploadResult = await safeDownloadResizeAndUploadToS3(
              imageUrl, 
              folder, 
              s3Key, 
              imageStats, 
              config, 
              sourceImageBuffer
            );
            
            if (uploadResult) {
              results[size] = generateCloudFrontUrlForS3(s3Key);
              console.log(`✅ ${size} resolution uploaded successfully`);
              imageStats.uploaded++;
            } else {
              console.log(`❌ Failed to upload ${size} resolution`);
            }
          }
          
          // Force garbage collection between sizes if enabled
          if (SAFETY_CONFIG.forceGarbageCollection && global.gc) {
            global.gc();
          }
        }
      }

      clearTimeout(timeoutId);
      resolve(results);

    } catch (error) {
      clearTimeout(timeoutId);
      imageStats.errors++;
      console.error(`❌ Error in safe image migration with multiple sizes for ${imageUrl}:`, error.message);
      resolve({ high: null, mid: null, low: null });
    }
  });
}

/**
 * Download image from S3 bucket
 */
async function downloadImageFromS3(imageUrl) {
  try {
    // Extract S3 key from URL
    let s3Key;
    if (imageUrl.includes('cloudfront')) {
      // Extract from CloudFront URL
      const urlParts = imageUrl.split('/');
      s3Key = urlParts.slice(3).join('/'); // Remove domain parts
    } else if (imageUrl.includes('s3')) {
      // Extract from S3 URL
      const urlParts = imageUrl.split('/');
      const bucketIndex = urlParts.findIndex(part => part.includes('s3'));
      s3Key = urlParts.slice(bucketIndex + 2).join('/'); // Remove bucket name
    } else {
      console.log(`❌ Cannot extract S3 key from URL: ${imageUrl}`);
      return null;
    }

    console.log(`📥 Downloading from S3 key: ${s3Key}`);
    console.log(`🔍 Full S3 URL: ${imageUrl}`);

    // Download from S3
    const s3 = require('../../config/awsConfig');
    let result;
    
    try {
      result = await s3.getObject({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: s3Key
      }).promise();
    } catch (s3Error) {
      console.log(`⚠️ S3 image not found, trying to download from original URL: ${imageUrl}`);
      
      try {
        // Fallback: Download from original URL using axios
        const axios = require('axios');
        const response = await axios({
          method: 'GET',
          url: imageUrl,
          responseType: 'arraybuffer',
          timeout: 30000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        
        result = {
          Body: Buffer.from(response.data),
          ContentType: response.headers['content-type'] || 'image/jpeg'
        };
        
        console.log(`✅ Successfully downloaded from original URL as fallback`);
      } catch (fallbackError) {
        console.log(`❌ Fallback download also failed: ${fallbackError.message}`);
        throw fallbackError; // Re-throw to be caught by outer catch
      }
    }

    console.log(`✅ Downloaded from S3: ${(result.Body.length / 1024 / 1024).toFixed(2)}MB`);
    return result.Body;

  } catch (error) {
    console.error(`❌ Error downloading from S3: ${error.message}`);
    return null;
  }
}

/**
 * Download image from URL, resize it, and upload to S3 (helper function) - Enhanced with resizing
 */
async function downloadResizeAndUploadToS3(imageUrl, folder = 'banners', s3Key = null, imageStats, resizeConfig = null, preDownloadedBuffer = null) {
  try {
    if (!imageUrl || imageUrl.trim() === '') {
      imageStats.skipped++;
      return null;
    }

    let originalBuffer;
    let originalSize;
    let fileExtension = '.jpg'; // default

    // Use pre-downloaded buffer if available (from S3)
    if (preDownloadedBuffer) {
      originalBuffer = preDownloadedBuffer;
      originalSize = originalBuffer.length;
      console.log(`📊 Using pre-downloaded image size: ${(originalSize / 1024 / 1024).toFixed(2)}MB`);
    } else {
      // Download from external URL
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
      fileExtension = path.extname(successUrl).toLowerCase();
      if (!fileExtension && response.headers['content-type']) {
        const mimeType = response.headers['content-type'];
        if (mimeType.includes('jpeg') || mimeType.includes('jpg')) fileExtension = '.jpg';
        else if (mimeType.includes('png')) fileExtension = '.png';
        else if (mimeType.includes('gif')) fileExtension = '.gif';
        else if (mimeType.includes('webp')) fileExtension = '.webp';
        else fileExtension = '.jpg'; // default
      }

      // Create temporary file to save original image
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

      // Read file and track original size
      originalBuffer = fs.readFileSync(tempFile);
      originalSize = originalBuffer.length;
      imageStats.size_reduction.original_total += originalSize;
      
      console.log(`📊 Original image size: ${(originalSize / 1024 / 1024).toFixed(2)}MB`);
      
      // Clean up temporary file
      fs.unlinkSync(tempFile);
    }

    // Use provided s3Key or generate unique filename
    let finalS3Key = s3Key;
    if (!finalS3Key) {
      const fileName = generateUniqueFileName(`image-optimized${fileExtension}`);
      finalS3Key = `${folder}/${fileName}`;
    }
    
    // Prepare upload parameters with resize config
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: finalS3Key,
      Body: originalBuffer,
      ContentType: response.headers['content-type'] || 'image/jpeg'
    };

    // Use resize config or default
    const finalResizeConfig = resizeConfig || RESIZE_CONFIGS.general;
    
    console.log(`🔧 Using resize config:`, finalResizeConfig);
    
    // Upload with automatic resizing
    const uploadResult = await uploadImageToS3WithResize(uploadParams, finalResizeConfig);
    
    // Track processed size (estimate based on compression)
    const processedSize = Math.round(originalSize * (finalResizeConfig.quality / 100) * 0.7); // Rough estimate
    imageStats.size_reduction.processed_total += processedSize;
    imageStats.resized++;
    
    // Clean up temporary file
    fs.unlinkSync(tempFile);
    
    if (uploadResult && uploadResult.Location) {
      logMessage(`✅ Resized and uploaded to S3: ${finalS3Key}`);
      logMessage(`📉 Size reduction: ${((1 - processedSize / originalSize) * 100).toFixed(2)}%`);
      return finalS3Key;
    } else {
      logMessage(`❌ Upload to S3 failed for: ${finalS3Key}`);
      return null;
    }

  } catch (error) {
    logMessage(`❌ Error processing and resizing image: ${error.message}`);
    return null;
  }
}

/**
 * Migrate banner images: Take image_url, resize to mid/low, upload to S3, update database
 */
async function migrateBannerImagesWithResize(crossServerMigration, queryInterface, Sequelize, imageStats) {
  try {
    // Get ALL banner images with original image_url
    const bannersWithImages = await queryInterface.sequelize.query(`
      SELECT id, title, image_url, image_url_mid, image_url_low
      FROM BannerImages 
      WHERE image_url IS NOT NULL 
      AND image_url != ''
      ORDER BY id
    `, {
      type: Sequelize.QueryTypes.SELECT
    });

    console.log(`📊 Found ${bannersWithImages.length} banner images to process and resize`);

    for (const banner of bannersWithImages) {
      imageStats.processed++;
      
      console.log(`🔄 Processing banner: ${banner.title || `ID ${banner.id}`}`);
      console.log(`📌 Source image_url: ${banner.image_url}`);
      
      // Take the original image_url and create mid/low versions
      const sourceUrl = banner.image_url;
      
      try {
        // Create resized versions (mid and low) from the original image_url
        const imageUrls = await smartImageMigrationWithMultipleSizes(
          sourceUrl, 
          'banners', 
          imageStats, 
          RESIZE_CONFIGS.banners,
          true // Force resize to create mid/low versions
        );
        
        if (imageUrls.mid || imageUrls.low) {
          // Update database with mid and low URLs
          await queryInterface.sequelize.query(`
            UPDATE BannerImages 
            SET image_url_mid = ?, 
                image_url_low = ?, 
                updatedAt = NOW() 
            WHERE id = ?
          `, {
            replacements: [
              imageUrls.mid || banner.image_url_mid,  // Update mid URL
              imageUrls.low || banner.image_url_low,   // Update low URL
              banner.id
            ]
          });
          
          imageStats.updated++;
          console.log(`✅ Updated banner with mid/low sizes: ${banner.title || `ID ${banner.id}`}`);
          console.log(`   - Mid: ${imageUrls.mid ? '✅' : '❌'}`);
          console.log(`   - Low: ${imageUrls.low ? '✅' : '❌'}`);
        } else {
          console.log(`❌ Failed to create mid/low versions for banner: ${banner.title || `ID ${banner.id}`}`);
        }
      } catch (error) {
        console.log(`❌ Error processing banner: ${banner.title || `ID ${banner.id}`} - ${error.message}`);
      }
      
      // Add delay between processing to avoid rate limiting
      if (imageStats.processed < bannersWithImages.length) {
        console.log(`⏳ Waiting 3 seconds before next image (optimized rate limiting)...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      // Save progress periodically (every 3 items)
      if (imageStats.processed % 3 === 0) {
        saveProgress(imageStats);
        logMessage(`💾 Progress saved (${imageStats.processed}/${bannersWithImages.length})`);
      }
    }

  } catch (error) {
    console.error('❌ Error migrating banner images with resize:', error);
    throw error;
  }
}

/**
 * Migrate carousel images from current DB URLs to S3 with multiple sizes
 */
async function migrateCarouselImagesWithResize(crossServerMigration, queryInterface, Sequelize, imageStats) {
  try {
    // Get ALL carousel images (including those already in S3)
    const carouselsWithImages = await queryInterface.sequelize.query(`
      SELECT id, title, image_url, image_url_mid, image_url_low
      FROM Carousels 
      WHERE image_url IS NOT NULL 
      AND image_url != ''
      ORDER BY id
    `, {
      type: Sequelize.QueryTypes.SELECT
    });

    console.log(`📊 Found ${carouselsWithImages.length} carousel images to process and resize`);

    for (const carousel of carouselsWithImages) {
      imageStats.processed++;
      
      console.log(`🔄 Processing carousel: ${carousel.title || `ID ${carousel.id}`}`);
      
      console.log(`📌 Source image_url: ${carousel.image_url}`);
      
      // Take the original image_url and create mid/low versions
      const sourceUrl = carousel.image_url;
      
      try {
        // Create resized versions (mid and low) from the original image_url
        const imageUrls = await smartImageMigrationWithMultipleSizes(
          sourceUrl, 
          'carousels', 
          imageStats, 
          RESIZE_CONFIGS.carousels,
          true // Force resize to create mid/low versions
        );
        
        if (imageUrls.mid || imageUrls.low) {
          // Update database with mid and low URLs
          await queryInterface.sequelize.query(`
            UPDATE Carousels 
            SET image_url_mid = ?, 
                image_url_low = ?, 
                updatedAt = NOW() 
            WHERE id = ?
          `, {
            replacements: [
              imageUrls.mid || carousel.image_url_mid,  // Update mid URL
              imageUrls.low || carousel.image_url_low,   // Update low URL
              carousel.id
            ]
          });
          
          imageStats.updated++;
          console.log(`✅ Updated carousel with mid/low sizes: ${carousel.title || `ID ${carousel.id}`}`);
          console.log(`   - Mid: ${imageUrls.mid ? '✅' : '❌'}`);
          console.log(`   - Low: ${imageUrls.low ? '✅' : '❌'}`);
        } else {
          console.log(`❌ Failed to create mid/low versions for carousel: ${carousel.title || `ID ${carousel.id}`}`);
        }
      } catch (error) {
        console.log(`❌ Error processing carousel: ${carousel.title || `ID ${carousel.id}`} - ${error.message}`);
      }
      
      // Add delay between processing to avoid rate limiting
      if (imageStats.processed < carouselsWithImages.length) {
        console.log(`⏳ Waiting 3 seconds before next image (optimized rate limiting)...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
      
      // Save progress periodically (every 3 items)
      if (imageStats.processed % 3 === 0) {
        saveProgress(imageStats);
        logMessage(`💾 Progress saved (${imageStats.processed}/${carouselsWithImages.length})`);
      }
    }

  } catch (error) {
    console.error('❌ Error migrating carousel images with resize:', error);
    throw error;
  }
}

// All the helper functions remain the same as in the original file
// (generateFallbackUrls, categorizeError, isRetryableError, logMessage, loadProgress, saveProgress, etc.)

/**
 * Generate multiple fallback URLs for failed downloads
 */
function generateFallbackUrls(imageUrl) {
  const fallbackUrls = [];
  
  // Clean the URL - remove any WordPress upload path prefixes
  const cleanUrl = imageUrl.replace(/^.*\/wp-content\/uploads\//, '').replace(/^.*\/uploads\//, '');
  
  // Original URL
  if (imageUrl.startsWith('http')) {
    fallbackUrls.push(imageUrl);
  }
  
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
        if (data.stats && data.stats[key] && typeof data.stats[key] === 'number') {
          imageStats[key] = Math.max(imageStats[key], data.stats[key]);
        } else if (data.stats && data.stats[key] && typeof data.stats[key] === 'object') {
          Object.assign(imageStats[key], data.stats[key]);
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
📊 ENHANCED BANNER & CAROUSEL MIGRATION REPORT (WITH RESIZING)
================================================================
Migration completed at: ${new Date().toISOString()}

STATISTICS:
- Total Processed: ${imageStats.processed}
- Successfully Uploaded: ${imageStats.uploaded}
- Images Resized: ${imageStats.resized}
- Skipped (Already Exists): ${imageStats.skipped}
- Database Records Updated: ${imageStats.updated}
- Total Errors: ${imageStats.errors}
- Retryable Errors: ${imageStats.retryable_errors}

SIZE OPTIMIZATION:
- Original Total Size: ${(imageStats.size_reduction.original_total / 1024 / 1024).toFixed(2)}MB
- Processed Total Size: ${(imageStats.size_reduction.processed_total / 1024 / 1024).toFixed(2)}MB
- Total Size Reduction: ${imageStats.size_reduction.original_total > 0 ? 
  ((1 - imageStats.size_reduction.processed_total / imageStats.size_reduction.original_total) * 100).toFixed(2) + '%' : 'N/A'}
- Storage Saved: ${((imageStats.size_reduction.original_total - imageStats.size_reduction.processed_total) / 1024 / 1024).toFixed(2)}MB

RESIZE CONFIGURATIONS USED:
- Banners: ${RESIZE_CONFIGS.banners.maxWidth}x${RESIZE_CONFIGS.banners.maxHeight}, Quality: ${RESIZE_CONFIGS.banners.quality}%
- Carousels: ${RESIZE_CONFIGS.carousels.maxWidth}x${RESIZE_CONFIGS.carousels.maxHeight}, Quality: ${RESIZE_CONFIGS.carousels.quality}%

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
  : '✅ ALL IMAGES SUCCESSFULLY MIGRATED AND OPTIMIZED!'}

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
    
    // Check if domain is reasonable
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

/**
 * Safe versions of download functions with timeout protection
 */
async function downloadImageFromS3WithTimeout(imageUrl) {
  return new Promise(async (resolve) => {
    const timeoutId = setTimeout(() => {
      logMessage(`⏱️ TIMEOUT: S3 download exceeded ${SAFETY_CONFIG.downloadTimeout}ms for: ${imageUrl}`);
      resolve(null);
    }, SAFETY_CONFIG.downloadTimeout);

    try {
      // Extract S3 key from URL
      let s3Key;
      if (imageUrl.includes('cloudfront')) {
        const urlParts = imageUrl.split('/');
        s3Key = urlParts.slice(3).join('/');
      } else if (imageUrl.includes('s3')) {
        const urlParts = imageUrl.split('/');
        const bucketIndex = urlParts.findIndex(part => part.includes('s3'));
        s3Key = urlParts.slice(bucketIndex + 2).join('/');
      } else {
        console.log(`❌ Cannot extract S3 key from URL: ${imageUrl}`);
        clearTimeout(timeoutId);
        return resolve(null);
      }

      console.log(`📥 Downloading from S3 key: ${s3Key}`);

      // Download from S3 with size check
      const s3 = require('../../config/awsConfig');
      let result;
      
      try {
        result = await s3.getObject({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: s3Key
        }).promise();
      } catch (s3Error) {
        console.log(`⚠️ S3 image not found, trying to download from original URL: ${imageUrl}`);
        
        try {
          // Fallback: Download from original URL using axios
          const axios = require('axios');
          const response = await axios({
            method: 'GET',
            url: imageUrl,
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          
          result = {
            Body: Buffer.from(response.data),
            ContentType: response.headers['content-type'] || 'image/jpeg'
          };
          
          console.log(`✅ Successfully downloaded from original URL as fallback`);
        } catch (fallbackError) {
          console.log(`❌ Fallback download also failed: ${fallbackError.message}`);
          clearTimeout(timeoutId);
          return resolve(null);
        }
      }

      // Check image size
      if (result.Body.length > SAFETY_CONFIG.maxImageSize) {
        console.log(`❌ Image too large (${(result.Body.length / 1024 / 1024).toFixed(2)}MB): ${imageUrl}`);
        clearTimeout(timeoutId);
        return resolve(null);
      }

      console.log(`✅ Downloaded from S3: ${(result.Body.length / 1024 / 1024).toFixed(2)}MB`);
      clearTimeout(timeoutId);
      resolve(result.Body);

    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`❌ Error downloading from S3: ${error.message}`);
      resolve(null);
    }
  });
}

/**
 * Safe download, resize and upload with comprehensive timeout protection
 */
async function safeDownloadResizeAndUploadToS3(imageUrl, folder = 'banners', s3Key = null, imageStats, resizeConfig = null, preDownloadedBuffer = null) {
  return new Promise(async (resolve) => {
    const timeoutId = setTimeout(() => {
      imageStats.timeouts++;
      logMessage(`⏱️ TIMEOUT: Download/resize/upload exceeded ${SAFETY_CONFIG.processingTimeout}ms for: ${imageUrl}`);
      resolve(null);
    }, SAFETY_CONFIG.processingTimeout);

    try {
      if (!imageUrl || imageUrl.trim() === '') {
        imageStats.skipped++;
        clearTimeout(timeoutId);
        return resolve(null);
      }

      let originalBuffer;
      let originalSize;

      // Use pre-downloaded buffer if available (from S3)
      if (preDownloadedBuffer) {
        originalBuffer = preDownloadedBuffer;
        originalSize = originalBuffer.length;
        console.log(`📊 Using pre-downloaded image size: ${(originalSize / 1024 / 1024).toFixed(2)}MB`);
      } else {
        // Download from external URL with timeout
        const downloadResult = await downloadImageWithTimeout(imageUrl);
        if (!downloadResult) {
          clearTimeout(timeoutId);
          return resolve(null);
        }
        originalBuffer = downloadResult.buffer;
        originalSize = downloadResult.size;
      }

      // Check image size
      if (originalSize > SAFETY_CONFIG.maxImageSize) {
        console.log(`❌ Image too large (${(originalSize / 1024 / 1024).toFixed(2)}MB), skipping: ${imageUrl}`);
        clearTimeout(timeoutId);
        return resolve(null);
      }

      imageStats.size_reduction.original_total += originalSize;

      // Use provided s3Key or generate unique filename
      let finalS3Key = s3Key;
      if (!finalS3Key) {
        const fileName = generateUniqueFileName(`image-optimized.jpg`);
        finalS3Key = `${folder}/${fileName}`;
      }
      
      // Prepare upload parameters with resize config
      const uploadParams = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: finalS3Key,
        Body: originalBuffer,
        ContentType: 'image/jpeg'
      };

      // Use resize config or default
      const finalResizeConfig = resizeConfig || RESIZE_CONFIGS.general;
      
      console.log(`🔧 Using resize config:`, finalResizeConfig);
      
      // Upload with automatic resizing and timeout
      const uploadResult = await uploadImageToS3WithResizeTimeout(uploadParams, finalResizeConfig);
      
      if (uploadResult) {
        // Track processed size (estimate)
        const processedSize = Math.round(originalSize * (finalResizeConfig.quality / 100) * 0.7);
        imageStats.size_reduction.processed_total += processedSize;
        imageStats.resized++;
        
        logMessage(`✅ Resized and uploaded to S3: ${finalS3Key}`);
        logMessage(`📉 Size reduction: ${((1 - processedSize / originalSize) * 100).toFixed(2)}%`);
        clearTimeout(timeoutId);
        resolve(finalS3Key);
      } else {
        logMessage(`❌ Upload to S3 failed for: ${finalS3Key}`);
        clearTimeout(timeoutId);
        resolve(null);
      }

    } catch (error) {
      clearTimeout(timeoutId);
      logMessage(`❌ Error in safe processing: ${error.message}`);
      resolve(null);
    }
  });
}

/**
 * Download image with timeout protection
 */
async function downloadImageWithTimeout(imageUrl) {
  return new Promise(async (resolve) => {
    const timeoutId = setTimeout(() => {
      logMessage(`⏱️ TIMEOUT: Download exceeded ${SAFETY_CONFIG.downloadTimeout}ms for: ${imageUrl}`);
      resolve(null);
    }, SAFETY_CONFIG.downloadTimeout);

    try {
      const response = await axios({
        method: 'GET',
        url: imageUrl,
        responseType: 'arraybuffer',
        timeout: SAFETY_CONFIG.downloadTimeout - 5000, // Leave 5s buffer
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        }
      });

      const buffer = Buffer.from(response.data);
      console.log(`✅ Downloaded: ${(buffer.length / 1024 / 1024).toFixed(2)}MB`);
      
      clearTimeout(timeoutId);
      resolve({ buffer, size: buffer.length });

    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`❌ Download failed: ${error.message}`);
      resolve(null);
    }
  });
}

/**
 * Upload to S3 with resize and timeout protection
 */
async function uploadImageToS3WithResizeTimeout(uploadParams, resizeConfig) {
  return new Promise(async (resolve) => {
    const timeoutId = setTimeout(() => {
      logMessage(`⏱️ TIMEOUT: Upload exceeded ${SAFETY_CONFIG.uploadTimeout}ms`);
      resolve(null);
    }, SAFETY_CONFIG.uploadTimeout);

    try {
      const result = await uploadImageToS3WithResize(uploadParams, resizeConfig);
      clearTimeout(timeoutId);
      resolve(result);
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`❌ Upload failed: ${error.message}`);
      resolve(null);
    }
  });
}

/**
 * Check memory usage and warn if approaching limits
 */
function checkMemoryUsage(imageStats) {
  const memoryUsage = process.memoryUsage();
  const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
  const heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
  
  console.log(`🧠 Memory: ${heapUsedMB.toFixed(2)}MB / ${heapTotalMB.toFixed(2)}MB`);
  
  // Warning if using more than 1GB
  if (heapUsedMB > 1024) {
    imageStats.memory_warnings++;
    console.log(`⚠️ HIGH MEMORY USAGE: ${heapUsedMB.toFixed(2)}MB - Consider restarting process`);
    
    // Force garbage collection if available
    if (global.gc) {
      console.log(`🗑️ Running garbage collection...`);
      global.gc();
    }
    
    // Critical memory usage - stop processing
    if (heapUsedMB > 2048) {
      console.log(`🚨 CRITICAL MEMORY USAGE: ${heapUsedMB.toFixed(2)}MB - Stopping processing`);
      return false;
    }
  }
  
  return true;
}

/**
 * Generate safety report
 */
function generateSafetyReport(imageStats) {
  const report = `
🛡️ SAFE BANNER & CAROUSEL MIGRATION REPORT
==========================================
Migration completed at: ${new Date().toISOString()}

PROCESSING STATISTICS:
- Total Processed: ${imageStats.processed}
- Successfully Uploaded: ${imageStats.uploaded}
- Images Resized: ${imageStats.resized}
- Skipped (Already Exists): ${imageStats.skipped}
- Database Records Updated: ${imageStats.updated}
- Total Errors: ${imageStats.errors}
- Timeouts Encountered: ${imageStats.timeouts}
- Memory Warnings: ${imageStats.memory_warnings}

SAFETY MEASURES APPLIED:
- Max Image Size: ${SAFETY_CONFIG.maxImageSize / 1024 / 1024}MB
- Processing Timeout: ${SAFETY_CONFIG.processingTimeout / 1000}s per image
- Batch Size: ${SAFETY_CONFIG.batchSize} images
- Break Duration: ${SAFETY_CONFIG.breakDuration / 1000}s between batches
- Memory Monitoring: Every ${SAFETY_CONFIG.memoryCheckInterval} images

SIZE OPTIMIZATION:
- Original Total Size: ${(imageStats.size_reduction.original_total / 1024 / 1024).toFixed(2)}MB
- Processed Total Size: ${(imageStats.size_reduction.processed_total / 1024 / 1024).toFixed(2)}MB
- Total Size Reduction: ${imageStats.size_reduction.original_total > 0 ? 
  ((1 - imageStats.size_reduction.processed_total / imageStats.size_reduction.original_total) * 100).toFixed(2) + '%' : 'N/A'}

SUCCESS RATE: ${imageStats.processed > 0 ? 
  ((imageStats.uploaded + imageStats.skipped) / imageStats.processed * 100).toFixed(2) + '%' : '0%'}

🛡️ ANTI-HANG PROTECTIONS ACTIVE:
✅ Individual image timeouts (${SAFETY_CONFIG.processingTimeout / 1000}s)
✅ Memory usage monitoring (<2GB critical)
✅ Download timeouts (${SAFETY_CONFIG.downloadTimeout / 1000}s)
✅ Upload timeouts (${SAFETY_CONFIG.uploadTimeout / 1000}s)
✅ Image size limits (${SAFETY_CONFIG.maxImageSize / 1024 / 1024}MB max)
✅ Sequential processing (no concurrency)
✅ Garbage collection between operations

Files Created:
- Progress Log: ${progressFile}
- Detailed Log: ${logFile}
`;

  console.log(report);
  logMessage(report);
  
  return report;
}
