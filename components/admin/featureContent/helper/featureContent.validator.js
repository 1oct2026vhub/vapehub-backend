const { body, param, query } = require('express-validator');
const multer = require('multer');

// Validation for feature content ID
const featureContentIdValidation = [
    param('id')
        .isInt()
        .withMessage('Invalid feature content ID')
];

// Validation for creating feature content
const featureContentValidation = [
    body('title')
        .trim()
        .notEmpty()
        .withMessage('Title is required')
        .isLength({ max: 255 })
        .withMessage('Title must be less than 255 characters'),
    
    body('subtitle')
        .trim()
        .notEmpty()
        .withMessage('Subtitle is required')
        .isLength({ max: 500 })
        .withMessage('Subtitle must be less than 500 characters'),
    
    body('icon_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Icon ID must be a positive integer'),
    
    body('status')
        .optional()
        .isIn(['active', 'inactive'])
        .withMessage('Status must be either active or inactive')
];

// Validation for updating feature content
const featureContentUpdateValidation = [
    body('title')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Title cannot be empty')
        .isLength({ max: 255 })
        .withMessage('Title must be less than 255 characters'),
    
    body('subtitle')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Subtitle cannot be empty')
        .isLength({ max: 500 })
        .withMessage('Subtitle must be less than 500 characters'),
    
    body('icon_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Icon ID must be a positive integer'),
    
    body('status')
        .optional()
        .isIn(['active', 'inactive'])
        .withMessage('Status must be either active or inactive')
];

// Validation for filtering feature content
const filterValidations = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    
    query('search')
        .optional()
        .isString()
        .withMessage('Search must be a string'),
    
    query('sort')
        .optional()
        .isIn(['id', 'title', 'subtitle', 'status', 'createdAt', 'updatedAt'])
        .withMessage('Sort must be one of: id, title, subtitle, status, createdAt, updatedAt'),
    
    query('order')
        .optional()
        .isIn(['ASC', 'DESC'])
        .withMessage('Order must be either ASC or DESC'),
    
    query('deleted')
        .optional()
        .isIn(['true', 'false', '0', '1'])
        .withMessage('Deleted must be true, false, 0, or 1'),
    
    query('status')
        .optional()
        .isIn(['active', 'inactive'])
        .withMessage('Status must be either active or inactive')
];

// Validation for icon filtering
const iconFilterValidations = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    
    query('search')
        .optional()
        .isString()
        .withMessage('Search must be a string'),
    
    query('sort')
        .optional()
        .isIn(['id', 'file_name', 'icon_url', 'createdAt'])
        .withMessage('Sort must be one of: id, file_name, icon_url, createdAt'),
    
    query('order')
        .optional()
        .isIn(['ASC', 'DESC'])
        .withMessage('Order must be either ASC or DESC'),
    
    query('deleted')
        .optional()
        .isIn(['true', 'false', '0', '1'])
        .withMessage('Deleted must be true, false, 0, or 1')
];

// File upload validation for icons
const uploadFileValidation = (req, res, next) => {
    // Configure multer for file upload
    const storage = multer.memoryStorage();
    
    const fileFilter = (req, file, cb) => {
        // Check file type
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
        
        if (!allowedMimeTypes.includes(file.mimetype)) {
            return cb(new Error('Invalid file type. Only JPEG, JPG, PNG, GIF, WebP, and SVG images are allowed.'), false);
        }
        
        // Check file size (5MB limit)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            return cb(new Error('File size too large. Maximum size is 5MB.'), false);
        }
        
        cb(null, true);
    };
    
    const upload = multer({
        storage: storage,
        fileFilter: fileFilter,
        limits: {
            fileSize: 5 * 1024 * 1024 // 5MB
        }
    });
    
    // Use single file upload for 'icon' field
    const uploadSingle = upload.single('icon');
    
    uploadSingle(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    success: false,
                    message: 'File size too large. Maximum size is 5MB.'
                });
            }
            return res.status(400).json({
                success: false,
                message: 'File upload error: ' + err.message
            });
        } else if (err) {
            return res.status(400).json({
                success: false,
                message: err.message
            });
        }
        
        // File is optional, so we don't need to check if it exists
        next();
    });
};

module.exports = {
    featureContentIdValidation,
    featureContentValidation,
    featureContentUpdateValidation,
    filterValidations,
    iconFilterValidations,
    uploadFileValidation,
    bulkFeatureContentValidation: [
        body('ids')
            .isArray({ min: 1 })
            .withMessage('IDs must be a non-empty array'),
        body('ids.*')
            .isInt({ min: 1 })
            .withMessage('Each ID must be a positive integer')
    ]
};
