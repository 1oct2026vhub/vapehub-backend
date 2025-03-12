const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Carousel } = require("../../../../models");
const { uploadFiletToS3 } = require("../../../../library/s3/s3Helper");
const { Op, Sequelize } = require("sequelize");

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
        logger.error('Error deleting image from S3:', error);
        // Don't throw error as this is not critical
    }
};

// Add this new helper function at the top
const getNextDisplayOrder = async () => {
    const maxOrder = await Carousel.max('display_order');
    return (maxOrder || 0) + 1;
};

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
            paranoid: !deleted // If deleted is true, include soft-deleted items
        });

        // Get carousels with pagination
        const carousels = await Carousel.findAll({
            where: whereClause,
            order: [[sort_by, order.toUpperCase()]],
            limit: parseInt(limit),
            offset: parseInt(offset),
            paranoid: !deleted // If deleted is true, include soft-deleted items
        });

        return successResponse(res, {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            results: carousels
        }, 'Carousels retrieved successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.createCarousel = async (req, res) => {
    try {
        const user_id = req?.user?.id;
        const { title, description, redirect_url } = req.body;  // Removed display_order from here
        const files = req.files;

        if (!files.image || !files.image_low) {
            const error = new Error("Both images (original and low) are required");
            error.statusCode = 400;
            throw error;
        }

        // Get next display order automatically
        const display_order = await getNextDisplayOrder();

        // Upload images and get URLs
        let image_url, image_url_low;
        try {
            [image_url, image_url_low] = await Promise.all([
                uploadImageToS3(files.image[0], 'original'),
                uploadImageToS3(files.image_low[0], 'low')
            ]);
        } catch (error) {
            throw new Error(`Image upload failed: ${error.message}`);
        }

        const carousel = await Carousel.create({
            display_order,  // Automatically calculated display order
            image_url,
            image_url_low,
            title,
            description,
            redirect_url,
            updated_by: user_id
        });

        return successResponse(res, carousel, 'Carousel created successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.updateCarousel = async (req, res) => {
    try {
        const { id } = req.params;
        const user_id = req?.user?.id;
        const { title, description, status, redirect_url } = req.body;  // Removed display_order from here
        const files = req.files;

        const carousel = await Carousel.findByPk(id);
        if (!carousel) {
            const error = new Error("Carousel not found");
            error.statusCode = 404;
            throw error;
        }

        if (files) {
            try {
                if (files.image) {
                    await deleteImageFromS3(carousel.image_url);
                    carousel.image_url = await uploadImageToS3(files.image[0], 'original');
                }
                if (files.image_low) {
                    await deleteImageFromS3(carousel.image_url_low);
                    carousel.image_url_low = await uploadImageToS3(files.image_low[0], 'low');
                }
            } catch (error) {
                throw new Error(`Image upload failed: ${error.message}`);
            }
        }

        Object.assign(carousel, {
            ...(title && { title }),
            ...(description && { description }),
            ...(status && { status }),
            ...(redirect_url && { redirect_url }),
            updated_by: user_id
        });

        await carousel.save();
        return successResponse(res, carousel, 'Carousel updated successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.deleteCarousel = async (req, res) => {
    try {
        const { id } = req.params;
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
                    display_order: Sequelize.literal('display_order - 1')
                },
                { 
                    where: {
                        display_order: { [Op.gt]: carousel.display_order }
                    },
                    transaction: t
                }
            );

            // Delete the carousel
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

        return successResponse(res, carousel, 'Carousel details retrieved successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

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

        return successResponse(res, updatedCarousels, 'Display order updated successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}; 