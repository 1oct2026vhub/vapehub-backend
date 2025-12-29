const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { BannerImage } = require("../../../../models");
const { Op, Sequelize } = require("sequelize");
const { uploadFiletToS3, deleteFile, uploadImageToS3WithResize, generateCloudFrontUrlForS3 } = require("../../../../library/s3/s3Helper");
// Removed old imports - using new migration-style system
const path = require('path');

// Banner image configurations - NO RESIZING, PRESERVE ORIGINAL FORMAT
const BANNER_RESIZE_CONFIGS = {
  desktop_wide: { priority: 'high' },
  desktop: { priority: 'high' },
  laptop: { priority: 'medium' },
  tablet_landscape: { priority: 'medium' },
  tablet_portrait: { priority: 'medium' },
  mobile: { priority: 'high' }
};

/**
 * Generate multiple responsive images using migration-style resizing
 * @param {Buffer} imageBuffer - Original image buffer
 * @param {string} baseS3Key - Base S3 key for the original image
 * @returns {Promise<Object>} - Object with all responsive image URLs
 */
async function generateResponsiveImagesWithMigrationStyle(imageBuffer, baseS3Key, fastMode = false) {
  try {
    console.log(`🔄 Generating responsive banner images using parallel processing${fastMode ? ' (FAST MODE)' : ''}...`);
    const startTime = Date.now();
    
    const baseFileName = path.basename(baseS3Key, path.extname(baseS3Key));
    const directory = path.dirname(baseS3Key);
    
    // Filter configs based on mode
    const configsToProcess = fastMode 
      ? Object.entries(BANNER_RESIZE_CONFIGS).filter(([_, config]) => config.priority === 'high')
      : Object.entries(BANNER_RESIZE_CONFIGS);
    
    console.log(`${fastMode ? '⚡ Fast mode' : '🐌 Full mode'}: Processing ${configsToProcess.length}/${Object.keys(BANNER_RESIZE_CONFIGS).length} sizes`);
    
    // Create parallel processing promises for selected responsive sizes
    const resizePromises = configsToProcess.map(async ([sizeKey, config]) => {
      try {
        console.log(`📐 Starting ${sizeKey}: ${config.width}x${config.height}`);
        
        // Preserve original format - no WebP conversion
        const originalExt = path.extname(baseS3Key).toLowerCase();
        const sizeS3Key = `${directory}/${baseFileName}-${sizeKey}${originalExt}`;
        
        // Determine content type from original file extension
        let contentType = 'image/jpeg'; // default
        if (originalExt === '.png') contentType = 'image/png';
        else if (originalExt === '.webp') contentType = 'image/webp';
        else if (originalExt === '.gif') contentType = 'image/gif';
        else if (originalExt === '.svg') contentType = 'image/svg+xml';
        
        const uploadParams = {
          Bucket: process.env.AWS_S3_BUCKET,
          Key: sizeS3Key,
          Body: imageBuffer,
          ContentType: contentType
        };
        
        const uploadResult = await uploadImageToS3WithResize(uploadParams, config);
        
        if (uploadResult && uploadResult.Location) {
          const url = generateCloudFrontUrlForS3(sizeS3Key);
          console.log(`✅ ${sizeKey} uploaded with original format: ${url}`);
          return { sizeKey, url, success: true };
        }
        
        return { sizeKey, url: null, success: false };
        
      } catch (error) {
        console.error(`❌ Error processing ${sizeKey}:`, error.message);
        return { sizeKey, url: null, success: false };
      }
    });
    
    // Wait for all resize operations to complete in parallel
    console.log('⏳ Processing 6 responsive sizes in parallel...');
    const results = await Promise.all(resizePromises);
    
    // Convert results to object format
    const responsiveUrls = {};
    let successCount = 0;
    
    results.forEach(({ sizeKey, url, success }) => {
      responsiveUrls[sizeKey] = url;
      if (success) successCount++;
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`🎉 Responsive banner image generation completed in ${duration}ms!`);
    console.log(`📊 Successfully generated ${successCount}/6 responsive images`);
    
    return responsiveUrls;
    
  } catch (error) {
    console.error('❌ Error in responsive image generation:', error);
    throw error;
  }
}

module.exports.getBanners = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            sort_by = 'display_order',
            order = 'ASC',
            search,
            deleted = false,
            status
        } = req.query;

        // Build where clause
        const whereClause = {};

        // Handle search
        if (search) {
            whereClause[Op.or] = [
                { title: { [Op.like]: `%${search}%` } },
                { description: { [Op.like]: `%${search}%` } }
            ];
        }

        // Handle status filter
        if (status) {
            whereClause.status = status;
        }

        // Calculate offset for pagination
        const offset = (page - 1) * limit;

        // Get total count for pagination
        const total = await BannerImage.count({
            where: whereClause,
            paranoid: deleted !== 'true' // Only include soft-deleted records when deleted=true
        });

        // Handle deleted filter
        if (deleted === 'true') {
            whereClause.deletedAt = { [Op.ne]: null };
        } else {
            whereClause.deletedAt = null;
        }
        // Get banners with pagination
        const banners = await BannerImage.findAll({
            where: whereClause,
            order: [[sort_by, order.toUpperCase()]],
            limit: parseInt(limit),
            offset: parseInt(offset),
            paranoid: deleted !== 'true' // Only include soft-deleted records when deleted=true
        });

        // Format banners with responsive image data
        const formattedBanners = banners.map(banner => {
            const bannerData = banner.toJSON();
            return {
                ...bannerData,
                responsive_images: banner.getResponsiveUrls()
            };
        });

        return successResponse(res, {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            results: formattedBanners
        }, 'Banners retrieved successfully');
    } catch (error) {
        console.log(error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.createBanner = async (req, res) => {
    try {
        const user_id = req?.user?.id;
        const { title, description, status, redirect_url, alt_text } = req.body;
        const files = req.files;

        if (!files.image) {
            const error = new Error("Banner image is required");
            error.statusCode = 400;
            throw error;
        }

        // Get next display order automatically
        const display_order = await getNextDisplayOrder();

        // Validate input image
        console.log('📊 Input image validation:');
        console.log(`📁 File name: ${files.image[0].originalname}`);
        console.log(`📊 File size: ${files.image[0].buffer.length} bytes`);
        console.log(`📋 MIME type: ${files.image[0].mimetype}`);
        
        if (!files.image[0].buffer || files.image[0].buffer.length === 0) {
            const error = new Error("Uploaded image is empty or corrupted");
            error.statusCode = 400;
            throw error;
        }

        // Generate base S3 key for the original image (using simple path like migration)
        const fileExtension = path.extname(files.image[0].originalname) || '.jpg';
        const baseFileName = path.basename(files.image[0].originalname, fileExtension);
        const baseS3Key = `banners/${baseFileName}${fileExtension}`;
        
        // Upload original image to S3 first
        const image_url = await uploadFiletToS3({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: baseS3Key,
            Body: files.image[0].buffer,
            ContentType: files.image[0].mimetype
        }).then(response => response.Location);
        
        console.log('✅ Original image uploaded successfully');

        // Generate responsive images using migration-style resizing
        console.log('🔄 Generating responsive banner images using migration approach...');
        console.log('📁 Base S3 Key:', baseS3Key);
        console.log('📊 Image buffer for processing:', {
            length: files.image[0].buffer.length,
            type: typeof files.image[0].buffer,
            isBuffer: Buffer.isBuffer(files.image[0].buffer)
        });
        
        // Generate critical images first for fast response, then background generate others
        const useFastMode = process.env.NODE_ENV === 'development' || process.env.FAST_IMAGE_GENERATION === 'true';
        const responsiveUrls = await generateResponsiveImagesWithMigrationStyle(
            files.image[0].buffer, 
            baseS3Key,
            useFastMode // Use fast mode in development or when explicitly enabled
        );

        // Schedule background generation of remaining images (only if fast mode was used)
        if (useFastMode && responsiveUrls) {
            setTimeout(async () => {
                try {
                    console.log('🔄 Starting background generation of remaining responsive banner images...');
                    const remainingUrls = await generateResponsiveImagesWithMigrationStyle(
                        files.image[0].buffer, 
                        baseS3Key,
                        false // Full mode for background generation
                    );
                    
                    // Update banner with remaining URLs
                    const bannerToUpdate = await BannerImage.findOne({ where: { image_url } });
                    if (bannerToUpdate) {
                        // Update only the missing fields
                        const updateData = {};
                        Object.entries(remainingUrls).forEach(([sizeKey, url]) => {
                            if (url && !responsiveUrls[sizeKey]) {
                                updateData[`image_url_${sizeKey}`] = url;
                            }
                        });
                        
                        if (Object.keys(updateData).length > 0) {
                            updateData.responsive_urls = { ...responsiveUrls, ...remainingUrls };
                            await bannerToUpdate.update(updateData);
                            console.log('✅ Background responsive banner images generated and saved');
                        }
                    }
                } catch (error) {
                    console.error('❌ Background banner image generation failed:', error.message);
                }
            }, 1000); // Start background job after 1 second
        }

        console.log('📊 Generated responsive URLs:', Object.keys(responsiveUrls));
        console.log('🔗 Responsive URLs result:', responsiveUrls);

        const banner = await BannerImage.create({
            display_order,
            image_url,
            title,
            description,
            alt_text,
            status,
            redirect_url,
            updated_by: user_id
        });

        // Set responsive URLs using helper method
        banner.updateResponsiveUrls(responsiveUrls);
        await banner.save();

        console.log('💾 Banner saved with responsive URLs');

        // Format response with responsive image data
        const formattedBanner = {
            ...banner.toJSON(),
            responsive_images: banner.getResponsiveUrls()
        };

        return successResponse(res, formattedBanner, 'Banner created successfully with responsive images');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Helper function to handle image upload
const uploadImageToS3 = async (file, prefix) => {
    return uploadFiletToS3({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: `banners/${prefix}-${Date.now()}-${file.originalname}`,
        Body: file.buffer,
        ContentType: file.mimetype
    }).then(response => response.Location);
};

// Helper function to validate display order
const validateDisplayOrder = async (display_order, currentOrder) => {
    if (display_order && display_order !== currentOrder) {
        const existing = await BannerImage.findOne({ where: { display_order } });
        if (existing) {
            const error = new Error("display_order already exists");
            error.statusCode = 400;
            throw error;
        }
    }
};

// Helper function to delete image from S3
const deleteImageFromS3 = async (imageUrl) => {
    if (!imageUrl) return;

    // Check if URL is from S3 bucket
    const bucketUrl = process.env.AWS_S3_BUCKET;
    if (!imageUrl.startsWith(bucketUrl)) return;

    try {
        const key = imageUrl.split('/').pop();
        await deleteFile(`banners/${key}`);
    } catch (error) {
        console.error('Error deleting image from S3:', error);
        // Don't throw error as this is not critical
    }
};

/**
 * Delete all responsive images from S3 for a given base S3 key
 * @param {string} baseS3Key - Base S3 key (e.g., "banners/filename.jpg")
 */
const deleteAllResizedImages = async (baseS3Key) => {
    if (!baseS3Key) return;

    try {
        console.log(`🗑️ Deleting all responsive images for: ${baseS3Key}`);
        
        // Extract base filename without extension
        const baseFileName = path.basename(baseS3Key, path.extname(baseS3Key));
        const directory = path.dirname(baseS3Key);
        
        // Get all responsive size keys from BANNER_RESIZE_CONFIGS
        const responsiveSizeKeys = Object.keys(BANNER_RESIZE_CONFIGS);
        
        // Delete all responsive image files (both WebP and JPG fallbacks)
        const deletePromises = [];
        
        for (const sizeKey of responsiveSizeKeys) {
            // Delete WebP version
            const webpKey = `${directory}/${baseFileName}-${sizeKey}.webp`;
            deletePromises.push(
                deleteFile(webpKey).catch(error => {
                    console.log(`⚠️ Failed to delete WebP ${sizeKey}: ${error.message}`);
                })
            );
            
            // Delete JPG fallback version
            const jpgKey = `${directory}/${baseFileName}-${sizeKey}.jpg`;
            deletePromises.push(
                deleteFile(jpgKey).catch(error => {
                    console.log(`⚠️ Failed to delete JPG ${sizeKey}: ${error.message}`);
                })
            );
        }
        
        // Also delete the original image
        deletePromises.push(
            deleteFile(baseS3Key).catch(error => {
                console.log(`⚠️ Failed to delete original image: ${error.message}`);
            })
        );
        
        // Wait for all deletions to complete
        await Promise.all(deletePromises);
        
        console.log(`✅ All responsive images deleted for: ${baseFileName}`);
        
    } catch (error) {
        console.error('❌ Error deleting responsive images:', error);
        // Don't throw error as this is not critical for banner deletion
    }
};

// Helper function to update banner images with responsive resizing
const updateBannerImages = async (banner, files) => {
    if (files.image) {
        // Delete all existing responsive images from S3 (using new system)
        if (banner.image_url) {
            const urlParts = banner.image_url.split('/');
            const fileName = urlParts[urlParts.length - 1];
            const baseS3Key = `banners/${fileName}`;
            await deleteAllResizedImages(baseS3Key);
        }

        // Generate new base S3 key
        const fileExtension = path.extname(files.image[0].originalname) || '.jpg';
        const baseFileName = path.basename(files.image[0].originalname, fileExtension);
        const newBaseS3Key = `banners/${baseFileName}${fileExtension}`;
        
        // Upload new original image
        banner.image_url = await uploadFiletToS3({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: newBaseS3Key,
            Body: files.image[0].buffer,
            ContentType: files.image[0].mimetype
        }).then(response => response.Location);

        // Generate responsive images using migration-style resizing
        console.log('🔄 Updating responsive banner images using migration approach...');
        const responsiveUrls = await generateResponsiveImagesWithMigrationStyle(
            files.image[0].buffer, 
            newBaseS3Key
        );

        // Update all responsive image URLs using helper method
        banner.updateResponsiveUrls(responsiveUrls);
    }
    
    // Keep backward compatibility for image_low if provided separately
    if (files.image_low) {
        await deleteImageFromS3(banner.image_url_low);
        banner.image_url_low = await uploadImageToS3(files.image_low[0], 'low');
    }
};

module.exports.updateBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req?.user?.id;
        const { title, description, status, redirect_url, alt_text } = req.body;
        const files = req.files;

        const banner = await BannerImage.findByPk(id);
        if (!banner) {
            const error = new Error("Banner not found");
            error.statusCode = 404;
            throw error;
        }

        if (files) {
            await updateBannerImages(banner, files);
        }

        Object.assign(banner, {
            ...(title !== undefined && { title }),
            ...(description !== undefined && { description }),
            ...(alt_text !== undefined && { alt_text }),
            ...(status !== undefined && { status }),
            ...(redirect_url !== undefined && { redirect_url }),
            updated_by: user_id
        });

        await banner.save();
        
        // Format response with responsive image data
        const formattedBanner = {
            ...banner.toJSON(),
            responsive_images: banner.getResponsiveUrls()
        };
        
        return successResponse(res, formattedBanner, 'Banner updated successfully with responsive images');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.deleteBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const banner = await BannerImage.findByPk(id);
        
        if (!banner) {
            const error = new Error("Banner not found");
            error.statusCode = 404;
            throw error;
        }

        await BannerImage.sequelize.transaction(async (t) => {
            // Update display orders of items after the deleted item
            await BannerImage.update(
                { 
                    display_order: Sequelize.literal('display_order - 1')
                },
                { 
                    where: {
                        display_order: { [Op.gt]: banner.display_order }
                    },
                    transaction: t
                }
            );

            // Delete all responsive images from S3
            if (banner.image_url) {
                // Extract the S3 key from the full URL
                const urlParts = banner.image_url.split('/');
                const fileName = urlParts[urlParts.length - 1];
                const baseS3Key = `banners/${fileName}`;
                await deleteAllResizedImages(baseS3Key);
            }

            // Soft delete the banner (marks as deleted but keeps record)
            await banner.destroy({ transaction: t });
        });

        return successResponse(res, null, 'Banner deleted successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.getBannerDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const banner = await BannerImage.findByPk(id);
        if (!banner) {
            const error = new Error("Banner not found");
            error.statusCode = 404;
            throw error;
        }

        // Format banner with responsive image data
        const formattedBanner = {
            ...banner.toJSON(),
            responsive_images: banner.getResponsiveUrls()
        };
        
        return successResponse(res, formattedBanner, 'Banner details retrieved successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Add this new function to handle display order shuffling
module.exports.shuffleDisplayOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { new_display_order } = req.body;
        const user_id = req?.user?.id;

        // Get current banner
        const currentBanner = await BannerImage.findByPk(id);
        if (!currentBanner) {
            const error = new Error("Banner not found");
            error.statusCode = 404;
            throw error;
        }

        // Get all banners ordered by display_order
        const banners = await BannerImage.findAll({
            order: [['display_order', 'ASC']]
        });

        // Start transaction for multiple updates
        await BannerImage.sequelize.transaction(async (t) => {
            if (currentBanner.display_order < new_display_order) {
                // Moving down: Decrease display_order of items between old and new position
                await BannerImage.update(
                    { 
                        display_order: Sequelize.literal('display_order - 1'),
                        updated_by: user_id 
                    },
                    { 
                        where: {
                            display_order: {
                                [Op.gt]: currentBanner.display_order,
                                [Op.lte]: new_display_order
                            }
                        },
                        transaction: t
                    }
                );
            } else if (currentBanner.display_order > new_display_order) {
                // Moving up: Increase display_order of items between new and old position
                await BannerImage.update(
                    { 
                        display_order: Sequelize.literal('display_order + 1'),
                        updated_by: user_id 
                    },
                    { 
                        where: {
                            display_order: {
                                [Op.gte]: new_display_order,
                                [Op.lt]: currentBanner.display_order
                            }
                        },
                        transaction: t
                    }
                );
            }

            // Update current banner's display_order
            await currentBanner.update(
                { 
                    display_order: new_display_order,
                    updated_by: user_id 
                },
                { transaction: t }
            );
        });

        // Get updated banner list
        const updatedBanners = await BannerImage.findAll({
            order: [['display_order', 'ASC']]
        });

        // Format banners with responsive image data
        const formattedBanners = updatedBanners.map(banner => {
            const bannerData = banner.toJSON();
            return {
                ...bannerData,
                responsive_images: banner.getResponsiveUrls()
            };
        });

        return successResponse(res, formattedBanners, 'Display order updated successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Add this helper function at the top with other helpers
const getNextDisplayOrder = async () => {
    const maxOrder = await BannerImage.max('display_order');
    return (maxOrder || 0) + 1;
}; 

// Restore a soft-deleted banner
module.exports.restoreBanner = async (req, res) => {
    try {
        const { id } = req.params;
        // Find the banner including soft-deleted
        const banner = await BannerImage.findByPk(id, { paranoid: false });
        if (!banner) {
            return res.status(404).json({ success: false, message: "Banner not found" });
        }
        await banner.restore();
        
        // Format banner with responsive image data
        const formattedBanner = {
            ...banner.toJSON(),
            responsive_images: banner.getResponsiveUrls()
        };
        
        return res.json({ success: true, message: "Banner restored successfully", data: formattedBanner });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
}; 