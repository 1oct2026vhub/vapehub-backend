const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Carousel } = require("../../../../models");
const { Op, Sequelize } = require("sequelize");
const { uploadFiletToS3, deleteFile, uploadImageToS3WithResize, generateCloudFrontUrlForS3, downloadS3ObjectBuffer } = require("../../../../library/s3/s3Helper");
const path = require('path');

// Carousel image configurations - NO RESIZING, PRESERVE ORIGINAL FORMAT
const CAROUSEL_RESIZE_CONFIGS = {
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
 * @param {boolean} fastMode - If true, only generate high-priority images immediately
 * @returns {Promise<Object>} - Object with all responsive image URLs
 */
async function generateResponsiveImagesWithMigrationStyle(imageBuffer, baseS3Key, fastMode = false) {
  try {
    console.log(`🔄 Generating responsive carousel images using parallel processing${fastMode ? ' (FAST MODE)' : ''}...`);
    const startTime = Date.now();
    
    const baseFileName = path.basename(baseS3Key, path.extname(baseS3Key));
    const directory = path.dirname(baseS3Key);
    
    // Filter configs based on mode
    const configsToProcess = fastMode 
      ? Object.entries(CAROUSEL_RESIZE_CONFIGS).filter(([_, config]) => config.priority === 'high')
      : Object.entries(CAROUSEL_RESIZE_CONFIGS);
    
    console.log(`${fastMode ? '⚡ Fast mode' : '🐌 Full mode'}: Processing ${configsToProcess.length}/${Object.keys(CAROUSEL_RESIZE_CONFIGS).length} sizes`);
    
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
    
    console.log(`🎉 Responsive carousel image generation completed in ${duration}ms!`);
    console.log(`📊 Successfully generated ${successCount}/6 responsive images`);
    
    return responsiveUrls;
    
  } catch (error) {
    console.error('❌ Error in responsive carousel image generation:', error);
    throw error;
  }
}

module.exports.getCarousels = async (req, res) => {
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
        const total = await Carousel.count({
            where: whereClause,
            paranoid: deleted !== 'true' // Only include soft-deleted records when deleted=true
        });

        // Handle deleted filter
        if (deleted === 'true') {
            whereClause.deletedAt = { [Op.ne]: null };
        } else {
            whereClause.deletedAt = null;
        }
        // Get carousels with pagination
        const carousels = await Carousel.findAll({
            where: whereClause,
            order: [[sort_by, order.toUpperCase()]],
            limit: parseInt(limit),
            offset: parseInt(offset),
            paranoid: deleted !== 'true' // Only include soft-deleted records when deleted=true
        });

        // Format carousels with responsive image data
        const formattedCarousels = carousels.map(carousel => {
            const carouselData = carousel.toJSON();
            return {
                ...carouselData,
                responsive_images: carousel.getResponsiveUrls()
            };
        });

        return successResponse(res, {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            results: formattedCarousels
        }, 'Carousels retrieved successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.createCarousel = async (req, res) => {
    try {
        const user_id = req?.user?.id;
        const { title, description, status, redirect_url, alt_text, alt_text_mobile } = req.body;
        const files = req.files;

        if (!files.image) {
            const error = new Error("Carousel image is required");
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
        const baseS3Key = `carousels/${baseFileName}${fileExtension}`;
        
        // Upload original image to S3 first
        const image_url = await uploadFiletToS3({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: baseS3Key,
            Body: files.image[0].buffer,
            ContentType: files.image[0].mimetype
        }).then(response => response.Location);
        
        console.log('✅ Original carousel image uploaded successfully');

        // Handle optional image_url_low upload
        let image_url_low = null;
        if (files.image_low && files.image_low[0]) {
            try {
                image_url_low = await uploadImageToS3(files.image_low[0], 'low');
                console.log('✅ Low resolution carousel image uploaded successfully');
            } catch (error) {
                console.error('⚠️ Failed to upload image_low, continuing without it:', error.message);
                // Continue without image_low if upload fails
            }
        } else {
            // If image_low is not provided, use mobile responsive image as fallback
            console.log('ℹ️ image_low not provided, will use mobile responsive image as fallback');
        }

        // Generate responsive images using migration-style resizing
        console.log('🔄 Generating responsive carousel images using migration approach...');
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
            const backgroundS3Key = baseS3Key;
            const savedImageUrl = image_url;
            const partialResponsiveUrls = { ...responsiveUrls };
            setTimeout(async () => {
                try {
                    console.log('🔄 Starting background generation of remaining responsive images...');
                    const imageBuffer = await downloadS3ObjectBuffer(backgroundS3Key);
                    const remainingUrls = await generateResponsiveImagesWithMigrationStyle(
                        imageBuffer,
                        backgroundS3Key,
                        false // Full mode for background generation
                    );
                    
                    // Update carousel with remaining URLs
                    const carouselToUpdate = await Carousel.findOne({ where: { image_url: savedImageUrl } });
                    if (carouselToUpdate) {
                        // Update only the missing fields
                        const updateData = {};
                        Object.entries(remainingUrls).forEach(([sizeKey, url]) => {
                            if (url && !partialResponsiveUrls[sizeKey]) {
                                updateData[`image_url_${sizeKey}`] = url;
                            }
                        });
                        
                        if (Object.keys(updateData).length > 0) {
                            updateData.responsive_urls = { ...partialResponsiveUrls, ...remainingUrls };
                            await carouselToUpdate.update(updateData);
                            console.log('✅ Background responsive images generated and saved');
                        }
                    }
                } catch (error) {
                    console.error('❌ Background image generation failed:', error.message);
                }
            }, 1000); // Start background job after 1 second
        }

        console.log('📊 Generated responsive URLs:', Object.keys(responsiveUrls));
        console.log('🔗 Responsive URLs result:', responsiveUrls);
        console.log('🔍 Detailed responsive URLs check:');
        console.log('  - desktop_wide:', responsiveUrls.desktop_wide);
        console.log('  - desktop:', responsiveUrls.desktop);
        console.log('  - laptop:', responsiveUrls.laptop);
        console.log('  - tablet_landscape:', responsiveUrls.tablet_landscape);
        console.log('  - tablet_portrait:', responsiveUrls.tablet_portrait);
        console.log('  - mobile:', responsiveUrls.mobile);

        // Use mobile responsive image as fallback for image_url_low if not provided
        if (!image_url_low && responsiveUrls.mobile) {
            image_url_low = responsiveUrls.mobile;
            console.log('ℹ️ Using mobile responsive image as image_url_low fallback');
        }

        // Ensure all responsive URL fields are properly initialized
        const carouselData = {
            display_order,
            image_url,
            image_url_low, // Include image_url_low (either uploaded or fallback)
            title,
            description,
            alt_text,
            alt_text_mobile,
            status,
            redirect_url,
            updated_by: user_id,
            // Include responsive URLs in the create call - ensure all fields are set
            image_url_desktop_wide: responsiveUrls.desktop_wide || null,
            image_url_desktop: responsiveUrls.desktop || null,
            image_url_laptop: responsiveUrls.laptop || null,
            image_url_tablet_landscape: responsiveUrls.tablet_landscape || null,
            image_url_tablet_portrait: responsiveUrls.tablet_portrait || null,
            image_url_mobile: responsiveUrls.mobile || null,
            responsive_urls: responsiveUrls
        };

        console.log('💾 Carousel data to be saved:', carouselData);
        const carousel = await Carousel.create(carouselData);

        console.log('💾 Carousel saved with responsive URLs');

        // Format response with responsive image data
        const formattedCarousel = {
            ...carousel.toJSON(),
            responsive_images: carousel.getResponsiveUrls()
        };

        return successResponse(res, formattedCarousel, 'Carousel created successfully with responsive images');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Helper function to validate display order
const validateDisplayOrder = async (display_order, currentOrder) => {
    if (display_order && display_order !== currentOrder) {
        const existing = await Carousel.findOne({ where: { display_order } });
        if (existing) {
            const error = new Error("display_order already exists");
            error.statusCode = 400;
            throw error;
        }
    }
};

// Helper function to handle image upload
const uploadImageToS3 = async (file, prefix) => {
    const response = await uploadFiletToS3({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: `carousels/${prefix}-${Date.now()}-${file.originalname}`,
        Body: file.buffer,
        ContentType: file.mimetype
    });
    
    // Ensure we return a string URL, not the full S3 response object
    if (response && response.Location) {
        return response.Location;
    }
    throw new Error('Failed to get image URL from S3');
};

// Helper function to delete image from S3
const deleteImageFromS3 = async (imageUrl) => {
    if (!imageUrl) return;

    // Check if URL is from S3 bucket
    const bucketUrl = process.env.AWS_S3_BUCKET;
    if (!imageUrl.startsWith(bucketUrl)) return;

    try {
        const key = imageUrl.split('/').pop();
        await deleteFile(`carousels/${key}`);
    } catch (error) {
        console.error('Error deleting image from S3:', error);
        // Don't throw error as this is not critical
    }
};

/**
 * Delete all responsive images from S3 for a given base S3 key
 * @param {string} baseS3Key - Base S3 key (e.g., "carousels/filename.jpg")
 */
const deleteAllResizedImages = async (baseS3Key) => {
    if (!baseS3Key) return;

    try {
        console.log(`🗑️ Deleting all responsive carousel images for: ${baseS3Key}`);
        
        // Extract base filename without extension
        const baseFileName = path.basename(baseS3Key, path.extname(baseS3Key));
        const directory = path.dirname(baseS3Key);
        
        // Get all responsive size keys from CAROUSEL_RESIZE_CONFIGS
        const responsiveSizeKeys = Object.keys(CAROUSEL_RESIZE_CONFIGS);
        
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
        
        console.log(`✅ All responsive carousel images deleted for: ${baseFileName}`);
        
    } catch (error) {
        console.error('❌ Error deleting responsive carousel images:', error);
        // Don't throw error as this is not critical for carousel deletion
    }
};

// Helper function to update carousel images with responsive resizing
const updateCarouselImages = async (carousel, files) => {
    if (files.image) {
        // Delete all existing responsive images from S3 (using new system)
        if (carousel.image_url) {
            const urlParts = carousel.image_url.split('/');
            const fileName = urlParts[urlParts.length - 1];
            const baseS3Key = `carousels/${fileName}`;
            await deleteAllResizedImages(baseS3Key);
        }

        // Generate new base S3 key
        const fileExtension = path.extname(files.image[0].originalname) || '.jpg';
        const baseFileName = path.basename(files.image[0].originalname, fileExtension);
        const newBaseS3Key = `carousels/${baseFileName}${fileExtension}`;
        
        // Upload new original image
        carousel.image_url = await uploadFiletToS3({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: newBaseS3Key,
            Body: files.image[0].buffer,
            ContentType: files.image[0].mimetype
        }).then(response => response.Location);

        // Generate responsive images using migration-style resizing
        console.log('🔄 Updating responsive carousel images using migration approach...');
        const responsiveUrls = await generateResponsiveImagesWithMigrationStyle(
            files.image[0].buffer, 
            newBaseS3Key
        );

        // Update all responsive image URLs using helper method
        carousel.updateResponsiveUrls(responsiveUrls);
    }
    
    // Keep backward compatibility for image_low if provided separately
    if (files.image_low) {
        await deleteImageFromS3(carousel.image_url_low);
        carousel.image_url_low = await uploadImageToS3(files.image_low[0], 'low');
    }
};

module.exports.updateCarousel = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req?.user?.id;
        const { title, description, status, redirect_url, alt_text, alt_text_mobile } = req.body;
        const files = req.files;

        const carousel = await Carousel.findByPk(id);
        if (!carousel) {
            const error = new Error("Carousel not found");
            error.statusCode = 404;
            throw error;
        }

        if (files) {
            await updateCarouselImages(carousel, files);
        }

        Object.assign(carousel, {
            ...(title !== undefined && { title }),
            ...(description !== undefined && { description }),
            ...(alt_text !== undefined && { alt_text }),
            ...(alt_text_mobile !== undefined && { alt_text_mobile }),
            ...(status !== undefined && { status }),
            ...(redirect_url !== undefined && { redirect_url }),
            updated_by: user_id
        });

        await carousel.save();
        
        // Format response with responsive image data
        const formattedCarousel = {
            ...carousel.toJSON(),
            responsive_images: carousel.getResponsiveUrls()
        };
        
        return successResponse(res, formattedCarousel, 'Carousel updated successfully with responsive images');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.deleteCarousel = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req?.user?.id ?? null;
        const carousel = await Carousel.findByPk(id);
        
        if (!carousel) {
            const error = new Error("Carousel not found");
            error.statusCode = 404;
            throw error;
        }

        await Carousel.sequelize.transaction(async (t) => {
            // Update display orders of items after the deleted item
            await Carousel.update(
                { 
                    display_order: Sequelize.literal('display_order - 1'),
                    updated_by: user_id
                },
                { 
                    where: {
                        display_order: { [Op.gt]: carousel.display_order }
                    },
                    transaction: t
                }
            );

            // Delete all responsive images from S3
            if (carousel.image_url) {
                // Extract the S3 key from the full URL
                const urlParts = carousel.image_url.split('/');
                const fileName = urlParts[urlParts.length - 1];
                const baseS3Key = `carousels/${fileName}`;
                await deleteAllResizedImages(baseS3Key);
            }

            if (user_id != null) {
                await carousel.update({ updated_by: user_id }, { transaction: t });
            }
            // Soft delete the carousel (marks as deleted but keeps record)
            await carousel.destroy({ transaction: t });
        });

        return successResponse(res, null, 'Carousel deleted successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.getCarouselDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const carousel = await Carousel.findByPk(id);
        if (!carousel) {
            const error = new Error("Carousel not found");
            error.statusCode = 404;
            throw error;
        }

        // Format carousel with responsive image data
        const formattedCarousel = {
            ...carousel.toJSON(),
            responsive_images: carousel.getResponsiveUrls()
        };
        
        return successResponse(res, formattedCarousel, 'Carousel details retrieved successfully');
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

        // Get current carousel
        const currentCarousel = await Carousel.findByPk(id);
        if (!currentCarousel) {
            const error = new Error("Carousel not found");
            error.statusCode = 404;
            throw error;
        }

        // Start transaction for multiple updates
        await Carousel.sequelize.transaction(async (t) => {
            if (currentCarousel.display_order < new_display_order) {
                // Moving down: Decrease display_order of items between old and new position
                await Carousel.update(
                    { 
                        display_order: Sequelize.literal('display_order - 1'),
                        updated_by: user_id 
                    },
                    { 
                        where: {
                            display_order: {
                                [Op.gt]: currentCarousel.display_order,
                                [Op.lte]: new_display_order
                            }
                        },
                        transaction: t
                    }
                );
            } else if (currentCarousel.display_order > new_display_order) {
                // Moving up: Increase display_order of items between new and old position
                await Carousel.update(
                    { 
                        display_order: Sequelize.literal('display_order + 1'),
                        updated_by: user_id 
                    },
                    { 
                        where: {
                            display_order: {
                                [Op.gte]: new_display_order,
                                [Op.lt]: currentCarousel.display_order
                            }
                        },
                        transaction: t
                    }
                );
            }

            // Update current carousel's display_order
            await currentCarousel.update(
                { 
                    display_order: new_display_order,
                    updated_by: user_id 
                },
                { transaction: t }
            );
        });

        // Get updated carousel list
        const updatedCarousels = await Carousel.findAll({
            order: [['display_order', 'ASC']]
        });

        // Format carousels with responsive image data
        const formattedCarousels = updatedCarousels.map(carousel => {
            const carouselData = carousel.toJSON();
            return {
                ...carouselData,
                responsive_images: carousel.getResponsiveUrls()
            };
        });

        return successResponse(res, formattedCarousels, 'Display order updated successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Add this helper function at the top with other helpers
const getNextDisplayOrder = async () => {
    const maxOrder = await Carousel.max('display_order');
    return (maxOrder || 0) + 1;
}; 

// Restore a soft-deleted carousel
module.exports.restoreCarousel = async (req, res) => {
    try {
        const { id } = req.params;
        // Find the carousel including soft-deleted
        const carousel = await Carousel.findByPk(id, { paranoid: false });
        if (!carousel) {
            return res.status(404).json({ success: false, message: "Carousel not found" });
        }
        await carousel.restore();
        
        // Format carousel with responsive image data
        const formattedCarousel = {
            ...carousel.toJSON(),
            responsive_images: carousel.getResponsiveUrls()
        };
        
        return res.json({ success: true, message: "Carousel restored successfully", data: formattedCarousel });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
}; 