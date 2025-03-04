const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Attribute, AttributeTerm, ProductVariantAttribute, ProductVariant, User } = require("../../../../models");
const { Sequelize, Op } = require("sequelize");
const logger = require("../../../../library/logger");

module.exports.createAttribute = async (req, res, next) => {
    const transaction = await Attribute.sequelize.transaction();
    try {
        const { 
            name, 
            slug, 
            description, 
            type = 'select',
            sort_order = 'custom'
        } = req.body;

        const { id: updated_by } = req.user;

        // Check if attribute slug exists (case-insensitive)
        const existingAttribute = await Attribute.findOne({
            where: Sequelize.where(
                Sequelize.fn('LOWER', Sequelize.col('slug')),
                slug.toLowerCase()
            ),
            transaction
        });

        if (existingAttribute) {
            await transaction.rollback();
            return errorResponse(res, { message: "Attribute with this slug already exists" }, "Duplicate attribute slug", 400);
        }

        // Create the attribute
        const newAttribute = await Attribute.create({
            name,
            slug: slug.toLowerCase(),
            description,
            type,
            sort_order,
            updated_by
        }, { transaction });

        // Commit transaction
        await transaction.commit();

        // Prepare response data
        const responseData = {
            ...newAttribute.toJSON()
        };

        return successResponse(
            res, 
            responseData, 
            "Attribute created successfully", 
            201
        );

    } catch (error) {
        await transaction.rollback();
        logger.error('Create Attribute Error:', error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.updateAttribute = async (req, res, next) => {
    const transaction = await Attribute.sequelize.transaction();
    try {
        const { id } = req.params;
        const { 
            name, 
            slug, 
            description, 
            type,
            sort_order
        } = req.body;

        const { id: updated_by } = req.user;

        // Find the attribute
        const attribute = await Attribute.findByPk(id, { transaction });
        if (!attribute) {
            await transaction.rollback();
            return errorResponse(res, { message: "Attribute not found" }, "Not found", 404);
        }

        // If slug is being changed, check for duplicates
        if (slug && slug.toLowerCase() !== attribute.slug) {
            const existingAttribute = await Attribute.findOne({
                where: Sequelize.where(
                    Sequelize.fn('LOWER', Sequelize.col('slug')),
                    slug.toLowerCase()
                ),
                transaction
            });

            if (existingAttribute) {
                await transaction.rollback();
                return errorResponse(res, { message: "Attribute with this slug already exists" }, "Duplicate slug", 400);
            }
        }

        // Update attribute
        await attribute.update({
            name: name || attribute.name,
            slug: slug ? slug.toLowerCase() : attribute.slug,
            description: description !== undefined ? description : attribute.description,
            type: type || attribute.type,
            sort_order: sort_order || attribute.sort_order,
            updated_by
        }, { transaction });

        // Commit transaction
        await transaction.commit();

        // Fetch updated attribute
        const updatedAttribute = await Attribute.findByPk(id);

        return successResponse(
            res, 
            updatedAttribute, 
            "Attribute updated successfully",
            201
        );

    } catch (error) {
        await transaction.rollback();
        logger.error('Update Attribute Error:', error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.deleteAttribute = async (req, res, next) => {
    const transaction = await Attribute.sequelize.transaction();
    try {
        const { id } = req.params;
        const { id: deleted_by } = req.user;

        // Find attribute with transaction
        const attribute = await Attribute.findByPk(id, { transaction });
        if (!attribute) {
            await transaction.rollback();
            return errorResponse(res, { message: "Attribute not found" }, "Not found", 404);
        }

        // Check if attribute is used in any product variants
        const productVariantAttributes = await ProductVariantAttribute.findOne({
            where: { 
                attribute_id: id,
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

        if (productVariantAttributes) {
            await transaction.rollback();
            return errorResponse(
                res, 
                { message: "Cannot delete attribute that is being used in product variants. Please remove from products first." },
                "Deletion restricted",
                400
            );
        }

        // Check if attribute has any associated terms
        const attributeTerms = await AttributeTerm.findOne({
            where: { 
                attribute_id: id,
                deleted_at: null
            },
            transaction
        });

        if (attributeTerms) {
            await transaction.rollback();
            return errorResponse(
                res, 
                { message: "Cannot delete attribute that has terms. Please delete all terms first." },
                "Deletion restricted",
                400
            );
        }

        // Update the deleted_by before soft delete
        await attribute.update({
            updated_by: deleted_by
        }, { transaction });

        // Soft delete the attribute
        await attribute.destroy({ transaction });

        // Commit transaction
        await transaction.commit();

        return successResponse(
            res,
            null,
            "Attribute deleted successfully",
            201
        );

    } catch (error) {
        await transaction.rollback();
        logger.error('Delete Attribute Error:', error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.restoreAttribute = async (req, res, next) => {
    const transaction = await Attribute.sequelize.transaction();
    try {
        const { id } = req.params;
        const { id: updated_by } = req.user;

        // Find the soft-deleted attribute
        const attribute = await Attribute.findOne({
            where: { id },
            paranoid: false,  // Include soft-deleted records
            transaction
        });

        if (!attribute) {
            await transaction.rollback();
            return errorResponse(res, { message: "Attribute not found" }, "Not found", 404);
        }

        if (!attribute.deleted_at) {
            await transaction.rollback();
            return errorResponse(res, { message: "Attribute is not deleted" }, "Invalid operation", 400);
        }

        // Check if slug is still unique before restore
        const existingAttribute = await Attribute.findOne({
            where: Sequelize.where(
                Sequelize.fn('LOWER', Sequelize.col('slug')),
                attribute.slug.toLowerCase()
            ),
            transaction
        });

        if (existingAttribute) {
            await transaction.rollback();
            return errorResponse(
                res, 
                { message: "Cannot restore attribute. An attribute with this slug already exists." },
                "Duplicate slug",
                400
            );
        }

        // Update the updated_by
        await attribute.update({
            updated_by
        }, { transaction });

        // Restore the attribute
        await attribute.restore({ transaction });

        // Commit transaction
        await transaction.commit();

        // Fetch the restored attribute
        const restoredAttribute = await Attribute.findByPk(id);

        return successResponse(
            res,
            restoredAttribute,
            "Attribute restored successfully"
        );

    } catch (error) {
        await transaction.rollback();
        logger.error('Restore Attribute Error:', error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.getAttribute = async (req, res, next) => {
    try {
        const { id } = req.params;

        const attribute = await Attribute.findOne({
            where: { id },
            include: [{
                model: AttributeTerm,
                as: 'terms',
                where: { deleted_at: null },
                required: false,
                order: [['name', 'ASC']],
                attributes: [
                    'id',
                    'name',
                    'slug',
                    'description',
                    'created_at',
                    'updated_at'
                ]
            }, {
                model: User,
                as: 'updatedByUser',
                attributes: ['id', 'first_name', 'last_name', 'email'],
                required: false
            }],
            attributes: [
                'id',
                'name',
                'slug',
                'description',
                'type',
                'sort_order',
                'created_at',
                'updated_at'
            ]
        });

        if (!attribute) {
            return errorResponse(res, { message: "Attribute not found" }, "Not found", 404);
        }

        return successResponse(
            res,
            attribute,
            "Attribute retrieved successfully"
        );

    } catch (error) {
        logger.error('Get Attribute Error:', error);
        return errorResponse(res, error, error.message);
    }
};

module.exports.getAttributes = async (req, res, next) => {
    try {
        const {
            sort_by = 'created_at',
            order = 'DESC',
            limit = 10,
            offset = 0,
            keyword = '',
            show_deleted = false
        } = req.query;

        // Validate sort_by field
        const allowedSortFields = ['id', 'name', 'slug', 'type', 'sort_order', 'created_at', 'updated_at'];
        const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'created_at';

        // Validate order
        const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

        // Base query options
        const queryOptions = {
            where: {},
            include: [{
                model: AttributeTerm,
                as: 'terms',
                where: { deleted_at: null },
                required: false,
                attributes: ['id', 'name']
            }, {
                model: User,
                as: 'updatedByUser',
                attributes: ['id', 'first_name', 'last_name', 'email'],
                required: false
            }],
            order: [[sortField, sortOrder]],
            limit: parseInt(limit),
            offset: parseInt(offset),
            attributes: [
                'id',
                'name',
                'slug',
                'description',
                'type',
                'sort_order',
                'created_at',
                'updated_at',
                'deleted_at'
            ],
            paranoid: show_deleted !== 'true'
        };

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
        const totalCount = await Attribute.count({
            where: queryOptions.where,
            paranoid: queryOptions.paranoid
        });

        // Get attributes with pagination
        const attributes = await Attribute.findAll(queryOptions);

        // Prepare pagination info
        const paginationInfo = {
            total: totalCount,
            per_page: parseInt(limit),
            current_page: Math.floor(offset / limit) + 1,
            total_pages: Math.ceil(totalCount / limit),
            has_more: offset + attributes.length < totalCount
        };

        // Prepare response data
        const responseData = {
            attributes: attributes,
            pagination: paginationInfo
        };

        return successResponse(
            res,
            responseData,
            "Attributes retrieved successfully"
        );

    } catch (error) {
        logger.error('Get Attributes Error:', error);
        return errorResponse(res, error, error.message);
    }
};



