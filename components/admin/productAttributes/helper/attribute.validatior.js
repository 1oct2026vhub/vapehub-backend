const { body, param, query } = require('express-validator');
const constants = require('../../../../config/constants');
const multer = require('multer');
const path = require('path');

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
        .default('custom')
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
        .withMessage('Invalid sort order')
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

exports.bulkUpdateAttributesValidator = [
    body('file')
    .custom((value, { req }) => {
        if (!req.file) {
            throw new Error('File must be uploaded');
        }
        return true;
    }),
];
