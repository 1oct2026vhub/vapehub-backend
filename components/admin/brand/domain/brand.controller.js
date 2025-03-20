const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Brand, SlugRelation, sequelize, Product } = require("../../../../models");
const { Op } = require("sequelize");
const { uploadFiletToS3, generateUniqueFileName } = require("../../../../library/s3/s3Helper");
const ExcelJS = require('exceljs');
const SlugManager = require("../../../../utils/slugManager");

const slugManager = new SlugManager(SlugRelation);

/**
 * Retrieves all brands with pagination and optional search.
 */
module.exports.listAllBrands = async (req, res, next) => {
    try {
        let { page = 1, limit = 10, search, deleted = "false" } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        const whereCondition = {};
        if (search) {
            whereCondition[Op.or] = [
                { name: { [Op.like]: `%${search}%` } },
                { slug: { [Op.like]: `%${search}%` } },
                { description: { [Op.like]: `%${search}%` } }
            ];
        }

        whereCondition.deletedAt = deleted === "true" ? { [Op.ne]: null } : null;

        const { count, rows: brands } = await Brand.findAndCountAll({
            where: whereCondition,
            limit,
            offset,
            order: [["createdAt", "DESC"]],
            paranoid: false,
        });

        return successResponse(res, {
            total: count,
            page,
            limit,
            brands,
        }, "Brands retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Retrieves a single brand by ID.
 */
module.exports.getBrandById = async (req, res, next) => {
    try {
        const brand = await Brand.findByPk(req.params.id);
        if (!brand) {
            return errorResponse(res, { message: "Brand not found" }, "Brand not found", 404);
        }
        return successResponse(res, brand, "Brand retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Creates a new brand.
 */
module.exports.createBrand = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        let { name, slug, description } = req.body;
        const { id: updated_by } = req.user;
        let logo_url = req.body.logo_url || null;
        const { file } = req;

        // Trim input values
        name = name?.trim();
        slug = slug?.trim();
        description = description?.trim();

        // Check if the brand name already exists
        const brandExists = await Brand.findOne({ where: { name } });
        if (brandExists) {
            await t.rollback();
            return errorResponse(res, { message: "Brand name already exists" }, "Brand name already exists", 400);
        }

        // Upload logo image to S3
        if (file) {
            try {
                const { originalname, mimetype, buffer } = file;
                const fileName = generateUniqueFileName(originalname);
                const params = {
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: `brands/${fileName}`,
                    Body: buffer,
                    ContentType: mimetype
                };

                const uploadedImage = await uploadFiletToS3(params);
                if (!uploadedImage?.Location) throw new Error("File upload failed");

                logo_url = uploadedImage.Location;
            } catch (uploadError) {
                await t.rollback();
                console.error("File Upload Error:", uploadError);
                return errorResponse(res, { message: "File upload failed" }, "File upload failed", 500);
            }
        }

        // Create brand
        const brand = await Brand.create({ 
            name, 
            slug, 
            description, 
            updated_by, 
            logo_url 
        }, { transaction: t });

        // Create slug relation
        await slugManager.createOrUpdateSlug(slug, 'brand', brand.id, t);

        await t.commit();
        return successResponse(res, brand, "Brand created successfully", 201);
    } catch (error) {
        await t.rollback();
        return errorResponse(res, error, error.message);
    }
};

/**
 * Updates an existing brand by ID.
 */
module.exports.updateBrand = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        let { name, slug, description } = req.body;
        const { id: updated_by } = req.user;
        const { file } = req;

        // Find brand
        const brand = await Brand.findByPk(id);
        if (!brand) {
            await t.rollback();
            return errorResponse(res, { message: "Brand not found" }, "Brand not found", 404);
        }

        // Check for name uniqueness (excluding the current brand)
        const existingBrand = await Brand.findOne({
            where: { name, id: { [Op.ne]: id } }
        });

        if (existingBrand) {
            await t.rollback();
            return errorResponse(res, { message: "Brand name already exists" }, "Duplicate brand entry", 400);
        }

        // Upload logo if file exists
        let logo_url = brand.logo_url;
        if (file) {
            try {
                const { originalname, mimetype, buffer } = file;
                const fileName = generateUniqueFileName(originalname);
                const params = {
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: `brands/${fileName}`,
                    Body: buffer,
                    ContentType: mimetype
                };

                const uploadedImage = await uploadFiletToS3(params);
                if (!uploadedImage?.Location) throw new Error("File upload failed");

                logo_url = uploadedImage.Location;
            } catch (uploadError) {
                await t.rollback();
                console.error("File Upload Error:", uploadError);
                return errorResponse(res, { message: "File upload failed" }, "File upload failed", 500);
            }
        }

        // Update slug if provided
        if (slug && slug !== brand.slug) {
            await slugManager.createOrUpdateSlug(slug, 'brand', id, t);
        }

        // Update brand
        await brand.update({
            name: name?.trim() || brand.name,
            slug: slug?.trim() || brand.slug,
            description: description?.trim() || brand.description,
            logo_url,
            updated_by
        }, { transaction: t });

        await t.commit();
        return successResponse(res, brand, "Brand updated successfully");
    } catch (error) {
        await t.rollback();
        return errorResponse(res, error, error.message);
    }
};

/**
 * Deletes a brand by ID (hard delete).
 */
module.exports.deleteBrand = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const brand = await Brand.findByPk(id);
        if (!brand) {
            await t.rollback();
            return errorResponse(res, { message: "Brand not found" }, "Brand not found", 404);
        }

        // Check if brand has any associated products
        const productCount = await Product.count({
            where: {
                brand_id: id
            }
        });
        if (productCount > 0) {
            await t.rollback();
            return errorResponse(res, 
                { message: "Cannot delete brand with associated products" }, 
                "Brand has associated products", 
                400
            );
        }

        // Delete slug relation first
        await slugManager.deleteSlug('brand', id, t);

        // Soft delete the brand
        await brand.destroy({ transaction: t });

        await t.commit();
        return successResponse(res, {}, "Brand soft deleted successfully", 200);
    } catch (error) {
        await t.rollback();
        return errorResponse(res, error, error.message);
    }
};

/**
 * Restores a soft-deleted brand by ID.
 */
module.exports.restoreBrand = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const brand = await Brand.findOne({ where: { id }, paranoid: false });
        if (!brand) {
            await t.rollback();
            return errorResponse(res, { message: "Brand not found" }, "Brand not found", 404);
        }

        // Restore the brand
        await brand.restore({ transaction: t });

        // Recreate slug relation
        await slugManager.createOrUpdateSlug(brand.slug, 'brand', brand.id, t);

        await t.commit();
        return successResponse(res, {}, "Brand restored successfully", 200);
    } catch (error) {
        await t.rollback();
        return errorResponse(res, error, error.message);
    }
};

/**
 * Bulk updates brands from an Excel file.
 * If a brand does not exist, a new brand will be created.
 */
module.exports.bulkUpdateBrands = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { file } = req;
        const { id: updated_by } = req.user;

        if (!file) {
            await t.rollback();
            return errorResponse(res, { message: "No file uploaded" }, "No file uploaded", 400);
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(file.buffer);
        const worksheet = workbook.worksheets[0];

        // Check the header row
        const headerRow = worksheet.getRow(1).values;
        const isFirstHeaderEmpty = !headerRow[0] || headerRow[0] !== 'Name';

        let results = [];
        const promises = [];

        // Convert worksheet rows to array and skip header
        const rows = worksheet.getRows(2, worksheet.rowCount - 1) || [];

        // Process each row
        for (const row of rows) {
            // Skip empty rows
            if (!row.values || row.values.length === 0) continue;

            const rowValues = isFirstHeaderEmpty ? row.values.slice(1) : row.values;
            const [name, slug, description] = rowValues;

            // Skip if required fields are missing
            if (!name || !slug) {
                results.push({
                    slug: slug || 'Missing slug',
                    name: name || 'Missing name',
                    status: 'Skipped',
                    message: 'Missing required fields'
                });
                continue;
            }

            // Create a promise for processing each row
            const processRowPromise = async () => {
                try {
                    // Validate slug format
                    const cleanSlug = typeof slug === 'string' ? 
                        slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') : 
                        slug;

                    // Check if brand exists
                    let brand = await Brand.findOne({
                        where: { slug: cleanSlug }
                    });

                    if (!brand) {
                        // Create new brand
                        brand = await Brand.create({
                            name: typeof name === 'string' ? name.trim() : name,
                            slug: cleanSlug,
                            description: typeof description === 'string' ? description.trim() : description,
                            updated_by
                        }, { transaction: t });

                        // Create slug relation
                        await slugManager.createOrUpdateSlug(cleanSlug, 'brand', brand.id, t);

                        results.push({
                            slug: cleanSlug,
                            name: brand.name,
                            status: 'Created',
                            id: brand.id
                        });
                    } else {
                        // Check if any changes are needed
                        const updates = {
                            name: typeof name === 'string' ? name.trim() : brand.name,
                            description: typeof description === 'string' ? description.trim() : brand.description,
                            updated_by
                        };

                        const hasChanges = Object.keys(updates).some(key => 
                            updates[key] !== brand[key]
                        );

                        if (hasChanges) {
                            // Update existing brand
                            await brand.update(updates, { transaction: t });

                            // Update slug if changed
                            if (cleanSlug !== brand.slug) {
                                await slugManager.createOrUpdateSlug(cleanSlug, 'brand', brand.id, t);
                            }

                            results.push({
                                slug: cleanSlug,
                                name: updates.name,
                                status: 'Updated',
                                id: brand.id
                            });
                        } else {
                            results.push({
                                slug: cleanSlug,
                                name: brand.name,
                                status: 'Unchanged',
                                id: brand.id
                            });
                        }
                    }
                } catch (error) {
                    results.push({
                        slug: slug || 'Unknown',
                        name: name || 'Unknown',
                        status: 'Error',
                        message: error.message
                    });
                    console.error(`Error processing brand with slug ${slug}:`, error);
                }
            };

            promises.push(processRowPromise());
        }

        // Wait for all promises to resolve
        await Promise.all(promises);

        // Sort results by status
        results.sort((a, b) => {
            const statusOrder = {
                'Created': 1,
                'Updated': 2,
                'Unchanged': 3,
                'Error': 4,
                'Skipped': 5
            };
            return statusOrder[a.status] - statusOrder[b.status];
        });

        // Generate summary
        const summary = {
            total: results.length,
            created: results.filter(r => r.status === 'Created').length,
            updated: results.filter(r => r.status === 'Updated').length,
            unchanged: results.filter(r => r.status === 'Unchanged').length,
            errors: results.filter(r => r.status === 'Error').length,
            skipped: results.filter(r => r.status === 'Skipped').length
        };

        await t.commit();
        return successResponse(res, {
            summary,
            results
        }, "Brands processed successfully");

    } catch (error) {
        await t.rollback();
        console.error('Error during bulk update:', error);
        return errorResponse(res, error, "Error processing brands");
    }
};

/**
 * Generates and downloads a sample Excel file for brands.
 */
module.exports.downloadSampleBrands = async (req, res, next) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Brands');

        // Add column headers without updated_by
        worksheet.columns = [
            { header: 'Name', key: 'name', width: 30 },
            { header: 'Slug', key: 'slug', width: 30 },
            { header: 'Description', key: 'description', width: 50 },
        ];

        // Sample data for brands
        worksheet.addRow({ name: 'Vape Brand A', slug: 'vape-brand-a', description: 'Description for Vape Brand A' });
        worksheet.addRow({ name: 'Vape Brand B', slug: 'vape-brand-b', description: 'Description for Vape Brand B' });
        worksheet.addRow({ name: 'Vape Brand C', slug: 'vape-brand-c', description: 'Description for Vape Brand C' });
        worksheet.addRow({ name: 'Vape Brand D', slug: 'vape-brand-d', description: 'Description for Vape Brand D' });
        worksheet.addRow({ name: 'Vape Brand E', slug: 'vape-brand-e', description: 'Description for Vape Brand E' });

        // Set the response headers
        res.setHeader('Content-Disposition', 'attachment; filename=SampleBrands.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        // Write the workbook to the response
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};