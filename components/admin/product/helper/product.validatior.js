const { check, param } = require("express-validator");
const multer = require("multer");
const path = require("path");

const productIdValidation = [
    param("id").isInt().withMessage("Category ID must be an integer"),
];

const createProductValidation = [
    check('name').isString().withMessage('Name must be a string').notEmpty().withMessage('Name is required'),
    check('slug').isString().withMessage('Slug must be a string').notEmpty().withMessage('Slug is required'),
    check('description').optional().isString().withMessage('Description must be a string'),
    check('price').optional().isDecimal().withMessage('Price must be a decimal number'),
    check('discount_price').optional().isDecimal().withMessage('Discount price must be a decimal number'),
    check('stock_quantity').optional().isInt().withMessage('Stock quantity must be an integer'),
    check('puff_count').optional().isInt().withMessage('Puff count must be an integer'),
    check('is_new').optional().isBoolean().withMessage('is_new must be a boolean'),
    check('battery_capacity').optional().isString().withMessage('Battery capacity must be a string'),
    check('coil_style').optional().isString().withMessage('Coil style must be a string'),
    check('device_style').optional().isString().withMessage('Device style must be a string'),
    check('eliquid_capacity').optional().isString().withMessage('E-liquid capacity must be a string'),
    check('pod_coil_style').optional().isString().withMessage('Pod coil style must be a string'),
    check('pod_fill_style').optional().isString().withMessage('Pod fill style must be a string'),
    check('power_supply').optional().isString().withMessage('Power supply must be a string'),
    check('nicotine_strength').optional().isString().withMessage('Nicotine strength must be a string'),
    check('nicotine_type').optional().isString().withMessage('Nicotine type must be a string'),
    check('vg_ratio').optional().isString().withMessage('VG ratio must be a string'),
    check('vaping_style').optional().isString().withMessage('Vaping style must be a string'),
    check('bottle_size').optional().isString().withMessage('Bottle size must be a string'),
    check('category_id').isInt().withMessage('Category ID must be an integer').notEmpty().withMessage('Category ID is required'),
    check('brand_id').isInt().withMessage('Brand ID must be an integer').notEmpty().withMessage('Brand ID is required'),
    check('flavour_ids').optional().isArray().withMessage('Flavour IDs must be an array'),
    check('flavour_ids.*.flavor_id').optional().isInt().withMessage('Flavor ID must be an integer'),
    check('flavour_ids.*.price').optional().isDecimal().withMessage('Flavor price must be a decimal number'),
    check('flavour_ids.*.discount_price').optional().isDecimal().withMessage('Flavor discount price must be a decimal number'),
    check('flavour_ids.*.stock_quantity').optional().isInt().withMessage('Flavor stock quantity must be an integer'),
    check('product_images').optional().isArray().withMessage('Product images must be an array'),
    check('product_images.*.image_url').optional().isString().withMessage('Image URL must be a string'),
    check('product_images.*.is_primary').optional().isBoolean().withMessage('is_primary must be a boolean'),
];

const updateProductValidations = [
    check('name').optional().isString().withMessage('Name must be a string'),
    check('slug').optional().isString().withMessage('Slug must be a string'),
    check('description').optional().isString().withMessage('Description must be a string'),
    check('price').optional().isDecimal().withMessage('Price must be a decimal number'),
    check('discount_price').optional().isDecimal().withMessage('Discount price must be a decimal number'),
    check('stock_quantity').optional().isInt().withMessage('Stock quantity must be an integer'),
    check('puff_count').optional().isInt().withMessage('Puff count must be an integer'),
    check('is_new').optional().isBoolean().withMessage('is_new must be a boolean'),
    check('battery_capacity').optional().isString().withMessage('Battery capacity must be a string'),
    check('coil_style').optional().isString().withMessage('Coil style must be a string'),
    check('device_style').optional().isString().withMessage('Device style must be a string'),
    check('eliquid_capacity').optional().isString().withMessage('E-liquid capacity must be a string'),
    check('pod_coil_style').optional().isString().withMessage('Pod coil style must be a string'),
    check('pod_fill_style').optional().isString().withMessage('Pod fill style must be a string'),
    check('power_supply').optional().isString().withMessage('Power supply must be a string'),
    check('nicotine_strength').optional().isString().withMessage('Nicotine strength must be a string'),
    check('nicotine_type').optional().isString().withMessage('Nicotine type must be a string'),
    check('vg_ratio').optional().isString().withMessage('VG ratio must be a string'),
    check('vaping_style').optional().isString().withMessage('Vaping style must be a string'),
    check('bottle_size').optional().isString().withMessage('Bottle size must be a string'),
    check('category_id').optional().isInt().withMessage('Category ID must be an integer'),
    check('brand_id').optional().isInt().withMessage('Brand ID must be an integer'),
    check('flavour_ids').optional().isArray().withMessage('Flavour IDs must be an array'),
    check('flavour_ids.*.flavor_id').optional().isInt().withMessage('Flavor ID must be an integer'),
    check('flavour_ids.*.price').optional().isDecimal().withMessage('Flavor price must be a decimal number'),
    check('flavour_ids.*.discount_price').optional().isDecimal().withMessage('Flavor discount price must be a decimal number'),
    check('flavour_ids.*.stock_quantity').optional().isInt().withMessage('Flavor stock quantity must be an integer'),
    check('product_images').optional().isArray().withMessage('Product images must be an array'),
    check('product_images.*.image_url').optional().isString().withMessage('Image URL must be a string'),
    check('product_images.*.is_primary').optional().isBoolean().withMessage('is_primary must be a boolean')
];

const productImageValidation = [
  param("product_id")
      .notEmpty().withMessage("Product ID is required")
      .isInt({ min: 1 }).withMessage("Product ID must be a valid integer"),

  param("image_id")
      .notEmpty().withMessage("Image ID is required")
      .isInt({ min: 1 }).withMessage("Image ID must be a valid integer")
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
  upload.array("images", 10)(req, res, (err) => { // Allow up to 5 images
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        success: false,
        message: "File upload error",
        errors: [{ path: "images", msg: err.message }],
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        message: "Invalid file type",
        errors: [{ path: "images", msg: err.message }],
      });
    }

    // Validate if any files were uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No files uploaded",
        errors: [{ path: "images", msg: "Please upload at least one image" }],
      });
    }

    next();
  });
};

module.exports = {
    productIdValidation,
    createProductValidation,
    updateProductValidations,
    productImageValidation,
    uploadFileValidation
};