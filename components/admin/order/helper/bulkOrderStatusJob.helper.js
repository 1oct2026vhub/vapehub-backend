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

    const job = await BulkOrderStatusJob.create({
        job_key: crypto.randomUUID(),
        status: 'queued',
        target_status: status,
        total: uniqueOrderIds.length,
        initiated_by: userId
    });

    const orderById = new Map(orders.map(o => [o.id, o]));
    const jobItemsPayload = uniqueOrderIds.map(orderId => ({
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
    return sequelize.transaction(async (transaction) => {
        const item = await BulkOrderStatusJobItem.findByPk(jobItemId, {
            lock: transaction.LOCK.UPDATE,
            transaction
        });
        if (!item) return null;

        const job = await BulkOrderStatusJob.findByPk(item.job_id, { transaction });
        if (!job || !['queued', 'processing'].includes(job.status)) {
            return null;
        }

        if (['success', 'failed', 'skipped'].includes(item.status)) {
            item.job = job;
            return item;
        }

        if (item.status !== 'pending') {
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

async function processBulkOrderStatusJobItem(jobItem) {
    const job = jobItem.job || await BulkOrderStatusJob.findByPk(jobItem.job_id);
    if (!job) {
        return;
    }

    try {
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
    createBulkOrderStatusJob,
    claimNextPendingJobItem,
    claimSpecificPendingJobItem,
    processBulkOrderStatusJobItem,
    getBulkOrderStatusJobDetails,
    finalizeJobIfComplete,
};
