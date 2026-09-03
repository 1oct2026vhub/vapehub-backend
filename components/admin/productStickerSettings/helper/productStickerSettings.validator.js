const { body } = require('express-validator');

const hexColorValidator = (value) => /^#[0-9A-Fa-f]{6}$/.test(value);

const updateProductStickerSettingsValidation = [
  body('new').isObject().withMessage('new settings are required'),
  body('new.enabled').isBoolean().withMessage('new.enabled must be a boolean'),
  body('new.sticker_name').optional().isString().trim().isLength({ max: 64 }),
  body('new.background_color').optional().custom(hexColorValidator).withMessage('new.background_color must be #RRGGBB'),
  body('new.duration_days').optional().isInt({ min: 1 }).withMessage('new.duration_days must be at least 1'),
  body('new.respect_is_new_flag').optional().isBoolean(),
  body('new_flavours').isObject().withMessage('new_flavours settings are required'),
  body('new_flavours.enabled').isBoolean().withMessage('new_flavours.enabled must be a boolean'),
  body('new_flavours.sticker_name').optional().isString().trim().isLength({ max: 64 }),
  body('new_flavours.background_color').optional().custom(hexColorValidator).withMessage('new_flavours.background_color must be #RRGGBB'),
  body('new_flavours.min_product_age_days').optional().isInt({ min: 0 }),
  body('new_flavours.duration_days').optional().isInt({ min: 1 }),
];

module.exports = {
  updateProductStickerSettingsValidation,
};
