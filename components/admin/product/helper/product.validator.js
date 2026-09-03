const { check, param, body } = require("express-validator");
const multer = require("multer");
const path = require("path");


const productIdValidation = [
    param("id").isInt().withMessage("Product ID must be an integer"),
];

const deleteProductValidation = [
    ...productIdValidation,
    body("redirect_url")
        .optional()
        .isString()
        .withMessage("Redirect URL must be a string")
        .isLength({ max: 500 })
        .withMessage("Redirect URL must be at most 500 characters"),
];

const getLinkedProductsValidation = [
    param("id").isInt().withMessage("Product ID must be an integer"),
    check('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    check('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    check('offset').optional().isInt({ min: 0 }).withMessage('Offset must be a non-negative integer'),
];

const productStickerValidation = [
    body('clear_sticker').optional().isBoolean().withMessage('clear_sticker must be a boolean'),
    body('sticker').optional({ nullable: true }).custom((value, { req }) => {
        if (value === null) return true;
        if (req.body.clear_sticker === true) return true;
        if (value === undefined) return true;
        if (typeof value !== 'object' || Array.isArray(value)) {
            throw new Error('sticker must be an object');
        }
        return true;
    }),
    body('sticker.name')
        .if((value, { req }) => req.body.sticker && typeof req.body.sticker === 'object')
        .isString().trim().notEmpty().withMessage('sticker.name is required')
        .isLength({ max: 64 }),
    body('sticker.background_color')
        .if((value, { req }) => req.body.sticker && typeof req.body.sticker === 'object')
        .matches(/^#[0-9A-Fa-f]{6}$/).withMessage('sticker.background_color must be #RRGGBB'),
    body('sticker.active_until')
        .if((value, { req }) => req.body.sticker && typeof req.body.sticker === 'object')
        .isISO8601().withMessage('sticker.active_until must be a valid ISO8601 date'),
    body('sticker.active_from')
        .optional({ nullable: true })
        .isISO8601().withMessage('sticker.active_from must be a valid ISO8601 date'),
];

const createProductValidation = [
    check('name').isString().withMessage('Name must be a string').notEmpty().withMessage('Name is required'),
    check('slug').isString().withMessage('Slug must be a string').notEmpty().withMessage('Slug is required'),
    check('description').optional().isString().withMessage('Description must be a string'),
    check('is_discontinued')
        .optional()
        .isBoolean().withMessage('is_discontinued must be a boolean'),
    check('is_coming_soon')
        .optional()
        .isBoolean().withMessage('is_coming_soon must be a boolean'),
    check('category_ids')
        .optional()
        .isArray({ min: 1 }).withMessage('Category IDs must be an array with at least one item')
        .custom((value) => {
            if (value && !Array.isArray(value)) {
                throw new Error('Category IDs must be an array');
            }
            if (value && value.length === 0) {
                throw new Error('At least one category ID is required');
            }
            if (value && !value.every(id => Number.isInteger(id) && id > 0)) {
                throw new Error('All category IDs must be positive integers');
            }
            return true;
        }),
    check('brand_ids')
        .optional()
        .isArray({ min: 1 }).withMessage('Brand IDs must be an array with at least one item')
        .custom((value) => {
            if (value && !Array.isArray(value)) {
                throw new Error('Brand IDs must be an array');
            }
            if (value && value.length === 0) {
                throw new Error('At least one brand ID is required');
            }
            if (value && !value.every(id => Number.isInteger(id) && id > 0)) {
                throw new Error('All brand IDs must be positive integers');
            }
            return true;
        }),
    check('linked_product_ids')
        .optional()
        .isArray().withMessage('Linked product IDs must be an array')
        .custom((value) => {
            if (value && !Array.isArray(value)) {
                throw new Error('Linked product IDs must be an array');
            }
            if (value && value.length > 0 && !value.every(id => Number.isInteger(id) && id > 0)) {
                throw new Error('All linked product IDs must be positive integers');
            }
            return true;
        }),
    ...productStickerValidation,
    check('related_blog_ids')
        .optional()
        .custom((value) => {
            if (value === undefined || value === null || value === '') {
                return true;
            }
            const { parseRelatedBlogIdsField } = require('./productBlogRelations.helper');
            parseRelatedBlogIdsField(value);
            return true;
        }),
];

const updateProductValidations = [
    check('name').optional().isString().withMessage('Name must be a string'),
    check('slug').optional().isString().withMessage('Slug must be a string'),
    check('sku')
        .optional({ nullable: true })
        .custom(value => {
            if (value === null) {
                return true;
            }
            if (typeof value !== 'string' && typeof value !== 'number') {
                throw new Error('SKU must be a string');
            }
            return true;
        }),
    check('description').optional().isString().withMessage('Description must be a string'),
    check('is_discontinued')
        .optional()
        .isBoolean().withMessage('is_discontinued must be a boolean'),
    check('is_coming_soon')
        .optional()
        .isBoolean().withMessage('is_coming_soon must be a boolean'),
    check('category_ids')
        .optional()
        .custom((value) => {
            if (value !== undefined && value !== null) {
                if (!Array.isArray(value)) {
                    throw new Error('Category IDs must be an array');
                }
                if (value.length === 0) {
                    throw new Error('Category IDs array cannot be empty');
                }
                if (!value.every(id => Number.isInteger(id) && id > 0)) {
                    throw new Error('All category IDs must be positive integers');
                }
            }
            return true;
        }),
    check('brand_ids')
        .optional()
        .custom((value) => {
            if (value !== undefined && value !== null) {
                if (!Array.isArray(value)) {
                    throw new Error('Brand IDs must be an array');
                }
                if (value.length === 0) {
                    throw new Error('Brand IDs array cannot be empty');
                }
                if (!value.every(id => Number.isInteger(id) && id > 0)) {
                    throw new Error('All brand IDs must be positive integers');
                }
            }
            return true;
        }),
    check('linked_product_ids')
        .optional()
        .custom((value) => {
            if (value !== undefined && value !== null) {
                if (!Array.isArray(value)) {
                    throw new Error('Linked product IDs must be an array');
                }
                // Allow empty array to remove all links
                if (value.length > 0 && !value.every(id => Number.isInteger(id) && id > 0)) {
                    throw new Error('All linked product IDs must be positive integers');
                }
            }
            return true;
        }),
    check('related_blog_ids')
        .optional()
        .custom((value) => {
            if (value === undefined || value === null || value === '') {
                return true;
            }
            const { parseRelatedBlogIdsField } = require('./productBlogRelations.helper');
            parseRelatedBlogIdsField(value);
            return true;
        }),
    check('redirect_url')
        .optional({ values: 'null' })
        .custom((value) => {
            if (value === null || value === undefined || value === '') return true;
            if (typeof value !== 'string') throw new Error('redirect_url must be a string');
            if (value.length > 500) throw new Error('redirect_url must be at most 500 characters');
            return true;
        }),
    ...productStickerValidation,
];

const productImageValidation = [
  param("product_id")
      .notEmpty().withMessage("Product ID is required")
      .isInt({ min: 1 }).withMessage("Product ID must be a valid integer"),

  param("image_id")
      .notEmpty().withMessage("Image ID is required")
      .isInt({ min: 1 }).withMessage("Image ID must be a valid integer")
];

const { createTempDiskStorage } = require("../../../../library/multer/tempDiskStorage");

// Configure multer for handling file uploads
const storage = createTempDiskStorage('products');
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedExtensions = [".png", ".jpg", ".jpeg", ".webp", ".svg"];
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            return cb(new Error("Only .png, .jpg, .jpeg, .webp, .svg files are allowed!"), false);
        }
        cb(null, true);
    },
});
const uploadFileValidation = (req, res, next) => {
  upload.array("images", 10)(req, res, (err) => { // Allow up to 10 images
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        success: false,
        message: "File upload error",
        errors: [{ path: "images", msg: err.message }],
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: "Invalid file type",
        errors: [{ path: "images", msg: err.message }],
      });
    }

    // Validate if any files were uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No files uploaded",
        errors: [{ path: "images", msg: "Please upload at least one image" }],
      });
    }

    next();
  });
};

const listAllProductsValidation = [
    check('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    check('limit').optional().isInt({ min: 1 }).withMessage('Limit must be a positive integer'),
    check('sort').optional().isString().withMessage('Sort must be a string'),
    check('filter').optional().isString().withMessage('Filter must be a string'),
    check('status').optional().isIn(['all','draft', 'published', 'archived']).withMessage('Status must be one of: draft, published, archived'),
];

// Configure multer for handling Excel file uploads
const uploadXlx = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedExtensions = ['.xlsx', '.xls'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            return cb(new Error('Only .xlsx and .xls files are allowed!'), false);
        }
        cb(null, true);
    },
});

const uploadXlxFileMiddleware = uploadXlx.single('file');

// Validation for bulk updates
const bulkUpdateProductsValidation = [
    body('file')
        .custom((value, { req }) => {
            if (!req.file) {
                throw new Error('Excel file must be uploaded');
            }
            return true;
        }),
    check('file')
        .custom((value, { req }) => {
            if (req.file) {
                const ext = path.extname(req.file.originalname).toLowerCase();
                if (!['.xlsx', '.xls'].includes(ext)) {
                    throw new Error('Only .xlsx and .xls files are allowed');
                }
                if (req.file.size > 5 * 1024 * 1024) { // 5MB in bytes
                    throw new Error('File size should not exceed 5MB');
                }
            }
            return true;
        })
];

const updateProductStatusValidation = [
    body('productId')
        .isInt({ min: 1 })
        .withMessage('Product ID must be a positive integer'),
    body('status')
        .isIn(['draft', 'published', 'archived'])
        .withMessage('Status must be one of: draft, published, archived')
];

const updateProductImageAltTextValidation = [
    param("product_id")
        .notEmpty().withMessage("Product ID is required")
        .isInt({ min: 1 }).withMessage("Product ID must be a valid integer"),
    param("image_id")
        .notEmpty().withMessage("Image ID is required")
        .isInt({ min: 1 }).withMessage("Image ID must be a valid integer"),
    body("alt_text")
        .optional()
        .isString().withMessage("Alt text must be a string")
        .trim()
];

module.exports = {
    productIdValidation,
    deleteProductValidation,
    createProductValidation,
    updateProductValidations,
    productImageValidation,
    uploadFileValidation,
    listAllProductsValidation,
    bulkUpdateProductsValidation,
    uploadXlxFileMiddleware,
    updateProductStatusValidation,
    getLinkedProductsValidation,
    updateProductImageAltTextValidation
};