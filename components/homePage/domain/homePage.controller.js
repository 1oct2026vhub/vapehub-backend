const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Carousel, BannerImage } = require("../../../models");
const { uploadFiletToS3 } = require("../../../library/s3/s3Helper");


module.exports.getHomeCarousel = async (req, res, next) => {
    try {
        const carousels = await Carousel.findAll({
            order: [
                ["display_order", "ASC"]
            ]
        });
        successResponse(res, carousels, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

module.exports.createHomeCarousel = async (req, res, next) => {
    try {
        const user_id = req?.user?.id;
        const { display_order, image_url, image_url_mid, image_url_low, title, description } = req.body;
        const existing = await Carousel.findAll({ where: { display_order } })
        if (existing.length > 0) {
            throw {
                message: "display_order already exists",
                statusCode: 400,
            }
        }
        const carousel = await Carousel.create({ display_order, image_url, image_url_mid, image_url_low, title, description, updated_by: user_id })
        successResponse(res, carousel, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}
module.exports.uploadBannerImage = async (req, res, next) => {
    try {
        if (!req.file) {
            return errorResponse(res, { message: "No file uploaded" }, "No file uploaded", 400);
        }
        const user_id = req?.user?.id;
        const file = req.file;
        const { originalname, mimetype, buffer } = file;
        const fileName = `public-images/${user_id}_${Date.now()}_${originalname}`;
        const params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: fileName,
            Body: buffer,
            ContentType: mimetype
        }

        // Upload image to S3 (or any cloud storage)
        const imageUrl = await uploadFiletToS3(params);

        return successResponse(res, imageUrl, "Image uploaded successfully");
    } catch (error) {
        return errorResponse(res, error, error.message || "Failed to upload image", 500);
    }
};

module.exports.addBannerImage = async (req, res, next) => {
    try {
        const user_id = req?.user?.id;
        const { display_order, image_url, image_url_mid, image_url_low, title, description } = req.body;
        const existing = await BannerImage.findAll({ where: { display_order } })
        if (existing.length > 0) {
            throw {
                message: "display_order already exists",
                statusCode: 400,
            }
        }
        const banner = await BannerImage.create({ display_order, image_url, image_url_mid, image_url_low, title, description, updated_by: user_id })
        successResponse(res, banner, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.getBannerImages = async (req, res, next) => {
    try {
        const banners = await BannerImage.findAll({
            order: [
                ["display_order", "ASC"]
            ]
        });
        successResponse(res, banners, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}