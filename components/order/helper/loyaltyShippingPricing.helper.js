const { calculateShippingCost } = require('../../shippingMethod/helper/shippingMethod.helper');

const round2 = (n) => parseFloat(Math.max(0, Number(n) || 0).toFixed(2));

/** Default: every 10 points → next tier (overridden by minimum_points_redemption when set). */
const DEFAULT_POINTS_PER_PERCENT_TIER = 10;

/**
 * Tiered percentage: floor(points / pointsPerTier) × percentPerTier = % off checkout.
 * Example: 10 pts → 3%, 40 pts → 12% (with percentPerTier = 3).
 */
function computeTieredPercentFromPoints(pointsUsed, pointsPerTier, percentPerTier) {
  const pts = Math.max(0, Math.floor(Number(pointsUsed) || 0));
  const block = Math.max(1, Math.floor(Number(pointsPerTier) || 0) || DEFAULT_POINTS_PER_PERCENT_TIER);
  const perBlock = Math.max(0, parseFloat(percentPerTier) || 0);
  const blocks = Math.floor(pts / block);
  return Math.min(100, blocks * perBlock);
}

/** Minimum points burned to achieve a given tiered % (ignores incomplete trailing blocks). */
function pointsRequiredForTieredPercent(percentApplied, pointsPerTier, percentPerTier) {
  const pct = Math.max(0, Math.min(100, parseFloat(percentApplied) || 0));
  if (pct <= 0) return 0;
  const block = Math.max(1, Math.floor(Number(pointsPerTier) || 0) || DEFAULT_POINTS_PER_PERCENT_TIER);
  const perBlock = Math.max(0, parseFloat(percentPerTier) || 0);
  if (perBlock <= 0) return 0;
  const tiersNeeded = Math.ceil(pct / perBlock);
  return tiersNeeded * block;
}

/**
 * Derive £ cap and £ per point for fixed (and legacy) loyalty types.
 */
function resolveLoyaltyMoneyParams(loyaltyAmountType, loyaltyAmount, pointsValue, redeemableGbp) {
  const laRaw = parseFloat(loyaltyAmount);
  const la = Number.isFinite(laRaw) ? laRaw : 0;
  const pvRaw = parseFloat(pointsValue) || 0;
  const type = String(loyaltyAmountType || '').toLowerCase();

  let capGbp = redeemableGbp;
  let gbpPerPoint = 0;

  if (type === 'percentage') {
    gbpPerPoint = pvRaw;
  } else if (type === 'fixed') {
    if (la > 0 && pvRaw >= 1) {
      gbpPerPoint = la / pvRaw;
    } else if (la > 0 && pvRaw > 0 && pvRaw < 1) {
      gbpPerPoint = pvRaw;
      capGbp = round2(Math.min(redeemableGbp, la));
    } else {
      gbpPerPoint = pvRaw;
    }
  } else {
    gbpPerPoint = pvRaw;
  }

  return { capGbp: round2(capGbp), gbpPerPoint };
}

/**
 * Cart-wide £30+ free shipping applies only to standard delivery.
 * Premium methods (Tracked 24, Special Delivery, DPD) always charge full price.
 * Dedicated free-shipping methods use is_free_shipping + calculateShippingCost.
 */
function qualifiesForCartThresholdFreeShipping(shippingMethod) {
  if (!shippingMethod || shippingMethod.is_free_shipping) {
    return false;
  }
  const code = String(shippingMethod.service_code || '').toLowerCase();
  return code === 'standard_delivery';
}

/**
 * Shipping cost from payable merchandise (after loyalty). Free standard delivery when payable >= threshold.
 */
function computeShippingCostFromPayable(shippingMethod, payableMerchandise, freeShippingThresholdGbp) {
  const threshold = Number(freeShippingThresholdGbp) || 30;
  const eligibleFreeShipping = payableMerchandise >= threshold;

  if (!shippingMethod) {
    return { shippingCost: 0, eligibleFreeShipping };
  }

  if (shippingMethod.is_free_shipping) {
    const calc = calculateShippingCost(shippingMethod, payableMerchandise);
    return { shippingCost: calc === null ? null : round2(calc), eligibleFreeShipping };
  }

  if (eligibleFreeShipping && qualifiesForCartThresholdFreeShipping(shippingMethod)) {
    return { shippingCost: 0, eligibleFreeShipping: true };
  }

  const calc = calculateShippingCost(shippingMethod, payableMerchandise);
  return { shippingCost: calc === null ? null : round2(calc), eligibleFreeShipping };
}

/**
 * @throws {{ statusCode: number, message: string }}
 */
function assertShippingMethodRequired({ shippingMethod, payableMerchandise, freeShippingThresholdGbp }) {
  const threshold = Number(freeShippingThresholdGbp) || 30;
  if (payableMerchandise < threshold && !shippingMethod) {
    throw {
      statusCode: 400,
      message: `Shipping method is required for orders under £${threshold}`,
    };
  }
}

/**
 * Merchandise after deals/coupons/mail, before loyalty.
 * Loyalty redeems against merchandise only — shipping is never discounted by points.
 *
 * Free standard delivery applies when payable merchandise (after loyalty) >= £30.
 *
 * Percentage type: every `pointsPerTier` points grants `loyalty_amount` % off merchandise.
 * Fixed type: block based — every `minimum_points_redemption` points grants `loyalty_amount` GBP off merchandise.
 *
 * @param {boolean} [fullRedemption] - loyalty + use full balance (all points requested for tier %).
 */
function computeShippingAndLoyalty({
  merchandiseTotalAfterDealsCouponsMail,
  shippingMethod,
  userLoyaltyPoints,
  pointsToRedeem,
  pointsValue: _pointsValue,
  loyaltyAmountType,
  loyaltyAmount,
  minimumPointsRedemption,
  minimumPurchaseAmountForRedemption,
  freeShippingThresholdGbp,
  fullRedemption = false,
}) {
  const merchandise = round2(merchandiseTotalAfterDealsCouponsMail);
  const threshold = Number(freeShippingThresholdGbp) || 30;

  const type = String(loyaltyAmountType || '').toLowerCase();
  const isPercentageTier = type === 'percentage';

  const requested = Math.max(0, Math.floor(Number(pointsToRedeem) || 0));
  const minRedeem = parseInt(minimumPointsRedemption, 10) || 0;
  const minPurchase = parseFloat(minimumPurchaseAmountForRedemption) || 0;
  const pointsPerTier =
    minRedeem >= 1 ? minRedeem : DEFAULT_POINTS_PER_PERCENT_TIER;
  const percentPerTier = parseFloat(loyaltyAmount) || 0;

  const loyaltyRedeemableGbp = merchandise;

  let pointsUsed = 0;
  let loyaltyDiscount = 0;
  let loyaltyPercentApplied = 0;
  let loyaltySurplusAbsorbedGbp = 0;

  let canRedeemPoints = false;

  if (isPercentageTier) {
    canRedeemPoints =
      requested > 0 &&
      percentPerTier > 0 &&
      userLoyaltyPoints >= minRedeem &&
      merchandise >= minPurchase &&
      Math.floor(Math.min(requested, userLoyaltyPoints) / pointsPerTier) >= 1;
  } else {
    const pointsPerBlock = Math.max(1, minRedeem || 0);
    const discountPerBlock = Math.max(0, parseFloat(loyaltyAmount) || 0);
    canRedeemPoints =
      requested > 0 &&
      discountPerBlock > 0 &&
      userLoyaltyPoints >= minRedeem &&
      merchandise >= minPurchase &&
      Math.floor(Math.min(requested, userLoyaltyPoints) / pointsPerBlock) >= 1;
  }

  if (canRedeemPoints) {
    if (isPercentageTier) {
      const candidatePoints = Math.min(requested, userLoyaltyPoints);
      const pointsPerTierSafe = Math.max(1, pointsPerTier);
      const percentPerTierSafe = Math.max(0, percentPerTier);
      const maxTiersByPoints = Math.floor(candidatePoints / pointsPerTierSafe);
      const neededPercent = loyaltyRedeemableGbp > 0 ? 100 : 0;
      const tiersNeededForTotal = Math.ceil(neededPercent / percentPerTierSafe);
      const tiersToUse = Math.max(0, Math.min(maxTiersByPoints, tiersNeededForTotal));

      pointsUsed = tiersToUse * pointsPerTierSafe;
      loyaltyPercentApplied = Math.min(100, tiersToUse * percentPerTierSafe);
      loyaltyDiscount = round2((loyaltyRedeemableGbp * loyaltyPercentApplied) / 100);
      loyaltyDiscount = Math.min(loyaltyDiscount, loyaltyRedeemableGbp);

      if (fullRedemption && loyaltyPercentApplied >= 100) {
        loyaltyDiscount = loyaltyRedeemableGbp;
      }
    } else {
      const pointsPerBlock = Math.max(1, minRedeem || 0);
      const discountPerBlock = Math.max(0, parseFloat(loyaltyAmount) || 0);
      const candidatePoints = Math.min(requested, userLoyaltyPoints);
      const maxBlocksByPoints = Math.floor(candidatePoints / pointsPerBlock);
      const blocksNeededForTotal = Math.ceil(loyaltyRedeemableGbp / discountPerBlock);
      const blocksToUse = Math.max(0, Math.min(maxBlocksByPoints, blocksNeededForTotal));

      pointsUsed = blocksToUse * pointsPerBlock;
      const rawFixedDiscount = blocksToUse * discountPerBlock;
      loyaltyDiscount = round2(Math.min(rawFixedDiscount, loyaltyRedeemableGbp));
      loyaltySurplusAbsorbedGbp = round2(Math.max(0, rawFixedDiscount - loyaltyDiscount));
    }
  }

  const payableMerchandise = round2(Math.max(0, merchandise - loyaltyDiscount));

  assertShippingMethodRequired({
    shippingMethod,
    payableMerchandise,
    freeShippingThresholdGbp: threshold,
  });

  const { shippingCost: ship, eligibleFreeShipping } = computeShippingCostFromPayable(
    shippingMethod,
    payableMerchandise,
    threshold
  );

  const grandTotal = ship === null ? null : round2(payableMerchandise + ship);
  const paymentRequired = grandTotal !== null && grandTotal > 0;

  return {
    merchandiseTotal: merchandise,
    eligibleFreeShipping,
    shippingCost: ship,
    loyaltyRedeemableGbp,
    pointsUsed,
    loyaltyDiscount,
    loyaltyPercentApplied: isPercentageTier ? loyaltyPercentApplied : null,
    loyaltyPointsPerTier: isPercentageTier ? pointsPerTier : null,
    loyaltyPercentPerTier: isPercentageTier ? percentPerTier : null,
    loyaltySurplusAbsorbedGbp,
    grandTotal,
    paymentRequired,
    payableMerchandise,
  };
}

/**
 * API payload for loyalty program settings + user balance (admin-driven tier rules).
 * @param {object} settings - LoyaltyPointsSettings row
 * @param {number} userPoints
 * @param {{ merchandiseTotal?: number, payableMerchandise?: number }} [options]
 */
function buildLoyaltyRedemptionInfo(settings, userPoints = 0, options = {}) {
  if (!settings) return null;

  const pts = Math.max(0, parseInt(userPoints, 10) || 0);
  const minRedeem = parseInt(settings.minimum_points_redemption, 10) || 0;
  const minPurchase = parseFloat(settings.minimum_purchase_amount) || 0;
  const type = String(settings.loyalty_amount_type || '').toLowerCase();
  const pointsPerTier =
    minRedeem >= 1 ? minRedeem : DEFAULT_POINTS_PER_PERCENT_TIER;
  const percentPerTier = parseFloat(settings.loyalty_amount) || 0;

  const merchandise =
    options.merchandiseTotal != null
      ? round2(options.merchandiseTotal)
      : null;
  const payableMerchandise =
    options.payableMerchandise != null
      ? round2(options.payableMerchandise)
      : merchandise;
  const freeShippingThreshold = 30;
  const hasEnoughPoints = pts >= minRedeem;
  const meetsMinimumOrder =
    merchandise === null || merchandise >= minPurchase;
  const tiersAtBalance =
    type === 'percentage' ? Math.floor(pts / pointsPerTier) : 0;

  const base = {
    user_points: pts,
    minimum_points_required: minRedeem,
    minimum_order_value_to_redeem: minPurchase,
    can_redeem: hasEnoughPoints && meetsMinimumOrder,
    has_enough_points: hasEnoughPoints,
    meets_minimum_order_value: meetsMinimumOrder,
    points_needed: Math.max(0, minRedeem - pts),
    loyalty_amount_type: type || null,
    points_value: settings.points_value,
    min_amount_for_loyalty_points: settings.min_amount_for_loyalty_points,
    amount_divisor: settings.amount_divisor,
    free_shipping_eligible:
      payableMerchandise !== null && payableMerchandise >= freeShippingThreshold,
  };

  if (type === 'percentage') {
    const maxPercent = computeTieredPercentFromPoints(
      pts,
      pointsPerTier,
      percentPerTier
    );
    return {
      ...base,
      redemption_type: 'percentage',
      redemption_model: 'tiered',
      percent_per_tier: percentPerTier,
      points_per_tier: pointsPerTier,
      redemption_amount: percentPerTier,
      max_percent_at_balance: maxPercent,
      tiers_at_balance: tiersAtBalance,
    };
  }

  if (type === 'fixed') {
    return {
      ...base,
      redemption_type: 'fixed',
      redemption_model: 'fixed',
      redemption_amount: parseFloat(settings.loyalty_amount) || 0,
    };
  }

  return {
    ...base,
    redemption_type: 'none',
    redemption_model: 'none',
    redemption_amount: 0,
  };
}

/**
 * Validate explicit loyalty redemption request (before full-balance expansion).
 * @throws {{ statusCode: number, message: string }}
 */
function assertLoyaltyPointsToRedeem({
  loyalty,
  rawPointsToRedeem,
  userPointsBalance,
  minimumPointsRedemption,
  loyaltyProgramActive = true,
}) {
  if (!loyalty || !loyaltyProgramActive) return;

  const requested = Math.max(0, Math.floor(Number(rawPointsToRedeem) || 0));

  if (requested === 0) return;

  const balance = Math.max(0, parseInt(userPointsBalance, 10) || 0);
  const minRedeem = Math.max(0, parseInt(minimumPointsRedemption, 10) || 0);

  if (requested > balance) {
    throw {
      statusCode: 400,
      message:
        balance === 0
          ? 'You have no loyalty points available to redeem'
          : `You only have ${balance} loyalty points available`,
    };
  }

  if (minRedeem > 0 && requested < minRedeem) {
    throw {
      statusCode: 400,
      message: `Minimum ${minRedeem} points required to redeem loyalty points`,
    };
  }
}

/** Snippet for apply-coupon / order responses after computeShippingAndLoyalty. */
function loyaltyPricingResponseFields(pricing) {
  if (!pricing) return {};
  return {
    loyalty_percent_applied: pricing.loyaltyPercentApplied,
    loyalty_points_per_tier: pricing.loyaltyPointsPerTier,
    loyalty_percent_per_tier: pricing.loyaltyPercentPerTier,
    loyalty_redeemable_gbp: pricing.loyaltyRedeemableGbp,
    payable_merchandise: pricing.payableMerchandise,
    free_shipping_eligible: pricing.eligibleFreeShipping,
  };
}

module.exports = {
  computeShippingAndLoyalty,
  computeShippingCostFromPayable,
  qualifiesForCartThresholdFreeShipping,
  assertShippingMethodRequired,
  resolveLoyaltyMoneyParams,
  computeTieredPercentFromPoints,
  pointsRequiredForTieredPercent,
  buildLoyaltyRedemptionInfo,
  assertLoyaltyPointsToRedeem,
  loyaltyPricingResponseFields,
  round2,
  DEFAULT_POINTS_PER_PERCENT_TIER,
};
