const crypto = require('crypto');
const { Op } = require('sequelize');
const {
    BulkOrderStatusJob,
    BulkOrderStatusJobItem,
    Order,
    sequelize,
} = require('../../../../models');
const { processOrderStatusUpdate } = require('./bulkOrderStatus.processor');
const { enqueueBulkOrderStatusItems } = require('../../../../library/bulkOrderStatus/sqsEnqueue');

const ASYNC_BULK_MAX_ORDERS = Number(process.env.BULK_ORDER_STATUS_ASYNC_MAX || 500);
const MAX_ERROR_SAMPLES = 50;
const DELIVERY_MODE = process.env.BULK_ORDER_STATUS_DELIVERY_MODE || 'db_poll';
const CLAIM_STALE_MINUTES = Math.max(1, Number(process.env.BULK_ORDER_STATUS_CLAIM_STALE_MINUTES || 3));
const MAX_ATTEMPTS = Math.max(1, Number(process.env.BULK_ORDER_STATUS_MAX_ATTEMPTS || 5));

function isStaleProcessingItem(item) {
    if (!item || item.status !== 'processing') {
        return false;
    }
    const updatedAt = item.updatedAt || item.updated_at;
    if (!updatedAt) {
        return false;
    }
    const cutoff = Date.now() - CLAIM_STALE_MINUTES * 60 * 1000;
    return new Date(updatedAt).getTime() < cutoff;
}

async function finalizeJobItemAsSkippedTx(item, job, order, message, transaction, { fromStatus = 'processing' } = {}) {
    const [updated] = await BulkOrderStatusJobItem.update(
        {
            status: 'skipped',
            error_message: message,
            shipstation_order_id: order?.shipstation_order_id || null,
            processed_at: new Date(),
        },
        {
            where: { id: item.id, status: fromStatus },
            transaction,
        }
    );

    if (updated === 0) {
        return false;
    }

    await job.increment('skipped', { transaction });
    return true;
}

async function findOrdersInActiveBulkJobs(orderIds, targetStatus) {
    if (!orderIds.length) {
        return [];
    }

    return BulkOrderStatusJobItem.findAll({
        attributes: ['order_id', 'job_id'],
        where: {
            order_id: { [Op.in]: orderIds },
            status: { [Op.in]: ['pending', 'processing'] },
        },
        include: [{
            model: BulkOrderStatusJob,
            as: 'job',
            required: true,
            attributes: ['id', 'status', 'target_status'],
            where: {
                target_status: targetStatus,
                status: { [Op.in]: ['queued', 'processing'] },
            },
        }],
    });
}

async function findOrdersAlreadyAtTargetStatus(orderIds, targetStatus) {
    if (!orderIds.length) {
        return [];
    }

    return Order.findAll({
        where: {
            id: { [Op.in]: orderIds },
            status: targetStatus,
        },
        attributes: ['id', 'order_unique_id', 'shipstation_order_id'],
    });
}

function isOrderAlreadyProcessedForTarget(order, targetStatus) {
    if (!order || !targetStatus) {
        return false;
    }
    if (order.status === targetStatus) {
        return true;
    }
    if (targetStatus === 'packed' && order.shipstation_order_id) {
        return true;
    }
    return false;
}

async function createBulkOrderStatusJob({ orderIds, status, userId }) {
    const uniqueOrderIds = [...new Set(orderIds)];

    const orders = await Order.findAll({
        where: { id: { [Op.in]: uniqueOrderIds } },
        attributes: ['id', 'order_unique_id']
    });

    const foundOrderIds = orders.map(o => o.id);
    const missingOrderIds = uniqueOrderIds.filter(id => !foundOrderIds.includes(id));

    if (missingOrderIds.length > 0) {
        const error = new Error('Some orders not found');
        error.statusCode = 404;
        error.missingOrderIds = missingOrderIds;
        throw error;
    }

    const inFlight = await findOrdersInActiveBulkJobs(uniqueOrderIds, status);
    if (inFlight.length > 0) {
        const error = new Error(
            'Some orders are already being processed in an active bulk job. ' +
            'Wait for the current batch to finish before submitting again.'
        );
        error.statusCode = 409;
        error.code = 'BULK_ORDERS_ALREADY_QUEUED';
        error.orderIds = [...new Set(inFlight.map((i) => i.order_id))];
        error.jobIds = [...new Set(inFlight.map((i) => i.job_id))];
        throw error;
    }

    const alreadyDone = await findOrdersAlreadyAtTargetStatus(uniqueOrderIds, status);
    const alreadyDoneIds = new Set(alreadyDone.map((o) => o.id));
    const orderIdsToQueue = uniqueOrderIds.filter((id) => !alreadyDoneIds.has(id));

    if (orderIdsToQueue.length === 0) {
        const error = new Error('All selected orders already have the target status');
        error.statusCode = 409;
        error.code = 'BULK_ORDERS_ALREADY_AT_STATUS';
        error.orderIds = uniqueOrderIds;
        throw error;
    }

    const ordersToQueue = orders.filter((o) => orderIdsToQueue.includes(o.id));

    const job = await BulkOrderStatusJob.create({
        job_key: crypto.randomUUID(),
        status: 'queued',
        target_status: status,
        total: orderIdsToQueue.length,
        initiated_by: userId
    });

    const orderById = new Map(ordersToQueue.map(o => [o.id, o]));
    const jobItemsPayload = orderIdsToQueue.map(orderId => ({
        job_id: job.id,
        order_id: orderId,
        order_unique_id: orderById.get(orderId)?.order_unique_id || null,
        status: 'pending'
    }));
    const createdJobItems = await BulkOrderStatusJobItem.bulkCreate(jobItemsPayload);

    if (DELIVERY_MODE === 'async_sqs') {
        if (!process.env.BULK_ORDER_STATUS_SQS_QUEUE_URL) {
            const error = new Error('BULK_ORDER_STATUS_SQS_QUEUE_URL is not configured');
            error.statusCode = 500;
            throw error;
        }

        const enqueuePayload = createdJobItems.map((item) => ({
            jobId: job.id,
            jobItemId: item.id
        }));
        const enqueueResult = await enqueueBulkOrderStatusItems(enqueuePayload);
        if (enqueueResult.failed > 0) {
            const error = new Error(`Failed to enqueue ${enqueueResult.failed} bulk status job items to SQS`);
            error.statusCode = 500;
            error.failedItems = enqueueResult.failedItems;
            throw error;
        }
    }

    return job;
}

async function claimNextPendingJobItem() {
    return sequelize.transaction(async (transaction) => {
        const item = await BulkOrderStatusJobItem.findOne({
            where: { status: 'pending' },
            order: [['id', 'ASC']],
            lock: transaction.LOCK.UPDATE,
            transaction
        });

        if (!item) {
            return null;
        }

        const job = await BulkOrderStatusJob.findByPk(item.job_id, { transaction });
        if (!job || !['queued', 'processing'].includes(job.status)) {
            return null;
        }

        await item.update({
            status: 'processing',
            attempts: item.attempts + 1
        }, { transaction });

        if (job.status === 'queued') {
            await job.update({
                status: 'processing',
                started_at: new Date()
            }, { transaction });
        }

        item.job = job;
        return item;
    });
}

async function claimSpecificPendingJobItem(jobItemId) {
    let jobIdToFinalize = null;

    const item = await sequelize.transaction(async (transaction) => {
        const row = await BulkOrderStatusJobItem.findByPk(jobItemId, {
            lock: transaction.LOCK.UPDATE,
            transaction
        });
        if (!row) return null;

        const job = await BulkOrderStatusJob.findByPk(row.job_id, { transaction });
        if (!job || !['queued', 'processing'].includes(job.status)) {
            return null;
        }

        if (['success', 'failed', 'skipped'].includes(row.status)) {
            row.job = job;
            return row;
        }

        if (row.status === 'processing') {
            if (!isStaleProcessingItem(row)) {
                return null;
            }

            if (row.attempts >= MAX_ATTEMPTS) {
                await row.update({
                    status: 'failed',
                    error_message: `failed after ${MAX_ATTEMPTS} processing attempts (stale reclaim)`,
                    processed_at: new Date(),
                }, { transaction });
                await job.increment('failed', { transaction });
                jobIdToFinalize = job.id;
                row.job = job;
                return row;
            }

            const order = await Order.findByPk(row.order_id, {
                attributes: ['id', 'order_unique_id', 'status', 'shipstation_order_id'],
                transaction,
            });

            if (order && isOrderAlreadyProcessedForTarget(order, job.target_status)) {
                const skipped = await finalizeJobItemAsSkippedTx(
                    row,
                    job,
                    order,
                    'reclaimed: order already at target status',
                    transaction
                );
                if (skipped) {
                    jobIdToFinalize = job.id;
                    await row.reload({ transaction });
                }
                row.job = job;
                return row;
            }

            await row.update({
                status: 'pending',
                error_message: `reclaimed from stale processing (>${CLAIM_STALE_MINUTES}m)`,
            }, { transaction });
            await row.reload({ transaction });
        }

        if (row.status !== 'pending') {
            return null;
        }

        await row.update({
            status: 'processing',
            attempts: row.attempts + 1
        }, { transaction });

        if (job.status === 'queued') {
            await job.update({
                status: 'processing',
                started_at: new Date()
            }, { transaction });
        }

        row.job = job;
        return row;
    });

    if (jobIdToFinalize) {
        await finalizeJobIfComplete(jobIdToFinalize);
    }

    return item;
}

async function releaseProcessingJobItem(jobItemId, reason = 'worker_release') {
    let jobIdToFinalize = null;

    const outcome = await sequelize.transaction(async (transaction) => {
        const item = await BulkOrderStatusJobItem.findByPk(jobItemId, {
            lock: transaction.LOCK.UPDATE,
            transaction,
        });

        if (!item) {
            return { found: false };
        }

        if (['success', 'failed', 'skipped'].includes(item.status)) {
            return {
                found: true,
                released: false,
                finalized: true,
                item_status: item.status,
            };
        }

        if (item.status !== 'processing') {
            return {
                found: true,
                released: false,
                finalized: false,
                item_status: item.status,
            };
        }

        const job = await BulkOrderStatusJob.findByPk(item.job_id, { transaction });
        if (!job) {
            return { found: true, released: false, finalized: false, item_status: item.status };
        }

        const order = await Order.findByPk(item.order_id, {
            attributes: ['id', 'order_unique_id', 'status', 'shipstation_order_id'],
            transaction,
        });

        if (order && isOrderAlreadyProcessedForTarget(order, job.target_status)) {
            const skipped = await finalizeJobItemAsSkippedTx(
                item,
                job,
                order,
                `release: order already processed (${reason})`,
                transaction
            );
            if (skipped) {
                jobIdToFinalize = job.id;
            }
            return {
                found: true,
                released: false,
                finalized: skipped,
                item_status: skipped ? 'skipped' : item.status,
            };
        }

        const [updated] = await BulkOrderStatusJobItem.update(
            {
                status: 'pending',
                error_message: `released: ${reason}`,
            },
            {
                where: { id: jobItemId, status: 'processing' },
                transaction,
            }
        );

        return {
            found: true,
            released: updated > 0,
            finalized: false,
            item_status: updated > 0 ? 'pending' : item.status,
        };
    });

    if (jobIdToFinalize) {
        await finalizeJobIfComplete(jobIdToFinalize);
    }

    return outcome;
}

async function finalizeJobIfComplete(jobId) {
    const pendingOrProcessing = await BulkOrderStatusJobItem.count({
        where: {
            job_id: jobId,
            status: { [Op.in]: ['pending', 'processing'] }
        }
    });

    if (pendingOrProcessing > 0) {
        return;
    }

    const job = await BulkOrderStatusJob.findByPk(jobId);
    if (!job || ['completed', 'partial_failed', 'failed', 'cancelled'].includes(job.status)) {
        return;
    }

    let jobStatus = 'completed';
    if (job.failed > 0 && job.successful === 0 && job.skipped === 0) {
        jobStatus = 'failed';
    } else if (job.failed > 0) {
        jobStatus = 'partial_failed';
    }

    await job.update({
        status: jobStatus,
        completed_at: new Date()
    });
}

async function finalizeJobItemAsSkipped(jobItem, order, message) {
    const job = await BulkOrderStatusJob.findByPk(jobItem.job_id);
    if (!job) {
        return false;
    }

    const [updated] = await BulkOrderStatusJobItem.update(
        {
            status: 'skipped',
            error_message: message,
            shipstation_order_id: order?.shipstation_order_id || null,
            processed_at: new Date(),
        },
        { where: { id: jobItem.id, status: 'processing' } }
    );

    if (updated === 0) {
        return false;
    }

    await job.increment('skipped');
    await finalizeJobIfComplete(job.id);
    return true;
}

async function processBulkOrderStatusJobItem(jobItem) {
    const job = jobItem.job || await BulkOrderStatusJob.findByPk(jobItem.job_id);
    if (!job) {
        return;
    }

    try {
        const order = await Order.findByPk(jobItem.order_id, {
            attributes: ['id', 'order_unique_id', 'status', 'shipstation_order_id'],
        });

        if (order && isOrderAlreadyProcessedForTarget(order, job.target_status)) {
            const processedAt = new Date();
            await jobItem.update({
                status: 'skipped',
                error_message: 'Order already at target status or already sent to ShipStation (duplicate batch item)',
                shipstation_order_id: order.shipstation_order_id || null,
                processed_at: processedAt,
            });
            await job.increment('skipped');
            await finalizeJobIfComplete(job.id);
            return {
                success: true,
                skipped: true,
                order_id: order.id,
                order_unique_id: order.order_unique_id,
                message: 'Order already processed',
            };
        }

        const result = await processOrderStatusUpdate({
            orderId: jobItem.order_id,
            status: job.target_status,
            userId: job.initiated_by,
            createLabel: false,
        });

        const processedAt = new Date();
        const shipstationOrderId = result.shipstation_data?.order_id || null;

        if (result.skipped) {
            await jobItem.update({
                status: 'skipped',
                error_message: result.message || null,
                shipstation_order_id: shipstationOrderId,
                processed_at: processedAt
            });
            await job.increment('skipped');
        } else if (result.success) {
            await jobItem.update({
                status: 'success',
                shipstation_order_id: shipstationOrderId,
                processed_at: processedAt
            });
            await job.increment('successful');
        } else {
            await jobItem.update({
                status: 'failed',
                error_message: result.error || 'Unknown error',
                processed_at: processedAt
            });
            await job.increment('failed');
        }

        await finalizeJobIfComplete(job.id);
        return result;
    } catch (error) {
        const processedAt = new Date();
        await jobItem.update({
            status: 'failed',
            error_message: error.message || 'Unknown error',
            processed_at: processedAt
        });
        await job.increment('failed');
        await finalizeJobIfComplete(job.id);
        return {
            success: false,
            skipped: false,
            order_id: jobItem.order_id,
            error: error.message || 'Unknown error',
        };
    }
}

async function getBulkOrderStatusJobDetails(jobId, { errorLimit = MAX_ERROR_SAMPLES } = {}) {
    const job = await BulkOrderStatusJob.findByPk(jobId);
    if (!job) {
        return null;
    }

    const pending = await BulkOrderStatusJobItem.count({
        where: { job_id: jobId, status: { [Op.in]: ['pending', 'processing'] } }
    });

    const failedItems = await BulkOrderStatusJobItem.findAll({
        where: { job_id: jobId, status: 'failed' },
        attributes: ['order_id', 'order_unique_id', 'error_message'],
        order: [['id', 'ASC']],
        limit: errorLimit
    });

    const processed = job.successful + job.failed + job.skipped;
    const progressPercent = job.total > 0 ? Math.round((processed / job.total) * 100) : 0;

    return {
        job_id: job.id,
        job_key: job.job_key,
        status: job.status,
        target_status: job.target_status,
        total: job.total,
        successful: job.successful,
        failed: job.failed,
        skipped: job.skipped,
        pending,
        progress_percent: progressPercent,
        started_at: job.started_at,
        completed_at: job.completed_at,
        created_at: job.createdAt,
        errors: failedItems.map(item => ({
            order_id: item.order_id,
            order_unique_id: item.order_unique_id,
            error: item.error_message
        }))
    };
}

module.exports = {
    ASYNC_BULK_MAX_ORDERS,
    CLAIM_STALE_MINUTES,
    MAX_ATTEMPTS,
    createBulkOrderStatusJob,
    claimNextPendingJobItem,
    claimSpecificPendingJobItem,
    releaseProcessingJobItem,
    processBulkOrderStatusJobItem,
    getBulkOrderStatusJobDetails,
    finalizeJobIfComplete,
    finalizeJobItemAsSkipped,
    findOrdersInActiveBulkJobs,
    isOrderAlreadyProcessedForTarget,
    isStaleProcessingItem,
};
