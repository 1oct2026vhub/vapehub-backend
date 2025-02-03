const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Category } = require("../../../models");

module.exports.listAllcategories = async (req, res, next) => {
    try {
        const Categories = await Category.findAll();
        successResponse(res, Categories, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.getCategoryByid = async (req, res, next) => {
    try {
        const category = await Category.findByPk(req.params.id);
        if(!category){
            throw {
                message: "Category not found",
                statusCode: 400,
            }
        }
        successResponse(res, category, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.createCategory = async (req, res, next) => {
    try {
        const { name, logo_url, slug } = req.body;
        const { id: updated_by } = req.user
        const category = await Category.create({ name, logo_url, updated_by, slug });
        successResponse(res, category, 'Category created successfully', 201);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}
module.exports.updateCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, slug, logo_url } = req.body;
        const { id: updated_by } = req.user

        const category = await Category.findByPk(id);
        if (!category) {
            throw {
                statusCode: 404,
                message: 'Category not found'
            }
        }

        await category.update({
            ...(name && { name }),
            ...(slug && { slug }),
            ...(logo_url && { logo_url }),
            ...(updated_by && { updated_by }),
        });
        successResponse(res, category, 'Category updated successfully',);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.deleteCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const category = await Category.findByPk(id);
        if (!category) {
            throw {
                statusCode: 404,
                message: 'Category not found'
            }
        }
        await category.destroy({ force: true });
        successResponse(res, { message: 'Category deleted successfully' }, 'Category deleted successfully', 200);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}