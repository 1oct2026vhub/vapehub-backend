const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Brand } = require("../../../../models");
const { Op } = require("sequelize");
const { uploadFiletToS3, generateUniqueFileName } = require("../../../../library/s3/s3Helper");
const ExcelJS = require('exceljs');

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
            paranoid: false, // Include soft-deleted records when deleted flag is used
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
    try {

        let { name, slug, description } = req.body;
        const { id: updated_by } = req.user;
        let logo_url = req.body.logo_url || null;
        const { file } = req;

        // Trim input values
        name = name?.trim();
        slug = slug?.trim();
        description = description?.trim();

        // Check if the category name already exists
        const brandExists = await Brand.findOne({ where: { name } });
        if (brandExists) {
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
                console.error("File Upload Error:", uploadError);
                return errorResponse(res, { message: "File upload failed" }, "File upload failed", 500);
            }
        }

        // Create brand
        const brand = await Brand.create({ name, slug, description, updated_by, logo_url });

        return successResponse(res, brand, "Brand created successfully", 201);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Updates an existing brand by ID.
 */
module.exports.updateBrand = async (req, res, next) => {
    try {
        const { id } = req.params;
        let { name, slug, description } = req.body;
        const { id: updated_by } = req.user;
        const { file } = req;

        // Find brand
        const brand = await Brand.findByPk(id);
        if (!brand) {
            return errorResponse(res, { message: "Brand not found" }, "Brand not found", 404);
        }

        // Check for name uniqueness (excluding the current brand)
        const existingBrand = await Brand.findOne({
            where: { name, id: { [Op.ne]: id } }
        });

        if (existingBrand) {
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
                console.error("File Upload Error:", uploadError);
                return errorResponse(res, { message: "File upload failed" }, "File upload failed", 500);
            }
        }

        // Update brand
        await brand.update({
            name: name?.trim() || brand.name,
            slug: slug?.trim() || brand.slug,
            description: description?.trim() || brand.description,
            logo_url,
            updated_by
        });
        return successResponse(res, brand, "Brand updated successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Deletes a brand by ID (hard delete).
 */
module.exports.deleteBrand = async (req, res, next) => {
    try {
        const { id } = req.params;
        const brand = await Brand.findByPk(id);
        if (!brand) {
            return errorResponse(res, { message: "Brand not found" }, "Brand not found", 404);
        }

        await brand.destroy(); // Hard delete
        return successResponse(res, {}, "Brand deleted successfully", 200);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Restores a soft-deleted brand by ID.
 */
module.exports.restoreBrand = async (req, res, next) => {
    try {
        const { id } = req.params;
        const brand = await Brand.findOne({ where: { id }, paranoid: false });
        if (!brand) {
            return errorResponse(res, { message: "Brand not found" }, "Brand not found", 404);
        }

        await brand.restore();
        return successResponse(res, {}, "Brand restored successfully", 200);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Bulk updates brands from an Excel file.
 * If a brand does not exist, a new brand will be created.
 */
module.exports.bulkUpdateBrands = async (req, res, next) => {
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
        const isFirstHeaderEmpty = !headerRow[0] || headerRow[0] !== 'Name';

        // Array to hold the results of each operation
        let results = [];

        // Iterate through each row in the worksheet
        worksheet.eachRow({ includeEmpty: false }, async (row, rowNumber) => {
            if (rowNumber === 1) return; // Skip header row

            // If the first header is empty, skip the first column in each row
            const rowValues = isFirstHeaderEmpty ? row.values.slice(1) : row.values; // Skip the first column if empty

            const [name, slug, description] = rowValues; // Adjust destructuring based on the new structure

            // Check if the slug already exists
            let brand = await Brand.findOne({ where: { slug } });

            try {
                if (!brand) {
                    // If brand does not exist, create a new one
                    brand = await Brand.create({
                        name: typeof name === 'string' ? name.trim() : name,
                        slug: typeof slug === 'string' ? slug.trim() : slug,
                        description: typeof description === 'string' ? description.trim() : description,
                    });
                    results.push({ slug, status: 'Created', id: brand.id });
                } else {
                    // Update existing brand fields
                    await brand.update({
                        name: typeof name === 'string' ? name.trim() : brand.name,
                        description: typeof description === 'string' ? description.trim() : brand.description,
                    });
                    results.push({ slug, status: 'Updated', id: brand.id });
                }
            } catch (updateError) {
                results.push({ slug, status: 'Error', message: updateError.message });
                console.error(`Error processing brand with slug ${slug}:`, updateError);
            }
        });

        return successResponse(res, { results }, "Brands processed successfully");
    } catch (error) {
        console.error('Error during bulk update:', error); // Log the error for debugging
        return errorResponse(res, error, error.message);
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