/**
 * Resolve how many points to debit for an order (matches checkout pricing intent).
 * Primary source: order.loyalty_points_used (set at placement from block pricing).
 */
function resolveLoyaltyDebitPoints(order, settings) {
  const stored = parseInt(order.loyalty_points_used, 10) || 0;
  if (stored > 0) {
    return stored;
  }

  const loyaltyDiscount = parseFloat(order.loyalty_discount || 0);
  if (loyaltyDiscount <= 0) {
    return 0;
  }

  const type = String(settings.loyalty_amount_type || '').toLowerCase();
  const minRedeem = Math.max(0, parseInt(settings.minimum_points_redemption, 10) || 0);

  if (type === 'fixed') {
    const discountPerBlock = parseFloat(settings.loyalty_amount) || 0;
    const pointsPerBlock = Math.max(1, minRedeem || 1);
    if (discountPerBlock > 0) {
      const blocks = Math.round(loyaltyDiscount / discountPerBlock);
      if (blocks > 0) {
        return blocks * pointsPerBlock;
      }
    }
  }

  if (type === 'percentage') {
    const pointsPerTier = minRedeem >= 1 ? minRedeem : 10;
    const percentPerTier = parseFloat(settings.loyalty_amount) || 0;
    const paidTotal = parseFloat(order.total || 0);
    const shippingCost = parseFloat(order.shipping_cost || 0);
    const redeemableGbp = paidTotal + loyaltyDiscount - shippingCost;
    if (percentPerTier > 0 && redeemableGbp > 0) {
      const percentApplied = Math.min(100, (loyaltyDiscount / redeemableGbp) * 100);
      const tiers = Math.ceil(percentApplied / percentPerTier);
      if (tiers > 0) {
        return tiers * pointsPerTier;
      }
    }
  }

  const pv = parseFloat(settings.points_value) || 0;
  if (pv > 0) {
    return Math.floor(loyaltyDiscount / pv);
  }

  return 0;
}

/**
 * Debit user loyalty points and record redemption history after successful payment.
 * @returns {Promise<number>} Points debited (0 if skipped).
 */
async function redeemLoyaltyPointsForOrder({ order, user, settings, transaction }) {
  if (!order?.loyalty_flag || !user || !settings) {
    return 0;
  }

  const { LoyaltyPointsHistory, sequelize } = require('../../../models');
  const debitPoints = resolveLoyaltyDebitPoints(order, settings);
  const userBalance = parseInt(user.loyalty_points, 10) || 0;

  if (debitPoints <= 0 || userBalance < debitPoints) {
    return 0;
  }

  await user.update(
    {
      loyalty_points: sequelize.literal(`GREATEST(0, loyalty_points - ${debitPoints})`),
    },
    { transaction }
  );

  await LoyaltyPointsHistory.create(
    {
      user_id: user.id,
      type: 'redeemed',
      points: debitPoints,
      order_id: order.id || null,
      description: 'Points redeemed',
      timestamp: new Date(),
    },
    { transaction }
  );

  return debitPoints;
}

module.exports = {
  resolveLoyaltyDebitPoints,
  redeemLoyaltyPointsForOrder,
};
