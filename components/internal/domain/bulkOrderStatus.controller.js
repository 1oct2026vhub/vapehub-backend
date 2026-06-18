const { successResponse, errorResponse } = require('../../../utils/responseUtils');
const { BulkOrderStatusJobItem } = require('../../../models');
const {
    claimSpecificPendingJobItem,
    processBulkOrderStatusJobItem,
} = require('../../admin/order/helper/bulkOrderStatusJob.helper');

async function processBulkOrderStatusItem(req, res) {
    try {
        const { jobItemId } = req.body || {};
        if (!Number.isInteger(jobItemId) || jobItemId <= 0) {
            return errorResponse(res, {}, 'jobItemId must be a positive integer', 400);
        }

        const existing = await BulkOrderStatusJobItem.findByPk(jobItemId);
        if (!existing) {
            return errorResponse(res, {}, 'Job item not found', 404);
        }

        if (['success', 'failed', 'skipped'].includes(existing.status)) {
            return successResponse(res, {
                finalized: true,
                deduped: true,
                item_status: existing.status
            }, 'Job item already finalized');
        }

        const claimed = await claimSpecificPendingJobItem(jobItemId);
        if (!claimed) {
            return successResponse(res, {
                finalized: false,
                deduped: false,
                item_status: existing.status
            }, 'Job item is not claimable right now');
        }

        if (['success', 'failed', 'skipped'].includes(claimed.status)) {
            return successResponse(res, {
                finalized: true,
                deduped: true,
                item_status: claimed.status
            }, 'Job item already finalized');
        }

        const result = await processBulkOrderStatusJobItem(claimed);
        const refreshed = await BulkOrderStatusJobItem.findByPk(jobItemId);
        const finalized = Boolean(refreshed && ['success', 'failed', 'skipped'].includes(refreshed.status));

        return successResponse(res, {
            finalized,
            deduped: false,
            item_status: refreshed?.status || null,
            result: result || null
        }, finalized ? 'Job item processed' : 'Job item processing attempted');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

module.exports = {
    processBulkOrderStatusItem
};
