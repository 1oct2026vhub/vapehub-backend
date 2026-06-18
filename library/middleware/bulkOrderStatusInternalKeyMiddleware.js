const logger = require('../logger');

function bulkOrderStatusInternalKeyMiddleware(req, res, next) {
    const expected = process.env.BULK_ORDER_STATUS_INTERNAL_KEY;
    if (!expected) {
        logger.warn('BULK_ORDER_STATUS_INTERNAL_KEY is not set; rejecting internal bulk order status job');
        return res.status(503).json({
            success: false,
            message: 'Internal bulk order status jobs are not configured (BULK_ORDER_STATUS_INTERNAL_KEY)'
        });
    }

    const provided = req.get('x-internal-job-key');
    if (provided !== expected) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    next();
}

module.exports = bulkOrderStatusInternalKeyMiddleware;
