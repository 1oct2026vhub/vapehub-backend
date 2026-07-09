const cron = require('node-cron');
const { Op } = require('sequelize');
const { BulkOrderStatusJob, BulkOrderStatusJobItem, Order, sequelize } = require('../models');
const { enqueueBulkOrderStatusItems } = require('../library/bulkOrderStatus/sqsEnqueue');
const {
    finalizeJobIfComplete,
    finalizeJobItemAsSkipped,
    isOrderAlreadyProcessedForTarget,
} = require('../components/admin/order/helper/bulkOrderStatusJob.helper');
const logger = require('../library/logger');

const STALE_MINUTES = Math.max(1, Number(process.env.BULK_ORDER_STATUS_STALE_RESET_MINUTES || 15));
const PENDING_STALE_MINUTES = Math.max(5, Number(process.env.BULK_ORDER_STATUS_PENDING_STALE_MINUTES || 10));
const MAX_ATTEMPTS = Math.max(1, Number(process.env.BULK_ORDER_STATUS_MAX_ATTEMPTS || 5));
const SCHEDULE = process.env.BULK_ORDER_STATUS_RECOVERY_CRON || '*/5 * * * *';
const BATCH_LIMIT = Math.max(1, Number(process.env.BULK_ORDER_STATUS_RECOVERY_BATCH_LIMIT || 500));

async function recoverStuckBulkOrderStatusItems() {
    if (process.env.BULK_ORDER_STATUS_DELIVERY_MODE !== 'async_sqs') {
        return { reset: 0, exhausted: 0, skippedAlreadyDone: 0, skipped: true, reason: 'not_async_sqs' };
    }

    if (!process.env.BULK_ORDER_STATUS_SQS_QUEUE_URL) {
        return { reset: 0, exhausted: 0, skippedAlreadyDone: 0, skipped: true, reason: 'missing_queue_url' };
    }

    const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000);

    const stuckItems = await BulkOrderStatusJobItem.findAll({
        where: {
            [Op.and]: [
                { status: 'processing' },
                sequelize.where(sequelize.col('updated_at'), Op.lt, cutoff)
            ]
        },
        attributes: ['id', 'job_id', 'order_id', 'attempts'],
        order: [[sequelize.col('updated_at'), 'ASC']],
        limit: BATCH_LIMIT
    });

    if (stuckItems.length === 0) {
        return { reset: 0, exhausted: 0, reEnqueued: 0, reEnqueueFailed: 0, skippedAlreadyDone: 0, skipped: false };
    }

    const pendingForEnqueue = [];
    let exhaustedFailed = 0;
    let skippedAlreadyDone = 0;

    for (const item of stuckItems) {
        const job = await BulkOrderStatusJob.findByPk(item.job_id, {
            attributes: ['id', 'target_status'],
        });

        const order = await Order.findByPk(item.order_id, {
            attributes: ['id', 'status', 'shipstation_order_id', 'order_unique_id'],
        });

        if (order && job && isOrderAlreadyProcessedForTarget(order, job.target_status)) {
            const skipped = await finalizeJobItemAsSkipped(
                item,
                order,
                'auto-skipped: order already packed or has ShipStation ID (stale processing item)'
            );
            if (skipped) {
                skippedAlreadyDone += 1;
            }
            continue;
        }

        if (item.attempts < MAX_ATTEMPTS) {
            const reset = await tryResetItem(item, cutoff);
            if (reset) {
                pendingForEnqueue.push({
                    jobId: Number(item.job_id),
                    jobItemId: Number(item.id)
                });
            }
            continue;
        }

        const exhausted = await failExhaustedItem(item);
        if (exhausted) {
            exhaustedFailed += 1;
        }
    }

    let reEnqueued = 0;
    let reEnqueueFailed = 0;

    if (pendingForEnqueue.length > 0) {
        try {
            const enqueueResult = await enqueueBulkOrderStatusItems(pendingForEnqueue);
            reEnqueued = enqueueResult.enqueued;
            reEnqueueFailed = enqueueResult.failed;
            if (enqueueResult.failed > 0) {
                logger.warn(
                    { failedItems: enqueueResult.failedItems.slice(0, 20) },
                    `Bulk status recovery: ${enqueueResult.failed} re-enqueue failures`
                );
            }
        } catch (err) {
            reEnqueueFailed = pendingForEnqueue.length;
            logger.error(
                { error: err.message },
                'Bulk status recovery: SQS re-enqueue threw'
            );
        }
    }

    if (pendingForEnqueue.length > 0 || exhaustedFailed > 0 || skippedAlreadyDone > 0) {
        logger.warn(
            `Bulk status recovery: reset=${pendingForEnqueue.length}, ` +
            `re-enqueued=${reEnqueued}, re-enqueue-failed=${reEnqueueFailed}, ` +
            `exhausted-failed=${exhaustedFailed}, skipped-already-done=${skippedAlreadyDone}`
        );
    }

    return {
        reset: pendingForEnqueue.length,
        exhausted: exhaustedFailed,
        reEnqueued,
        reEnqueueFailed,
        skippedAlreadyDone,
        skipped: false
    };
}

async function recoverStalePendingBulkOrderStatusItems() {
    if (process.env.BULK_ORDER_STATUS_DELIVERY_MODE !== 'async_sqs') {
        return { reEnqueued: 0, skipped: true, reason: 'not_async_sqs' };
    }

    if (!process.env.BULK_ORDER_STATUS_SQS_QUEUE_URL) {
        return { reEnqueued: 0, skipped: true, reason: 'missing_queue_url' };
    }

    const cutoff = new Date(Date.now() - PENDING_STALE_MINUTES * 60 * 1000);

    const stalePending = await BulkOrderStatusJobItem.findAll({
        where: {
            [Op.and]: [
                { status: 'pending' },
                { attempts: { [Op.lt]: MAX_ATTEMPTS } },
                sequelize.where(sequelize.col('created_at'), Op.lt, cutoff),
            ],
        },
        attributes: ['id', 'job_id'],
        order: [[sequelize.col('created_at'), 'ASC']],
        limit: BATCH_LIMIT,
    });

    if (stalePending.length === 0) {
        return { reEnqueued: 0, skipped: false };
    }

    const payload = stalePending.map((item) => ({
        jobId: Number(item.job_id),
        jobItemId: Number(item.id),
    }));

    try {
        const result = await enqueueBulkOrderStatusItems(payload);
        if (result.enqueued > 0) {
            logger.warn(
                `Bulk status pending recovery: re-enqueued=${result.enqueued}, failed=${result.failed}`
            );
        }
        return { reEnqueued: result.enqueued, reEnqueueFailed: result.failed, skipped: false };
    } catch (err) {
        logger.error({ error: err.message }, 'Bulk status pending recovery: SQS re-enqueue threw');
        return { reEnqueued: 0, reEnqueueFailed: stalePending.length, skipped: false };
    }
}

async function tryResetItem(item, cutoff) {
    const [updated] = await BulkOrderStatusJobItem.update(
        {
            status: 'pending',
            error_message: `auto-recovered from stale processing (attempts=${item.attempts})`
        },
        {
            where: {
                [Op.and]: [
                    { id: item.id, status: 'processing' },
                    sequelize.where(sequelize.col('updated_at'), Op.lt, cutoff)
                ]
            }
        }
    );

    if (updated === 0) {
        return false;
    }

    await BulkOrderStatusJobItem.increment('attempts', { where: { id: item.id } });
    return true;
}

async function failExhaustedItem(item) {
    const [claimed] = await BulkOrderStatusJobItem.update(
        {
            status: 'failed',
            error_message: `auto-failed after ${MAX_ATTEMPTS} stale recoveries`,
            processed_at: new Date()
        },
        { where: { id: item.id, status: 'processing' } }
    );

    if (claimed === 0) {
        return false;
    }

    await BulkOrderStatusJob.increment({ failed: 1 }, { where: { id: item.job_id } });
    await finalizeJobIfComplete(item.job_id);
    return true;
}

cron.schedule(SCHEDULE, async () => {
    try {
        await recoverStuckBulkOrderStatusItems();
        await recoverStalePendingBulkOrderStatusItems();
    } catch (err) {
        logger.error(
            { error: err.message },
            'recoverStuckBulkOrderStatusItems tick failed'
        );
    }
});

logger.info(
    `Bulk order status recovery cron scheduled ` +
    `(cron='${SCHEDULE}', stale=${STALE_MINUTES}m, pending_stale=${PENDING_STALE_MINUTES}m, max_attempts=${MAX_ATTEMPTS})`
);

module.exports = {
    recoverStuckBulkOrderStatusItems,
    recoverStalePendingBulkOrderStatusItems,
};
