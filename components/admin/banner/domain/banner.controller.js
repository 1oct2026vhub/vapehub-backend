const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { BannerImage } = require("../../../../models");
const { Op } = require("sequelize");
const { uploadFiletToS3 } = require("../../../../library/s3/s3Helper");

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
            paranoid: !deleted // If deleted is true, include soft-deleted items
        });

        // Get banners with pagination
        const banners = await BannerImage.findAll({
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
            results: banners
        }, 'Banners retrieved successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.createBanner = async (req, res) => {
    try {
        const user_id = req?.user?.id;
        const { display_order, title, description, status, redirect_url } = req.body;
        const files = req.files;

        // Check if all required images are uploaded
        if (!files.image || !files.image_mid || !files.image_low) {
            const error = new Error("All three images (original, medium, and low) are required");
            error.statusCode = 400;
            throw error;
        }

        // Check for existing display order
        const existing = await BannerImage.findOne({ where: { display_order } });
        if (existing) {
            const error = new Error("display_order already exists");
            error.statusCode = 400;
            throw error;
        }

        // Upload all images to S3
        const [image_url, image_url_mid, image_url_low] = await Promise.all([
            uploadFiletToS3({
                Bucket: process.env.AWS_S3_BUCKET,
                Key: `banners/original-${Date.now()}-${files.image[0].originalname}`,
                Body: files.image[0].buffer,
                ContentType: files.image[0].mimetype
            }),
            uploadFiletToS3({
                Bucket: process.env.AWS_S3_BUCKET,
                Key: `banners/mid-${Date.now()}-${files.image_mid[0].originalname}`,
                Body: files.image_mid[0].buffer,
                ContentType: files.image_mid[0].mimetype
            }),
            uploadFiletToS3({
                Bucket: process.env.AWS_S3_BUCKET,
                Key: `banners/low-${Date.now()}-${files.image_low[0].originalname}`,
                Body: files.image_low[0].buffer,
                ContentType: files.image_low[0].mimetype
            })
        ]);

        const banner = await BannerImage.create({
            display_order,
            image_url,
            image_url_mid,
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
    });
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
    if (!imageUrl.includes(process.env.AWS_S3_BUCKET)) return;
    
    try {
        const key = imageUrl.split('/').pop();
        await uploadFiletToS3({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: `banners/${key}`,
            Delete: true
        });
    } catch (error) {
        console.log('Error deleting image from S3:', error);
        // Don't throw error as this is not critical
    }
};

// Helper function to update banner images
const updateBannerImages = async (banner, files) => {
    if (files.image) {
        await deleteImageFromS3(banner.image_url);
        banner.image_url = await uploadImageToS3(files.image[0], 'original');
    }
    if (files.image_mid) {
        await deleteImageFromS3(banner.image_url_mid);
        banner.image_url_mid = await uploadImageToS3(files.image_mid[0], 'mid');
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
        const { display_order, title, description, status, redirect_url } = req.body;
        const files = req.files;

        const banner = await BannerImage.findByPk(id);
        if (!banner) {
            throw { statusCode: 404, message: "Banner not found" };
        }

        await validateDisplayOrder(display_order, banner.display_order);

        if (files) {
            await updateBannerImages(banner, files);
        }

        Object.assign(banner, {
            ...(display_order && { display_order }),
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

        await banner.destroy();
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