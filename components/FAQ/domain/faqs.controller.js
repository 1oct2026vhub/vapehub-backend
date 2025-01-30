const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { FAQ } = require("../../../models");

module.exports.listAllfaqs = async (req, res, next) => {
    try {
        const faqs = await FAQ.findAll();
        successResponse(res, faqs, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.getFaqByid = async (req, res, next) => {
    try {
        const faq = await FAQ.findByPk(req.params.id);
        successResponse(res, faq, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.createFaq = async (req, res, next) => {
    try {
        const { name, logo_url } = req.body;
        const { id: updated_by } = req.user
        const faq = await FAQ.create({ name, logo_url, updated_by });
        successResponse(res, faq, 'FAQ created successfully', 201);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}
module.exports.updateFaq = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, logo_url } = req.body;
        const { id: updated_by } = req.user

        const faq = await FAQ.findByPk(id);
        if (!faq) {
            throw {
                statusCode: 404,
                message: 'FAQ not found'
            }
        }

        await faq.update({
            ...(name && { name }),
            ...(logo_url && { logo_url }),
            ...(updated_by && { updated_by }),
        });
        successResponse(res, faq, 'FAQ updated successfully',);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.deleteFaq = async (req, res, next) => {
    try {
        const { id } = req.params;
        const faq = await FAQ.findByPk(id);
        if (!faq) {
            throw {
                statusCode: 404,
                message: 'FAQ not found'
            }
        }
        await faq.destroy();
        successResponse(res, { message: 'FAQ deleted successfully' }, null, 204);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}