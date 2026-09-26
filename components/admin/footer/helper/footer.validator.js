const { body, query, param } = require('express-validator');
const multer = require('multer');
const path = require('path');

const MB = 1024 * 1024;
const FOOTER_BADGE_ICON_MAX_MB = parseInt(process.env.FOOTER_BADGE_ICON_MAX_MB || '2', 10);
const FOOTER_BADGE_ICON_FILE_SIZE_LIMIT = FOOTER_BADGE_ICON_MAX_MB * MB;

const optionalBooleanSanitizer = (value) => {
    if (value === true || value === 'true' || value === '1') return true;
    if (value === false || value === 'false' || value === '0') return false;
    return value;
};

const optionalUrlValidator = (value) => {
    if (value == null || String(value).trim() === '') {
        return true;
    }
    const trimmed = String(value).trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return true;
    }
    return /^[a-zA-Z0-9-/_]+$/.test(trimmed);
};

const getFooterSectionsValidation = [
    query('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active must be a boolean')
];

const getFooterLinksValidation = [
    query('section_id')
        .optional()
        .isInt()
        .withMessage('Section ID must be an integer'),
    query('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active must be a boolean')
];

const createFooterSectionValidation = [
    body('title')
        .trim()
        .notEmpty()
        .withMessage('Title is required')
        .isLength({ min: 1, max: 100 })
        .withMessage('Title must be between 1 and 100 characters'),
    body('order')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Order must be a non-negative integer'),
    body('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active must be a boolean')
];

const updateFooterSectionValidation = [
    param('id')
        .isInt()
        .withMessage('Invalid section ID'),
    body('title')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Title cannot be empty')
        .isLength({ min: 1, max: 100 })
        .withMessage('Title must be between 1 and 100 characters'),
    body('order')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Order must be a non-negative integer'),
    body('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active must be a boolean')
];

const createFooterLinkValidation = [
    body('section_id')
        .isInt()
        .withMessage('Section ID must be an integer')
        .notEmpty()
        .withMessage('Section ID is required'),
    body('label')
        .trim()
        .notEmpty()
        .withMessage('Label is required')
        .isLength({ min: 1, max: 100 })
        .withMessage('Label must be between 1 and 100 characters'),
    body('url')
        .trim()
        .notEmpty()
        .withMessage('URL is required')
        .custom((value) => {
            // Allow both URLs and slugs
            if (value.startsWith('http://') || value.startsWith('https://')) {
                return true; // Valid URL
            }
            // For slugs, just ensure it's not empty and contains valid characters
            return /^[a-zA-Z0-9-/_]+$/.test(value);
        })
        .withMessage('URL must be either a valid URL or a valid slug'),
    body('order')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Order must be a non-negative integer'),
    body('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active must be a boolean')
];

const updateFooterLinkValidation = [
    param('id')
        .isInt()
        .withMessage('Invalid link ID'),
    body('section_id')
        .optional()
        .isInt()
        .withMessage('Section ID must be an integer')
        .notEmpty()
        .withMessage('Section ID cannot be empty'),
    body('label')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Label cannot be empty')
        .isLength({ min: 1, max: 100 })
        .withMessage('Label must be between 1 and 100 characters'),
    body('url')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('URL cannot be empty')
        .custom((value) => {
            // Allow both URLs and slugs
            if (value.startsWith('http://') || value.startsWith('https://')) {
                return true; // Valid URL
            }
            // For slugs, just ensure it's not empty and contains valid characters
            return /^[a-zA-Z0-9-/_]+$/.test(value);
        })
        .withMessage('URL must be either a valid URL or a valid slug'),
    body('order')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Order must be a non-negative integer'),
    body('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active must be a boolean')
];

const reorderFooterSectionValidation = [
    param('id')
        .isInt()
        .withMessage('Invalid section ID'),
    body('new_order')
        .isInt({ min: 0 })
        .withMessage('New order must be a non-negative integer')
        .notEmpty()
        .withMessage('New order is required')
];

const reorderFooterLinkValidation = [
    param('id')
        .isInt()
        .withMessage('Invalid link ID'),
    body('new_order')
        .isInt({ min: 0 })
        .withMessage('New order must be a non-negative integer')
        .notEmpty()
        .withMessage('New order is required')
];

const getFooterBadgesValidation = [
    query('is_active')
        .optional()
        .isBoolean()
        .withMessage('is_active must be a boolean')
];

const createFooterBadgeValidation = [
    body('heading')
        .trim()
        .notEmpty()
        .withMessage('Heading is required')
        .isLength({ min: 1, max: 100 })
        .withMessage('Heading must be between 1 and 100 characters'),
    body('subtitle')
        .trim()
        .notEmpty()
        .withMessage('Subtitle is required')
        .isLength({ min: 1, max: 100 })
        .withMessage('Subtitle must be between 1 and 100 characters'),
    body('url')
        .optional({ nullable: true, checkFalsy: true })
        .custom(optionalUrlValidator)
        .withMessage('URL must be either a valid URL or a valid slug'),
    body('order')
        .optional()
        .toInt()
        .isInt({ min: 0 })
        .withMessage('Order must be a non-negative integer'),
    body('is_active')
        .optional()
        .customSanitizer(optionalBooleanSanitizer)
        .isBoolean()
        .withMessage('is_active must be a boolean')
];

const updateFooterBadgeValidation = [
    param('id')
        .isInt()
        .withMessage('Invalid badge ID'),
    body('heading')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Heading cannot be empty')
        .isLength({ min: 1, max: 100 })
        .withMessage('Heading must be between 1 and 100 characters'),
    body('subtitle')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Subtitle cannot be empty')
        .isLength({ min: 1, max: 100 })
        .withMessage('Subtitle must be between 1 and 100 characters'),
    body('url')
        .optional({ nullable: true })
        .custom(optionalUrlValidator)
        .withMessage('URL must be either a valid URL or a valid slug'),
    body('order')
        .optional()
        .toInt()
        .isInt({ min: 0 })
        .withMessage('Order must be a non-negative integer'),
    body('is_active')
        .optional()
        .customSanitizer(optionalBooleanSanitizer)
        .isBoolean()
        .withMessage('is_active must be a boolean')
];

const reorderFooterBadgeValidation = [
    param('id')
        .isInt()
        .withMessage('Invalid badge ID'),
    body('new_order')
        .isInt({ min: 0 })
        .withMessage('New order must be a non-negative integer')
        .notEmpty()
        .withMessage('New order is required')
];

const badgeIconUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: FOOTER_BADGE_ICON_FILE_SIZE_LIMIT
    },
    fileFilter: (req, file, cb) => {
        const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            return cb(new Error('Only .png, .jpg, .jpeg, .webp, .svg files are allowed!'), false);
        }
        cb(null, true);
    }
});

const uploadBadgeIconValidation = (req, res, next) => {
    badgeIconUpload.single('icon')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            const msg = err.code === 'LIMIT_FILE_SIZE'
                ? `Icon exceeds the maximum allowed size of ${FOOTER_BADGE_ICON_MAX_MB}MB.`
                : err.message;
            const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
            return res.status(status).json({
                success: false,
                message: msg,
                errors: [{ path: err.field || 'icon', msg }]
            });
        }
        if (err) {
            return res.status(400).json({
                success: false,
                message: err.message || 'Invalid file',
                errors: [{ path: 'icon', msg: err.message }]
            });
        }
        next();
    });
};

module.exports = {
    getFooterSectionsValidation,
    getFooterLinksValidation,
    createFooterSectionValidation,
    updateFooterSectionValidation,
    createFooterLinkValidation,
    updateFooterLinkValidation,
    reorderFooterSectionValidation,
    reorderFooterLinkValidation,
    getFooterBadgesValidation,
    createFooterBadgeValidation,
    updateFooterBadgeValidation,
    reorderFooterBadgeValidation,
    uploadBadgeIconValidation
}; 