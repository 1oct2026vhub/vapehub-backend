const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Testimonial, User } = require("../../../models");

module.exports.listAlltestimonials = async (req, res, next) => {
    try {
        const testimonials = await Testimonial.findAll({
            include: {
                model: User,
                as: 'User',
                attributes: ['id', 'first_name', 'last_name', 'email']
            }
        });
        successResponse(res, testimonials, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.getTestimonialByid = async (req, res, next) => {
    try {
        const testimonial = await Testimonial.findByPk(req.params.id, {
            include: {
                model: User,
                as: 'User',
                attributes: ['id', 'first_name', 'last_name', 'email']
            }
        });
        if (!testimonial) {
            throw {
                message: "Testimonial not found",
                statusCode: 400,
            }
        }
        successResponse(res, testimonial, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.createTestimonial = async (req, res, next) => {
    try {
        const { rating, content, product_id = null } = req.body;
        const { id: user_id } = req.user;
        const updated_by = req.user?.id ?? null;
        const testimonial = await Testimonial.create({ rating, content, product_id, user_id, updated_by });
        console.log("🚀 ~ module.exports.createTestimonial= ~ req.user:", req.user)
        successResponse(res, testimonial, 'Testimonial created successfully', 201);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}
module.exports.updateTestimonial = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { rating, content, product_id = null} = req.body;
        const { id: user_id } = req.user;
        const updated_by = req.user?.id ?? null;

        const testimonial = await Testimonial.findByPk(id);
        if (!testimonial) {
            throw {
                statusCode: 404,
                message: 'Testimonial not found'
            }
        }

        await testimonial.update({
            ...(rating && { rating }),
            ...(content && { content }),
            ...(product_id && { product_id }),
            ...(user_id && { user_id }),
            ...(updated_by != null && { updated_by }),
        });
        successResponse(res, testimonial, 'Testimonial updated successfully',);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.deleteTestimonial = async (req, res, next) => {
    try {
        const { id } = req.params;
        const testimonial = await Testimonial.findByPk(id);
        if (!testimonial) {
            throw {
                statusCode: 404,
                message: 'Testimonial not found'
            }
        }
        await testimonial.destroy({ force: true });
        successResponse(res, { message: 'Testimonial deleted successfully' }, "Success", 200);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

module.exports.getTestimonialBySlug = async (req, res, next) => {
    try {
        const testimonial = await Testimonial.findOne({
            where: { slug: req.params.slug }, include: {
                model: User,
                as: 'User',
                attributes: ['id', 'first_name', 'last_name', 'email']
            }
        });

        if (!testimonial) {
            throw {
                message: "Testimonial not found",
                statusCode: 400,
            };
        }
        return successResponse(res, { ...testimonial.get({ plain: true }), ...product }, "Success");
    } catch (error) {
        console.log("🚀 ~ module.exports.getTestimonialBySlug= ~ error:", error)
        return errorResponse(res, error, error.message);
    }
}