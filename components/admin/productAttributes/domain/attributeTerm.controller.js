const { AttributeTerm, Attribute, User, ProductVariantAttribute, ProductVariant } = require('../../../../models');
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Op } = require('sequelize');
const logger = require("../../../../library/logger");

// Create Term
module.exports.createTerm = async (req, res, next) => {
    const transaction = await AttributeTerm.sequelize.transaction();
    try {
        const { 
            attribute_id,
            name, 
            slug, 
            description 
        } = req.body;
        const { id: updated_by } = req.user;

        // Check if attribute exists
        const attribute = await Attribute.findByPk(attribute_id, { transaction });
        if (!attribute) {
            await transaction.rollback();
            return errorResponse(res, { message: "Attribute not found" }, "Not found", 404);
        }

        // Check if term slug exists for this attribute
        const existingTerm = await AttributeTerm.findOne({
            where: {
                attribute_id,
                slug: slug.toLowerCase()
            },
            transaction
        });

        if (existingTerm) {
            await transaction.rollback();
            return errorResponse(res, { message: "Term with this slug already exists for this attribute" }, "Duplicate slug", 400);
        }

        // Create term
        const newTerm = await AttributeTerm.create({
            attribute_id,
            name,
            slug: slug.toLowerCase(),
            description,
            updated_by
        }, { transaction });

        await transaction.commit();

        return successResponse(
            res, 
            newTerm, 
            "Term created successfully", 
            201
        );

    } catch (error) {
        await transaction.rollback();
        logger.error('Create Term Error:', error);
        return errorResponse(res, error, error.message);
    }
};

// Update Term
module.exports.updateTerm = async (req, res, next) => {
    const transaction = await AttributeTerm.sequelize.transaction();
    try {
        const { id } = req.params;
        const { 
            name, 
            slug, 
            description 
        } = req.body;
        const { id: updated_by } = req.user;

        // Find term
        const term = await AttributeTerm.findByPk(id, { transaction });
        if (!term) {
            await transaction.rollback();
            return errorResponse(res, { message: "Term not found" }, "Not found", 404);
        }

        // If slug is changing, check for duplicates
        if (slug && slug.toLowerCase() !== term.slug) {
            const existingTerm = await AttributeTerm.findOne({
                where: {
                    attribute_id: term.attribute_id,
                    slug: slug.toLowerCase()
                },
                transaction
            });

            if (existingTerm) {
                await transaction.rollback();
                return errorResponse(res, { message: "Term with this slug already exists for this attribute" }, "Duplicate slug", 400);
            }
        }

        // Update term
        await term.update({
            name: name || term.name,
            slug: slug ? slug.toLowerCase() : term.slug,
            description: description !== undefined ? description : term.description,
            updated_by
        }, { transaction });

        await transaction.commit();

        return successResponse(
            res, 
            term, 
            "Term updated successfully"
        );

    } catch (error) {
        await transaction.rollback();
        logger.error('Update Term Error:', error);
        return errorResponse(res, error, error.message);
    }
};

// Delete Term
module.exports.deleteTerm = async (req, res, next) => {
    const transaction = await AttributeTerm.sequelize.transaction();
    try {
        const { id } = req.params;
        const { id: deleted_by } = req.user;

        // Find term
        const term = await AttributeTerm.findByPk(id, { transaction });
        if (!term) {
            await transaction.rollback();
            return errorResponse(res, { message: "Term not found" }, "Not found", 404);
        }

        // Check if term is used in any product variants
        const productVariantAttribute = await ProductVariantAttribute.findOne({
            where: { 
                term_id: id,
                deleted_at: null
            },
            include: [{
                model: ProductVariant,
                as: 'variant',
                where: { deleted_at: null },
                required: true
            }],
            transaction
        });

        if (productVariantAttribute) {
            await transaction.rollback();
            return errorResponse(
                res, 
                { message: "Cannot delete term that is being used in product variants" },
                "Deletion restricted",
                400
            );
        }

        // Update before soft delete
        await term.update({ updated_by: deleted_by }, { transaction });
        await term.destroy({ transaction });

        await transaction.commit();

        return successResponse(
            res,
            null,
            "Term deleted successfully"
        );

    } catch (error) {
        await transaction.rollback();
        logger.error('Delete Term Error:', error);
        return errorResponse(res, error, error.message);
    }
};

// Restore Term
module.exports.restoreTerm = async (req, res, next) => {
    const transaction = await AttributeTerm.sequelize.transaction();
    try {
        const { id } = req.params;
        const { id: updated_by } = req.user;

        // Find the soft-deleted term
        const term = await AttributeTerm.findOne({
            where: { id },
            paranoid: false,
            transaction
        });

        if (!term) {
            await transaction.rollback();
            return errorResponse(res, { message: "Term not found" }, "Not found", 404);
        }

        if (!term.deleted_at) {
            await transaction.rollback();
            return errorResponse(res, { message: "Term is not deleted" }, "Invalid operation", 400);
        }

        // Check if slug is still unique before restore
        const existingTerm = await AttributeTerm.findOne({
            where: {
                attribute_id: term.attribute_id,
                slug: term.slug,
                id: { [Op.ne]: id }
            },
            transaction
        });

        if (existingTerm) {
            await transaction.rollback();
            return errorResponse(
                res, 
                { message: "Cannot restore term. A term with this slug already exists." },
                "Duplicate slug",
                400
            );
        }

        await term.update({ updated_by }, { transaction });
        await term.restore({ transaction });

        await transaction.commit();

        return successResponse(
            res,
            term,
            "Term restored successfully"
        );

    } catch (error) {
        await transaction.rollback();
        logger.error('Restore Term Error:', error);
        return errorResponse(res, error, error.message);
    }
};

// Get Term by ID
module.exports.getTerm = async (req, res, next) => {
    try {
        const { id } = req.params;

        const term = await AttributeTerm.findOne({
            where: { id },
            include: [{
                model: Attribute,
                as: 'attribute',
                attributes: ['id', 'name', 'slug']
            }, {
                model: User,
                as: 'updatedByUser',
                attributes: ['id', 'first_name', 'last_name', 'email']
            }],
            attributes: [
                'id',
                'name',
                'slug',
                'description',
                'created_at',
                'updated_at'
            ]
        });

        if (!term) {
            return errorResponse(res, { message: "Term not found" }, "Not found", 404);
        }

        return successResponse(
            res,
            term,
            "Term retrieved successfully"
        );

    } catch (error) {
        logger.error('Get Term Error:', error);
        return errorResponse(res, error, error.message);
    }
};

// List Terms
module.exports.getTerms = async (req, res, next) => {
    try {
        const {
            attribute_id,
            sort_by = 'created_at',
            order = 'DESC',
            limit = 10,
            offset = 0,
            keyword = '',
            show_deleted = false
        } = req.query;
        console.log(attribute_id);
        // Validate sort_by field
        const allowedSortFields = ['id', 'name', 'slug', 'created_at', 'updated_at'];
        const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'created_at';

        // Validate order
        const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Base query options
        const queryOptions = {
            where: {},
            include: [{
                model: Attribute,
                as: 'attribute',
                attributes: ['id', 'name', 'slug']
            }, {
                model: User,
                as: 'updatedByUser',
                attributes: ['id', 'first_name', 'last_name', 'email']
            }],
            order: [[sortField, sortOrder]],
            limit: parseInt(limit),
            offset: parseInt(offset),
            attributes: [
                'id',
                'name',
                'slug',
                'description',
                'created_at',
                'updated_at',
                'deleted_at'
            ]
        };

        // Add attribute_id filter if provided
        if (attribute_id) {
            queryOptions.where.attribute_id = attribute_id;
        }

        // Add keyword search if provided
        if (keyword) {
            queryOptions.where[Op.or] = [
                {
                    name: {
                        [Op.like]: `%${keyword}%`
                    }
                },
                {
                    slug: {
                        [Op.like]: `%${keyword}%`
                    }
                },
                {
                    description: {
                        [Op.like]: `%${keyword}%`
                    }
                }
            ];
        }

        // Handle deleted records
        if (show_deleted === 'true') {
            queryOptions.paranoid = false;
            queryOptions.where.deleted_at = {
                [Op.ne]: null  // Only show deleted records
            };
        }

        // Get total count for pagination
        const totalCount = await AttributeTerm.count({
            where: queryOptions.where,
            paranoid: queryOptions.paranoid
        });

        // Get terms with pagination
        const terms = await AttributeTerm.findAll(queryOptions);

        // Prepare pagination info
        const paginationInfo = {
            total: totalCount,
            per_page: parseInt(limit),
            current_page: Math.floor(offset / limit) + 1,
            total_pages: Math.ceil(totalCount / limit),
            has_more: offset + terms.length < totalCount
        };

        const responseData = {
            terms: terms,
            pagination: paginationInfo
        };

        return successResponse(
            res,
            responseData,
            "Terms retrieved successfully"
        );

    } catch (error) {
        logger.error('Get Terms Error:', error);
        return errorResponse(res, error, error.message);
    }
}; 