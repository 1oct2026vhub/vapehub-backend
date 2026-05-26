const { calculateShippingCost } = require('../../shippingMethod/helper/shippingMethod.helper');

const round2 = (n) => parseFloat(Math.max(0, Number(n) || 0).toFixed(2));

/**
 * Derive £ cap for loyalty this checkout and £ per point, from LoyaltyPointsSettings.
 */
function resolveLoyaltyMoneyParams(loyaltyAmountType, loyaltyAmount, pointsValue, redeemableGbp) {
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
      const pctOff = round2((redeemableGbp * pct) / 100);
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
 * Merchandise after deals/coupons/mail, before loyalty.
 * Points may redeem against the full checkout total (merchandise + shipping).
 *
 * @param {boolean} [fullRedemption] - When true (loyalty + use full balance), ceil points
 *   needed to cover capGbp; discount still capped at capGbp (surplus point value absorbed).
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

  const { capGbp, gbpPerPoint: pv } = resolveLoyaltyMoneyParams(
    loyaltyAmountType,
    loyaltyAmount,
    pointsValue,
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

  let loyaltySurplusAbsorbedGbp = 0;

  if (canRedeemPoints) {
    const maxGbp = capGbp;
    const rawPointsForTotal = maxGbp / pv;
    const maxPoints = fullRedemption
      ? Math.ceil(rawPointsForTotal - 1e-9)
      : Math.floor(rawPointsForTotal);

    pointsUsed = Math.min(requested, userLoyaltyPoints, maxPoints);
    loyaltyDiscount = round2(Math.min(pointsUsed * pv, maxGbp));
    loyaltySurplusAbsorbedGbp = round2(Math.max(0, pointsUsed * pv - loyaltyDiscount));
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
    loyaltySurplusAbsorbedGbp,
    grandTotal,
    paymentRequired,
    payableMerchandise: round2(Math.max(0, merchandise - Math.min(loyaltyDiscount, merchandise))),
  };
}

module.exports = {
  computeShippingAndLoyalty,
  resolveLoyaltyMoneyParams,
  round2,
};
