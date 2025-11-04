const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Category, SlugRelation, sequelize, Product, ProductCategory, Menu } = require("../../../../models");
const { Op } = require("sequelize");
const { uploadFiletToS3, generateUniqueFileName, deleteFile } = require("../../../../library/s3/s3Helper");
const ExcelJS = require("exceljs"); // Import the exceljs library
const SlugManager = require("../../../../utils/slugManager");
const seoService = require('../../seo/domain/seo.service');

const slugManager = new SlugManager(SlugRelation);

/**
 * Retrieves all categories.
 */
module.exports.listAllCategories = async (req, res, next) => {
    try {
        let { page = 1, limit = 10, search, search_only_name = "false", deleted = "false", sortBy = "createdAt", sortOrder = "DESC" } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);
        const offset = (page - 1) * limit;

        // Validate sort parameters
        const allowedSortFields = ["id", "name", "slug", "description", "createdAt", "updatedAt"];
        sortBy = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
        sortOrder = ["ASC", "DESC"].includes(sortOrder.toUpperCase()) ? sortOrder.toUpperCase() : "DESC";

        const whereCondition = {};
        if (search) {
            if (search_only_name === "true") {
                // Only search in the name field
                whereCondition.name = { [Op.like]: `%${search}%` };
            } else {
                // Search in multiple fields
                whereCondition[Op.or] = [
                    { id: { [Op.like]: `%${search}%` } },
                    { name: { [Op.like]: `%${search}%` } },
                    { slug: { [Op.like]: `%${search}%` } },
                    { description: { [Op.like]: `%${search}%` } }
                ];
            }
        }

        whereCondition.deletedAt = deleted === "true" ? { [Op.ne]: null } : null;

        const { count, rows: categories } = await Category.findAndCountAll({
            where: whereCondition,
            limit,
            offset,
            order: [[sortBy, sortOrder]],
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
            sortBy,
            sortOrder,
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
    const t = await sequelize.transaction();
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
            await t.rollback();
            return errorResponse(res, { message: "Category name already exists" }, "Category name already exists", 400);
        }

        // Check if the category slug already exists
        const categorySlugExists = await Category.findOne({ where: { slug } });
        if (categorySlugExists) {
            await t.rollback();
            return errorResponse(res, { message: "Category slug already exists" }, "Category slug already exists", 400);
        }

        
        // Validate parent category
        if (parent_id && !(await Category.findByPk(parent_id))) {
            await t.rollback();
            return errorResponse(res, { message: "Parent category does not exist" }, "Invalid parent category", 400);
        }

        // Validate parent category
        if (parent_id) {
            const parentCategory = await Category.findByPk(parent_id);
            if (!parentCategory) {
                await t.rollback();
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
                await t.rollback();
                console.error("File Upload Error:", uploadError);
                return errorResponse(res, { message: "File upload failed" }, "File upload failed", 500);
            }
        }

        // Create category
        const category = await Category.create({ name, slug, description, parent_id, updated_by, logo_url }, { transaction: t });

        // Create slug relation
        await slugManager.createOrUpdateSlug(slug, 'category', category.id, t);

        await t.commit();
        return successResponse(res, category, "Category created successfully", 201);
    } catch (error) {
        await t.rollback();
        return errorResponse(res, error, error.message);
    }
};

/**
 * Updates an existing category by ID.
 */
module.exports.updateCategory = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { name, slug, description, parent_id: rawParentId } = req.body;
        const { id: updated_by } = req.user;
        const { file } = req;

        // Find category
        const category = await Category.findByPk(id);
        if (!category) {
            await t.rollback();
            return errorResponse(res, { message: "Category not found" }, "Category not found", 404);
        }

        // Check for name and slug uniqueness
        const existingCategory = await Category.findOne({ where: { name, id: { [Op.ne]: id } } });

        if (existingCategory) {
            await t.rollback();
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
            await t.rollback();
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
                await t.rollback();
                console.error("File Upload Error:", uploadError);
                return errorResponse(res, { message: "File upload failed" }, "File upload failed", 500);
            }
        }

        // Update SEO slug if slug has changed
        if (slug && category.slug !== slug) {
            await seoService.updateSeoSlug('category', id, slug);
        }
        // Update slug if provided
        if (slug && slug !== category.slug) {
            await slugManager.createOrUpdateSlug(slug, 'category', id, t);
        }
         // Update category
         await category.update({
            name: name?.trim() || category.name,
            slug: slug?.trim() || category.slug,
            logo_url,
            description: description?.trim() || category.description,
            updated_by,
            parent_id
        }, { transaction: t });
        const menu = await Menu.findOne({ where: { entity_id: id} });
        if (menu) {
            await Menu.update({
                original: `/${slug?.trim()}`,
                // name: name?.trim() || menu.name,
                // slug: slug?.trim() || menu.slug

            }, { where: { entity_id: id } }, { transaction: t });
        }
        // Update SEO noIndex based on category status
        await seoService.updateCategoryNoIndex(id);
        await t.commit();
        return successResponse(res, category, "Category updated successfully");
    } catch (error) {
        await t.rollback();
        return errorResponse(res, error, error.message);
    }
};

/**
 * Deletes a category by ID.
 */
module.exports.deleteCategory = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const category = await Category.findByPk(id);
        if (!category) {
            await t.rollback();
            return errorResponse(res, { message: "Category not found" }, "Category not found", 404);
        }

        // Check if there are any (non-deleted) products associated with this category via product_categories
        const productsCount = await ProductCategory.count({
            where: { category_id: id },
            include: [
                {
                    model: Product,
                    required: true,
                    attributes: [],
                    where: { deletedAt: null }
                }
            ]
        });
        if (productsCount > 0) {
            await t.rollback();
            return errorResponse(
                res, 
                { message: "Cannot delete category with associated products" },
                "Category has associated products",
                400
            );
        }
        
        // Delete slug relation first
        await slugManager.deleteSlug('category', id, t);

        // Delete the category
        await category.destroy({ transaction: t });

        // Update SEO noIndex based on category status
        await seoService.updateNoIndex('category', id, true);   

        await t.commit();
        return successResponse(res, {}, "Category deleted successfully", 200);
    } catch (error) {
        await t.rollback();
        return errorResponse(res, error, error.message);
    }
};

/**
 * Restores a soft-deleted category by ID.
 */
module.exports.restoreCategory = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const category = await Category.findOne({ where: { id }, paranoid: false });
        if (!category) {
            await t.rollback();
            return errorResponse(res, { message: "Category not found" }, "Category not found", 404);
        }

        // Restore the category
        await category.restore({ transaction: t });

        // Recreate slug relation
        await slugManager.createOrUpdateSlug(category.slug, 'category', category.id, t);


        await t.commit();

        // Update SEO noIndex based on category status
        await seoService.updateCategoryNoIndex(id);
        
        return successResponse(res, {}, "Category restored successfully", 200);
    } catch (error) {
        await t.rollback();
        return errorResponse(res, error, error.message);
    }
};

/**
 * Bulk updates categories from an Excel file.
 * If a category does not exist, a new category will be created.
 */
module.exports.bulkUpdateCategories = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { file } = req;
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
        const promises = []; // Array to store all promises

        // Convert worksheet rows to array and skip header
        const rows = worksheet.getRows(2, worksheet.rowCount - 1) || [];

        // Process each row
        for (const row of rows) {
            // Skip empty rows
            if (!row.values || row.values.length === 0) continue;

            const rowValues = isFirstHeaderEmpty ? row.values.slice(1) : row.values;
            const [name, slug, description, parent_slug] = rowValues;

            // Skip if required fields are missing
            if (!name || !slug) {
                results.push({ 
                    slug: slug || 'Missing slug', 
                    status: 'Skipped', 
                    message: 'Missing required fields' 
                });
                continue;
            }

            // Create a promise for processing each row
            const processRowPromise = async () => {
                try {
                    // Find parent category if parent_slug exists
                    let parentCategory = null;
                    if (parent_slug) {
                        parentCategory = await Category.findOne({ 
                            where: { slug: parent_slug } 
                        });
                    }

                    // Check if category exists
                    let category = await Category.findOne({ 
                        where: { slug } 
                    });

                    if (!category) {
                        // Create new category
                        category = await Category.create({
                            name: typeof name === 'string' ? name.trim() : name,
                            slug: typeof slug === 'string' ? slug.trim() : slug,
                            description: typeof description === 'string' ? description.trim() : description,
                            parent_id: parentCategory ? parentCategory.id : null,
                        }, { transaction: t });

                        // Create slug relation
                        await slugManager.createOrUpdateSlug(slug, 'category', category.id, t);

                        results.push({ 
                            slug, 
                            status: 'Created', 
                            id: category.id 
                        });
                    } else {
                        // Update existing category
                        await category.update({
                            name: typeof name === 'string' ? name.trim() : category.name,
                            description: typeof description === 'string' ? description.trim() : category.description,
                            parent_id: parentCategory ? parentCategory.id : null,
                        }, { transaction: t });

                        // Update slug if changed
                        if (slug !== category.slug) {
                            await slugManager.createOrUpdateSlug(slug, 'category', category.id, t);
                        }

                        results.push({ 
                            slug, 
                            status: 'Updated', 
                            id: category.id 
                        });
                    }
                } catch (error) {
                    results.push({ 
                        slug: slug || 'Unknown', 
                        status: 'Error', 
                        message: error.message 
                    });
                    console.error(`Error processing category with slug ${slug}:`, error);
                }
            };

            promises.push(processRowPromise());
        }

        // Wait for all promises to resolve
        await Promise.all(promises);

        // Sort results by status (Created, Updated, Error, Skipped)
        results.sort((a, b) => {
            const statusOrder = {
                'Created': 1,
                'Updated': 2,
                'Error': 3,
                'Skipped': 4
            };
            return statusOrder[a.status] - statusOrder[b.status];
        });

        // Return response with summary
        const summary = {
            total: results.length,
            created: results.filter(r => r.status === 'Created').length,
            updated: results.filter(r => r.status === 'Updated').length,
            errors: results.filter(r => r.status === 'Error').length,
            skipped: results.filter(r => r.status === 'Skipped').length,
        };

        await t.commit();
        return successResponse(res, {
            summary,
            results
        }, "Categories processed successfully");

    } catch (error) {
        await t.rollback();
        console.error('Error during bulk update:', error);
        return errorResponse(res, error, "Error processing categories");
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

/**
 * Removes a category's image from S3 and updates the category record.
 */
module.exports.removeCategoryImage = async (req, res, next) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const category = await Category.findByPk(id);
        
        if (!category) {
            await t.rollback();
            return errorResponse(res, { message: "Category not found" }, "Category not found", 404);
        }

        if (!category.logo_url) {
            await t.rollback();
            return errorResponse(res, { message: "Category has no image to remove" }, "No image to remove", 400);
        }

        // Extract the S3 key from the image URL
        const imageKey = category.logo_url.split(".amazonaws.com/")[1];

        // Delete the image from S3
        await deleteFile(imageKey);

        // Update category record to remove logo_url
        await category.update({ logo_url: null }, { transaction: t });

        await t.commit();
        return successResponse(res, category, "Category image removed successfully");
    } catch (error) {
        await t.rollback();
        return errorResponse(res, error, error.message);
    }
};
