const { body, param, query } = require('express-validator');
const multer = require('multer');
const path = require('path');
const { Blog } = require('../../../../models');
const { Op } = require('sequelize');

const MB = 1024 * 1024;
const BLOG_CONTENT_MAX_MB = parseInt(process.env.BLOG_CONTENT_MAX_MB || '10', 10);
const BLOG_IMAGE_MAX_MB = parseInt(process.env.BLOG_IMAGE_MAX_MB || '5', 10);
const BLOG_IMAGE_FILE_SIZE_LIMIT = BLOG_IMAGE_MAX_MB * MB;
const BLOG_CONTENT_FIELD_SIZE_LIMIT = BLOG_CONTENT_MAX_MB * MB;
const BLOG_MAX_NON_FILE_FIELDS = 50;

const contentTooLargeMessage = () =>
    `Blog content exceeds the maximum size of ${BLOG_CONTENT_MAX_MB}MB. Remove large pasted images or save again after images are uploaded.`;

const assertContentWithinSizeLimit = (value) => {
    if (value == null || value === '') {
        return;
    }
    const sizeBytes = Buffer.byteLength(String(value), 'utf8');
    if (sizeBytes > BLOG_CONTENT_FIELD_SIZE_LIMIT) {
        const sizeMb = (sizeBytes / MB).toFixed(1);
        throw new Error(
            `Blog content is ${sizeMb}MB, which exceeds the maximum allowed size of ${BLOG_CONTENT_MAX_MB}MB.`
        );
    }
};

const blogIdValidation = [
    param('id')
        .isInt()
        .withMessage('Invalid blog ID')
];

const blogValidation = [
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
            assertContentWithinSizeLimit(value);
            return true;
        }),
    
    body('slug')
        .trim()
        .notEmpty()
        .withMessage('Slug is required')
        .matches(/^[a-z0-9-]+$/)
        .withMessage('Slug must contain only lowercase letters, numbers, and hyphens')
        .isLength({ max: 255 })
        .withMessage('Slug must be less than 255 characters'),
    
    body('status')
        .optional()
        .isIn(['draft', 'published', 'archived'])
        .withMessage('Status must be either draft, published, or archived'),
    
    body('published_at')
        .optional()
        .isISO8601()
        .withMessage('Invalid date format for published_at'),
    
    body('categories')
        .optional()
        .custom((value) => {
            if (!value) return true;
            // Handle comma-separated string of numbers
            const categoryIds = value.split(',').map(id => parseInt(id.trim()));
            if (categoryIds.some(id => isNaN(id))) {
                throw new Error('Categories must be valid integers');
            }
            return true;
        }),
    
    body('tags')
        .optional()
        .custom((value) => {
            if (!value) return true;
            // Handle comma-separated string of numbers
            const tagIds = value.split(',').map(id => parseInt(id.trim()));
            if (tagIds.some(id => isNaN(id))) {
                throw new Error('Tags must be valid integers');
            }
            return true;
        }),
    
    body('alt_text')
        .optional()
        .isString()
        .isLength({ max: 500 })
        .withMessage('Alt text must be a string with maximum 500 characters')
];

const blogUpdateValidation = [
    param('id')
        .isInt()
        .withMessage('Invalid blog ID'),
    
    body('title')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Title cannot be empty')
        .isLength({ max: 255 })
        .withMessage('Title must be less than 255 characters'),
    
    body('content')
        .optional()
        .custom((value) => {
            if (!value || value.trim().length === 0) {
                throw new Error('Content cannot be empty');
            }
            assertContentWithinSizeLimit(value);
            return true;
        }),
    
    body('slug')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('Slug cannot be empty')
        .matches(/^[a-z0-9-]+$/)
        .withMessage('Slug must contain only lowercase letters, numbers, and hyphens')
        .isLength({ max: 255 })
        .withMessage('Slug must be less than 255 characters')
        .custom(async (value, { req }) => {
            const existingBlog = await Blog.findOne({
                where: {
                    slug: value,
                    id: { [Op.ne]: req.params.id }
                }
            });
            if (existingBlog) {
                throw new Error('Slug already exists');
            }
            return true;
        }),
    
    body('status')
        .optional()
        .isIn(['draft', 'published', 'archived'])
        .withMessage('Status must be either draft, published, or archived'),
    
    body('categories')
        .optional()
        .custom((value) => {
            if (!value) return true;
            const categories = value.split(',').map(id => parseInt(id.trim()));
            if (!categories.every(id => !isNaN(id))) {
                throw new Error('Invalid category ID format');
            }
            return true;
        }),
    
    body('tags')
        .optional()
        .custom((value) => {
            if (!value) return true;
            const tags = value.split(',').map(id => parseInt(id.trim()));
            if (!tags.every(id => !isNaN(id))) {
                throw new Error('Invalid tag ID format');
            }
            return true;
        }),
    
    body('published_at')
        .optional()
        .isISO8601()
        .withMessage('Invalid date format for published_at'),
    
    body('meta_description')
        .optional()
        .trim()
        .isLength({ max: 160 })
        .withMessage('Meta description must be less than 160 characters'),
    
    body('published_at')
        .custom((value, { req }) => {
            if (req.body.status === 'published' && !value) {
                throw new Error('Published date is required for published posts');
            }
            return true;
        }),
    
    body('alt_text')
        .optional()
        .isString()
        .isLength({ max: 500 })
        .withMessage('Alt text must be a string with maximum 500 characters')
];

const filterValidations = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    
    query('limit')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Limit must be a positive integer'),
    
    query('search')
        .optional()
        .isString()
        .withMessage('Search must be a string'),
    
    query('sort')
        .optional()
        .isIn(['title', 'created_at', 'published_at'])
        .withMessage('Invalid sort field'),
    
    query('order')
        .optional()
        .isIn(['ASC', 'DESC'])
        .withMessage('Order must be ASC or DESC'),
    
    query('deleted')
        .optional()
        .isIn(['true', 'false'])
        .withMessage('Deleted must be "true" or "false"'),
    
    query('status')
        .optional()
        .isIn(['draft', 'published', 'archived'])
        .withMessage('Invalid status filter'),
    
    query('from_date')
        .optional()
        .isISO8601()
        .withMessage('Invalid from_date format'),
    
    query('to_date')
        .optional()
        .isISO8601()
        .withMessage('Invalid to_date format')
        .custom((value, { req }) => {
            if (req.query.from_date && value < req.query.from_date) {
                throw new Error('to_date must be after from_date');
            }
            return true;
        }),
    
    query('category_id')
        .optional()
        .custom((value) => {
            if (!value) return true;
            // Handle comma-separated string of numbers
            const categoryIds = value.split(',').map(id => parseInt(id.trim()));
            if (categoryIds.some(id => isNaN(id))) {
                throw new Error('Category IDs must be valid integers');
            }
            return true;
        }),
    
    query('tag_id')
        .optional()
        .custom((value) => {
            if (!value) return true;
            // Handle comma-separated string of numbers
            const tagIds = value.split(',').map(id => parseInt(id.trim()));
            if (tagIds.some(id => isNaN(id))) {
                throw new Error('Tag IDs must be valid integers');
            }
            return true;
        })
];

// Configure multer storage
const storage = multer.memoryStorage(); // Using memory storage for S3 upload

const multerLimitMessage = (err) => {
    switch (err.code) {
        case 'LIMIT_FIELD_VALUE':
            return contentTooLargeMessage();
        case 'LIMIT_FILE_SIZE':
            return `Featured image exceeds the maximum allowed size of ${BLOG_IMAGE_MAX_MB}MB.`;
        case 'LIMIT_FIELD_COUNT':
            return `Too many form fields (maximum ${BLOG_MAX_NON_FILE_FIELDS}).`;
        default:
            return err.message;
    }
};
// Update upload validation with storage and more specific file types
const uploadValidation = multer({
    storage: storage,
    limits: {
        fileSize: BLOG_IMAGE_FILE_SIZE_LIMIT,
        fieldSize: BLOG_CONTENT_FIELD_SIZE_LIMIT,
        fields: BLOG_MAX_NON_FILE_FIELDS
    },
    fileFilter: (req, file, cb) => {
        // Check file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Only .jpeg, .png, and .webp files are allowed!'), false);
        }

        // Check file extension
        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            return cb(new Error('Invalid file extension'), false);
        }

        cb(null, true);
    }
}).single('image');

// Add upload middleware handler
const uploadFileValidation = (req, res, next) => {
    uploadValidation(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            const msg = multerLimitMessage(err);
            return res.status(413).json({
                success: false,
                message: msg,
                errors: [{ path: err.field || 'content', msg }]
            });
        } else if (err) {
            return res.status(400).json({
                success: false,
                message: err.message || 'Invalid file',
                errors: [{ path: 'image', msg: err.message }]
            });
        }
        next();
    });
};

module.exports = {
    blogIdValidation,
    blogValidation,
    blogUpdateValidation,
    filterValidations,
    uploadFileValidation,
    BLOG_CONTENT_MAX_MB,
    BLOG_IMAGE_MAX_MB,
};
