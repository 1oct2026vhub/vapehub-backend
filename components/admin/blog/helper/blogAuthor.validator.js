const { body, param, check } = require('express-validator');
const multer = require('multer');
const path = require('path');
const { Op } = require('sequelize');
const { Author, User } = require('../../../../models');

const MB = 1024 * 1024;
const AUTHOR_AVATAR_MAX_MB = parseInt(process.env.BLOG_IMAGE_MAX_MB || '5', 10);

const authorIdValidation = [
    param('id')
        .isInt()
        .withMessage('Author ID must be an integer')
];

const optionalUserIdValidation = (field, { optional = true } = {}) => {
    const chain = optional
        ? body(field).optional({ values: 'falsy' })
        : body(field);

    return chain
        .custom(async (value) => {
            if (value == null || value === '') {
                return true;
            }

            const userId = parseInt(value, 10);
            if (Number.isNaN(userId)) {
                throw new Error('user_id must be a valid integer');
            }

            const user = await User.findByPk(userId, { attributes: ['id'] });
            if (!user) {
                throw new Error('user_id does not match an existing user');
            }

            return true;
        });
};

const uniqueUserIdValidation = (isUpdate = false) => body('user_id')
    .optional({ values: 'falsy' })
    .custom(async (value, { req }) => {
        if (value == null || value === '') {
            return true;
        }

        const userId = parseInt(value, 10);
        if (Number.isNaN(userId)) {
            return true;
        }

        const existing = await Author.findOne({
            where: {
                user_id: userId,
                ...(isUpdate ? { id: { [Op.ne]: req.params.id } } : {})
            },
            paranoid: false
        });
        if (existing) {
            throw new Error('This user is already linked to another author');
        }

        return true;
    });

const uniqueSlugValidation = (isUpdate = false) => body('slug')
    .optional({ values: 'falsy' })
    .trim()
    .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .withMessage('Slug must contain only lowercase letters, numbers, and hyphens')
    .isLength({ max: 100 })
    .withMessage('Slug must be less than 100 characters')
    .custom(async (value, { req }) => {
        const existing = await Author.findOne({
            where: {
                slug: value,
                ...(isUpdate ? { id: { [Op.ne]: req.params.id } } : {})
            },
            paranoid: false
        });
        if (existing) {
            throw new Error('Slug already exists');
        }
        return true;
    });

const authorValidation = [
    body('first_name')
        .trim()
        .notEmpty()
        .withMessage('First name is required')
        .isLength({ max: 255 })
        .withMessage('First name must be less than 255 characters'),

    body('last_name')
        .optional({ values: 'falsy' })
        .isString()
        .withMessage('Last name must be a string')
        .isLength({ max: 255 })
        .withMessage('Last name must be less than 255 characters'),

    body('role')
        .optional({ values: 'falsy' })
        .isString()
        .withMessage('Role must be a string')
        .isLength({ max: 255 })
        .withMessage('Role must be less than 255 characters'),

    body('bio')
        .optional({ values: 'falsy' })
        .isString()
        .withMessage('Bio must be a string')
        .isLength({ max: 5000 })
        .withMessage('Bio must be less than 5000 characters'),

    uniqueSlugValidation(false),
    optionalUserIdValidation('user_id'),
    uniqueUserIdValidation(false),

    body('archive_url')
        .optional({ values: 'falsy' })
        .isString()
        .withMessage('archive_url must be a string')
        .isLength({ max: 500 })
        .withMessage('archive_url must be less than 500 characters'),

    body('team_url')
        .optional({ values: 'falsy' })
        .isString()
        .withMessage('team_url must be a string')
        .isLength({ max: 500 })
        .withMessage('team_url must be less than 500 characters'),

    body('avatar_url')
        .optional({ values: 'falsy' })
        .isString()
        .withMessage('avatar_url must be a string')
        .isLength({ max: 500 })
        .withMessage('avatar_url must be less than 500 characters')
];

const authorUpdatesValidation = [
    param('id')
        .isInt()
        .withMessage('Author ID must be an integer'),

    body('first_name')
        .optional()
        .trim()
        .notEmpty()
        .withMessage('First name cannot be empty')
        .isLength({ max: 255 })
        .withMessage('First name must be less than 255 characters'),

    body('last_name')
        .optional({ nullable: true })
        .isString()
        .withMessage('Last name must be a string')
        .isLength({ max: 255 })
        .withMessage('Last name must be less than 255 characters'),

    body('role')
        .optional({ nullable: true })
        .isString()
        .withMessage('Role must be a string')
        .isLength({ max: 255 })
        .withMessage('Role must be less than 255 characters'),

    body('bio')
        .optional({ nullable: true })
        .isString()
        .withMessage('Bio must be a string')
        .isLength({ max: 5000 })
        .withMessage('Bio must be less than 5000 characters'),

    uniqueSlugValidation(true),
    optionalUserIdValidation('user_id'),
    uniqueUserIdValidation(true),

    body('archive_url')
        .optional({ nullable: true })
        .isString()
        .withMessage('archive_url must be a string')
        .isLength({ max: 500 })
        .withMessage('archive_url must be less than 500 characters'),

    body('team_url')
        .optional({ nullable: true })
        .isString()
        .withMessage('team_url must be a string')
        .isLength({ max: 500 })
        .withMessage('team_url must be less than 500 characters'),

    body('avatar_url')
        .optional({ nullable: true })
        .isString()
        .withMessage('avatar_url must be a string')
        .isLength({ max: 500 })
        .withMessage('avatar_url must be less than 500 characters')
];

const filterValidations = [
    check('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),

    check('limit')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Limit must be a positive integer'),

    check('search')
        .optional()
        .isString()
        .withMessage('Search must be a string'),

    check('sort')
        .optional()
        .isIn(['first_name', 'last_name', 'slug', 'created_at', 'updated_at'])
        .withMessage('Invalid sort field'),

    check('order')
        .optional()
        .isIn(['ASC', 'DESC', 'asc', 'desc'])
        .withMessage('Order must be ASC or DESC'),

    check('deleted')
        .optional()
        .isBoolean()
        .withMessage('Deleted must be a boolean value')
        .customSanitizer((value) => value === 'true' || value === true)
];

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: AUTHOR_AVATAR_MAX_MB * MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Only .jpeg, .png, and .webp files are allowed!'), false);
        }

        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            return cb(new Error('Invalid file extension'), false);
        }

        cb(null, true);
    }
});

const uploadFileValidation = (req, res, next) => {
    upload.single('avatar')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            const message = err.code === 'LIMIT_FILE_SIZE'
                ? `Author avatar exceeds the maximum allowed size of ${AUTHOR_AVATAR_MAX_MB}MB.`
                : err.message;
            return res.status(400).json({
                success: false,
                message,
                errors: [{ path: 'avatar', msg: message }]
            });
        }
        if (err) {
            return res.status(400).json({
                success: false,
                message: err.message || 'Invalid file',
                errors: [{ path: 'avatar', msg: err.message }]
            });
        }
        next();
    });
};

module.exports = {
    authorIdValidation,
    authorValidation,
    authorUpdatesValidation,
    filterValidations,
    uploadFileValidation
};
