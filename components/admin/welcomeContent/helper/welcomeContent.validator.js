const { body, param, query } = require('express-validator');
const multer = require('multer');
const path = require('path');

const welcomeContentIdValidation = [
    param('id')
        .isInt()
        .withMessage('Invalid welcome content ID')
];

const welcomeContentValidation = [
    body('title')
        .trim()
        .notEmpty()
        .withMessage('Title is required')
        .isLength({ max: 255 })
        .withMessage('Title must be less than 255 characters'),
    
    body('content')
        .custom((value) => {
            if (!value || value.trim() === '') {
                throw new Error('Content is required');
            }
            return true;
        }),
    
    body('status')
        .optional()
        .isIn(['active', 'inactive'])
        .withMessage('Status must be either active or inactive')
];



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
        .isIn(['id', 'title', 'status', 'createdAt', 'updatedAt'])
        .withMessage('Sort must be one of: id, title, status, createdAt, updatedAt'),
    
    query('order')
        .optional()
        .isIn(['ASC', 'DESC'])
        .withMessage('Order must be either ASC or DESC'),
    
    query('deleted')
        .optional()
        .isBoolean()
        .withMessage('Deleted must be a boolean'),
    
    query('status')
        .optional()
        .isIn(['active', 'inactive'])
        .withMessage('Status must be either active or inactive')
];

// File upload validation
const uploadFileValidation = (req, res, next) => {
    // Configure multer for file upload
    const storage = multer.memoryStorage();
    
    const fileFilter = (req, file, cb) => {
        // Check file type
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        
        if (!allowedMimeTypes.includes(file.mimetype)) {
            return cb(new Error('Invalid file type. Only JPEG, JPG, PNG, GIF, and WebP images are allowed.'), false);
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
    
    // Use single file upload for 'image' field
    const uploadSingle = upload.single('image');
    
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
    welcomeContentIdValidation,
    welcomeContentValidation,
    filterValidations,
    uploadFileValidation
};
