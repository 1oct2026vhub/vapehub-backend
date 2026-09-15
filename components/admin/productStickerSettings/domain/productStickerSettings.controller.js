const { errorResponse, successResponse } = require('../../../../utils/responseUtils');
const { Settings } = require('../../../../models');
const logger = require('../../../../library/logger');
const {
  getProductStickerDefaults,
  bustProductStickerDefaultsCache,
  validateStickerDefaultsPayload,
  normalizeStickerDefaultsPayload,
  DEFAULT_STICKER_CONFIG,
} = require('../../../product/helper/productSticker.helper');

const SETTINGS_KEY = 'product_sticker_defaults';

module.exports.getProductStickerSettings = async (req, res) => {
  try {
    const defaults = await getProductStickerDefaults();
    return successResponse(res, defaults, 'Product sticker settings retrieved successfully');
  } catch (error) {
    logger.error('Get product sticker settings error:', error);
    return errorResponse(res, error, error.message);
  }
};

module.exports.updateProductStickerSettings = async (req, res) => {
  try {
    const validationErrors = validateStickerDefaultsPayload(req.body);
    if (validationErrors.length > 0) {
      return errorResponse(
        res,
        { message: 'Validation failed', errors: validationErrors },
        'Validation failed',
        400
      );
    }

    const normalized = normalizeStickerDefaultsPayload(req.body);
    const updated_by = req.user?.id ?? null;
    const content = JSON.stringify(normalized);

    let setting = await Settings.findOne({
      where: { content_key: SETTINGS_KEY },
    });

    if (setting) {
      await setting.update({
        content,
        is_active: true,
        updated_by,
      });
    } else {
      setting = await Settings.create({
        content_key: SETTINGS_KEY,
        content,
        is_active: true,
        updated_by,
      });
    }

    await bustProductStickerDefaultsCache();

    return successResponse(res, normalized, 'Product sticker settings updated successfully');
  } catch (error) {
    logger.error('Update product sticker settings error:', error);
    return errorResponse(res, error, error.message);
  }
};

module.exports.getProductStickerSettingsSchema = async (req, res) => {
  try {
    return successResponse(res, {
      defaults: DEFAULT_STICKER_CONFIG,
      fields: {
        new: [
          { key: 'enabled', label: 'Enable NEW sticker', type: 'boolean' },
          { key: 'sticker_name', label: 'Sticker text', type: 'string' },
          { key: 'background_color', label: 'Background colour', type: 'hex' },
          { key: 'duration_days', label: 'Show for days after product created', type: 'number', min: 1 },
          { key: 'respect_is_new_flag', label: 'Also show when is_new flag is true', type: 'boolean' },
        ],
        new_flavours: [
          { key: 'enabled', label: 'Enable NEW FLAVOURS sticker', type: 'boolean' },
          { key: 'sticker_name', label: 'Sticker text', type: 'string' },
          { key: 'background_color', label: 'Background colour', type: 'hex' },
          { key: 'min_product_age_days', label: 'Product must be at least this many days old', type: 'number', min: 0 },
          { key: 'duration_days', label: 'Show for days after new flavour added', type: 'number', min: 1 },
        ],
      },
    }, 'Product sticker settings schema retrieved successfully');
  } catch (error) {
    logger.error('Get product sticker settings schema error:', error);
    return errorResponse(res, error, error.message);
  }
};
