const logger = require('../logger');

/**
 * Protects internal job endpoints (SQS/Lambda → API). Set EMAIL_CHUNK_INTERNAL_KEY in env.
 */
function internalJobKeyMiddleware(req, res, next) {
    const expected = process.env.EMAIL_CHUNK_INTERNAL_KEY;
    if (!expected) {
        logger.warn('EMAIL_CHUNK_INTERNAL_KEY is not set; rejecting internal email campaign job');
        return res.status(503).json({
            success: false,
            message: 'Internal email jobs are not configured (EMAIL_CHUNK_INTERNAL_KEY)'
        });
    }

    const provided = req.get('x-internal-job-key');
    if (provided !== expected) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    next();
}

module.exports = internalJobKeyMiddleware;
