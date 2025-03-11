const { body, query, param } = require('express-validator');
const multer = require('multer');

const uploadImageMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
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
    { name: 'image_mid', maxCount: 1 },
    { name: 'image_low', maxCount: 1 }
]);

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

const createCarouselValidation = [
    body('display_order')
        .notEmpty().withMessage('Display order is required')
        .isInt({ min: 1 }).withMessage('Display order must be a positive integer'),
    
    body('title')
        .optional()
        .isString().withMessage('Title must be a string')
        .trim()
        .isLength({ max: 255 }).withMessage('Title must be less than 255 characters'),
    
    body('description')
        .optional()
        .isString().withMessage('Description must be a string')
        .trim()
];

const updateCarouselValidation = [
    param('id')
        .isInt().withMessage('Invalid carousel ID'),
    
    body('display_order')
        .optional()
        .isInt({ min: 1 }).withMessage('Display order must be a positive integer'),
    
    body('title')
        .optional()
        .isString().withMessage('Title must be a string')
        .trim()
        .isLength({ max: 255 }).withMessage('Title must be less than 255 characters'),
    
    body('description')
        .optional()
        .isString().withMessage('Description must be a string')
        .trim()
];

const getCarouselsValidation = [
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

const deleteCarouselValidation = [
    param('id')
        .isInt().withMessage('Invalid carousel ID')
];

const getCarouselDetailsValidation = [
    param('id')
        .isInt().withMessage('Invalid carousel ID')
];

module.exports = {
    validateImageUpload,
    createCarouselValidation,
    updateCarouselValidation,
    getCarouselsValidation,
    deleteCarouselValidation,
    getCarouselDetailsValidation,
}; 