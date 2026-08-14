const { check, query, param, body } = require("express-validator");
const moment = require("moment");
const multer = require("multer");
const path = require("path");

const roleValidation =  [
        query('deleted')
        .optional()
        .customSanitizer((value) => {
            if (typeof value === "string") return value.toLowerCase() === "true";
            return Boolean(value);
        })
        .isBoolean().withMessage("deleted must be a boolean value")
];


const userValidationRules = [
  body("first_name")
    .notEmpty().withMessage("First name is required")
    .isString().withMessage("First name must be a string"),

  body("last_name")
    .notEmpty().withMessage("Last name is required")
    .isString().withMessage("Last name must be a string"),

  body("email")
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Invalid email format"),

  body("password")
    .notEmpty().withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[a-z]/)
    .withMessage("Password must contain at least one lowercase letter")
    .matches(/\d/)
    .withMessage("Password must contain at least one digit")
    .matches(/[@$!%*?&]/)
    .withMessage("Password must contain at least one special character (@, $, !, %, *, ?, &)"),

  body("phone")
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ min: 8, max: 16 }).withMessage("Phone number must be between 8 and 16 digits long")
    .matches(/^[+\d]+$/).withMessage("Phone number must contain only digits and + symbol")
    .custom((value) => {
      if (value == null || value === "") return true;
      const mobilePattern = /^\+?\d{8,16}$/; // Updated pattern to allow 8-16 digits
      if (!mobilePattern.test(value)) {
        throw new Error("Invalid phone number format");
      }
      return true;
    }),
    // .isMobilePhone('any', { strict: true }).withMessage("Invalid mobile phone number format"),

  body("roleId")
    .notEmpty().withMessage("Role ID is required")
    .isInt().withMessage("Role ID must be an integer"),

  body("gender")
    .optional()
    .isIn(["male", "female", "other"]).withMessage("Gender must be male, female, or other"),

  body("dob")
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601().withMessage("DOB must be a valid date in YYYY-MM-DD format")
    .custom((value) => {
      if (value == null || value === "") return true;
      const dob = new Date(value);
      const today = new Date();
      const age = today.getFullYear() - dob.getFullYear();
      
      if (age < 18) {
        throw new Error("You must be at least 18 years old.");
      }
      return true;
    }),
];


const USER_AVATAR_MAX_MB = parseInt(process.env.USER_AVATAR_MAX_MB || '5', 10);
const USER_AVATAR_FILE_SIZE_LIMIT = USER_AVATAR_MAX_MB * 1024 * 1024;

const blogAuthorValidationRules = [
    body('blog_author_role')
        .optional({ nullable: true })
        .isString()
        .withMessage('blog_author_role must be a string')
        .isLength({ max: 255 })
        .withMessage('blog_author_role must be less than 255 characters'),

    body('blog_author_bio')
        .optional({ nullable: true })
        .isString()
        .withMessage('blog_author_bio must be a string')
        .isLength({ max: 5000 })
        .withMessage('blog_author_bio must be less than 5000 characters'),

    body('blog_author_slug')
        .optional({ nullable: true })
        .custom((value) => {
            if (value == null || value === '') {
                return true;
            }
            if (!/^[a-z0-9-]+$/.test(String(value).trim())) {
                throw new Error('blog_author_slug must contain only lowercase letters, numbers, and hyphens');
            }
            return true;
        }),

    body('blog_author_archive_url')
        .optional({ nullable: true })
        .isString()
        .withMessage('blog_author_archive_url must be a string')
        .isLength({ max: 500 })
        .withMessage('blog_author_archive_url must be less than 500 characters'),

    body('blog_author_team_url')
        .optional({ nullable: true })
        .isString()
        .withMessage('blog_author_team_url must be a string')
        .isLength({ max: 500 })
        .withMessage('blog_author_team_url must be less than 500 characters'),

    body('profile_pic_url')
        .optional({ nullable: true })
        .isString()
        .withMessage('profile_pic_url must be a string')
        .isLength({ max: 500 })
        .withMessage('profile_pic_url must be less than 500 characters')
];

const userUpdateValidationRules = [
    body("first_name")
        .optional()
        .notEmpty().withMessage("First name is required")
        .isString().withMessage("First name must be a string"),
  
    body("last_name")
        .optional()
        .notEmpty().withMessage("Last name is required")
        .isString().withMessage("Last name must be a string"),
  
    body("password")
        .optional()
        .notEmpty().withMessage("Password is required")
        .isLength({ min: 8 })
        .withMessage("Password must be at least 8 characters long")
        .matches(/[A-Z]/)
        .withMessage("Password must contain at least one uppercase letter")
        .matches(/[a-z]/)
        .withMessage("Password must contain at least one lowercase letter")
        .matches(/\d/)
        .withMessage("Password must contain at least one digit")
        .matches(/[@$!%*?&]/)
        .withMessage("Password must contain at least one special character (@, $, !, %, *, ?, &)"),
  
    body("phone")
        .optional({ nullable: true, checkFalsy: true })
        .isLength({ min: 8, max: 16 }).withMessage("Phone number must be between 8 and 16 digits long")
        .matches(/^[+\d]+$/).withMessage("Phone number must contain only digits and + symbol")
        .custom((value) => {
          if (value == null || value === "") return true;
          const mobilePattern = /^\+?\d{8,16}$/; // Updated pattern to allow 8-16 digits
          if (!mobilePattern.test(value)) {
            throw new Error("Invalid phone number format");
          }
          return true;
        }),
  
    body("roleId")
        .optional()
        .notEmpty().withMessage("Role ID is required")
        .isInt().withMessage("Role ID must be an integer"),
  
    body("gender")
        .optional()
        .isIn(["male", "female", "other"]).withMessage("Gender must be male, female, or other"),
  
    body("dob")
        .optional({ nullable: true, checkFalsy: true })
        .isISO8601().withMessage("DOB must be a valid date in YYYY-MM-DD format")
        .custom((value) => {
          if (value == null || value === "") return true;
          const dob = new Date(value);
          const today = new Date();
          const age = today.getFullYear() - dob.getFullYear();
          
          if (age < 18) {
            throw new Error("You must be at least 18 years old.");
          }
          return true;
        }),

    ...blogAuthorValidationRules
];

const restoreUserValidation = [
    param("id").isInt().withMessage("User ID must be an integer")
];

const userListValidationRules = [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
  
    query("limit")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Limit must be a positive integer"),
  
    query("roleId")
      .optional()
      .isInt()
      .withMessage("Role ID must be an integer"),
  
    query("search")
      .optional()
      .isString()
      .withMessage("Search must be a string"),
  
    query("sort_by")
      .optional()
      .isIn([
        'id', 'first_name', 'last_name', 'email', 'phone', 
        'gender', 'role', 'createdAt', 'updatedAt', 'deletedAt',
        'email_verified_at', 'blocked'
      ])
      .withMessage("sort_by must be one of: id, first_name, last_name, email, phone, gender, role, createdAt, updatedAt, deletedAt, email_verified_at, blocked"),
  
    query("order")
      .optional()
      .isIn(["ASC", "DESC"])
      .withMessage("Order must be either ASC or DESC"),
  
    query("deleted")
      .optional()
      .isBoolean()
      .withMessage("Deleted must be a boolean value"),

    query("blocked")
      .optional()
      .isIn(["true", "false"])
      .withMessage("Blocked must be either true or false"),

    query("verified")
      .optional()
      .isIn(["all", "true", "false"])
      .withMessage("Verified must be one of: all, true, false"),
];

// Validation for user ID parameter
const userIDValidation = [
    param("id").isInt().withMessage("User ID must be an integer")
];

const uploadValidation = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: USER_AVATAR_FILE_SIZE_LIMIT
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Only .jpeg, .png, and .webp avatar images are allowed'), false);
        }

        const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            return cb(new Error('Invalid avatar file extension'), false);
        }

        cb(null, true);
    }
}).single('avatar');

const uploadFileValidation = (req, res, next) => {
    uploadValidation(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            const message = err.code === 'LIMIT_FILE_SIZE'
                ? `Avatar image exceeds the maximum allowed size of ${USER_AVATAR_MAX_MB}MB`
                : err.message;
            return res.status(413).json({
                success: false,
                message,
                errors: [{ path: err.field || 'avatar', msg: message }]
            });
        }

        if (err) {
            return res.status(400).json({
                success: false,
                message: err.message || 'Invalid avatar file',
                errors: [{ path: 'avatar', msg: err.message }]
            });
        }

        next();
    });
};

module.exports = {
    roleValidation,
    userValidationRules,
    restoreUserValidation,
    userListValidationRules,
    userUpdateValidationRules,
    userIDValidation,
    uploadFileValidation,
    blogAuthorValidationRules
};