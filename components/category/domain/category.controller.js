const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Category } = require("../../../models");
const { fetchProducts } = require("../../product/helper/product.helper");

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
        if (!category) {
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
        const { name, logo_url, slug, description } = req.body;
        const { id: updated_by } = req.user;
        // check if category already exists
        const categoryExists = await Category.findOne({ where: { name } });
        if (categoryExists) {
            throw {
                message: "Category name already exists",
                statusCode: 400,
                errors: { name: "Category name already exists" },
            }
        }

        // Create new category
        const category = await Category.create({ name, logo_url, updated_by, slug, description });
        successResponse(res, category, 'Category created successfully', 201);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}
module.exports.updateCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, slug, logo_url, description } = req.body;
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
            ...(description && { description }),
            ...(description && { description }),
        });
        successResponse(res, category, 'Category updated successfully',);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.deleteCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const category = await Category.findByPk(id, { plain: true });
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

module.exports.getCategoryBySlug = async (req, res, next) => {
    try {
        const category = await Category.findOne({ where: { slug: req.params.slug } });
        if (!category) {
            throw {
                message: "Category not found",
                statusCode: 400,
            };
        }
        req.query.categories = `${category.id}`;
        req.query.source = 'category';
        // const { products, attributes,filters, price_ranges, brands, pagination } = await fetchProducts(req.query);
        const { products, brand, attributes, price_ranges, pagination } = await fetchProducts(req.query);

        return successResponse(res, { 
            // ...category.get({ plain: true }), 
            products,
            brand, 
            attributes,
            price_ranges,
            pagination,
             // Since we're querying by slug, there will be only one category
        }, "Success");
    } catch (error) {
        console.log("🚀 ~ module.exports.getCategoryBySlug= ~ error:", error)
        return errorResponse(res, error, error.message);
    }
}