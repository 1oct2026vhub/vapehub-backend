const { check, param, body } = require("express-validator");
const multer = require("multer");
const path = require("path");

const MB = 1024 * 1024;
const TYPE_CARDS_CONTENT_MAX_MB = parseInt(process.env.TYPE_CARDS_CONTENT_MAX_MB || '10', 10);
const CATEGORY_IMAGE_MAX_MB = parseInt(process.env.CATEGORY_IMAGE_MAX_MB || '5', 10);
const CATEGORY_IMAGE_FILE_SIZE_LIMIT = CATEGORY_IMAGE_MAX_MB * MB;
const TYPE_CARDS_FIELD_SIZE_LIMIT = TYPE_CARDS_CONTENT_MAX_MB * MB;

const typeCardsTooLargeMessage = () =>
    `Type cards HTML exceeds the maximum size of ${TYPE_CARDS_CONTENT_MAX_MB}MB. Remove large pasted images and save again after images are uploaded.`;

const assertTypeCardsWithinSizeLimit = (value) => {
    if (value == null || value === '') {
        return;
    }
    const sizeBytes = Buffer.byteLength(String(value), 'utf8');
    if (sizeBytes > TYPE_CARDS_FIELD_SIZE_LIMIT) {
        const sizeMb = (sizeBytes / MB).toFixed(1);
        throw new Error(
            `Type cards HTML is ${sizeMb}MB, which exceeds the maximum allowed size of ${TYPE_CARDS_CONTENT_MAX_MB}MB.`
        );
    }
};

const categoryIdValidation = [
    param("id").isInt().withMessage("Category ID must be an integer"),
];

const categoryValidation = [
    check("name")
    .custom((value, { req }) => {
        if (!req.body.name || req.body.name.trim() === "") {
            throw new Error("Name is required");
        }
        return true;
    }),
    check("slug")
      .custom((value, { req }) => {
          if (!req.body.slug || req.body.slug.trim() === "") {
              throw new Error("Slug is required");
          }
          return true;
      })
      .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage("Slug must be a valid URL-friendly string (lowercase letters, numbers, and hyphens only)"),
    check("description")
      .optional({ nullable: true })
      .customSanitizer(value => (value === "" ? null : value)) 
      .isString()
      .withMessage("Description must be a string"),
    check("type_cards_html")
      .optional({ nullable: true })
      .customSanitizer(value => (value === "" ? null : value))
      .isString()
      .withMessage("type_cards_html must be a string")
      .custom((value) => {
          assertTypeCardsWithinSizeLimit(value);
          return true;
      }),
    check("additional_text_box")
      .optional({ nullable: true })
      .customSanitizer(value => (value === "" ? null : value))
      .isString()
      .withMessage("additional_text_box must be a string")
      .custom((value) => {
          assertTypeCardsWithinSizeLimit(value);
          return true;
      }),
    check("alt_text")
      .optional({ nullable: true })
      .isString()
      .trim()
      .withMessage("Alt text must be a string"),
    check("parent_id")
      .optional({ nullable: true })
      .customSanitizer(value => (value === "" ? null : value)) 
      .custom(value => {
          if (value !== null && isNaN(Number(value))) {
              throw new Error("Parent ID must be an integer or null");
          }
          return true;
      }),
];

const categoryUpdatesValidation = [
    param("id").
      isInt().withMessage("ID must be an integer"),
    check("name")
      .optional({ nullable: true })
      .customSanitizer(value => (value === "" ? null : value)) 
      .trim().isString().withMessage("Name must be a string"),
    check("slug")
      .optional({ nullable: true })
      .customSanitizer(value => (value === "" ? null : value)) 
      .matches(/^[a-z0-9_]+(?:[-_][a-z0-9_]+)*$/).withMessage("Slug must be a valid URL-friendly string (lowercase letters, numbers, hyphens, and underscores only)"),
    check("description")
      .optional({ nullable: true })
      .customSanitizer(value => (value === "" ? null : value)) 
      .trim().isString().withMessage("Description must be a string"),
    check("type_cards_html")
      .optional({ nullable: true })
      .customSanitizer(value => (value === "" ? null : value))
      .isString()
      .withMessage("type_cards_html must be a string")
      .custom((value) => {
          assertTypeCardsWithinSizeLimit(value);
          return true;
      }),
    check("additional_text_box")
      .optional({ nullable: true })
      .customSanitizer(value => (value === "" ? null : value))
      .isString()
      .withMessage("additional_text_box must be a string")
      .custom((value) => {
          assertTypeCardsWithinSizeLimit(value);
          return true;
      }),
    check("logo_url")
      .optional({ nullable: true })
      .customSanitizer(value => (value === "" ? null : value)) 
      .isString().withMessage("Logo URL must be a string"),
    check("alt_text")
      .optional({ nullable: true })
      .isString()
      .trim()
      .withMessage("Alt text must be a string"),
    check("parent_id")
      .optional({ nullable: true })
      .customSanitizer(value => (value === "" ? null : value)) 
      .custom(value => {
          if (value !== null && isNaN(Number(value))) {
              throw new Error("Parent ID must be an integer or null");
          }
          return true;
      }),
];

const filterValidations = [
    check("page")
      .optional()
      .isInt({ min: 1 }).withMessage("Page must be a positive integer"),
    check("limit")
      .optional()
      .isInt({ min: 1 }).withMessage("Limit must be a positive integer"),
    check("search")
      .optional()
      .isString().withMessage("Search must be a string"),
    check("search_only_name")
      .optional()
      .isBoolean().withMessage("Search only name must be a boolean value"),
    check("deleted")
      .optional()
      .isBoolean().withMessage("Deleted must be a boolean value"),
]

// Configure multer for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: CATEGORY_IMAGE_FILE_SIZE_LIMIT,
        fieldSize: TYPE_CARDS_FIELD_SIZE_LIMIT,
    },
    fileFilter: (req, file, cb) => {
        const allowedExtensions = [".png", ".jpg", ".jpeg", ".webp"];
        const ext = path.extname(file.originalname).toLowerCase();
        if (!allowedExtensions.includes(ext)) {
            return cb(new Error("Only .png, .jpg, .jpeg, .webp files are allowed!"), false);
        }
        cb(null, true);
    },
});

const uploadFileMiddleware = upload.single('file');

const uploadXlx = multer({
  storage: storage,
  limits: {
      fileSize: CATEGORY_IMAGE_FILE_SIZE_LIMIT,
  },
  fileFilter: (req, file, cb) => {
      const allowedExtensions = ['.xlsx', '.xls'];
      const ext = path.extname(file.originalname).toLowerCase();
      if (!allowedExtensions.includes(ext)) {
          return cb(new Error('Only .xlsx and .xls files are allowed!'), false);
      }
      cb(null, true);
  },
});

const uploadXlxFileMiddleware = uploadXlx.single('file');

const multerLimitMessage = (err) => {
    switch (err.code) {
        case 'LIMIT_FIELD_VALUE':
            return typeCardsTooLargeMessage();
        case 'LIMIT_FILE_SIZE':
            return `Logo exceeds the maximum allowed size of ${CATEGORY_IMAGE_MAX_MB}MB.`;
        default:
            return err.message;
    }
};

const uploadFileValidation = (req, res, next) => {
  upload.single("logo")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
          const msg = multerLimitMessage(err);
          const status = err.code === 'LIMIT_FIELD_VALUE' || err.code === 'LIMIT_FILE_SIZE'
              ? 413
              : 400;
          return res.status(status).json({
              success: false,
              message: msg,
              errors: [{ path: err.field || 'type_cards_html', msg }],
          });
      } else if (err) {
          return res.status(400).json({
              success: false,
              message: err.message || 'Invalid file',
              errors: [{ path: err.field || 'logo', msg: err.message }],
          });
      }
      next();
  });
};

const bulkUpdateCategoriesValidation = [
    body('file')
        .custom((value, { req }) => {
            if (!req.file) {
                throw new Error('File must be uploaded');
            }
            return true;
        }),
];

module.exports = {
    categoryIdValidation,
    categoryValidation,
    categoryUpdatesValidation,
    uploadFileValidation,
    bulkUpdateCategoriesValidation,
    uploadFileMiddleware,
    uploadXlxFileMiddleware,
    TYPE_CARDS_CONTENT_MAX_MB,
    CATEGORY_IMAGE_MAX_MB,
};
