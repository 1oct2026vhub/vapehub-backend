const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Brand } = require("../../../models");
const { fetchProducts } = require("../../product/helper/product.helper");
const { Op } = require("sequelize");

module.exports.listAllbrands = async (req, res, next) => {
    try {
        const { sort } = req.query
        const brands = await Brand.findAll({
            order: [
                ['createdAt', sort === 'ASC' ? 'ASC' : 'DESC'],
            ],
        });
        successResponse(res, brands, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}

module.exports.getBrandByid = async (req, res, next) => {
    try {
        const brand = await Brand.findByPk(req.params.id);
        if (!brand) {
            throw {
                message: "Brand not found",
                statusCode: 400,
            }
        }
        successResponse(res, brand, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

module.exports.createBrand = async (req, res, next) => {
    try {
        const { name, logo_url, slug, description } = req.body;
        const { id: updated_by } = req.user
        const brand = await Brand.create({ name, logo_url, updated_by, slug, description });
        successResponse(res, brand, 'Brand created successfully', 201);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

module.exports.updateBrand = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, logo_url, slug, description } = req.body;
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
            ...(description && { description }),
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

module.exports.getBrandBySlug = async (req, res, next) => {
    try {
        const brand = await Brand.findOne({ where: { slug: req.params.slug } });
        // fetch related product
        req.query.brands = `${brand.id}`
        const product = await fetchProducts(req.query)

        if (!brand) {
            throw {
                message: "Brand not found",
                statusCode: 400,
            };
        }
        return successResponse(res, { ...brand.get({ plain: true }), ...product }, "Success");
    } catch (error) {
        console.log("🚀 ~ module.exports.getBrandBySlug= ~ error:", error)
        return errorResponse(res, error, error.message);
    }
}

module.exports.listBrandsWithPagination = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        // Build where clause for search
        const whereClause = search ? {
            [Op.or]: [
                { name: { [Op.iLike]: `%${search}%` } },
                { description: { [Op.iLike]: `%${search}%` } }
            ]
        } : {};

        const { count, rows: brands } = await Brand.findAndCountAll({
            where: whereClause,
            limit,
            offset,
            order: [['id', 'DESC']],
            attributes: ['id', 'name', 'logo_url', 'slug', 'description']
        });

        const totalPages = Math.ceil(count / limit);

        successResponse(res, {
            brands,
            pagination: {
                currentPage: page,
                totalPages,
                totalItems: count,
                itemsPerPage: limit,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1
            }
        }, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}