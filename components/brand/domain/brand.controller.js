const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Brand } = require("../../../models");

module.exports.listAllbrands = async (req, res, next) => {
    try {
        const brands = await Brand.findAll();
        successResponse(res, brands, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.getBrandByid = async (req, res, next) => {
    try {
        const brand = await Brand.findByPk(req.params.id);
        successResponse(res, brand, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.createBrand = async (req, res, next) => {
    try {
        const { name, logo_url, slug } = req.body;
        const { id: updated_by } = req.user
        const brand = await Brand.create({ name, logo_url, updated_by, slug });
        successResponse(res, brand, 'Brand created successfully', 201);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}
module.exports.updateBrand = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, logo_url, slug } = req.body;
        const { id: updated_by } = req.user

        const brand = await Brand.findByPk(id);
        if (!brand) {
            throw {
                statusCode: 404,
                message: 'Brand not found'
            }
        }

        await brand.update({
            ...(name && { name }),
            ...(slug && { slug }),
            ...(logo_url && { logo_url }),
            ...(updated_by && { updated_by }),
        });
        successResponse(res, brand, 'Brand updated successfully',);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.deleteBrand = async (req, res, next) => {
    try {
        const { id } = req.params;
        const brand = await Brand.findByPk(id);
        if (!brand) {
            throw {
                statusCode: 404,
                message: 'Brand not found'
            }
        }
        await brand.destroy({ force: true });
        successResponse(res, { message: 'Brand deleted successfully' }, "Success", 200);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}