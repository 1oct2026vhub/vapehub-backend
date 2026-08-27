const multer = require('multer');
const path = require('path');
const { param } = require('express-validator');
const {
    parseBuyingGuideBody,
    validateBuyingGuidePayload
} = require('./buyingGuidePayload.helper');

const BANNER_MAX_MB = 5;
const BANNER_FILE_SIZE_LIMIT = BANNER_MAX_MB * 1024 * 1024;

const buyingGuideIdValidation = [
    param('id').isInt().withMessage('Category ID must be an integer')
];

const storage = multer.memoryStorage();
const bannerUpload = multer({
    storage,
    limits: {
        fileSize: BANNER_FILE_SIZE_LIMIT
    },
    fileFilter: (req, file, cb) => {
        const allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp'];
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
        const ext = path.extname(file.originalname).toLowerCase();

        if (!allowedExtensions.includes(ext) || !allowedMimeTypes.includes(file.mimetype)) {
            return cb(new Error('Invalid banner image format'), false);
        }

        cb(null, true);
    }
}).single('banner_image');

const buyingGuideUploadValidation = (req, res, next) => {
    bannerUpload(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            const message = err.code === 'LIMIT_FILE_SIZE'
                ? 'Banner image exceeds maximum size'
                : err.message;
            return res.status(400).json({
                success: false,
                message,
                errors: [{ field: 'banner_image', message }]
            });
        }

        if (err) {
            return res.status(400).json({
                success: false,
                message: err.message || 'Invalid banner image format',
                errors: [{ field: 'banner_image', message: err.message }]
            });
        }

        next();
    });
};

const buyingGuideBodyValidation = (req, res, next) => {
    const categoryId = parseInt(req.params.id, 10);
    if (Number.isNaN(categoryId)) {
        return res.status(400).json({
            success: false,
            message: 'Category ID must be an integer',
            errors: [{ field: 'id', message: 'Category ID must be an integer' }]
        });
    }

    try {
        const payload = parseBuyingGuideBody(req.body);
        validateBuyingGuidePayload(payload);
        req.buyingGuidePayload = payload;
        next();
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message || 'Validation failed',
            errors: [{ field: 'buyingGuide', message: error.message }]
        });
    }
};

module.exports = {
    buyingGuideIdValidation,
    buyingGuideBodyValidation,
    buyingGuideUploadValidation,
    BANNER_MAX_MB
};
