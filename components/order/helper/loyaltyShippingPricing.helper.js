const { calculateShippingCost } = require('../../shippingMethod/helper/shippingMethod.helper');

const round2 = (n) => parseFloat(Math.max(0, Number(n) || 0).toFixed(2));

/**
 * Derive £ cap for loyalty this checkout and £ per point, from LoyaltyPointsSettings.
 *
 * - percentage: cap £ discount at min(redeemableGbp, merchandise × loyalty_amount%).
 *   Points still convert with points_value as £ per point (debit granularity).
 * - fixed + loyalty_amount + points_value ≥ 1: treat as block — loyalty_amount £ per points_value points
 *   → £/point = loyalty_amount / points_value (e.g. £2 / 10 = 0.2).
 * - fixed + loyalty_amount + 0 < points_value < 1: treat points_value as £/point and cap £ discount at loyalty_amount.
 * - otherwise: points_value = £ per point; cap = redeemableGbp.
 */
function resolveLoyaltyMoneyParams(loyaltyAmountType, loyaltyAmount, pointsValue, merchandise, redeemableGbp) {
  const laRaw = parseFloat(loyaltyAmount);
  const la = Number.isFinite(laRaw) ? laRaw : 0;
  const pvRaw = parseFloat(pointsValue) || 0;
  const type = String(loyaltyAmountType || '').toLowerCase();

  let capGbp = redeemableGbp;
  let gbpPerPoint = 0;

  if (type === 'percentage') {
    if (la <= 0) {
      capGbp = redeemableGbp;
    } else {
      const pct = Math.min(100, Math.max(0, la));
      const pctOff = round2((merchandise * pct) / 100);
      capGbp = round2(Math.min(redeemableGbp, pctOff));
    }
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
 * Merchandise total is after deals, coupons/referral, and mail subscription — before loyalty points.
 * Shipping: free when merchandise >= freeShippingThresholdGbp; otherwise use shipping method rules.
 * Points redeem against merchandise only when shipping is paid (< threshold); when shipping is free,
 * merchandise is the full redeemable amount (shipping is already £0).
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
  /** Sub-£30: points cover merchandise only; paid shipping stays on the card total. */
  const loyaltyRedeemableGbp =
    ship === null ? merchandise : eligibleFreeShipping ? round2(merchandise + ship) : merchandise;

  const { capGbp, gbpPerPoint: pv } = resolveLoyaltyMoneyParams(
    loyaltyAmountType,
    loyaltyAmount,
    pointsValue,
    merchandise,
    loyaltyRedeemableGbp
  );

  let pointsUsed = 0;
  let loyaltyDiscount = 0;

  const requested = Math.max(0, Math.floor(Number(pointsToRedeem) || 0));
  const minRedeem = parseInt(minimumPointsRedemption, 10) || 0;
  const minPurchase = parseFloat(minimumPurchaseAmountForRedemption) || 0;

  const canRedeemPoints =
    requested > 0 &&
    pv > 0 &&
    userLoyaltyPoints >= minRedeem &&
    merchandise >= minPurchase;

  if (canRedeemPoints) {
    const maxGbp = capGbp;
    const maxPoints = Math.floor(maxGbp / pv);
    pointsUsed = Math.min(requested, userLoyaltyPoints, maxPoints);
    loyaltyDiscount = round2(pointsUsed * pv);
    loyaltyDiscount = Math.min(loyaltyDiscount, maxGbp);
  }

  const discountOnMerchandise = Math.min(loyaltyDiscount, merchandise);
  const payableMerchandise = round2(merchandise - discountOnMerchandise);

  const grandTotal = checkoutGbp === null ? null : round2(checkoutGbp - loyaltyDiscount);
  const paymentRequired = grandTotal !== null && grandTotal > 0;

  return {
    merchandiseTotal: merchandise,
    eligibleFreeShipping,
    shippingCost: ship,
    loyaltyRedeemableGbp,
    pointsUsed,
    loyaltyDiscount,
    grandTotal,
    paymentRequired,
    payableMerchandise,
  };
}

module.exports = {
  computeShippingAndLoyalty,
  resolveLoyaltyMoneyParams,
  round2,
};
