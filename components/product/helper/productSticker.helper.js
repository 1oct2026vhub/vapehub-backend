'use strict';

const { Settings, Product, Attribute } = require('../../../models');
const { cacheOrFetch, invalidateCache } = require('../../../library/cache');

const STICKER_DEFAULTS_CACHE_KEY = 'product_sticker_defaults';
const STICKER_DEFAULTS_TTL = 600;
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const FLAVOUR_ATTRIBUTE_NAMES = new Set(['flavour', 'flavor']);

const DEFAULT_STICKER_CONFIG = {
  new: {
    enabled: true,
    sticker_name: 'NEW',
    background_color: '#000000',
    duration_days: 30,
    respect_is_new_flag: true,
  },
  new_flavours: {
    enabled: true,
    sticker_name: 'NEW FLAVOURS',
    background_color: '#00A651',
    min_product_age_days: 30,
    duration_days: 28,
  },
};

function isFlavourAttributeName(name) {
  if (!name || typeof name !== 'string') return false;
  return FLAVOUR_ATTRIBUTE_NAMES.has(name.toLowerCase().trim());
}

function parseStickerDefaultsContent(content) {
  if (!content) return { ...DEFAULT_STICKER_CONFIG };
  try {
    const parsed = typeof content === 'string' ? JSON.parse(content) : content;
    return {
      new: { ...DEFAULT_STICKER_CONFIG.new, ...(parsed.new || {}) },
      new_flavours: { ...DEFAULT_STICKER_CONFIG.new_flavours, ...(parsed.new_flavours || {}) },
    };
  } catch {
    return { ...DEFAULT_STICKER_CONFIG };
  }
}

async function getProductStickerDefaults() {
  return cacheOrFetch(
    STICKER_DEFAULTS_CACHE_KEY,
    async () => {
      const setting = await Settings.findOne({
        where: { content_key: 'product_sticker_defaults' },
      });
      return parseStickerDefaultsContent(setting?.content);
    },
    STICKER_DEFAULTS_TTL
  );
}

async function bustProductStickerDefaultsCache() {
  await invalidateCache(STICKER_DEFAULTS_CACHE_KEY);
}

function clearProductStickerFields() {
  return {
    sticker_name: null,
    sticker_background_color: null,
    sticker_active_from: null,
    sticker_active_until: null,
    sticker_source: null,
  };
}

function parseStickerInput(sticker) {
  if (!sticker || typeof sticker !== 'object') {
    throw new Error('sticker must be an object');
  }

  const name = typeof sticker.name === 'string' ? sticker.name.trim() : '';
  if (!name) {
    throw new Error('sticker.name is required');
  }
  if (name.length > 64) {
    throw new Error('sticker.name must be at most 64 characters');
  }

  const backgroundColor = typeof sticker.background_color === 'string'
    ? sticker.background_color.trim()
    : '';
  if (!HEX_COLOR_REGEX.test(backgroundColor)) {
    throw new Error('sticker.background_color must be a valid hex colour (#RRGGBB)');
  }

  if (!sticker.active_until) {
    throw new Error('sticker.active_until is required');
  }

  const activeUntil = new Date(sticker.active_until);
  if (Number.isNaN(activeUntil.getTime())) {
    throw new Error('sticker.active_until must be a valid date');
  }

  let activeFrom = new Date();
  if (sticker.active_from) {
    activeFrom = new Date(sticker.active_from);
    if (Number.isNaN(activeFrom.getTime())) {
      throw new Error('sticker.active_from must be a valid date');
    }
  }

  if (activeUntil <= activeFrom) {
    throw new Error('sticker.active_until must be after sticker.active_from');
  }

  return {
    sticker_name: name,
    sticker_background_color: backgroundColor,
    sticker_active_from: activeFrom,
    sticker_active_until: activeUntil,
    sticker_source: 'manual',
  };
}

function isStickerCurrentlyActive(product) {
  if (!product?.sticker_name || !product?.sticker_active_until) return false;
  const now = new Date();
  const from = product.sticker_active_from ? new Date(product.sticker_active_from) : null;
  const until = new Date(product.sticker_active_until);
  if (from && now < from) return false;
  if (now > until) return false;
  return true;
}

function formatProductStickerResponse(product) {
  if (!product?.sticker_name) {
    return null;
  }

  return {
    name: product.sticker_name,
    background_color: product.sticker_background_color,
    active_from: product.sticker_active_from,
    active_until: product.sticker_active_until,
    source: product.sticker_source,
    is_active: isStickerCurrentlyActive(product),
  };
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function productAgeInDays(createdAt) {
  const created = new Date(createdAt);
  const diffMs = Date.now() - created.getTime();
  return diffMs / (1000 * 60 * 60 * 24);
}

async function applyAutoNewSticker(product, transaction) {
  const config = await getProductStickerDefaults();
  const rule = config.new;
  if (!rule?.enabled) return;

  if (product.sticker_source === 'manual') return;

  const durationDays = Number(rule.duration_days) || 30;
  const ageDays = productAgeInDays(product.createdAt);
  const withinNewWindow = ageDays <= durationDays;
  const manualFlag = rule.respect_is_new_flag !== false && product.is_new === true;

  if (!withinNewWindow && !manualFlag) return;

  const now = new Date();
  await product.update({
    sticker_name: rule.sticker_name || 'NEW',
    sticker_background_color: rule.background_color || '#000000',
    sticker_active_from: now,
    sticker_active_until: addDays(product.createdAt, durationDays),
    sticker_source: 'auto_new',
  }, { transaction });
}

async function applyAutoNewFlavoursSticker(productId, transaction) {
  const config = await getProductStickerDefaults();
  const rule = config.new_flavours;
  if (!rule?.enabled) return;

  const product = await Product.findByPk(productId, { transaction });
  if (!product) return;
  if (product.sticker_source === 'manual') return;

  const minAgeDays = Number(rule.min_product_age_days) || 30;
  if (productAgeInDays(product.createdAt) < minAgeDays) return;

  const durationDays = Number(rule.duration_days) || 28;
  const now = new Date();

  await product.update({
    sticker_name: rule.sticker_name || 'NEW FLAVOURS',
    sticker_background_color: rule.background_color || '#00A651',
    sticker_active_from: now,
    sticker_active_until: addDays(now, durationDays),
    sticker_source: 'auto_new_flavours',
  }, { transaction });
}

async function applyAutoNewFlavoursStickerForAttributeIds(productId, attributeIds, transaction) {
  if (!attributeIds?.length) return;

  const uniqueIds = [...new Set(attributeIds.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id)))];
  if (!uniqueIds.length) return;

  const attributes = await Attribute.findAll({
    where: { id: uniqueIds },
    attributes: ['id', 'name'],
    transaction,
  });

  const hasFlavour = attributes.some((attr) => isFlavourAttributeName(attr.name));
  if (!hasFlavour) return;

  await applyAutoNewFlavoursSticker(productId, transaction);
}

function validateStickerDefaultsPayload(body) {
  const errors = [];
  if (!body || typeof body !== 'object') {
    return ['Request body must be an object'];
  }

  ['new', 'new_flavours'].forEach((key) => {
    const section = body[key];
    if (!section || typeof section !== 'object') {
      errors.push(`${key} section is required`);
      return;
    }
    if (typeof section.enabled !== 'boolean') {
      errors.push(`${key}.enabled must be a boolean`);
    }
    if (section.enabled) {
      if (!section.sticker_name || typeof section.sticker_name !== 'string' || !section.sticker_name.trim()) {
        errors.push(`${key}.sticker_name is required when enabled`);
      }
      if (!section.background_color || !HEX_COLOR_REGEX.test(section.background_color)) {
        errors.push(`${key}.background_color must be a valid hex colour`);
      }
    }
    if (key === 'new') {
      const days = Number(section.duration_days);
      if (!Number.isInteger(days) || days < 1) {
        errors.push('new.duration_days must be a positive integer');
      }
    }
    if (key === 'new_flavours') {
      const minDays = Number(section.min_product_age_days);
      const windowDays = Number(section.duration_days);
      if (!Number.isInteger(minDays) || minDays < 0) {
        errors.push('new_flavours.min_product_age_days must be a non-negative integer');
      }
      if (!Number.isInteger(windowDays) || windowDays < 1) {
        errors.push('new_flavours.duration_days must be a positive integer');
      }
    }
  });

  return errors;
}

function normalizeStickerDefaultsPayload(body) {
  return {
    new: {
      enabled: Boolean(body.new.enabled),
      sticker_name: String(body.new.sticker_name || 'NEW').trim(),
      background_color: String(body.new.background_color).trim(),
      duration_days: parseInt(body.new.duration_days, 10),
      respect_is_new_flag: body.new.respect_is_new_flag !== false,
    },
    new_flavours: {
      enabled: Boolean(body.new_flavours.enabled),
      sticker_name: String(body.new_flavours.sticker_name || 'NEW FLAVOURS').trim(),
      background_color: String(body.new_flavours.background_color).trim(),
      min_product_age_days: parseInt(body.new_flavours.min_product_age_days, 10),
      duration_days: parseInt(body.new_flavours.duration_days, 10),
    },
  };
}

function attachStickerToProductList(products) {
  if (!Array.isArray(products)) return products;
  return products.map((product) => ({
    ...product,
    sticker: formatProductStickerResponse(product),
  }));
}

/** SQL fragment for product listing queries */
const PRODUCT_STICKER_SELECT_SQL = `
  p.sticker_name,
  p.sticker_background_color,
  p.sticker_active_from,
  p.sticker_active_until,
  p.sticker_source`;

module.exports = {
  DEFAULT_STICKER_CONFIG,
  PRODUCT_STICKER_SELECT_SQL,
  getProductStickerDefaults,
  bustProductStickerDefaultsCache,
  clearProductStickerFields,
  parseStickerInput,
  isStickerCurrentlyActive,
  formatProductStickerResponse,
  attachStickerToProductList,
  applyAutoNewSticker,
  applyAutoNewFlavoursSticker,
  applyAutoNewFlavoursStickerForAttributeIds,
  validateStickerDefaultsPayload,
  normalizeStickerDefaultsPayload,
  isFlavourAttributeName,
};
