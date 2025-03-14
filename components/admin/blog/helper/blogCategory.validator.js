const { check, param } = require("express-validator");
const multer = require("multer");
const path = require("path");

const blogCategoryIdValidation = [
    param("id").isInt().withMessage("Blog category ID must be an integer"),
];

const blogCategoryValidation = [
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
        .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .withMessage("Slug must be a valid URL-friendly string"),
    check("description")
        .optional({ nullable: true })
        .customSanitizer(value => (value === "" ? null : value))
        .isString()
        .withMessage("Description must be a string"),
];

const blogCategoryUpdatesValidation = [
    param("id")
        .isInt()
        .withMessage("ID must be an integer"),
    check("name")
        .optional({ nullable: true })
        .customSanitizer(value => (value === "" ? null : value))
        .trim()
        .isString()
        .withMessage("Name must be a string"),
    check("slug")
        .optional({ nullable: true })
        .customSanitizer(value => (value === "" ? null : value))
        .matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .withMessage("Slug must be a valid URL-friendly string"),
    check("description")
        .optional({ nullable: true })
        .customSanitizer(value => (value === "" ? null : value))
        .trim()
        .isString()
        .withMessage("Description must be a string"),
    check("image_url")
        .optional({ nullable: true })
        .customSanitizer(value => (value === "" ? null : value))
        .trim()
        .isString()
        .withMessage("Image URL must be a string"),
];

// Configure multer for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
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

const uploadFileValidation = (req, res, next) => {
    upload.single("image")(req, res, (err) => {
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

module.exports = {
    blogCategoryIdValidation,
    blogCategoryValidation,
    blogCategoryUpdatesValidation,
    uploadFileValidation,
}; 