const { calculateShippingCost } = require('../../shippingMethod/helper/shippingMethod.helper');

const round2 = (n) => parseFloat(Math.max(0, Number(n) || 0).toFixed(2));

/**
 * Merchandise total is after deals, coupons/referral, and mail subscription — before loyalty points.
 * Shipping: free when merchandise >= freeShippingThresholdGbp; otherwise use shipping method rules.
 * Points may redeem against merchandise plus paid shipping (full checkout up to M + S when S is known).
 */
function computeShippingAndLoyalty({
  merchandiseTotalAfterDealsCouponsMail,
  shippingMethod,
  userLoyaltyPoints,
  pointsToRedeem,
  pointsValue,
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
  /** Max £ discount from points: full checkout when shipping is known; merchandise only if shipping invalid. */
  const redeemableGbp = ship === null ? merchandise : round2(merchandise + ship);

  const pv = parseFloat(pointsValue) || 0;
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
    const maxGbp = redeemableGbp;
    const maxPoints = Math.floor(maxGbp / pv);
    pointsUsed = Math.min(requested, userLoyaltyPoints, maxPoints);
    loyaltyDiscount = round2(pointsUsed * pv);
    loyaltyDiscount = Math.min(loyaltyDiscount, maxGbp);
  }

  const discountOnMerchandise = Math.min(loyaltyDiscount, merchandise);
  const payableMerchandise = round2(merchandise - discountOnMerchandise);

  const grandTotal = ship === null ? null : round2(redeemableGbp - loyaltyDiscount);
  const paymentRequired = grandTotal !== null && grandTotal > 0;

  return {
    merchandiseTotal: merchandise,
    eligibleFreeShipping,
    shippingCost: ship,
    pointsUsed,
    loyaltyDiscount,
    grandTotal,
    paymentRequired,
    payableMerchandise,
  };
}

module.exports = {
  computeShippingAndLoyalty,
  round2,
};
