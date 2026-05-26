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
    // Percentage uses tiered points → % in computeShippingAndLoyalty (not a flat % of checkout here).
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
 * Merchandise after deals/coupons/mail, before loyalty.
 * Points may redeem against the full checkout total (merchandise + shipping).
 *
 * Percentage type: every `pointsPerTier` points (default 10, or minimum_points_redemption) grants
 * `loyalty_amount` % off the checkout (e.g. 10 pts → 3%, 40 pts → 12%).
 *
 * Fixed type: unchanged — points × points_value capped by loyalty_amount £.
 *
 * @param {boolean} [fullRedemption] - loyalty + use full balance (all points requested for tier %).
 */
function computeShippingAndLoyalty({
  merchandiseTotalAfterDealsCouponsMail,
  shippingMethod,
  userLoyaltyPoints,
  pointsToRedeem,
  pointsValue,
  loyaltyAmountType,
  loyaltyAmount,
  minimumPointsRedemption,
  minimumPurchaseAmountForRedemption,
  freeShippingThresholdGbp,
  fullRedemption = false,
}) {
  const merchandise = round2(merchandiseTotalAfterDealsCouponsMail);
  const threshold = Number(freeShippingThresholdGbp) || 30;
  const eligibleFreeShipping = merchandise >= threshold;

  let shippingCost = 0;
  if (shippingMethod) {
    if (eligibleFreeShipping) {
      shippingCost = 0;
    } else {
      const calc = calculateShippingCost(shippingMethod, merchandise);
      shippingCost = calc === null ? null : round2(calc);
    }
  }

  const ship = shippingCost;
  const checkoutGbp = ship === null ? null : round2(merchandise + ship);
  const loyaltyRedeemableGbp = checkoutGbp === null ? merchandise : checkoutGbp;

  const type = String(loyaltyAmountType || '').toLowerCase();
  const isPercentageTier = type === 'percentage';

  const requested = Math.max(0, Math.floor(Number(pointsToRedeem) || 0));
  const minRedeem = parseInt(minimumPointsRedemption, 10) || 0;
  const minPurchase = parseFloat(minimumPurchaseAmountForRedemption) || 0;
  const pointsPerTier =
    minRedeem >= 1 ? minRedeem : DEFAULT_POINTS_PER_PERCENT_TIER;
  const percentPerTier = parseFloat(loyaltyAmount) || 0;

  const { capGbp, gbpPerPoint: pv } = resolveLoyaltyMoneyParams(
    loyaltyAmountType,
    loyaltyAmount,
    pointsValue,
    loyaltyRedeemableGbp
  );

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
    canRedeemPoints =
      requested > 0 &&
      pv > 0 &&
      userLoyaltyPoints >= minRedeem &&
      merchandise >= minPurchase;
  }

  if (canRedeemPoints) {
    if (isPercentageTier) {
      const candidatePoints = Math.min(requested, userLoyaltyPoints);
      loyaltyPercentApplied = computeTieredPercentFromPoints(
        candidatePoints,
        pointsPerTier,
        percentPerTier
      );
      const pointsForAppliedPercent = pointsRequiredForTieredPercent(
        loyaltyPercentApplied,
        pointsPerTier,
        percentPerTier
      );
      pointsUsed = Math.min(candidatePoints, pointsForAppliedPercent);
      loyaltyDiscount = round2((loyaltyRedeemableGbp * loyaltyPercentApplied) / 100);
      loyaltyDiscount = Math.min(loyaltyDiscount, loyaltyRedeemableGbp);

      if (fullRedemption && loyaltyPercentApplied >= 100) {
        loyaltyDiscount = loyaltyRedeemableGbp;
      }
    } else {
      const maxGbp = capGbp;
      const rawPointsForTotal = maxGbp / pv;
      const maxPoints = fullRedemption
        ? Math.ceil(rawPointsForTotal - 1e-9)
        : Math.floor(rawPointsForTotal);

      pointsUsed = Math.min(requested, userLoyaltyPoints, maxPoints);
      loyaltyDiscount = round2(Math.min(pointsUsed * pv, maxGbp));
      loyaltySurplusAbsorbedGbp = round2(Math.max(0, pointsUsed * pv - loyaltyDiscount));
    }
  }

  const grandTotal = checkoutGbp === null ? null : round2(checkoutGbp - loyaltyDiscount);
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
    payableMerchandise: round2(Math.max(0, merchandise - Math.min(loyaltyDiscount, merchandise))),
  };
}

/**
 * API payload for loyalty program settings + user balance (admin-driven tier rules).
 * @param {object} settings - LoyaltyPointsSettings row
 * @param {number} userPoints
 * @param {{ merchandiseTotal?: number }} [options]
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

/** Snippet for apply-coupon / order responses after computeShippingAndLoyalty. */
function loyaltyPricingResponseFields(pricing) {
  if (!pricing) return {};
  return {
    loyalty_percent_applied: pricing.loyaltyPercentApplied,
    loyalty_points_per_tier: pricing.loyaltyPointsPerTier,
    loyalty_percent_per_tier: pricing.loyaltyPercentPerTier,
    loyalty_redeemable_gbp: pricing.loyaltyRedeemableGbp,
  };
}

module.exports = {
  computeShippingAndLoyalty,
  resolveLoyaltyMoneyParams,
  computeTieredPercentFromPoints,
  pointsRequiredForTieredPercent,
  buildLoyaltyRedemptionInfo,
  loyaltyPricingResponseFields,
  round2,
  DEFAULT_POINTS_PER_PERCENT_TIER,
};
