const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Category } = require("../../../models");

module.exports.listAllproducts = async (req, res, next) => {
    try {
        const Categories = await Category.findAll();
        successResponse(res, Categories, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.getProductByid = async (req, res, next) => {
    try {
        const product = await Category.findByPk(req.params.id);
        successResponse(res, product, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.createProduct = async (req, res, next) => {
    try {
        const { name, logo_url } = req.body;
        const { id: updated_by } = req.user
        const product = await Category.create({ name, logo_url, updated_by });
        successResponse(res, product, 'Category created successfully', 201);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}
module.exports.updateProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, logo_url } = req.body;
        const { id: updated_by } = req.user

        const product = await Category.findByPk(id);
        if (!product) {
            throw {
                statusCode: 404,
                message: 'Category not found'
            }
        }

        await product.update({
            ...(name && { name }),
            ...(logo_url && { logo_url }),
            ...(updated_by && { updated_by }),
        });
        successResponse(res, product, 'Category updated successfully',);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.deleteProduct = async (req, res, next) => {
    try {
        const { id } = req.params;
        const product = await Category.findByPk(id);
        if (!product) {
            throw {
                statusCode: 404,
                message: 'Category not found'
            }
        }
        await product.destroy();
        successResponse(res, { message: 'Category deleted successfully' }, null, 204);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}