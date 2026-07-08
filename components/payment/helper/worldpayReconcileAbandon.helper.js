const constants = require('../../../config/constants');
const { sequelize } = require('../../../models');
const {
    RECONCILE_ABANDONED_STATUS,
    RECONCILE_EXHAUSTED_LABEL
} = require('./worldpayPaymentEligibility.helper');

const NEGATIVE_EVENT_KEYWORDS = ['refused', 'cancel', 'expired', 'failed'];

function includesNegativeKeyword(value) {
    if (!value) {
        return false;
    }
    const normalized = String(value).toLowerCase();
    return NEGATIVE_EVENT_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function isDefinitiveUnpaidState(state) {
    if (!state) {
        return false;
    }

    if (!state.settled && state.reason === 'NOT_SETTLED') {
        if (includesNegativeKeyword(state.lastEvent)) {
            return true;
        }
        if (Array.isArray(state.eventHints) && state.eventHints.some(includesNegativeKeyword)) {
            return true;
        }
    }

    if (state.queryUnavailable && state?.lastError?.reason === 'NO_PAYMENTS_FOUND') {
        return true;
    }

    if (!state.queryUnavailable && state.reason === 'NO_MATCHING_PAYMENT') {
        return true;
    }

    return false;
}

async function incrementReconcileAttempt(order, state, transaction = null) {
    const pendingTransaction = await sequelize.models.Transaction.findOne({
        where: {
            orderId: order.id,
            userId: order.user_id,
            status: constants.transactionStatus.PENDING
        },
        transaction,
        lock: transaction ? transaction.LOCK.UPDATE : undefined
    });

    if (!pendingTransaction) {
        return 0;
    }

    const metadata = pendingTransaction.metadata || {};
    const reconcileAttempts = Number(metadata.reconcileAttempts || 0) + 1;

    await pendingTransaction.update(
        {
            metadata: {
                ...metadata,
                reconcileAttempts,
                lastReconcileReason: state?.reason || null,
                lastReconcileEvent: state?.lastEvent || null,
                lastReconcileAt: new Date().toISOString()
            }
        },
        { transaction }
    );

    return reconcileAttempts;
}

async function markOrderReconcileAbandoned(order, state, source = 'cron:reconcile') {
    const transaction = await sequelize.transaction();

    try {
        const lockedOrder = await sequelize.models.Order.findOne({
            where: { id: order.id },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!lockedOrder) {
            throw new Error('Order not found while marking reconcile_abandoned');
        }

        await lockedOrder.update(
            { status: constants.orderStatus.CANCEL },
            { transaction }
        );

        const pendingTransaction = await sequelize.models.Transaction.findOne({
            where: {
                orderId: lockedOrder.id,
                userId: lockedOrder.user_id,
                status: constants.transactionStatus.PENDING
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (pendingTransaction) {
            await pendingTransaction.update(
                {
                    status: constants.transactionStatus.CANCELLED,
                    notes: 'Payment abandoned after reconcile retries',
                    metadata: {
                        ...(pendingTransaction.metadata || {}),
                        abandonedByReconcile: true,
                        abandonedAt: new Date().toISOString(),
                        abandonSource: source,
                        lastReconcileReason: state?.reason || null,
                        lastReconcileEvent: state?.lastEvent || null
                    }
                },
                { transaction }
            );
        }

        await sequelize.models.OrderLog.create(
            {
                order_id: lockedOrder.id,
                user_id: lockedOrder.user_id,
                status: RECONCILE_ABANDONED_STATUS,
                label: RECONCILE_EXHAUSTED_LABEL,
                additional_info: JSON.stringify({
                    source,
                    reason: state?.reason || null,
                    lastEvent: state?.lastEvent || null,
                    eventHints: state?.eventHints || null,
                    markedAt: new Date().toISOString()
                })
            },
            { transaction }
        );

        await transaction.commit();
        return { ok: true };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
}

module.exports = {
    isDefinitiveUnpaidState,
    incrementReconcileAttempt,
    markOrderReconcileAbandoned
};
