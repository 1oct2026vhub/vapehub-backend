const express = require('express');
const router = express.Router();
const authMiddleware = require('../../../../library/middleware/authMiddleware');
const { validateRequest } = require('../../../../utils/validationMiddleware');
const {
  getProductStickerSettings,
  updateProductStickerSettings,
  getProductStickerSettingsSchema,
} = require('../domain/productStickerSettings.controller');
const { updateProductStickerSettingsValidation } = require('../helper/productStickerSettings.validator');

router.get(
  '/schema',
  authMiddleware(true),
  getProductStickerSettingsSchema
);

router.get(
  '/',
  authMiddleware(true),
  getProductStickerSettings
);

router.put(
  '/',
  authMiddleware(true),
  validateRequest(updateProductStickerSettingsValidation),
  updateProductStickerSettings
);

module.exports = router;
