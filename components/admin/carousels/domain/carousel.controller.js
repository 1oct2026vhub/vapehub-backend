const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Carousel } = require("../../../../models");
const { uploadFiletToS3 } = require("../../../../library/s3/s3Helper");
const { Op } = require("sequelize");

// Helper function to handle image upload
const uploadImageToS3 = async (file, prefix) => {
    return uploadFiletToS3({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: `carousels/${prefix}-${Date.now()}-${file.originalname}`,
        Body: file.buffer,
        ContentType: file.mimetype
    });
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
    
    if (!imageUrl.includes(process.env.AWS_S3_BUCKET)) return;
    
    try {
        const key = imageUrl.split('/').pop();
        await uploadFiletToS3({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: `carousels/${key}`,
            Delete: true
        });
    } catch (error) {
        console.log('Error deleting image from S3:', error);
    }
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
        const { display_order, title, description } = req.body;
        const files = req.files;

        if (!files.image || !files.image_mid || !files.image_low) {
            const error = new Error("All three images (original, medium, and low) are required");
            error.statusCode = 400;
            throw error;
        }

        await validateDisplayOrder(display_order);

        const [image_url, image_url_mid, image_url_low] = await Promise.all([
            uploadImageToS3(files.image[0], 'original'),
            uploadImageToS3(files.image_mid[0], 'mid'),
            uploadImageToS3(files.image_low[0], 'low')
        ]);

        const carousel = await Carousel.create({
            display_order,
            image_url,
            image_url_mid,
            image_url_low,
            title,
            description,
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
        const { display_order, title, description } = req.body;
        const files = req.files;

        const carousel = await Carousel.findByPk(id);
        if (!carousel) {
            const error = new Error("Carousel not found");
            error.statusCode = 404;
            throw error;
        }

        await validateDisplayOrder(display_order, carousel.display_order);

        if (files) {
            try {
                if (files.image) {
                    await deleteImageFromS3(carousel.image_url);
                    carousel.image_url = await uploadImageToS3(files.image[0], 'original');
                }
                if (files.image_mid) {
                    await deleteImageFromS3(carousel.image_url_mid);
                    carousel.image_url_mid = await uploadImageToS3(files.image_mid[0], 'mid');
                }
                if (files.image_low) {
                    await deleteImageFromS3(carousel.image_url_low);
                    carousel.image_url_low = await uploadImageToS3(files.image_low[0], 'low');
                }
            } catch (error) {
                const err = new Error('Error processing images');
                err.statusCode = 500;
                throw err;
            }
        }

        Object.assign(carousel, {
            ...(display_order && { display_order }),
            ...(title && { title }),
            ...(description && { description }),
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

        await carousel.destroy();
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