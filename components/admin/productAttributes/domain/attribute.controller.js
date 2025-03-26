const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Attribute, AttributeTerm, ProductVariantAttribute, ProductVariant, User, SlugRelation } = require("../../../../models");
const { Sequelize, Op } = require("sequelize");
const logger = require("../../../../library/logger");
const ExcelJS = require('exceljs');
const SlugManager = require("../../../../utils/slugManager");

const slugManager = new SlugManager(SlugRelation);

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

        // Create slug relation
        await slugManager.createOrUpdateSlug(newAttribute.slug, 'attribute', newAttribute.id, transaction);

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

        // Update slug relation if slug has changed
        if (slug && slug.toLowerCase() !== attribute.slug) {
            await slugManager.createOrUpdateSlug(slug.toLowerCase(), 'attribute', id, transaction);
        }

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

        // Delete slug relation first
        await slugManager.deleteSlug('attribute', id, transaction);

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

        // Recreate slug relation
        await slugManager.createOrUpdateSlug(attribute.slug, 'attribute', attribute.id, transaction);

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
            const searchConditions = [];
            
            // Check if keyword is numeric for ID search
            const numericKeyword = parseInt(keyword);
            if (!isNaN(numericKeyword)) {
                searchConditions.push({ id: numericKeyword });
            }
            
            // Add text field searches
            searchConditions.push(
                { name: { [Op.like]: `%${keyword}%` } },
                { slug: { [Op.like]: `%${keyword}%` } },
                { description: { [Op.like]: `%${keyword}%` } }
            );
            
            queryOptions.where[Op.or] = searchConditions;
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

/**
 * Bulk creates or updates attributes from an Excel file.
 * If an attribute does not exist, a new attribute will be created.
 */
module.exports.bulkCreateOrUpdateAttributes = async (req, res, next) => {
    const transaction = await Attribute.sequelize.transaction(); 
    try {
        const { file } = req;
        if (!file) {
            await transaction.rollback();
            throw new Error("No file uploaded");
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(file.buffer);
        const worksheet = workbook.worksheets[0];

        const headerRow = worksheet.getRow(1).values;
        const isFirstHeaderEmpty = !headerRow[0] || headerRow[0] !== 'Name';

        let results = [];

        for (const row of worksheet.getRows(2, worksheet.rowCount - 1)) {
            const rowValues = isFirstHeaderEmpty ? row.values.slice(1) : row.values;
            const [name, slug, description, type, sort_order] = rowValues;

            if (!slug) continue; // Skip empty slugs to prevent errors

            const result = await processAttribute(slug, name, description, type, sort_order, transaction);
            results.push(result);
        }

        await transaction.commit();
        return successResponse(res, { results }, "Attributes processed successfully");

    } catch (error) {
        await transaction.rollback(); // Rollback transaction only in case of an error
        console.error('Error during bulk update:', error);
        return errorResponse(res, { message: error.message }, error.message);
    }
};

const processAttribute = async (slug, name, description, type, sort_order, transaction) => {
    let attribute = await Attribute.findOne({ 
        where: { slug: { [Op.like]: slug.trim().toLowerCase() } }, 
        transaction 
    });

    try {
        if (!attribute) {
            attribute = await Attribute.create({
                name: typeof name === 'string' ? name.trim() : name,
                slug: typeof slug === 'string' ? slug.trim().toLowerCase() : slug,
                description: typeof description === 'string' ? description.trim() : description,
                type: type || 'select',
                sort_order: sort_order || 'custom'
            }, { transaction });

            return { slug, status: 'Created', id: attribute.id };
        } else {
            await attribute.update({
                name: typeof name === 'string' ? name.trim() : attribute.name,
                description: typeof description === 'string' ? description.trim() : attribute.description,
                type: type || attribute.type,
                sort_order: sort_order || attribute.sort_order,
            }, { transaction });

            return { slug, status: 'Updated', id: attribute.id };
        }
    } catch (updateError) {
        return { slug, status: 'Error', message: updateError.message };
    }
};

/**
 * Generates and downloads a sample Excel file for attributes.
 */
module.exports.downloadSampleAttributes = async (req, res, next) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Attributes');

        // Add column headers
        worksheet.columns = [
            { header: 'Name', key: 'name', width: 30 },
            { header: 'Slug', key: 'slug', width: 30 },
            { header: 'Description', key: 'description', width: 50 },
            { header: 'Type', key: 'type', width: 20 },
            { header: 'Sort Order', key: 'sort_order', width: 20 },
        ];

        // Sample data for attributes
        worksheet.addRow({ name: 'Color', slug: 'color', description: 'Attribute for color', type: 'select', sort_order: 'custom' });
        worksheet.addRow({ name: 'Size', slug: 'size', description: 'Attribute for size', type: 'select', sort_order: 'custom' });
        worksheet.addRow({ name: 'Material', slug: 'material', description: 'Attribute for material', type: 'select', sort_order: 'custom' });

        // Set the response headers
        res.setHeader('Content-Disposition', 'attachment; filename=SampleAttributes.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        // Write the workbook to the response
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};




