const { sequelize } = require('../../../models');
const constants = require('../../../config/constants');

/**
 * Ensure a PENDING Worldpay transaction exists for checkout audit / admin reference.
 */
async function ensurePendingWorldpayTransaction({
    userId,
    orderId,
    orderCode,
    amount,
    currency = 'GBP',
    dbTransaction
}) {
    if (!orderId || !orderCode) {
        return null;
    }

    const existing = await sequelize.models.Transaction.findOne({
        where: {
            orderId,
            userId
        },
        transaction: dbTransaction,
        lock: dbTransaction ? dbTransaction.LOCK.UPDATE : undefined
    });

    if (existing) {
        if (existing.status === constants.transactionStatus.COMPLETED) {
            return existing;
        }

        if (existing.status === constants.transactionStatus.PENDING) {
            if (existing.referenceNumber !== String(orderCode)) {
                await existing.update(
                    {
                        referenceNumber: String(orderCode),
                        amount,
                        currency
                    },
                    { transaction: dbTransaction }
                );
            }
            return existing;
        }
    }

    return sequelize.models.Transaction.create(
        {
            userId,
            orderId,
            paymentMethod: 'worldpay',
            transactionType: constants.transactionTypes.PURCHASE,
            amount,
            currency,
            status: constants.transactionStatus.PENDING,
            referenceNumber: String(orderCode),
            notes: 'Awaiting Worldpay payment',
            metadata: {
                source: 'order_placement'
            }
        },
        { transaction: dbTransaction }
    );
}

module.exports = {
    ensurePendingWorldpayTransaction
};
