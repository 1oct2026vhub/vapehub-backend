const cron = require('node-cron');
const { Op } = require('sequelize');
const logger = require('../library/logger');
const { createDomainLogger } = require('../library/logging/domainLogger');
const { Order, PaymentMethod, Transaction, OrderLog, sequelize } = require('../models');
const {
    confirmWorldpayPayment,
    recoverWorldpayPostPaymentEffects,
    POST_PAYMENT_MARKER_STATUS
} = require('../components/payment/domain/worldpayPaymentFinalize.service');
const { getWorldpayPaymentState } = require('../components/payment/helper/worldpayPaymentQuery.helper');
const {
    RECONCILE_ELIGIBLE_STATUSES,
    RECONCILE_MAX_AGE_DAYS,
    DEFAULT_RECONCILE_MIN_AGE_MINUTES,
    DEFAULT_RECONCILE_CRON
} = require('../components/payment/helper/worldpayPaymentEligibility.helper');

const reconcileLog = createDomainLogger('payment-reconcile');

const SCHEDULE = process.env.WORLDPAY_RECONCILE_CRON || DEFAULT_RECONCILE_CRON;
const MIN_AGE_MINUTES = Math.max(
    DEFAULT_RECONCILE_MIN_AGE_MINUTES,
    Number(process.env.WORLDPAY_RECONCILE_MIN_AGE_MINUTES || DEFAULT_RECONCILE_MIN_AGE_MINUTES)
);
const MAX_AGE_DAYS = Math.max(1, Number(process.env.WORLDPAY_RECONCILE_MAX_AGE_DAYS || RECONCILE_MAX_AGE_DAYS));
const BATCH_LIMIT = Math.max(1, Number(process.env.WORLDPAY_RECONCILE_BATCH_LIMIT || 100));
const DRY_RUN = String(process.env.WORLDPAY_RECONCILE_DRY_RUN || 'false').toLowerCase() === 'true';

async function findOrphanWorldpayOrders(limit = BATCH_LIMIT) {
    const minCreatedAt = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
    const maxCreatedAt = new Date(Date.now() - MIN_AGE_MINUTES * 60 * 1000);

    const worldpayMethod = await PaymentMethod.findOne({
        where: { payment_method: 'Worldpay' },
        attributes: ['id']
    });

    if (!worldpayMethod) {
        return [];
    }

    const completedOrderIds = await Transaction.findAll({
        where: { status: 'COMPLETED' },
        attributes: ['orderId'],
        raw: true
    });
    const completedIds = completedOrderIds.map((row) => row.orderId).filter(Boolean);

    const where = {
        ordered: false,
        order_code: { [Op.ne]: null },
        payment_method_id: worldpayMethod.id,
        status: { [Op.in]: RECONCILE_ELIGIBLE_STATUSES },
        createdAt: {
            [Op.between]: [minCreatedAt, maxCreatedAt]
        }
    };

    if (completedIds.length > 0) {
        where.id = { [Op.notIn]: completedIds };
    }

    return Order.findAll({
        where,
        attributes: ['id', 'order_code', 'order_unique_id', 'total', 'status', 'ordered', 'email', 'createdAt'],
        order: [['createdAt', 'ASC']],
        limit
    });
}

async function findWorldpayOrdersMissingPostPayment(limit = BATCH_LIMIT) {
    const minCreatedAt = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

    const worldpayMethod = await PaymentMethod.findOne({
        where: { payment_method: 'Worldpay' },
        attributes: ['id']
    });

    if (!worldpayMethod) {
        return [];
    }

    const processedRows = await OrderLog.findAll({
        where: { status: POST_PAYMENT_MARKER_STATUS },
        attributes: ['order_id'],
        raw: true
    });
    const processedOrderIds = processedRows.map((row) => row.order_id).filter(Boolean);

    const where = {
        ordered: true,
        order_code: { [Op.ne]: null },
        payment_method_id: worldpayMethod.id,
        status: 'processing',
        createdAt: {
            [Op.gte]: minCreatedAt
        }
    };

    if (processedOrderIds.length > 0) {
        where.id = { [Op.notIn]: processedOrderIds };
    }

    return Order.findAll({
        where,
        attributes: ['id', 'order_code', 'order_unique_id', 'total', 'status', 'ordered', 'createdAt'],
        include: [
            {
                model: Transaction,
                as: 'transactions',
                where: { status: 'COMPLETED' },
                required: true,
                attributes: ['amount', 'currency']
            }
        ],
        order: [['createdAt', 'ASC']],
        limit
    });
}

async function recoverMissingPostPaymentEffects(summary) {
    const orders = await findWorldpayOrdersMissingPostPayment();
    summary.postPaymentRecoveryScanned = orders.length;

    for (const order of orders) {
        try {
            if (DRY_RUN) {
                summary.postPaymentRecovered += 1;
                continue;
            }

            const completedTransaction = Array.isArray(order.transactions)
                ? order.transactions[0]
                : null;

            const result = await recoverWorldpayPostPaymentEffects({
                orderCode: order.order_code,
                amount: completedTransaction?.amount ?? parseFloat(order.total),
                currency: completedTransaction?.currency || 'GBP',
                source: 'cron:reconcile-recovery'
            });

            if (result.ok && result.postProcessed) {
                summary.postPaymentRecovered += 1;
            } else if (result.ok && result.alreadyDone) {
                summary.postPaymentAlreadyDone += 1;
            } else if (result.sideEffectFailed) {
                summary.postPaymentRecoveryFailed += 1;
                summary.errors.push({
                    order_id: order.id,
                    order_code: order.order_code,
                    reason: 'POST_PAYMENT_RECOVERY_FAILED'
                });
            }
        } catch (error) {
            summary.postPaymentRecoveryFailed += 1;
            summary.errors.push({
                order_id: order.id,
                order_code: order.order_code,
                message: error.message
            });
            reconcileLog.logError({
                event: 'worldpay_post_payment_recovery_error',
                order_id: order.id,
                order_code: order.order_code,
                message: error.message
            });
        }
    }
}

async function reconcileUnpaidWorldpayOrders() {
    const orders = await findOrphanWorldpayOrders();
    const summary = {
        scanned: orders.length,
        reconciled: 0,
        skippedNotSettled: 0,
        skippedQueryUnavailable: 0,
        skippedIneligible: 0,
        postPaymentRecoveryScanned: 0,
        postPaymentRecovered: 0,
        postPaymentAlreadyDone: 0,
        postPaymentRecoveryFailed: 0,
        dryRun: DRY_RUN,
        errors: []
    };

    for (const order of orders) {
        try {
            const state = await getWorldpayPaymentState(order.order_code);

            if (state.queryUnavailable) {
                summary.skippedQueryUnavailable += 1;
                reconcileLog.logInfo({
                    event: 'worldpay_reconcile_skipped',
                    order_id: order.id,
                    order_code: order.order_code,
                    reason: state.reason || 'QUERY_UNAVAILABLE',
                    last_error: state.lastError || null
                });
                continue;
            }

            if (!state.settled) {
                summary.skippedNotSettled += 1;
                reconcileLog.logInfo({
                    event: 'worldpay_reconcile_skipped',
                    order_id: order.id,
                    order_code: order.order_code,
                    reason: state.reason || 'NOT_SETTLED',
                    worldpay_last_event: state.lastEvent || null,
                    worldpay_event_hints: state.eventHints || null,
                    worldpay_endpoint: state.endpoint || null
                });
                continue;
            }

            reconcileLog.logInfo({
                event: 'worldpay_reconcile_candidate',
                order_id: order.id,
                order_unique_id: order.order_unique_id,
                order_code: order.order_code,
                worldpay_last_event: state.lastEvent || null
            });

            if (DRY_RUN) {
                summary.reconciled += 1;
                continue;
            }

            const result = await confirmWorldpayPayment({
                orderCode: order.order_code,
                amount: state.amount ?? parseFloat(order.total),
                currency: state.currency || 'GBP',
                source: 'cron:reconcile',
                metadata: {
                    reconciledAt: new Date().toISOString(),
                    worldpayLastEvent: state.lastEvent || null
                }
            });

            if (result.ok) {
                summary.reconciled += 1;
            } else if (result.reason === 'ORDER_NOT_ELIGIBLE') {
                summary.skippedIneligible += 1;
            } else {
                summary.errors.push({
                    order_id: order.id,
                    order_code: order.order_code,
                    reason: result.reason
                });
            }
        } catch (error) {
            summary.errors.push({
                order_id: order.id,
                order_code: order.order_code,
                message: error.message
            });
            reconcileLog.logError({
                event: 'worldpay_reconcile_error',
                order_id: order.id,
                order_code: order.order_code,
                message: error.message
            });
        }
    }

    await recoverMissingPostPaymentEffects(summary);

    logger.info('Worldpay reconcile tick', summary);

    return summary;
}

cron.schedule(SCHEDULE, async () => {
    try {
        await reconcileUnpaidWorldpayOrders();
    } catch (err) {
        logger.error('reconcileUnpaidWorldpayOrders tick failed:', err);
    }
});

logger.info(
    `Worldpay reconcile cron scheduled (cron='${SCHEDULE}', min_age=${MIN_AGE_MINUTES}m, max_age=${MAX_AGE_DAYS}d, batch=${BATCH_LIMIT}, dry_run=${DRY_RUN})`
);

module.exports = {
    reconcileUnpaidWorldpayOrders,
    findOrphanWorldpayOrders,
    findWorldpayOrdersMissingPostPayment
};
