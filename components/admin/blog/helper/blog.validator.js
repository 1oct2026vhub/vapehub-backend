const { body, param, query } = require('express-validator');
const multer = require('multer');
const path = require('path');
const { Blog } = require('../../../../models');
const { Op } = require('sequelize');

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
        })
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
        })
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
        .isBoolean()
        .withMessage('Deleted must be a boolean'),
    
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

// Update upload validation with storage and more specific file types
const uploadValidation = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
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
            return res.status(400).json({
                success: false,
                message: "File upload error",
                errors: [{ msg: err.message }]
            });
        } else if (err) {
            return res.status(400).json({
                success: false,
                message: "Invalid file",
                errors: [{ msg: err.message }]
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
    uploadFileValidation
};
