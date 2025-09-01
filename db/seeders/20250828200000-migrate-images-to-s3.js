'use strict';

const CrossServerMigration = require('../../utils/cross-server-migration');
const { uploadFiletToS3, generateUniqueFileName, generateCloudFrontUrlForS3, checkImageExists } = require('../../library/s3/s3Helper');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

module.exports = {
  async up(queryInterface, Sequelize) {
    const crossServerMigration = new CrossServerMigration(process.env.NODE_ENV || 'local');
    
    try {
      console.log('🚀 Starting CATEGORY & BRAND IMAGE MIGRATION: Uploading images to S3...');
      
      // Note: No need to connect to old database since we're reading from current database
      
      const imageStats = {
        processed: 0,
        uploaded: 0,
        skipped: 0,
        errors: 0,
        updated: 0
      };

      // MIGRATE CATEGORY IMAGES (URLs exist, need to upload to S3)
      console.log('📷 Migrating category images...');
      await migrateCategoryImages(crossServerMigration, queryInterface, Sequelize, imageStats);

      // MIGRATE BRAND IMAGES
      console.log('📷 Migrating brand images...');
      console.log('⏳ Waiting 3 seconds before starting brand migration...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      await migrateBrandImages(crossServerMigration, queryInterface, Sequelize, imageStats);

      console.log('✅ Category & Brand image migration completed!');
      console.log(`📊 Statistics:
        - Processed: ${imageStats.processed}
        - Uploaded: ${imageStats.uploaded}
        - Skipped: ${imageStats.skipped}
        - Updated: ${imageStats.updated}
        - Errors: ${imageStats.errors}`);

      // No old database connection to close
      
    } catch (error) {
      console.error('❌ Error during image migration:', error);
      // No old database connection to close
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
async function smartImageMigration(imageUrl, folder = 'categories', imageStats) {
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
 * Download image from URL and upload to S3 (helper function)
 */
async function downloadAndUploadToS3(imageUrl, folder = 'products', s3Key = null, imageStats) {
  try {
    if (!imageUrl || imageUrl.trim() === '') {
      imageStats.skipped++;
      return null;
    }

    // Clean the URL - remove any WordPress upload path prefixes
    const cleanUrl = imageUrl.replace(/^.*\/wp-content\/uploads\//, '').replace(/^.*\/uploads\//, '');
    
    // Create full URL if it's a relative path
    const fullUrl = imageUrl.startsWith('http') ? imageUrl : 
                   imageUrl.startsWith('//') ? `https:${imageUrl}` :
                   `https://vapehub.co.uk/wp-content/uploads/${cleanUrl}`;

    console.log(`📥 Downloading: ${fullUrl}`);

    // Download the image with improved headers and retry logic
    let response;
    let retries = 3;
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
            'Referer': 'https://www.vapehub.co.uk/',
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
          // Exponential backoff: 2s, 4s, 6s
          const delay = (3 - retries) * 2000;
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
      imageStats.uploaded++;
      console.log(`✅ Uploaded to S3: ${finalS3Key}`);
      
      // Return the S3 key for the calling function to generate URL
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
 * Migrate category images from current DB URLs to S3
 */
async function migrateCategoryImages(crossServerMigration, queryInterface, Sequelize, imageStats) {
  try {
    // Get ALL categories with images (including those already in S3)
    const categoriesWithImages = await queryInterface.sequelize.query(`
      SELECT id, name, logo_url 
      FROM categories 
      WHERE logo_url IS NOT NULL 
      AND logo_url != ''
      ORDER BY id
    `, {
      type: Sequelize.QueryTypes.SELECT
    });

    console.log(`📊 Found ${categoriesWithImages.length} categories with images to process`);

    for (const category of categoriesWithImages) {
      imageStats.processed++;
      
      console.log(`🔄 Processing category: ${category.name}`);
      
      // Smart migration: check if exists, upload if needed, get correct URL
      const finalUrl = await smartImageMigration(category.logo_url, 'categories', imageStats);
      
      if (finalUrl) {
        await queryInterface.sequelize.query(`
          UPDATE categories SET logo_url = ?, updatedAt = NOW() WHERE id = ?
        `, {
          replacements: [finalUrl, category.id]
        });
        
        imageStats.updated++;
        console.log(`✅ Updated category image URL: ${category.name}`);
      } else {
        console.log(`❌ Failed to process category image: ${category.name}`);
      }
    
    // Add delay between processing to avoid rate limiting
    if (imageStats.processed < categoriesWithImages.length) {
      console.log(`⏳ Waiting 1 second before next image...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    }

  } catch (error) {
    console.error('❌ Error migrating category images:', error);
    throw error;
  }
}

/**
 * Migrate brand images from current DB URLs to S3
 */
async function migrateBrandImages(crossServerMigration, queryInterface, Sequelize, imageStats) {
  try {
    // Get ALL brands with images (including those already in S3)
    const brandsWithImages = await queryInterface.sequelize.query(`
      SELECT id, name, logo_url 
      FROM brands 
      WHERE logo_url IS NOT NULL 
      AND logo_url != ''
      ORDER BY id
    `, {
      type: Sequelize.QueryTypes.SELECT
    });

    console.log(`📊 Found ${brandsWithImages.length} brands with images to process`);

    for (const brand of brandsWithImages) {
      imageStats.processed++;
      
      console.log(`🔄 Processing brand: ${brand.name}`);
      
      // Smart migration: check if exists, upload if needed, get correct URL
      const finalUrl = await smartImageMigration(brand.logo_url, 'brands', imageStats);
      
      if (finalUrl) {
        await queryInterface.sequelize.query(`
          UPDATE brands SET logo_url = ?, updatedAt = NOW() WHERE id = ?
        `, {
          replacements: [finalUrl, brand.id]
        });
        
        imageStats.updated++;
        console.log(`✅ Updated brand image URL: ${brand.name}`);
      } else {
        console.log(`❌ Failed to process brand image: ${brand.name}`);
      }
    
    // Add delay between processing to avoid rate limiting
    if (imageStats.processed < brandsWithImages.length) {
      console.log(`⏳ Waiting 1 second before next image...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    }

  } catch (error) {
    console.error('❌ Error migrating brand images:', error);
    throw error;
  }
}


