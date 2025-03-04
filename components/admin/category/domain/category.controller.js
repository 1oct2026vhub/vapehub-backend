const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Category } = require("../../../../models");
const { Op } = require("sequelize");
const { uploadFiletToS3, generateUniqueFileName } = require("../../../../library/s3/s3Helper");
const ExcelJS = require("exceljs"); // Import the exceljs library

/**
 * Retrieves all categories.
 */
module.exports.listAllCategories = async (req, res, next) => {
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

        const { count, rows: categories } = await Category.findAndCountAll({
            where: whereCondition,
            limit,
            offset,
            order: [["createdAt", "DESC"]],
            paranoid: false, // Include soft-deleted records when deleted flag is used
            include: [
                {
                    model: Category,
                    as: "parent", // Alias for parent category relation
                    attributes: ["id", "name", "slug"],
                }
            ]
        });

        return successResponse(res, {
            total: count,
            page,
            limit,
            categories,
        }, "Categories retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Retrieves a category by ID.
 */
module.exports.getCategoryById = async (req, res, next) => {
    try {
        const category = await Category.findByPk(req.params.id);
        if (!category) {
            return errorResponse(res, { message: "Category not found" }, "Category not found", 404);
        }
        return successResponse(res, category, "Category retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Creates a new category.
 */
module.exports.createCategory = async (req, res, next) => {
    try {

        let { name, slug, description, parent_id } = req.body;
        const { id: updated_by } = req.user;
        let logo_url = req.body.logo_url || null;
        const { file } = req;

        // Trim input values
        name = name?.trim();
        slug = slug?.trim();
        description = description?.trim();
        parent_id = parent_id?.trim() || null;

        // Check if the category name already exists
        const categoryExists = await Category.findOne({ where: { name } });
        if (categoryExists) {
            return errorResponse(res, { message: "Category name already exists" }, "Category name already exists", 400);
        }

        
        // Validate parent category
        if (parent_id && !(await Category.findByPk(parent_id))) {
            return errorResponse(res, { message: "Parent category does not exist" }, "Invalid parent category", 400);
        }

        // Validate parent category
        if (parent_id) {
            const parentCategory = await Category.findByPk(parent_id);
            if (!parentCategory) {
                return errorResponse(res, { message: "Parent category does not exist" }, "Parent category does not exist", 400);
            }
        }

        // Upload logo image to S3
        if (file) {
            try {
                const { originalname, mimetype, buffer } = file;
                const fileName = generateUniqueFileName(originalname);
                const params = {
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: `categories/${fileName}`,
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

        // Create category
        const category = await Category.create({ name, slug, description, parent_id, updated_by, logo_url });

        return successResponse(res, category, "Category created successfully", 201);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Updates an existing category by ID.
 */
module.exports.updateCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, slug, description, parent_id: rawParentId } = req.body;
        const { id: updated_by } = req.user;
        const { file } = req;

        // Find category
        const category = await Category.findByPk(id);
        if (!category) {
            return errorResponse(res, { message: "Category not found" }, "Category not found", 404);
        }

        // Check for name and slug uniqueness
        const existingCategory = await Category.findOne({ where: { name, id: { [Op.ne]: id } } });

        if (existingCategory) {
            return errorResponse(
                res,
                { message: `${existingCategory.name === name ? "Category name" : "Category slug"} already exists` },
                "Duplicate category entry",
                400
            );
        }

        // Validate parent category
        const parent_id = rawParentId?.trim() || null;
        if (parent_id && !(await Category.findByPk(parent_id))) {
            return errorResponse(res, { message: "Parent category does not exist" }, "Invalid parent category", 400);
        }
        // Upload logo if file exists
        let logo_url = category.logo_url;
        if (file) {
            
            try {
                const { originalname, mimetype, buffer } = file;
                const fileName = generateUniqueFileName(originalname);
                const params = {
                    Bucket: process.env.AWS_S3_BUCKET,
                    Key: `categories/${fileName}`,
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

         // Update category
         await category.update({
            name: name?.trim() || category.name,
            slug: slug?.trim() || category.slug,
            logo_url,
            description: description?.trim() || category.description,
            updated_by,
            parent_id
        });
        return successResponse(res, category, "Category updated successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Deletes a category by ID.
 */
module.exports.deleteCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const category = await Category.findByPk(id);
        if (!category) {
            return errorResponse(res, { message: "Category not found" }, "Category not found", 404);
        }
        
        // Perform a hard delete
        await category.destroy();
        return successResponse(res, {}, "Category deleted successfully", 200);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Restores a soft-deleted category by ID.
 */
module.exports.restoreCategory = async (req, res, next) => {
    try {
        const { id } = req.params;
        const category = await Category.findOne({ where: { id }, paranoid: false });
        if (!category) {
            return errorResponse(res, { message: "Category not found" }, "Category not found", 404);
        }

        await category.restore();
        return successResponse(res, {}, "Category restored successfully", 200);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

/**
 * Bulk updates categories from an Excel file.
 * If a category does not exist, a new category will be created.
 */
module.exports.bulkUpdateCategories = async (req, res, next) => {
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

            const [name, slug, description, parent_slug] = rowValues; // Adjust destructuring based on the new structure

            // Find the parent category by slug
            let parentCategory = null;
            if (parent_slug) {
                parentCategory = await Category.findOne({ where: { slug: parent_slug } });
            }

            // Check if the slug already exists
            let category = await Category.findOne({ where: { slug } });

            try {
                if (!category) {
                    // If category does not exist, create a new one
                    category = await Category.create({
                        name: typeof name === 'string' ? name.trim() : name,
                        slug: typeof slug === 'string' ? slug.trim() : slug,
                        description: typeof description === 'string' ? description.trim() : description,
                        parent_id: parentCategory ? parentCategory.id : null, // Use parent category ID if found
                    });
                    results.push({ slug, status: 'Created', id: category.id });
                } else {
                    // Update existing category fields
                    await category.update({
                        name: typeof name === 'string' ? name.trim() : category.name,
                        description: typeof description === 'string' ? description.trim() : category.description,
                        parent_id: parentCategory ? parentCategory.id : null, // Update parent ID if found
                    });
                    results.push({ slug, status: 'Updated', id: category.id });
                }
            } catch (updateError) {
                results.push({ slug, status: 'Error', message: updateError.message });
                console.error(`Error processing category with slug ${slug}:`, updateError);
            }
        });

        return successResponse(res, { results }, "Categories processed successfully");
    } catch (error) {
        console.error('Error during bulk update:', error); // Log the error for debugging
        return errorResponse(res, error, error.message);
    }
};

/**
 * Generates and downloads a sample Excel file.
 */
module.exports.downloadSampleExcel = async (req, res, next) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Categories');

        // Add column headers without ID and Parent ID
        worksheet.columns = [
            { header: 'Name', key: 'name', width: 30 },
            { header: 'Slug', key: 'slug', width: 30 },
            { header: 'Description', key: 'description', width: 50 },
            { header: 'Parent Slug', key: 'parent_slug', width: 30 }, // New column for Parent Slug
        ];

        // Sample data based on Electric Vape category
        worksheet.addRow({ name: 'Electric Vape', slug: 'electric-vape', description: 'All electric vape products', parent_slug: null });
        worksheet.addRow({ name: 'Vape Pens', slug: 'vape-pens', description: 'Portable vape pens for on-the-go use', parent_slug: 'electric-vape' });
        worksheet.addRow({ name: 'E-Liquids', slug: 'e-liquids', description: 'Various flavors of e-liquids for vaping', parent_slug: 'electric-vape' });
        worksheet.addRow({ name: 'Vape Accessories', slug: 'vape-accessories', description: 'Accessories for your vaping needs', parent_slug: 'electric-vape' });
        worksheet.addRow({ name: 'New Vape Category', slug: 'new-vape-category', description: 'A new category for upcoming vape products', parent_slug: null });

        // Set the response headers
        res.setHeader('Content-Disposition', 'attachment; filename=SampleCategories.xlsx');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        // Write the workbook to the response
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};
