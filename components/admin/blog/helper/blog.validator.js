const { body, param, query } = require('express-validator');
const multer = require('multer');
const path = require('path');
const { Blog, Author } = require('../../../../models');
const { parsePullQuoteField, parseInlineProductCardField, parseFirstPersonCalloutsField } = require('./blogPayload.helper');
const { Op } = require('sequelize');
// blog content size
const MB = 1024 * 1024;
const BLOG_CONTENT_MAX_MB = parseInt(process.env.BLOG_CONTENT_MAX_MB || '10', 10);
const BLOG_IMAGE_MAX_MB = parseInt(process.env.BLOG_IMAGE_MAX_MB || '5', 10);
const BLOG_IMAGE_FILE_SIZE_LIMIT = BLOG_IMAGE_MAX_MB * MB;
const BLOG_CONTENT_FIELD_SIZE_LIMIT = BLOG_CONTENT_MAX_MB * MB;
const BLOG_MAX_NON_FILE_FIELDS = 50;

const contentTooLargeMessage = () =>
    `Blog content exceeds the maximum size of ${BLOG_CONTENT_MAX_MB}MB. Remove large sized pasted images and save again after images are uploaded.`;

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

const parseSourcesForValidation = (value) => {
    if (value == null || value === '') {
        return [];
    }

    let sources = value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return [];
        }
        sources = JSON.parse(trimmed);
    }

    if (!Array.isArray(sources)) {
        throw new Error('sources must be a JSON array');
    }

    if (sources.length > 20) {
        throw new Error('sources cannot contain more than 20 items');
    }

    sources.forEach((item, index) => {
        if (!item || typeof item !== 'object') {
            throw new Error(`sources[${index}] must be an object`);
        }
        if (!item.label || !String(item.label).trim()) {
            throw new Error(`sources[${index}].label is required`);
        }
        if (!item.href || !String(item.href).trim()) {
            throw new Error(`sources[${index}].href is required`);
        }
        try {
            const url = new URL(String(item.href).trim());
            if (!['http:', 'https:'].includes(url.protocol)) {
                throw new Error('invalid protocol');
            }
        } catch {
            throw new Error(`sources[${index}].href must be a valid URL with http or https`);
        }
    });

    return sources;
};

const parseRelatedBlogIdsForValidation = (value, blogId = null) => {
    if (value == null || value === '') {
        return [];
    }

    let ids = value;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            return [];
        }
        if (trimmed.startsWith('[')) {
            ids = JSON.parse(trimmed);
        } else {
            ids = trimmed.split(',').map((id) => parseInt(id.trim(), 10));
        }
    }

    if (!Array.isArray(ids)) {
        throw new Error('related_blog_ids must be an array or comma-separated list of integers');
    }

    const parsedIds = ids.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id));
    const uniqueIds = [...new Set(parsedIds)];

    if (uniqueIds.length > 3) {
        throw new Error('related_blog_ids cannot contain more than 3 items');
    }

    if (blogId != null && uniqueIds.includes(parseInt(blogId, 10))) {
        throw new Error('related_blog_ids cannot include the current blog post');
    }

    return uniqueIds;
};

const authorIdValidation = (optional = true) => {
    const chain = optional
        ? body('author_id').optional({ values: 'undefined' })
        : body('author_id')
            .exists({ checkFalsy: true })
            .withMessage('author_id is required');

    return chain.custom(async (value) => {
        if (value == null || value === '') {
            return true;
        }

        const authorId = parseInt(value, 10);
        if (Number.isNaN(authorId)) {
            throw new Error('author_id must be a valid integer');
        }

        const author = await Author.findByPk(authorId, { attributes: ['id'] });
        if (!author) {
            throw new Error('author_id does not match an existing author');
        }

        return true;
    });
};

const sourcesValidation = body('sources')
    .optional()
    .custom((value) => {
        parseSourcesForValidation(value);
        return true;
    });

const pullQuoteValidation = body('pull_quote')
    .optional()
    .custom((value) => {
        parsePullQuoteField(value);
        return true;
    });

const inlineProductCardValidation = body('inline_product_card')
    .optional()
    .custom(async (value) => {
        await parseInlineProductCardField(value);
        return true;
    });

const firstPersonCalloutsValidation = body('first_person_callouts')
    .optional()
    .custom((value) => {
        parseFirstPersonCalloutsField(value);
        return true;
    });

const relatedBlogIdsValidation = (blogIdFromParams = false) => body('related_blog_ids')
    .optional()
    .custom((value, { req }) => {
        const blogId = blogIdFromParams ? req.params.id : null;
        parseRelatedBlogIdsForValidation(value, blogId);
        return true;
    });

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
        .withMessage('Alt text must be a string with maximum 500 characters'),

    authorIdValidation(false),
    sourcesValidation,
    pullQuoteValidation,
    inlineProductCardValidation,
    firstPersonCalloutsValidation,
    relatedBlogIdsValidation(false)
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
        .withMessage('Alt text must be a string with maximum 500 characters'),

    authorIdValidation(true),
    sourcesValidation,
    pullQuoteValidation,
    inlineProductCardValidation,
    firstPersonCalloutsValidation,
    relatedBlogIdsValidation(true)
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
    const fieldLabel = 'Featured image';
    switch (err.code) {
        case 'LIMIT_FIELD_VALUE':
            return contentTooLargeMessage();
        case 'LIMIT_FILE_SIZE':
            return `${fieldLabel} exceeds the maximum allowed size of ${BLOG_IMAGE_MAX_MB}MB.`;
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
}).fields([
    { name: 'image', maxCount: 1 }
]);

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
                errors: [{ path: err.field || 'image', msg: err.message }]
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
