const { body, query, param } = require('express-validator');
const multer = require('multer');
const path = require('path');

// Multer configuration for multiple image uploads
const uploadImageMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG and WEBP are allowed.'), false);
        }
    }
}).fields([
    { name: 'image', maxCount: 1 },
    { name: 'image_low', maxCount: 1 }
]);

// Validation middleware for image upload
const validateImageUpload = (req, res, next) => {
    uploadImageMiddleware(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({
                message: "File upload error",
                error: err.message
            });
        } else if (err) {
            return res.status(400).json({
                message: "Invalid file",
                error: err.message
            });
        }
        next();
    });
};

// Validation rules for creating a banner
const createBannerValidation = [
    body('title')
        .optional()
        .isString().withMessage('Title must be a string')
        .trim()
        .isLength({ max: 255 }).withMessage('Title must be less than 255 characters'),
    
    body('description')
        .optional()
        .isString().withMessage('Description must be a string')
        .trim(),
    
    body('status')
        .optional()
        .isIn(['active', 'inactive']).withMessage('Status must be either active or inactive'),
    
    body('redirect_url')
        .optional()
        .custom((value) => {
            if (value === '#') return true;
            
            try {
                new URL(value);
                return true;
            } catch (e) {
                if (!/^[a-zA-Z0-9-_/]+$/.test(value)) {
                    throw new Error('Redirect URL must be "#", a valid URL, or contain only letters, numbers, hyphens, underscores, and forward slashes');
                }
            }
            return true;
        }),
];

// Validation rules for updating a banner
const updateBannerValidation = [
    param('id')
        .isInt().withMessage('Invalid banner ID'),
    
    body('title')
        .optional()
        .isString().withMessage('Title must be a string')
        .trim()
        .isLength({ max: 255 }).withMessage('Title must be less than 255 characters'),
    
    body('description')
        .optional()
        .isString().withMessage('Description must be a string')
        .trim(),
    
    body('status')
        .optional()
        .isIn(['active', 'inactive']).withMessage('Status must be either active or inactive'),
    
    body('redirect_url')
        .optional()
        .custom((value) => {
            if (value === '#') return true;
            
            try {
                new URL(value);
                return true;
            } catch (e) {
                if (!/^[a-zA-Z0-9-_/]+$/.test(value)) {
                    throw new Error('Redirect URL must be "#", a valid URL, or contain only letters, numbers, hyphens, underscores, and forward slashes');
                }
            }
            return true;
        }),
];

// Validation rules for getting banners
const getBannersValidation = [
    query('page')
        .optional()
        .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1 }).withMessage('Limit must be a positive integer'),
    query('sort_by')
        .optional()
        .isIn(['id', 'display_order', 'title', 'createdAt', 'updatedAt'])
        .withMessage('Sort by must be one of: id, display_order, title, createdAt, updatedAt'),
    query('order')
        .optional()
        .isIn(['ASC', 'DESC'])
        .withMessage('Order must be either ASC or DESC'),
    query('search')
        .optional()
        .isString()
        .withMessage('Search must be a string'),
    query('deleted')
        .optional()
        .isBoolean()
        .withMessage('Deleted must be a boolean value'),
    query('status')
        .optional()
        .isIn(['active', 'inactive'])
        .withMessage('Status must be either active or inactive')
];

// Validation rules for deleting a banner
const deleteBannerValidation = [
    param('id')
        .isInt().withMessage('Invalid banner ID')
];

const bannerIdValidation = [
    param('id')
        .isInt().withMessage('Invalid banner ID')
];

const shuffleBannerValidation = [
    param('id').isInt().withMessage('Invalid banner ID'),
    body('new_display_order').isInt().withMessage('New display order must be an integer')
];

module.exports = {
    validateImageUpload,
    createBannerValidation,
    updateBannerValidation,
    getBannersValidation,
    deleteBannerValidation,
    bannerIdValidation,
    shuffleBannerValidation
}; 