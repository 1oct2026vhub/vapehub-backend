const express = require('express');
const router = express.Router();
const internalJobKeyMiddleware = require('../../library/middleware/internalJobKeyMiddleware');
const { processEmailCampaignChunk } = require('./domain/emailCampaignChunk.controller');

router.post('/email-campaigns/process-chunk', internalJobKeyMiddleware, processEmailCampaignChunk);

module.exports = router;
