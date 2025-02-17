const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Carousel } = require("../../../models");


module.exports.getHomeCarousel = async (req, res, next) => {
    try {
        const carousels = await Carousel.findAll();
        successResponse(res, carousels, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

module.exports.createHomeCarousel = async (req, res, next) => {
    try {
        const user_id = req?.user?.id;
        const { order, image_url, image_url_mid, image_url_low, title, description } = req.body;
        const existing = await Carousel.findAll({ where: { order } })
        if (existing.length > 0) {
            throw {
                message: "Order already exists",
                statusCode: 400,
            }
        }
        const carousel = await Carousel.create({ order, image_url, image_url_mid, image_url_low, title, description, updated_by: user_id })
        successResponse(res, carousel, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}