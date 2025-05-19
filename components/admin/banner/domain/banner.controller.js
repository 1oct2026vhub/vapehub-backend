const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { BannerImage } = require("../../../../models");
const { Op, Sequelize } = require("sequelize");
const { uploadFiletToS3, deleteFile } = require("../../../../library/s3/s3Helper");

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
            whereClause.deleted_at = { [Op.ne]: null };
        } else {
            whereClause.deleted_at = null;
        }
        // Get banners with pagination
        const banners = await BannerImage.findAll({
            where: whereClause,
            order: [[sort_by, order.toUpperCase()]],
            limit: parseInt(limit),
            offset: parseInt(offset),
            paranoid: deleted !== 'true' // Only include soft-deleted records when deleted=true
        });

        return successResponse(res, {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            results: banners
        }, 'Banners retrieved successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.createBanner = async (req, res) => {
    try {
        const user_id = req?.user?.id;
        const { title, description, status, redirect_url } = req.body;
        const files = req.files;

        if (!files.image || !files.image_low) {
            const error = new Error("Both images (original and low) are required");
            error.statusCode = 400;
            throw error;
        }

        // Get next display order automatically
        const display_order = await getNextDisplayOrder();

        // Upload images to S3
        const [image_url, image_url_low] = await Promise.all([
            uploadFiletToS3({
                Bucket: process.env.AWS_S3_BUCKET,
                Key: `banners/original-${Date.now()}-${files.image[0].originalname}`,
                Body: files.image[0].buffer,
                ContentType: files.image[0].mimetype
            }).then(response => response.Location),
            uploadFiletToS3({
                Bucket: process.env.AWS_S3_BUCKET,
                Key: `banners/low-${Date.now()}-${files.image_low[0].originalname}`,
                Body: files.image_low[0].buffer,
                ContentType: files.image_low[0].mimetype
            }).then(response => response.Location)
        ]);

        const banner = await BannerImage.create({
            display_order,
            image_url,
            image_url_low,
            title,
            description,
            status,
            redirect_url,
            updated_by: user_id
        });

        return successResponse(res, banner, 'Banner created successfully');
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
        logger.error('Error deleting image from S3:', error);
        // Don't throw error as this is not critical
    }
};

// Helper function to update banner images
const updateBannerImages = async (banner, files) => {
    if (files.image) {
        await deleteImageFromS3(banner.image_url);
        banner.image_url = await uploadImageToS3(files.image[0], 'original');
    }
    if (files.image_low) {
        await deleteImageFromS3(banner.image_url_low);
        banner.image_url_low = await uploadImageToS3(files.image_low[0], 'low');
    }
};

module.exports.updateBanner = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req?.user?.id;
        const { title, description, status, redirect_url } = req.body;
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
            ...(title && { title }),
            ...(description && { description }),
            ...(status && { status }),
            ...(redirect_url && { redirect_url }),
            updated_by: user_id
        });

        await banner.save();
        return successResponse(res, banner, 'Banner updated successfully');
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

            // Delete the banner
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

        return successResponse(res, banner, 'Banner details retrieved successfully');
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

        return successResponse(res, updatedBanners, 'Display order updated successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Add this helper function at the top with other helpers
const getNextDisplayOrder = async () => {
    const maxOrder = await BannerImage.max('display_order');
    return (maxOrder || 0) + 1;
}; 