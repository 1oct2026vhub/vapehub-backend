const crypto = require('crypto');
const { PaymentWebhookInbox } = require('../../../models');
const { confirmWorldpayPayment } = require('../domain/worldpayPaymentFinalize.service');
const { findWorldpayOrderByCode } = require('../domain/worldpay.paidOrder.helper');
const { isWorldpayPaymentFinalizeEligible } = require('./worldpayPaymentEligibility.helper');

const SETTLEMENT_EVENT = 'sentForSettlement';

const deriveEventId = (webhookData) => {
    if (webhookData?.eventId) {
        return String(webhookData.eventId);
    }

    const txRef = webhookData?.eventDetails?.transactionReference || '';
    const eventType = webhookData?.eventDetails?.type || '';
    const timestamp = webhookData?.eventTimestamp || webhookData?.eventDetails?.date || '';
    const digest = crypto
        .createHash('sha256')
        .update(`${txRef}|${eventType}|${timestamp}`)
        .digest('hex')
        .slice(0, 32);

    return `synthetic-${digest}`;
};

const convertAmountToDecimal = (amount, currencyCode) => ({
    value: parseFloat((Math.floor((amount || 0) * 100) / 100).toFixed(2)),
    currencyCode: currencyCode || 'GBP'
});

async function recordWebhookReceived(webhookData) {
    const eventId = deriveEventId(webhookData);
    const eventType = webhookData?.eventDetails?.type || null;
    const transactionReference = webhookData?.eventDetails?.transactionReference || null;

    const [row, created] = await PaymentWebhookInbox.findOrCreate({
        where: {
            provider: 'worldpay',
            event_id: eventId
        },
        defaults: {
            event_type: eventType,
            transaction_reference: transactionReference,
            payload: webhookData,
            status: 'received',
            attempts: 0
        }
    });

    if (!created && row.status === 'processed') {
        return { row, alreadyProcessed: true };
    }

    if (!created) {
        await row.update({
            event_type: eventType || row.event_type,
            transaction_reference: transactionReference || row.transaction_reference,
            payload: webhookData
        });
    }

    return { row, alreadyProcessed: false };
}

async function processSettlementFromInbox(inboxRow, source, orderTotalFallback = null) {
    const webhookData = inboxRow.payload;
    const transactionReference = webhookData?.eventDetails?.transactionReference;

    if (!transactionReference) {
        throw new Error('Settlement webhook missing transactionReference');
    }

    await inboxRow.update({
        status: 'processing',
        attempts: inboxRow.attempts + 1
    });

    const order = await findWorldpayOrderByCode(transactionReference);

    if (!order || !isWorldpayPaymentFinalizeEligible(order)) {
        const skipReason = order
            ? `Skipped: order status ${order.status} (only pending/cancel are eligible)`
            : 'Skipped: order not found';

        await inboxRow.update({
            status: 'processed',
            processed_at: new Date(),
            last_error: skipReason
        });

        return { skipped: true, reason: 'ORDER_NOT_ELIGIBLE', orderStatus: order?.status || null };
    }

    let amount;
    let currency = webhookData?.eventDetails?.amount?.currencyCode || 'GBP';

    const minorUnits = webhookData?.eventDetails?.amount?.value;
    if (minorUnits != null && !Number.isNaN(Number(minorUnits))) {
        amount = Number(minorUnits) / 100;
    } else if (orderTotalFallback != null) {
        ({ value: amount, currencyCode: currency } = convertAmountToDecimal(
            orderTotalFallback,
            currency
        ));
    }

    const result = await confirmWorldpayPayment({
        orderCode: transactionReference,
        amount,
        currency,
        source,
        metadata: {
            eventId: webhookData.eventId,
            eventTimestamp: webhookData.eventTimestamp,
            eventDate: webhookData.eventDetails?.date,
            transactionId: transactionReference,
            downstreamReference: webhookData.eventDetails?.downstreamReference,
            type: webhookData.eventDetails?.type,
            classification: webhookData.eventDetails?.classification,
            paymentLink: webhookData.eventDetails?._links?.payment?.href,
            inboxId: inboxRow.id
        },
        order
    });

    if (!result.ok) {
        if (result.reason === 'ORDER_NOT_ELIGIBLE') {
            await inboxRow.update({
                status: 'processed',
                processed_at: new Date(),
                last_error: `Skipped: order status ${result.orderStatus || 'unknown'}`
            });
            return { skipped: true, reason: result.reason, orderStatus: result.orderStatus };
        }
        throw new Error(result.reason || 'Payment confirmation failed');
    }

    await inboxRow.update({
        status: 'processed',
        processed_at: new Date(),
        last_error: null
    });

    return result;
}

async function processSettlementWebhook(webhookData, source = 'webhook:settlement', orderTotalFallback = null) {
    const { row, alreadyProcessed } = await recordWebhookReceived(webhookData);

    if (alreadyProcessed) {
        return { skipped: true, reason: 'ALREADY_PROCESSED', inboxId: row.id };
    }

    try {
        const result = await processSettlementFromInbox(row, source, orderTotalFallback);
        if (result?.skipped) {
            return { skipped: true, reason: result.reason, inboxId: row.id, result };
        }
        return { skipped: false, inboxId: row.id, result };
    } catch (error) {
        await row.update({
            status: 'failed',
            last_error: error.message
        });
        throw error;
    }
}

async function retryFailedSettlementWebhooks({ limit = 50, maxAttempts = 10 } = {}) {
    const rows = await PaymentWebhookInbox.findAll({
        where: {
            provider: 'worldpay',
            event_type: SETTLEMENT_EVENT,
            status: 'failed'
        },
        order: [['updatedAt', 'ASC']],
        limit
    });

    const retried = [];
    const exhausted = [];

    for (const row of rows) {
        if (row.attempts >= maxAttempts) {
            exhausted.push(row.id);
            continue;
        }

        try {
            await processSettlementFromInbox(row, 'cron:webhook-retry');
            retried.push(row.id);
        } catch (error) {
            await row.update({
                status: 'failed',
                last_error: error.message
            });
        }
    }

    return { retried, exhausted, scanned: rows.length };
}

module.exports = {
    SETTLEMENT_EVENT,
    recordWebhookReceived,
    processSettlementWebhook,
    retryFailedSettlementWebhooks
};
