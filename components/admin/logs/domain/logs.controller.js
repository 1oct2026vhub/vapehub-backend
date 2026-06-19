const { errorResponse, successResponse } = require('../../../../utils/responseUtils');
const logger = require('../../../../library/logger');
const {
    listLogFiles,
    getLogDownloadUrl,
    getLogPreview,
    getLogPrefix,
} = require('../../../../library/logging/s3LogReader');

module.exports.listLogs = async (req, res) => {
    try {
        const { date, instanceId } = req.query;

        const files = await listLogFiles({ date, instanceId });

        return successResponse(res, {
            prefix: getLogPrefix(),
            count: files.length,
            files,
        }, 'Application logs listed successfully');
    } catch (error) {
        logger.error({ err: error }, 'Failed to list application logs');
        return errorResponse(res, error, error.message || 'Failed to list application logs', 500);
    }
};

module.exports.downloadLog = async (req, res) => {
    try {
        const { key } = req.query;

        if (!key) {
            return errorResponse(res, { message: 'key is required' }, 'key is required', 400);
        }

        const download = await getLogDownloadUrl(key);

        return successResponse(res, download, 'Log download URL generated successfully');
    } catch (error) {
        logger.error({ err: error, key: req.query?.key }, 'Failed to generate log download URL');

        if (error.message === 'Invalid log file key') {
            return errorResponse(res, error, error.message, 400);
        }

        return errorResponse(res, error, error.message || 'Failed to generate log download URL', 500);
    }
};

module.exports.previewLog = async (req, res) => {
    try {
        const { key, lines } = req.query;

        if (!key) {
            return errorResponse(res, { message: 'key is required' }, 'key is required', 400);
        }

        const preview = await getLogPreview(key, lines);

        return successResponse(res, preview, 'Log preview fetched successfully');
    } catch (error) {
        logger.error({ err: error, key: req.query?.key }, 'Failed to preview application log');

        if (error.message === 'Invalid log file key') {
            return errorResponse(res, error, error.message, 400);
        }

        if (error.code === 'NoSuchKey' || error.statusCode === 404) {
            return errorResponse(res, error, 'Log file not found', 404);
        }

        return errorResponse(res, error, error.message || 'Failed to preview application log', 500);
    }
};
