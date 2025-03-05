const { body, param } = require('express-validator');
const multer = require("multer");
const path = require("path");

// Common validations
const commonValidations = {
    productId: param('product_id')
        .isInt()
        .withMessage('Invalid product ID'),
    
    variantId: param('variant_id')
        .isInt()
        .withMessage('Invalid variant ID'),
    
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
            .isString()
            .trim()
            .isLength({ min: 3, max: 100 })
            .withMessage('Slug must be between 3 and 100 characters'),
        body('price')
            .optional()
            .isFloat({ min: 0 })
            .withMessage('Price must be a positive number'),
        body('discount_price')
            .optional()
            .isFloat({ min: 0 })
            .withMessage('Discount price must be a positive number')
            .custom((value, { req }) => {
                if (value >= req.body.price) {
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
            .withMessage('Stock must be a positive integer'),
        body('low_stock_threshold')
            .optional()
            .isInt({ min: 0 })
            .withMessage('Low stock threshold must be a positive integer'),
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
            .withMessage('Status must be either active or inactive')
    ],

    attributeTermId: [
        param('attribute_term_id') // Assuming the ID is passed as a URL parameter
            .exists().withMessage('Attribute Term ID is required')
            .isInt().withMessage('Attribute Term ID must be a valid integer'), // Adjust based on your ID type
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

// Middleware for variant image upload validation
const uploadVariantImageMiddleware = (req, res, next) => {
    upload.array("files", 10)(req, res, (err) => { // Allow up to 10 images
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

        // Validate if any files were uploaded
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

// Validator configurations
const addProductAttributesValidator = [
    commonValidations.productId,
    ...commonValidations.attributeValidation,
    body('attributes.*.is_visible_page')
        .optional()
        .isBoolean()
        .withMessage('is_visible_page must be boolean'),
    body('attributes.*.used_in_variation')
        .optional()
        .isBoolean()
        .withMessage('used_in_variation must be boolean')
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
        .isString()
        .trim()
        .isLength({ min: 3, max: 100 })
        .withMessage('Variant slug must be between 3 and 100 characters'),
    body('variants.*.price')
        .isFloat({ min: 0 })
        .withMessage('Variant price must be a positive number'),
    ...commonValidations.variantBaseFields,
    body('variants.*.attributes')
        .isArray()
        .withMessage('Variant attributes must be an array')
];

const updateProductVariantValidator = [
    commonValidations.variantId,
    ...commonValidations.variantBaseFields,
    body('attributes')
        .optional()
        .isArray()
        .withMessage('Attributes must be an array'),
    body('attributes.*.attribute_id')
        .optional()
        .isInt()
        .withMessage('Invalid attribute ID'),
    body('attributes.*.term_id')
        .optional()
        .isInt()
        .withMessage('Invalid term ID')
];

// Modified uploadVariantImagesValidator to use with multer
const uploadVariantImagesValidator = [
    commonValidations.variantId,
    // File validation is handled by uploadVariantImageMiddleware
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
        .withMessage('Attributes must be an array'),
    body('attributes.*.attribute_id')
        .isInt()
        .withMessage('Invalid attribute ID')
];
const removeProductAttributeTermValidator = [
    ...commonValidations.attributeTermId,
    commonValidations.productId
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
    removeProductAttributeTermValidator
};
