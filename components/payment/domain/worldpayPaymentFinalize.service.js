const { Order, sequelize } = require('../../../models');
const paymentWebhookLogger = require('../../../utils/paymentWebhookLogger');
const {
    findWorldpayOrderByCode,
    runPostPaymentSideEffects
} = require('./worldpay.paidOrder.helper');
const {
    isWorldpayPaymentFinalizeEligible,
    requiresPaymentFinalizeEligibility
} = require('../helper/worldpayPaymentEligibility.helper');

const POST_PAYMENT_MARKER_STATUS = 'post_payment_processed';

const serializeErrorForLog = (error) => ({
    name: error?.name || null,
    message: error?.message || null,
    stack: error?.stack || null,
    code: error?.code || null,
    status: error?.status || error?.statusCode || null,
    axios: error?.isAxiosError
        ? {
            method: error?.config?.method || null,
            url: error?.config?.url || null,
            timeout: error?.config?.timeout || null,
            response_status: error?.response?.status || null,
            response_data: error?.response?.data || null
        }
        : null,
    sequelize: error?.errors
        ? {
            errors: error.errors.map((e) => ({
                message: e?.message || null,
                path: e?.path || null,
                value: e?.value || null,
                type: e?.type || null
            }))
        }
        : null
});

const logPaymentFinalizeError = (type, error, context = {}) => {
    paymentWebhookLogger.logError({
        type,
        ...context,
        error: serializeErrorForLog(error)
    });
};

const finalizePaidOrder = async ({
    order,
    referenceNumber,
    amount,
    currency,
    source,
    metadata = {}
}) => {
    const transaction = await sequelize.transaction();
    try {
        const lockedOrder = await Order.findOne({
            where: { id: order.id },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (!lockedOrder) {
            throw new Error('Order not found during payment finalization');
        }

        if (lockedOrder.ordered) {
            await transaction.commit();
            return { noOp: true, order: lockedOrder };
        }

        if (!['pending', 'cancel'].includes(lockedOrder.status)) {
            await transaction.commit();
            return { noOp: true, skippedIneligible: true, order: lockedOrder };
        }

        await lockedOrder.update(
            {
                status: 'processing',
                ordered: true
            },
            { transaction }
        );

        const existingTransaction = await sequelize.models.Transaction.findOne({
            where: {
                orderId: lockedOrder.id,
                userId: lockedOrder.user_id
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (existingTransaction) {
            await existingTransaction.update(
                {
                    paymentMethod: 'worldpay',
                    transactionType: 'PURCHASE',
                    amount,
                    currency,
                    status: 'COMPLETED',
                    referenceNumber,
                    notes: 'Payment completed successfully',
                    metadata: {
                        ...(existingTransaction.metadata || {}),
                        ...metadata,
                        source
                    }
                },
                { transaction }
            );
        } else {
            await sequelize.models.Transaction.create(
                {
                    userId: lockedOrder.user_id,
                    orderId: lockedOrder.id,
                    paymentMethod: 'worldpay',
                    transactionType: 'PURCHASE',
                    amount,
                    currency,
                    status: 'COMPLETED',
                    referenceNumber,
                    notes: 'Payment completed successfully',
                    metadata: {
                        ...metadata,
                        source
                    }
                },
                { transaction }
            );
        }

        const additionalInfo = JSON.stringify({
            source,
            referenceNumber,
            amount,
            currency,
            ...metadata
        });

        const existingOrderLog = await sequelize.models.OrderLog.findOne({
            where: {
                order_id: lockedOrder.id,
                user_id: lockedOrder.user_id,
                status: 'processing'
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        });

        if (existingOrderLog) {
            await existingOrderLog.update(
                {
                    status: 'processing',
                    label: 'Payment Successful via Worldpay',
                    additional_info: additionalInfo
                },
                { transaction }
            );
        } else {
            await sequelize.models.OrderLog.create(
                {
                    order_id: lockedOrder.id,
                    user_id: lockedOrder.user_id,
                    status: 'processing',
                    label: 'Payment Successful via Worldpay',
                    additional_info: additionalInfo
                },
                { transaction }
            );
        }

        await transaction.commit();
        return { noOp: false, order: lockedOrder };
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

const hasPostPaymentProcessed = async (orderId, userId) => {
    const marker = await sequelize.models.OrderLog.findOne({
        where: {
            order_id: orderId,
            user_id: userId,
            status: POST_PAYMENT_MARKER_STATUS
        }
    });

    return Boolean(marker);
};

const markPostPaymentProcessed = async (order, source) => {
    await sequelize.models.OrderLog.create({
        order_id: order.id,
        user_id: order.user_id,
        status: POST_PAYMENT_MARKER_STATUS,
        label: 'Post payment side effects processed',
        additional_info: JSON.stringify({
            source,
            processedAt: new Date().toISOString()
        })
    });
};

const processWorldpayPaidOrder = async ({
    order,
    referenceNumber,
    amount,
    currency,
    source,
    metadata = {},
    orderCodeForEffects
}) => {
    const finalizationResult = await finalizePaidOrder({
        order,
        referenceNumber,
        amount,
        currency,
        source,
        metadata
    });

    order.status = finalizationResult.order.status;
    order.ordered = finalizationResult.order.ordered;

    if (finalizationResult.skippedIneligible) {
        return {
            finalized: false,
            skippedIneligible: true,
            order
        };
    }

    if (finalizationResult.noOp) {
        return {
            finalized: true,
            postProcessed: false,
            alreadyDone: true,
            order
        };
    }

    if (await hasPostPaymentProcessed(order.id, order.user_id)) {
        return {
            finalized: true,
            postProcessed: false,
            alreadyDone: true,
            order
        };
    }

    const effectOrderCode = orderCodeForEffects || referenceNumber || order.order_code;

    try {
        await runPostPaymentSideEffects(order, {
            amount,
            currency,
            orderCode: effectOrderCode
        });
        await markPostPaymentProcessed(order, source);
        return {
            finalized: true,
            postProcessed: true,
            alreadyDone: false,
            order
        };
    } catch (sideEffectError) {
        if (
            source === 'webhook:settlement' ||
            source === 'cron:webhook-retry' ||
            source === 'cron:reconcile'
        ) {
            logPaymentFinalizeError('worldpay_settlement_post_process_error', sideEffectError, {
                order_id: order.id,
                order_code: order.order_code,
                source
            });
            return {
                finalized: true,
                postProcessed: false,
                sideEffectFailed: true,
                alreadyDone: false,
                order
            };
        }
        throw sideEffectError;
    }
};

/**
 * Single entry point for confirming a Worldpay payment (webhook, API, cron).
 */
const confirmWorldpayPayment = async ({
    orderCode,
    amount,
    currency = 'GBP',
    source,
    metadata = {},
    order: orderInstance = null
}) => {
    const order = orderInstance || (await findWorldpayOrderByCode(orderCode));

    if (!order) {
        return {
            ok: false,
            reason: 'ORDER_NOT_FOUND',
            orderCode
        };
    }

    if (requiresPaymentFinalizeEligibility(source) && !isWorldpayPaymentFinalizeEligible(order)) {
        return {
            ok: false,
            reason: 'ORDER_NOT_ELIGIBLE',
            orderStatus: order.status,
            orderCode
        };
    }

    const referenceNumber = orderCode || order.order_code;
    const paymentAmount = amount != null ? amount : parseFloat(order.total);

    const result = await processWorldpayPaidOrder({
        order,
        referenceNumber,
        amount: paymentAmount,
        currency,
        source,
        metadata,
        orderCodeForEffects: referenceNumber
    });

    if (result.skippedIneligible) {
        return {
            ok: false,
            reason: 'ORDER_NOT_ELIGIBLE',
            orderStatus: order.status,
            orderCode: referenceNumber
        };
    }

    return {
        ok: true,
        orderCode: referenceNumber,
        ...result
    };
};

module.exports = {
    confirmWorldpayPayment,
    processWorldpayPaidOrder,
    finalizePaidOrder,
    hasPostPaymentProcessed,
    markPostPaymentProcessed,
    POST_PAYMENT_MARKER_STATUS,
    logPaymentFinalizeError
};
