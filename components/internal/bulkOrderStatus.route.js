const express = require('express');
const router = express.Router();
const bulkOrderStatusInternalKeyMiddleware = require('../../library/middleware/bulkOrderStatusInternalKeyMiddleware');
const { processBulkOrderStatusItem } = require('./domain/bulkOrderStatus.controller');

router.post('/bulk-order-status/process-item', bulkOrderStatusInternalKeyMiddleware, processBulkOrderStatusItem);

module.exports = router;
