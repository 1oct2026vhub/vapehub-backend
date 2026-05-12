const { calculateShippingCost } = require('../../shippingMethod/helper/shippingMethod.helper');

const round2 = (n) => parseFloat(Math.max(0, Number(n) || 0).toFixed(2));

/**
 * Merchandise total is after deals, coupons/referral, and mail subscription — before loyalty points.
 * Shipping: free when merchandise >= freeShippingThresholdGbp; otherwise use shipping method rules.
 * Points redeem only against merchandise (not shipping when shipping is paid).
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
    const maxGbp = merchandise;
    const maxPoints = Math.floor(maxGbp / pv);
    pointsUsed = Math.min(requested, userLoyaltyPoints, maxPoints);
    loyaltyDiscount = round2(pointsUsed * pv);
    loyaltyDiscount = Math.min(loyaltyDiscount, merchandise);
  }

  const payableMerchandise = round2(merchandise - loyaltyDiscount);
  const ship = shippingCost;
  const grandTotal = ship === null ? null : round2(payableMerchandise + ship);
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
