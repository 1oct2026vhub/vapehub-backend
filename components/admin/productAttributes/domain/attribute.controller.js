const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Attribute, AttributeTerm, ProductVariantAttribute, ProductVariant, User, SlugRelation } = require("../../../../models");
const { Sequelize, Op } = require("sequelize");
const logger = require("../../../../library/logger");
const ExcelJS = require('exceljs');
const SlugManager = require("../../../../utils/slugManager");
const AWS = require("aws-sdk");
const { uploadFiletToS3, generateUniqueFileName } = require("../../../../library/s3/s3Helper");

const slugManager = new SlugManager(SlugRelation);
const s3 = new AWS.S3();

// Helper function for image upload
const uploadAttributeImage = async (file, attributeId) => {
    const { originalname, mimetype, buffer } = file;
    const fileName = generateUniqueFileName(originalname);
    const params = {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: `attributes/${attributeId}/${fileName}`,
        Body: buffer,
        ContentType: mimetype
    };
    return uploadFiletToS3(params);
};

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
        const file = req.file; // Get uploaded file

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

        // Handle image upload if file exists
        let imageUrl = null;
        if (file) {
            const { Location } = await uploadAttributeImage(file, newAttribute.id);
            imageUrl = Location;
            await newAttribute.update({ image_url: imageUrl }, { transaction });
        }

        // Create slug relation
        await slugManager.createOrUpdateSlug(newAttribute.slug, 'attribute', newAttribute.id, transaction);

        // Commit transaction
        await transaction.commit();

        // Prepare response data
        const responseData = {
            ...newAttribute.toJSON(),
            image_url: imageUrl
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
            sort_order,
            new_image = false
        } = req.body;

        const { id: updated_by } = req.user;
        const file = req.file;

        // Find the attribute
        const attribute = await Attribute.findByPk(id, { transaction });
        if (!attribute) {
            await transaction.rollback();
            return errorResponse(res, { message: "Attribute not found" }, "Not found", 404);
        }

        // Handle image update if new_image is true and file exists
        if (new_image && file) {
            // Delete old image if exists
            if (attribute.image_url) {
                const oldKey = attribute.image_url.split(".amazonaws.com/")[1];
                await s3.deleteObject({
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: oldKey
                }).promise();
            }

            // Upload new image
            const { Location } = await uploadAttributeImage(file, id);
            await attribute.update({ image_url: Location }, { transaction });
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
            "Attribute updated successfully"
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

/**
 * Bulk soft-deletes attributes by IDs.
 */
module.exports.bulkDeleteAttributes = async (req, res, next) => {
    try {
        const { ids } = req.body;
        const { id: deleted_by } = req.user;

        const deletedAttributes = [];
        const notDeletedAttributes = [];

        for (const rawId of ids) {
            const id = Number(rawId);
            const t = await Attribute.sequelize.transaction();
            try {
                // Find attribute
                const attribute = await Attribute.findByPk(id, { transaction: t });
                
                if (!attribute) {
                    await t.rollback();
                    notDeletedAttributes.push({ 
                        id, 
                        reason: 'Attribute not found' 
                    });
                    continue;
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
                    transaction: t
                });

                if (productVariantAttributes) {
                    await t.rollback();
                    notDeletedAttributes.push({ 
                        id, 
                        name: attribute.name,
                        reason: 'Cannot delete attribute that is being used in product variants. Please remove from products first.' 
                    });
                    continue;
                }

                // Check if attribute has any associated terms
                const attributeTerms = await AttributeTerm.findOne({
                    where: { 
                        attribute_id: id,
                        deleted_at: null
                    },
                    transaction: t
                });

                if (attributeTerms) {
                    await t.rollback();
                    notDeletedAttributes.push({ 
                        id, 
                        name: attribute.name,
                        reason: 'Cannot delete attribute that has terms. Please delete all terms first.' 
                    });
                    continue;
                }

                // Update the deleted_by before soft delete
                await attribute.update({
                    updated_by: deleted_by
                }, { transaction: t });

                // Delete slug relation first
                await slugManager.deleteSlug('attribute', id, t);

                // Soft delete the attribute
                await attribute.destroy({ transaction: t });

                await t.commit();
                
                deletedAttributes.push({ 
                    id: attribute.id, 
                    name: attribute.name,
                    slug: attribute.slug 
                });
            } catch (error) {
                await t.rollback();
                notDeletedAttributes.push({ 
                    id, 
                    reason: error.message || 'Failed to delete attribute' 
                });
                logger.error(`Error deleting attribute ${id}:`, error);
            }
        }

        const responseData = {
            deleted: deletedAttributes,
            not_deleted: notDeletedAttributes,
            summary: {
                total_requested: ids.length,
                deleted_count: deletedAttributes.length,
                not_deleted_count: notDeletedAttributes.length,
            },
        };

        const statusCode = deletedAttributes.length > 0 ? 200 : 400;
        const message = deletedAttributes.length === ids.length
            ? 'All attributes deleted successfully'
            : deletedAttributes.length > 0
                ? 'Some attributes deleted successfully'
                : 'No attributes were deleted';

        return successResponse(res, responseData, message, statusCode);
    } catch (error) {
        logger.error('Bulk delete attributes error:', error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Bulk restores soft-deleted attributes by IDs.
 */
module.exports.bulkRestoreAttributes = async (req, res, next) => {
    try {
        const { ids } = req.body;
        const { id: updated_by } = req.user;

        const restoredAttributes = [];
        const notRestoredAttributes = [];

        for (const rawId of ids) {
            const id = Number(rawId);
            const t = await Attribute.sequelize.transaction();
            try {
                // Find the soft-deleted attribute
                const attribute = await Attribute.findOne({
                    where: { id },
                    paranoid: false,
                    transaction: t
                });
                
                if (!attribute) {
                    await t.rollback();
                    notRestoredAttributes.push({ 
                        id, 
                        reason: 'Attribute not found' 
                    });
                    continue;
                }

                // Check if the attribute is already active
                if (!attribute.deleted_at) {
                    await t.rollback();
                    notRestoredAttributes.push({ 
                        id, 
                        name: attribute.name,
                        reason: 'Attribute is already active (not deleted)' 
                    });
                    continue;
                }

                // Check if slug is still unique before restore
                const existingAttribute = await Attribute.findOne({
                    where: Sequelize.where(
                        Sequelize.fn('LOWER', Sequelize.col('slug')),
                        attribute.slug.toLowerCase()
                    ),
                    transaction: t
                });

                if (existingAttribute) {
                    await t.rollback();
                    notRestoredAttributes.push({ 
                        id, 
                        name: attribute.name,
                        reason: 'Cannot restore attribute. An attribute with this slug already exists.' 
                    });
                    continue;
                }

                // Update the updated_by
                await attribute.update({
                    updated_by
                }, { transaction: t });

                // Restore the attribute
                await attribute.restore({ transaction: t });

                // Recreate slug relation
                await slugManager.createOrUpdateSlug(attribute.slug, 'attribute', attribute.id, t);

                await t.commit();

                restoredAttributes.push({ 
                    id: attribute.id, 
                    name: attribute.name,
                    slug: attribute.slug 
                });
            } catch (error) {
                await t.rollback();
                notRestoredAttributes.push({ 
                    id, 
                    reason: error.message || 'Failed to restore attribute' 
                });
                logger.error(`Error restoring attribute ${id}:`, error);
            }
        }

        const responseData = {
            restored: restoredAttributes,
            not_restored: notRestoredAttributes,
            summary: {
                total_requested: ids.length,
                restored_count: restoredAttributes.length,
                not_restored_count: notRestoredAttributes.length,
            },
        };

        const statusCode = restoredAttributes.length > 0 ? 200 : 400;
        const message = restoredAttributes.length === ids.length
            ? 'All attributes restored successfully'
            : restoredAttributes.length > 0
                ? 'Some attributes restored successfully'
                : 'No attributes were restored';

        return successResponse(res, responseData, message, statusCode);
    } catch (error) {
        logger.error('Bulk restore attributes error:', error);
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
                'image_url',
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
                'image_url',
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
                // { description: { [Op.like]: `%${keyword}%` } }
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

/**
 * Remove an attribute's image
 */
module.exports.removeAttributeImage = async (req, res, next) => {
    const transaction = await Attribute.sequelize.transaction();
    try {
        const { id } = req.params;
        const { id: updated_by } = req.user;

        // Find the attribute
        const attribute = await Attribute.findByPk(id, { transaction });
        if (!attribute) {
            await transaction.rollback();
            return errorResponse(res, { message: "Attribute not found" }, "Not found", 404);
        }

        // If no image exists, return success
        if (!attribute.image_url) {
            await transaction.rollback();
            return successResponse(res, null, "No image to remove");
        }

        // Delete the image from S3
        const oldKey = attribute.image_url.split(".amazonaws.com/")[1];
        await s3.deleteObject({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: oldKey
        }).promise();

        // Update the attribute to remove the image URL
        await attribute.update({ 
            image_url: null,
            updated_by
        }, { transaction });

        await transaction.commit();
        return successResponse(res, null, "Image removed successfully");

    } catch (error) {
        await transaction.rollback();
        logger.error('Remove Attribute Image Error:', error);
        return errorResponse(res, error, error.message);
    }
};




