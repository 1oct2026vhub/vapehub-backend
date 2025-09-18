'use strict';

const { Sequelize } = require('sequelize');
const { uploadFiletToS3, generateUniqueFileName, generateCloudFrontUrlForS3, checkImageExists } = require('../library/s3/s3Helper');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const dbConfig = require('../config/database');

/**
 * CRON JOB: Migrate Product Variant Images to S3
 * 
 * This cron job processes product variant images in batches with rate limiting
 * and progress tracking similar to product images migration.
 */

// Configuration
const CONFIG = {
  BATCH_SIZE: 15,
  DELAY_BETWEEN_IMAGES: 400,
  DELAY_BETWEEN_BATCHES: 15000,
  MAX_RETRIES: 3,
  PROGRESS_FILE: './logs/variant-migration-progress.json',
  LOG_FILE: './logs/variant-migration.log'
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

async function migrateVariantImagesToS3() {
  const startTime = new Date();
  globalStats.startTime = startTime;
  
  console.log('🚀 Starting PRODUCT VARIANT IMAGE MIGRATION CRON JOB');
  console.log(`⏰ Started at: ${startTime.toISOString()}`);
  console.log(`📊 Batch size: ${CONFIG.BATCH_SIZE}`);
  
  try {
    const environment = process.env.NODE_ENV || 'local';
    const config = dbConfig[environment];
    const sequelize = new Sequelize({
      ...config,
      pool: { max: 1, min: 0, idle: 10000 }
    });

    await sequelize.authenticate();
    console.log('✅ Connected to database successfully');

    const progress = loadProgress();
    if (progress) {
      console.log(`📈 Resuming from previous run: ${progress.currentBatch}/${progress.totalBatches} batches`);
      globalStats.currentBatch = progress.currentBatch;
    }

    const totalVariants = await getTotalVariantImageCount(sequelize);
    globalStats.totalBatches = Math.ceil(totalVariants / CONFIG.BATCH_SIZE);

    console.log(`📊 Total variant images: ${totalVariants}`);
    console.log(`📦 Total batches to process: ${globalStats.totalBatches}`);

    for (let batchNum = globalStats.currentBatch; batchNum < globalStats.totalBatches; batchNum++) {
      const batchStartTime = new Date();
      globalStats.currentBatch = batchNum;
      globalStats.lastBatchTime = batchStartTime;

      console.log(`\n🔄 Processing batch ${batchNum + 1}/${globalStats.totalBatches}`);
      console.log(`⏰ Batch started at: ${batchStartTime.toISOString()}`);

      const batchStats = await processVariantBatch(sequelize, batchNum);

      globalStats.totalProcessed += batchStats.processed;
      globalStats.totalUploaded += batchStats.uploaded;
      globalStats.totalSkipped += batchStats.skipped;
      globalStats.totalUpdated += batchStats.updated;
      globalStats.totalErrors += batchStats.errors;

      const batchEndTime = new Date();
      const batchDuration = (batchEndTime - batchStartTime) / 1000;
      console.log(`✅ Batch ${batchNum + 1} completed in ${batchDuration.toFixed(2)}s`);
      console.log(`📊 Batch stats: ${batchStats.processed} processed, ${batchStats.uploaded} uploaded, ${batchStats.errors} errors`);

      saveProgress();

      if (batchNum < globalStats.totalBatches - 1) {
        console.log(`⏳ Waiting ${CONFIG.DELAY_BETWEEN_BATCHES / 1000}s before next batch...`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_BATCHES));
      }
    }

    const endTime = new Date();
    const totalDuration = (endTime - startTime) / 1000;

    console.log('\n🎉 PRODUCT VARIANT IMAGE MIGRATION COMPLETED!');
    console.log(`⏰ Total duration: ${totalDuration.toFixed(2)}s`);
    console.log('📊 Final Statistics:');
    console.log(`   - Total processed: ${globalStats.totalProcessed}`);
    console.log(`   - Total uploaded: ${globalStats.totalUploaded}`);
    console.log(`   - Total skipped: ${globalStats.totalSkipped}`);
    console.log(`   - Total updated: ${globalStats.totalUpdated}`);
    console.log(`   - Total errors: ${globalStats.totalErrors}`);

    cleanupProgress();
    await sequelize.close();
    console.log('🔌 Closed database connection');
  } catch (error) {
    console.error('❌ CRITICAL ERROR in variant image migration:', error);
    console.error('Stack trace:', error.stack);
    saveProgress();
    logError(error);
    throw error;
  }
}

async function processVariantBatch(sequelize, batchNum) {
  const batchStats = {
    processed: 0,
    uploaded: 0,
    skipped: 0,
    updated: 0,
    errors: 0
  };

  try {
    const variants = await getVariantImagesBatch(sequelize, batchNum);
    console.log(`📦 Processing ${variants.length} variant images in batch ${batchNum + 1}`);

    for (let i = 0; i < variants.length; i++) {
      const variantImage = variants[i];
      batchStats.processed++;

      try {
        console.log(`🔄 Processing variant image ${i + 1}/${variants.length}: ${variantImage.variant_name || `ID ${variantImage.id}`}`);

        const finalUrl = await smartImageMigration(variantImage.image_url, 'variants', batchStats);

        if (finalUrl) {
          await updateVariantImageUrl(sequelize, variantImage.id, finalUrl);
          batchStats.updated++;
          console.log(`✅ Updated variant image URL: ${variantImage.variant_name || `ID ${variantImage.id}`}`);
        } else {
          console.log(`❌ Failed to process variant image: ${variantImage.variant_name || `ID ${variantImage.id}`}`);
        }

        if (i < variants.length - 1) {
          await new Promise(resolve => setTimeout(resolve, CONFIG.DELAY_BETWEEN_IMAGES));
        }
      } catch (error) {
        batchStats.errors++;
        console.error(`❌ Error processing variant image ${variantImage.id}:`, error.message);
        continue;
      }
    }
  } catch (error) {
    console.error(`❌ Error processing variant batch ${batchNum + 1}:`, error);
    throw error;
  }

  return batchStats;
}

async function smartImageMigration(imageUrl, folder = 'variants', batchStats) {
  try {
    if (!imageUrl || imageUrl.trim() === '') {
      batchStats.skipped++;
      return null;
    }

    let s3Key;
    let needsUpload = false;

    const urlParts = imageUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];

    if (fileName && fileName.includes('.')) {
      s3Key = `${folder}/${fileName}`;
    } else {
      const fileExtension = '.jpg';
      const uniqueFileName = generateUniqueFileName(`variant${fileExtension}`);
      s3Key = `${folder}/${uniqueFileName}`;
    }

    console.log(`🔍 Checking if image exists in S3: ${s3Key}`);

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

    if (needsUpload) {
      const uploadResult = await downloadAndUploadToS3(imageUrl, folder, s3Key, batchStats);
      if (!uploadResult) {
        return null;
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

async function downloadAndUploadToS3(imageUrl, folder = 'variants', s3Key = null, batchStats) {
  try {
    if (!imageUrl || imageUrl.trim() === '') {
      batchStats.skipped++;
      return null;
    }

    // Use the image URL directly from database for downloading
    const fullUrl = imageUrl;

    console.log(`📥 Downloading: ${fullUrl}`);

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
        break;
      } catch (error) {
        lastError = error;
        retries--;
        if (retries > 0) {
          console.log(`⚠️ Download failed, retrying... (${retries} attempts left)`);
          const delay = (CONFIG.MAX_RETRIES - retries) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    if (!response) {
      throw lastError;
    }

    let fileExtension = path.extname(fullUrl).toLowerCase();
    if (!fileExtension && response.headers['content-type']) {
      const mimeType = response.headers['content-type'];
      if (mimeType.includes('jpeg') || mimeType.includes('jpg')) fileExtension = '.jpg';
      else if (mimeType.includes('png')) fileExtension = '.png';
      else if (mimeType.includes('gif')) fileExtension = '.gif';
      else if (mimeType.includes('webp')) fileExtension = '.webp';
      else fileExtension = '.jpg';
    }

    let finalS3Key = s3Key;
    if (!finalS3Key) {
      const fileName = generateUniqueFileName(`variant${fileExtension}`);
      finalS3Key = `${folder}/${fileName}`;
    }

    const tempDir = os.tmpdir();
    const tempFileName = generateUniqueFileName(`temp${fileExtension}`);
    const tempFile = path.join(tempDir, tempFileName);
    const writer = fs.createWriteStream(tempFile);

    response.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const fileBuffer = fs.readFileSync(tempFile);
    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: finalS3Key,
      Body: fileBuffer,
      ContentType: response.headers['content-type'] || 'image/jpeg'
    };

    const uploadResult = await uploadFiletToS3(uploadParams);
    fs.unlinkSync(tempFile);

    if (uploadResult && uploadResult.Location) {
      console.log(`✅ Uploaded to S3: ${finalS3Key}`);
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

async function getTotalVariantImageCount(sequelize) {
  try {
    const [result] = await sequelize.query(`
      SELECT COUNT(*) as total 
      FROM product_variant_images 
      WHERE image_url IS NOT NULL AND image_url != ''
    `, {
      type: Sequelize.QueryTypes.SELECT
    });
    return result.total;
  } catch (error) {
    console.error('❌ Error getting variant image count:', error);
    throw error;
  }
}

async function getVariantImagesBatch(sequelize, batchNum) {
  try {
    const offset = batchNum * CONFIG.BATCH_SIZE;
    const variantImages = await sequelize.query(`
      SELECT pvi.id, pvi.image_url, pv.slug as variant_name
      FROM product_variant_images pvi
      JOIN product_variants pv ON pvi.variant_id = pv.id
      WHERE pvi.image_url IS NOT NULL AND pvi.image_url != ''
      ORDER BY pvi.id
      LIMIT ? OFFSET ?
    `, {
      replacements: [CONFIG.BATCH_SIZE, offset],
      type: Sequelize.QueryTypes.SELECT
    });
    return variantImages;
  } catch (error) {
    console.error(`❌ Error getting variant images for batch ${batchNum}:`, error);
    throw error;
  }
}

async function updateVariantImageUrl(sequelize, variantImageId, newUrl) {
  try {
    await sequelize.query(`
      UPDATE product_variant_images 
      SET image_url = ?, updated_at = NOW() 
      WHERE id = ?
    `, {
      replacements: [newUrl, variantImageId]
    });
    return true;
  } catch (error) {
    console.error(`❌ Error updating variant image ${variantImageId}:`, error);
    throw error;
  }
}

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

    const logsDir = path.dirname(CONFIG.PROGRESS_FILE);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    fs.writeFileSync(CONFIG.PROGRESS_FILE, JSON.stringify(progressData, null, 2));
  } catch (error) {
    console.warn('⚠️ Could not save progress file:', error.message);
  }
}

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

function logError(error) {
  try {
    const errorLog = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      stats: globalStats
    };

    const logsDir = path.dirname(CONFIG.LOG_FILE);
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    fs.appendFileSync(CONFIG.LOG_FILE, JSON.stringify(errorLog, null, 2) + '\n---\n');
  } catch (logError) {
    console.error('❌ Could not log error to file:', logError.message);
  }
}

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

if (require.main === module) {
  migrateVariantImagesToS3()
    .then(() => {
      console.log('✅ Variant image migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Variant image migration failed:', error);
      process.exit(1);
    });
}

module.exports = {
  migrateVariantImagesToS3,
  CONFIG
};


