const router = require('express').Router();
const multer = require('multer');
const authenticateJWT = require('../../auth/middleware/authMiddleware');
const { check, param, query } = require('express-validator');
const { validateRequest } = require('../../../utils/validationMiddleware');
const controller = require('../domain/entityBanner.controller');

const TYPE_ENUM = ['brand', 'category', 'deal'];

// Configure multer for handling image uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP are allowed.'), false);
        }
    }
});

// Middleware for image upload validation
const validateImageUpload = (req, res, next) => {
    upload.single('image')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({
                success: false,
                message: "File upload error",
                errors: [{ path: "image", msg: err.message }],
            });
        } else if (err) {
            return res.status(400).json({
                success: false,
                message: "Invalid file type",
                errors: [{ path: "image", msg: err.message }],
            });
        }
        next();
    });
};

router.get('/',
    validateRequest([
        query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
        query('limit').optional().isInt({ min: 1 }).withMessage('limit must be a positive integer'),
        query('type').optional().isIn(TYPE_ENUM).withMessage('type must be one of brand, category, deal'),
        query('brand_id').optional().isInt({ min: 1 }).withMessage('brand_id must be an integer'),
        query('category_id').optional().isInt({ min: 1 }).withMessage('category_id must be an integer'),
        query('deals_id').optional().isInt({ min: 1 }).withMessage('deals_id must be an integer'),
    ]),
    controller.listEntityBanners
);

router.get('/:id',
    validateRequest([
        param('id').isInt({ min: 1 }).withMessage('id must be a positive integer')
    ]),
    controller.getEntityBanner
);

router.post('/',
    authenticateJWT,
    validateImageUpload,
    validateRequest([
        check('type').isIn(TYPE_ENUM).withMessage('type must be one of brand, category, deal'),
        check('brand_id').optional().isInt({ min: 1 }).withMessage('brand_id must be an integer'),
        check('category_id').optional().isInt({ min: 1 }).withMessage('category_id must be an integer'),
        check('deals_id').optional().isInt({ min: 1 }).withMessage('deals_id must be an integer'),
        check('order').optional().isInt({ min: 0 }).withMessage('order must be an integer >= 0'),
        // Removed image URL validation - image will be handled as file upload or URL in controller
        check('url').optional().isURL().withMessage('url must be a valid URL'),
        check('alt').optional().isString().withMessage('alt must be a string')
    ]),
    controller.createEntityBanner
);

router.put('/:id',
    authenticateJWT,
    validateImageUpload,
    validateRequest([
        param('id').isInt({ min: 1 }).withMessage('id must be a positive integer'),
        check('type').optional().isIn(TYPE_ENUM).withMessage('type must be one of brand, category, deal'),
        check('brand_id').optional().isInt({ min: 1 }).withMessage('brand_id must be an integer'),
        check('category_id').optional().isInt({ min: 1 }).withMessage('category_id must be an integer'),
        check('deals_id').optional().isInt({ min: 1 }).withMessage('deals_id must be an integer'),
        check('order').optional().isInt({ min: 0 }).withMessage('order must be an integer >= 0'),
        // Removed image URL validation - image will be handled as file upload or URL in controller
        check('url').optional().isURL().withMessage('url must be a valid URL'),
        check('alt').optional().isString().withMessage('alt must be a string')
    ]),
    controller.updateEntityBanner
);

router.delete('/:id',
    authenticateJWT,
    validateRequest([
        param('id').isInt({ min: 1 }).withMessage('id must be a positive integer')
    ]),
    controller.deleteEntityBanner
);

module.exports = router;
