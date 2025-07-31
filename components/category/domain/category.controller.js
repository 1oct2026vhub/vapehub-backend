const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Category, Product, ProductCategory, ProductBrand, Brand } = require("../../../models");
const { fetchProducts } = require("../../product/helper/product.helper");

module.exports.listAllcategories = async (req, res, next) => {
    try {
        const Categories = await Category.findAll({
            order: [['createdAt', 'DESC']]
        });
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
        const { productId } = req.query;

        if (productId) {
            // Get category ID for this product
            const productCategory = await ProductCategory.findOne({
                where: { product_id: productId },
                include: [{
                    model: Category,
                    as: 'Category',
                    attributes: ['id']
                }]
            });

            // Get brand ID for this product
            const productBrand = await ProductBrand.findOne({
                where: { product_id: productId },
                include: [{
                    model: Brand,
                    as: 'Brand',
                    attributes: ['id']
                }]
            });

            // Set category and brand IDs from the product for fetchProducts
            if (productCategory?.Category?.id) {
                req.query.categories = `${productCategory.Category.id}`;
            }
            if (productBrand?.Brand?.id) {
                req.query.brand = `${productBrand.Brand.id}`;
            }
            req.query.source = 'product';
            
            // Remove variant filtering when fetching by both category and brand
            // delete req.query.variant;
        } else {
            // Original logic when no productId is provided
            const category = await Category.findOne({ where: { slug: req.params.slug } });
            if (!category) {
                throw {
                    message: "Category not found",
                    statusCode: 400,
                };
            }
            req.query.categories = `${category.id}`;
            req.query.source = 'category';
        }
        // const { products, attributes,filters, price_ranges, brands, pagination } = await fetchProducts(req.query);
        const {additionalData, products, brand_items, attributes, deal_items, price_ranges, pagination } = await fetchProducts(req.query);

        return successResponse(res, { 
            ...additionalData,
            products,
            brand: brand_items, 
            attributes,
            deal:deal_items,
            price_ranges,
            pagination
        }, "Success");
    } catch (error) {
        console.log("🚀 ~ module.exports.getCategoryBySlug= ~ error:", error)
        return errorResponse(res, error, error.message);
    }
}