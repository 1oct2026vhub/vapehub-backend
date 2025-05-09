const { AttributeTerm, Attribute, User, ProductVariantAttribute, ProductVariant, SlugRelation } = require('../../../../models');
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Op } = require('sequelize');
const logger = require("../../../../library/logger");
const ExcelJS = require('exceljs');
const SlugManager = require("../../../../utils/slugManager");

const slugManager = new SlugManager(SlugRelation);

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

        // Create slug relation
        await slugManager.createOrUpdateSlug(newTerm.slug, 'attribute_term', newTerm.id, transaction);

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

        // Update slug relation if slug has changed
        if (slug && slug.toLowerCase() !== term.slug) {
            await slugManager.createOrUpdateSlug(slug.toLowerCase(), 'attribute_term', id, transaction);
        }

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

        // Delete slug relation first
        await slugManager.deleteSlug('attribute_term', id, transaction);

        // Soft delete the term
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

        // Recreate slug relation
        await slugManager.createOrUpdateSlug(term.slug, 'attribute_term', term.id, transaction);

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
module.exports.bulkCreateOrUpdateTerms = async (req, res, next) => {
    const transaction = await AttributeTerm.sequelize.transaction(); // Start a transaction
    try {
        const { file } = req; // Get the uploaded file
        if (!file) {
            return errorResponse(res, { message: "No file uploaded" }, "No file uploaded", 400);
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(file.buffer); // Load the Excel file from buffer
        const worksheet = workbook.worksheets[0]; // Get the first worksheet

        // Check the header row
        const headerRow = worksheet.getRow(1).values;
        const isFirstHeaderEmpty = !headerRow[0] || headerRow[0] !== 'Slug';

        // Array to hold the results of each operation
        let results = [];

        // Iterate through each row in the worksheet
        for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
            const row = worksheet.getRow(rowNumber);
            const rowValues = isFirstHeaderEmpty ? row.values.slice(1) : row.values; // Skip the first column if empty

            const [slug, attribute_slug, name, description] = rowValues; // Adjust destructuring based on the new structure

            // Check if the attribute exists
            const attribute = await Attribute.findOne({ where: { slug: attribute_slug } });

            if (!attribute) {
                results.push({ slug, status: 'Error', message: 'Attribute not found' });
                continue; // Use continue instead of return to process the next row
            }

            // Check if the term slug already exists (case-insensitive)
            let term = await AttributeTerm.findOne({ where: { slug: slug.toLowerCase(), attribute_id: attribute.id }, transaction });

            try {
                if (!term) {
                    // If term does not exist, create a new one
                    term = await AttributeTerm.create({
                        slug: slug.toLowerCase(),
                        name,
                        description,
                        attribute_id: attribute.id
                    }, { transaction });
                    results.push({ slug, status: 'Created', id: term.id });
                } else {
                    // Update existing term fields
                    await term.update({
                        name: name || term.name,
                        description: description !== undefined ? description : term.description,
                    }, { transaction });
                    results.push({ slug, status: 'Updated', id: term.id });
                }
            } catch (updateError) {
                results.push({ slug, status: 'Error', message: updateError.message });
                console.error(`Error processing term with slug ${slug}:`, updateError);
            }
        }

        await transaction.commit(); // Commit the transaction
        return successResponse(res, { results }, "Terms processed successfully");
    } catch (error) {
        await transaction.rollback(); // Rollback the transaction on error
        console.error('Error during bulk update:', error); // Log the error for debugging
        return errorResponse(res, error, error.message);
    }
};

module.exports.downloadSampleTermsExcel = async (req, res, next) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Terms');

        // Add column headers
        worksheet.columns = [
            { header: 'Slug', key: 'slug', width: 30 },
            { header: 'Attribute Slug', key: 'attribute_slug', width: 30 },
            { header: 'Name', key: 'name', width: 30 },
            { header: 'Description', key: 'description', width: 50 },
        ];

        // Sample data for terms
        worksheet.addRow({ slug: 'color', attribute_slug: 'color', name: 'Color', description: 'Term for color' });
        worksheet.addRow({ slug: 'size', attribute_slug: 'size', name: 'Size', description: 'Term for size' });
        worksheet.addRow({ slug: 'material', attribute_slug: 'material', name: 'Material', description: 'Term for material' });

        // Set the response headers
        res.setHeader('Content-Disposition', 'attachment; filename=SampleTerms.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        // Write the workbook to the response
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

