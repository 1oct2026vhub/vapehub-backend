const { body, param } = require('express-validator');
const multer = require("multer");
const path = require("path");

// Common validations
const commonValidations = {
    productId: param('product_id')
        .isInt()
        .withMessage('Product ID must be a valid integer'),
    variantId: param('variant_id')
        .isInt()
        .withMessage('Variant ID must be a valid integer'),
    
    imageId: param('image_id')
        .isInt()
        .withMessage('Invalid image ID'),
    
    attributeValidation: [
        body('attributes').isArray().withMessage('Attributes must be an array'),
        body('attributes.*.attribute_id').isInt().withMessage('Invalid attribute ID'),
        body('attributes.*.term_id').isInt().withMessage('Invalid term ID')
    ],

    variantBaseFields: [
        body('slug')
            .optional()
            .custom((value) => {
                if (value === null) return true;
                if (typeof value === 'string' && value.trim().length >= 3 && value.trim().length <= 100) return true;
                throw new Error('Slug must be between 3 and 100 characters');
            }),
        body('price')
            .optional()
            .custom((value) => {
                if (value === null) value = 0;
                if (typeof value === 'number' && value >= 0) return true;
                throw new Error('Price must be a positive number or null');
            })
            .default(0),
        body('discount_price')
            .optional()
            .custom((value, { req }) => {
                if (value === null) return true;
                if (typeof value === 'number' && value >= 0) {
                    if (value !== 0 && req.body.price && req.body.price !== 0 && value >= req.body.price) {
                        throw new Error('Discount price must be less than regular price');
                    }
                    return true;
                }
                throw new Error('Discount price must be a positive number');
            }),
        body('purchase_price')
            .optional()
            .custom((value) => {
                if (value === null)  value = 0;
                if (typeof value === 'number' && value >= 0) return true;
                throw new Error('Purchase price must be a positive number');
            }),
        body('stock')
            .optional()
            .custom((value) => {
                if (value === null)  value = 0;
                if (Number.isInteger(value) && value >= 0) return true;
                throw new Error('Stock must be a positive integer');
            })
            .default(0),
        body('low_stock_threshold')
            .optional()
            .custom((value) => {
                if (value === null)  value = 0;
                if (Number.isInteger(value) && value >= 0) return true;
                throw new Error('Low stock threshold must be a positive integer');
            })
            .default(0),
        body('weight')
            .optional()
            .custom((value) => {
                if (value === null) return true;
                if (typeof value === 'number' && value >= 0) return true;
                throw new Error('Weight must be a positive number');
            })
            .default(0),
        body('length')
            .optional()
            .custom((value) => {
                if (value === null) return true;
                if (typeof value === 'number' && value >= 0) return true;
                throw new Error('Length must be a positive number');
            })
            .default(0),
        body('width')
            .optional()
            .custom((value) => {
                if (value === null) return true;
                if (typeof value === 'number' && value >= 0) return true;
                throw new Error('Width must be a positive number');
            })
            .default(0),
        body('height')
            .optional()
            .custom((value) => {
                if (value === null) return true;
                if (typeof value === 'number' && value >= 0) return true;
                throw new Error('Height must be a positive number');
            })
            .default(0),
        body('barcode')
            .optional()
            .custom((value) => {
                if (value === null)  value = '';
                if (typeof value === 'string' && value.trim().length >= 3 && value.trim().length <= 50) return true;
                throw new Error('Barcode must be between 3 and 50 characters');
            }),
        body('status')
            .optional()
            .custom((value) => {
                if (value === null) value = 'active';
                if (['active', 'inactive'].includes(value)) return true;
                throw new Error('Status must be either active or inactive');
            })
            .default('active')
    ],

    attributeTermId: [
        param('attribute_term_id')
            .exists().withMessage('Attribute Term ID is required')
            .isInt().withMessage('Attribute Term ID must be a valid integer'),
    ],
};

// Configure multer for handling variant image uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedExtensions = [".png", ".jpg", ".jpeg", ".webp"];
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            return cb(new Error("Only .png, .jpg, .jpeg, .webp files are allowed!"), false);
        }
        cb(null, true);
    },
});

// Configure multer for handling Excel file uploads
const excelStorage = multer.memoryStorage();
const uploadExcel = multer({
    storage: excelStorage,
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

// Middleware for variant image upload validation
const uploadVariantImageMiddleware = (req, res, next) => {
    upload.array("files", 10)(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({
                success: false,
                message: "File upload error",
                errors: [{ path: "files", msg: err.message }],
            });
        } else if (err) {
            return res.status(400).json({
                success: false,
                message: "Invalid file type",
                errors: [{ path: "files", msg: err.message }],
            });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No files uploaded",
                errors: [{ path: "files", msg: "Please upload at least one image" }],
            });
        }

        next();
    });
};

// Middleware for Excel file upload validation
const uploadExcelMiddleware = (req, res, next) => {
    uploadExcel.single('file')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({
                success: false,
                message: "File upload error",
                errors: [{ path: "file", msg: err.message }],
            });
        } else if (err) {
            return res.status(400).json({
                success: false,
                message: "Invalid file type",
                errors: [{ path: "file", msg: err.message }],
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded",
                errors: [{ path: "file", msg: "Please upload an Excel file" }],
            });
        }

        next();
    });
};

// Validator configurations
const bulkUpdateVariantsValidator = [
    uploadExcelMiddleware,
    body('file')
        .custom((value, { req }) => {
            if (!req.file) {
                throw new Error('Excel file must be uploaded');
            }
            const ext = path.extname(req.file.originalname).toLowerCase();
            if (!['.xlsx', '.xls'].includes(ext)) {
                throw new Error('Only .xlsx and .xls files are allowed');
            }
            if (req.file.size > 5 * 1024 * 1024) {
                throw new Error('File size should not exceed 5MB');
            }
            return true;
        })
];

const addProductAttributesValidator = [
    commonValidations.productId,
    body('attributes')
        .isArray()
        .withMessage('Attributes must be an array')
        .notEmpty()
        .withMessage('Attributes array cannot be empty'),
    body('attributes.*.attribute_id')
        .isInt({ min: 1 })
        .withMessage('Attribute ID must be a positive integer'),
    body('attributes.*.term_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Term ID must be a positive integer'),
    body('attributes.*.term_ids')
        .optional()
        .isArray()
        .withMessage('Term IDs must be an array')
        .custom((value, { req }) => {
            if (!value && !req.body.attributes.some(attr => attr.term_id)) {
                throw new Error('Either term_id or term_ids must be provided');
            }
            return true;
        }),
    body('attributes.*.term_ids.*')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Each term ID must be a positive integer'),
    body('attributes.*.is_visible_page')
        .optional()
        .isBoolean()
        .withMessage('is_visible_page must be a boolean'),
    body('attributes.*.used_in_variation')
        .optional()
        .isBoolean()
        .withMessage('used_in_variation must be a boolean'),
    body('attributes')
        .custom((value, { req }) => {
            for (const attr of value) {
                if (!attr.term_id && !attr.term_ids) {
                    throw new Error('Either term_id or term_ids must be provided for each attribute');
                }
                if (attr.term_id && attr.term_ids) {
                    throw new Error('Cannot provide both term_id and term_ids for the same attribute');
                }
            }
            return true;
        })
];

const createProductVariantsValidator = [
    commonValidations.productId,
    body('variants')
        .isArray()
        .withMessage('Variants must be an array')
        .notEmpty()
        .withMessage('Variants array cannot be empty'),
    body('variants.*')
        .isObject()
        .withMessage('Each variant must be an object'),
    body('variants.*.slug')
        .optional()
        .isString()
        .trim()
        .isLength({ min: 3, max: 100 })
        .withMessage('Variant slug must be between 3 and 100 characters'),
    body('variants.*.regular_price')
        .notEmpty()
        .withMessage('Regular price is required')
        .isFloat({ min: 0 })
        .withMessage('Regular price must be a positive number'),
    body('variants.*.discount_price')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Discount price must be a positive number')
        .custom((value, { req, path }) => {
            const variantIndex = parseInt(path.split('[')[1]);
            if (value >= req.body.variants[variantIndex].regular_price) {
                throw new Error('Discount price must be less than regular price');
            }
            return true;
        }),
    body('variants.*.purchase_price')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Purchase price must be a positive number'),
    body('variants.*.stock')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Stock must be a non-negative integer'),
    body('variants.*.low_stock_threshold')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Low stock threshold must be a non-negative integer'),
    body('variants.*.weight')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Weight must be a positive number'),
    body('variants.*.length')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Length must be a positive number'),
    body('variants.*.width')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Width must be a positive number'),
    body('variants.*.height')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Height must be a positive number'),
    body('variants.*.barcode')
        .optional()
        .isString()
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('Barcode must be between 3 and 50 characters'),
    body('variants.*.status')
        .optional()
        .isIn(['active', 'inactive'])
        .withMessage('Status must be either active or inactive'),
    body('variants.*.attributes')
        .isArray()
        .withMessage('Variant attributes must be an array')
        .notEmpty()
        .withMessage('Variant attributes cannot be empty'),
    body('variants.*.attributes.*.attribute_id')
        .notEmpty()
        .withMessage('Attribute ID is required')
        .isInt({ min: 1 })
        .withMessage('Attribute ID must be a positive integer'),
    body('variants.*.attributes.*.term_id')
        .notEmpty()
        .withMessage('Term ID is required')
        .isInt({ min: 1 })
        .withMessage('Term ID must be a positive integer')
];

const updateProductVariantValidator = [
    commonValidations.productId,
    commonValidations.variantId,
    body('slug')
        .optional()
        .isString()
        .trim()
        .isLength({ min: 3, max: 100 })
        .withMessage('Variant slug must be between 3 and 100 characters'),
    body('regular_price')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Regular price must be a positive number'),
    body('discount_price')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Discount price must be a positive number')
        .custom((value, { req }) => {
            if (value >= req.body.regular_price) {
                throw new Error('Discount price must be less than regular price');
            }
            return true;
        }),
    body('purchase_price')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Purchase price must be a positive number'),
    body('stock')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Stock must be a non-negative integer'),
    body('low_stock_threshold')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Low stock threshold must be a non-negative integer'),
    body('weight')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Weight must be a positive number'),
    body('length')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Length must be a positive number'),
    body('width')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Width must be a positive number'),
    body('height')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Height must be a positive number'),
    body('barcode')
        .optional()
        .isString()
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('Barcode must be between 3 and 50 characters'),
    body('status')
        .optional()
        .isIn(['active', 'inactive'])
        .withMessage('Status must be either active or inactive'),
    body('attributes')
        .optional()
        .isArray()
        .withMessage('Attributes must be an array'),
    body('attributes.*.attribute_id')
        .optional()
        .isInt()
        .withMessage('Invalid attribute ID')
        .isInt({ min: 1 })
        .withMessage('Attribute ID must be a positive integer'),
    body('attributes.*.term_id')
        .optional()
        .isInt()
        .withMessage('Invalid term ID')
        .isInt({ min: 1 })
        .withMessage('Term ID must be a positive integer')
];

const uploadVariantImagesValidator = [
    commonValidations.variantId,
];

const setVariantPrimaryImageValidator = [
    commonValidations.variantId,
    commonValidations.imageId
];

const deleteVariantImageValidator = [
    commonValidations.variantId,
    commonValidations.imageId
];

const getProductVariantsValidator = [
    commonValidations.productId
];

const getProductVariantValidator = [
    commonValidations.variantId
];

const updateProductAttributesValidator = [
    commonValidations.productId,
    body('attributes')
        .isArray()
        .withMessage('Attributes must be an array')
        .notEmpty()
        .withMessage('Attributes array cannot be empty'),
    body('attributes.*.attribute_id')
        .isInt({ min: 1 })
        .withMessage('Invalid attribute ID'),
    body('attributes.*.term_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Invalid term ID'),
    body('attributes.*.term_ids')
        .optional()
        .isArray()
        .withMessage('term_ids must be an array')
        .custom((value, { req, path }) => {
            if (!value || value.length === 0) {
                throw new Error('term_ids array cannot be empty');
            }
            return true;
        }),
    body('attributes.*.term_ids.*')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Invalid term ID in term_ids array'),
    body('attributes.*.is_visible_page')
        .optional()
        .isBoolean()
        .withMessage('is_visible_page must be a boolean'),
    body('attributes.*.used_in_variation')
        .optional()
        .isBoolean()
        .withMessage('used_in_variation must be a boolean'),
    body('attributes')
        .custom((value, { req }) => {
            for (const attr of value) {
                if (!attr.term_id && !attr.term_ids) {
                    throw new Error('Either term_id or term_ids must be provided for each attribute');
                }
                if (attr.term_id && attr.term_ids) {
                    throw new Error('Cannot provide both term_id and term_ids for the same attribute');
                }
            }
            return true;
        })
];

const removeProductAttributeTermValidator = [
    ...commonValidations.attributeTermId,
    commonValidations.productId
];

const generateVariantsValidator = [
    param('product_id')
        .isInt({ min: 1 })
        .withMessage('Product ID must be a positive integer')
];

const bulkUpdateVariantsDirectValidator = [
    commonValidations.productId,
    body('updates')
        .isObject()
        .withMessage('Updates must be an object'),
    body('updates.regular_price')
        .optional()
        .isObject()
        .withMessage('Regular price update must be an object')
        .custom((value) => {
            if (!['set', 'increase', 'decrease'].includes(value.type)) {
                throw new Error('Regular price update type must be set, increase, or decrease');
            }
            if (typeof value.value !== 'number' || value.value < 0) {
                throw new Error('Regular price value must be a positive number');
            }
            if (typeof value.is_percentage !== 'boolean') {
                throw new Error('is_percentage must be a boolean');
            }
            return true;
        }),
    body('updates.discount_price')
        .optional()
        .isObject()
        .withMessage('Discount price update must be an object')
        .custom((value) => {
            if (!['set', 'increase', 'decrease'].includes(value.type)) {
                throw new Error('Discount price update type must be set, increase, or decrease');
            }
            if (typeof value.value !== 'number' || value.value < 0) {
                throw new Error('Discount price value must be a positive number');
            }
            if (typeof value.is_percentage !== 'boolean') {
                throw new Error('is_percentage must be a boolean');
            }
            return true;
        }),
    body('updates.purchase_price')
        .optional()
        .isObject()
        .withMessage('Purchase price update must be an object')
        .custom((value) => {
            if (!['set', 'increase', 'decrease'].includes(value.type)) {
                throw new Error('Purchase price update type must be set, increase, or decrease');
            }
            if (typeof value.value !== 'number' || value.value < 0) {
                throw new Error('Purchase price value must be a positive number');
            }
            if (typeof value.is_percentage !== 'boolean') {
                throw new Error('is_percentage must be a boolean');
            }
            return true;
        }),
    body('updates.weight')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Weight must be a positive number'),
    body('updates.length')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Length must be a positive number'),
    body('updates.width')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Width must be a positive number'),
    body('updates.height')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Height must be a positive number'),
    body('updates.stock')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Stock must be a non-negative integer'),
    body('updates.low_stock_threshold')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Low stock threshold must be a non-negative integer'),
    body('updates.stock_status')
        .optional()
        .isIn(['in_stock', 'out_of_stock', 'low_stock'])
        .withMessage('Invalid stock status'),
    body('updates.status')
        .optional()
        .isIn(['active', 'inactive'])
        .withMessage('Invalid status')
];

module.exports = {
    addProductAttributesValidator,
    createProductVariantsValidator,
    updateProductVariantValidator,
    uploadVariantImagesValidator,
    setVariantPrimaryImageValidator,
    deleteVariantImageValidator,
    getProductVariantsValidator,
    getProductVariantValidator,
    uploadVariantImageMiddleware,
    updateProductAttributesValidator,
    removeProductAttributeTermValidator,
    bulkUpdateVariantsValidator,
    uploadExcelMiddleware,
    generateVariantsValidator,
    bulkUpdateVariantsDirectValidator
};
