const { body, param, query } = require('express-validator');
const constants = require('../../../../config/constants');
const multer = require('multer');
const path = require('path');

// Configure multer for handling image uploads
const imageStorage = multer.memoryStorage();
const imageUpload = multer({
    storage: imageStorage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml'];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, GIF and SVG are allowed.'), false);
        }
    },
});

// Configure multer for handling Excel file uploads
const excelStorage = multer.memoryStorage();
const excelUpload = multer({
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

// Middleware for image upload
exports.uploadImageMiddleware = imageUpload.single('image');

// Middleware for Excel file upload
exports.uploadExcelMiddleware = excelUpload.single('file');

exports.createAttributeValidator = [
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
        .withMessage('Description must be less than 1000 characters'),

    body('type')
        .optional()
        .isIn(constants.attributeEnums.types)
        .withMessage('Invalid attribute type')
        .default('select'),

    body('sort_order')
        .optional()
        .isIn(constants.attributeEnums.sortOrders)
        .withMessage('Invalid sort order')
        .default('custom'),

    body('image')
        .custom((value, { req }) => {
            if (req.file && !['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml'].includes(req.file.mimetype)) {
                throw new Error('Invalid file type. Only JPEG, PNG, GIF and SVG are allowed.');
            }
            return true;
        })
];

exports.updateAttributeValidator = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Invalid attribute ID'),

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
        .withMessage('Description must be less than 1000 characters'),

    body('type')
        .optional()
        .isIn(constants.attributeEnums.types)
        .withMessage('Invalid attribute type'),

    body('sort_order')
        .optional()
        .isIn(constants.attributeEnums.sortOrders)
        .withMessage('Invalid sort order'),

    body('new_image')
        .optional()
        .isBoolean()
        .withMessage('new_image must be a boolean'),

    body('image')
        .custom((value, { req }) => {
            if (req.file && !['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml'].includes(req.file.mimetype)) {
                throw new Error('Invalid file type. Only JPEG, PNG, GIF and SVG are allowed.');
            }
            return true;
        })
];

exports.getAttributeValidator = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Invalid attribute ID')
];

exports.deleteAttributeValidator = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Invalid attribute ID')
];

exports.getAttributesValidator = [
  query('sort_by')
      .optional()
      .isIn(['id', 'name', 'slug', 'type', 'sort_order', 'created_at', 'updated_at'])
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

exports.bulkUpdateAttributesValidator = [
    body('file')
    .custom((value, { req }) => {
        if (!req.file) {
            throw new Error('File must be uploaded');
        }
        return true;
    }),
];

exports.removeAttributeImageValidator = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Invalid attribute ID')
];
