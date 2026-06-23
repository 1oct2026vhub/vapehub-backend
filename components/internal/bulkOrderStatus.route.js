const express = require('express');
const router = express.Router();
const bulkOrderStatusInternalKeyMiddleware = require('../../library/middleware/bulkOrderStatusInternalKeyMiddleware');
const {
    processBulkOrderStatusItem,
    releaseBulkOrderStatusItem,
} = require('./domain/bulkOrderStatus.controller');

router.post('/bulk-order-status/process-item', bulkOrderStatusInternalKeyMiddleware, processBulkOrderStatusItem);
router.post('/bulk-order-status/release-item', bulkOrderStatusInternalKeyMiddleware, releaseBulkOrderStatusItem);

module.exports = router;
