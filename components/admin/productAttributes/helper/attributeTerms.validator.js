const { body, param, query } = require('express-validator');
const multer = require('multer');
const path = require('path');

exports.createTermValidator = [
    body('attribute_id')
        .notEmpty()
        .withMessage('Attribute ID is required')
        .isInt({ min: 1 })
        .withMessage('Invalid attribute ID'),

    body('name')
        .trim()
        .notEmpty()
        .withMessage('Name is required')
        .isLength({ max: 255 })
        .withMessage('Name must be less than 255 characters'),

    body('slug')
        .trim()
        .notEmpty()
        .withMessage('Slug is required')
        .isLength({ max: 255 })
        .withMessage('Slug must be less than 255 characters')
        .matches(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/)
        .withMessage('Slug must contain only lowercase letters, numbers, and hyphens'),

    body('description')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Description must be less than 1000 characters')
];

exports.updateTermValidator = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Invalid term ID'),

    body('name')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Name cannot be empty')
        .isLength({ max: 255 })
        .withMessage('Name must be less than 255 characters'),

    body('slug')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Slug cannot be empty')
        .isLength({ max: 255 })
        .withMessage('Slug must be less than 255 characters')
        .matches(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/)
        .withMessage('Slug must contain only lowercase letters, numbers, and hyphens'),

    body('description')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Description must be less than 1000 characters')
];

exports.getTermValidator = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Invalid term ID')
];

exports.deleteTermValidator = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Invalid term ID')
];

exports.restoreTermValidator = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Invalid term ID')
];

exports.getTermsValidator = [
    query('attribute_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Invalid attribute ID'),

    query('sort_by')
        .optional()
        .isIn(['id', 'name', 'slug', 'created_at', 'updated_at'])
        .withMessage('Invalid sort field'),

    query('order')
        .optional()
        .isIn(['ASC', 'DESC', 'asc', 'desc'])
        .withMessage('Order must be ASC or DESC'),

    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),

    query('offset')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Offset must be a non-negative integer'),

    query('keyword')
        .optional()
        .isString()
        .trim()
        .isLength({ max: 255 })
        .withMessage('Keyword must be less than 255 characters'),

    query('show_deleted')
        .optional()
        .isBoolean()
        .withMessage('show_deleted must be true or false')
];

// Configure multer for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({
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

// Middleware for file upload
exports.uploadFileMiddleware = upload.single('file');

exports.bulkUpdateTermsValidator = [
    body('file')
        .custom((value, { req }) => {
            if (!req.file) {
                throw new Error('File must be uploaded');
            }
            return true;
        }),
];
