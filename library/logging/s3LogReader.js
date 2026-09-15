const s3 = require('../../config/awsConfig');
const { generateSignedUrl } = require('../s3/s3Helper');

const PREFIX = (process.env.S3_LOG_PREFIX || 'logs/app').replace(/\/$/, '');
const ESCAPED_PREFIX = PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LOG_KEY_PATTERN = new RegExp(`^${ESCAPED_PREFIX}/([^/]+)/([^/]+\\.log)$`);

function getLogPrefix() {
    return PREFIX;
}

function isValidLogKey(key) {
    if (!key || typeof key !== 'string') return false;
    if (key.includes('..')) return false;
    return LOG_KEY_PATTERN.test(key);
}

function parseLogKey(key) {
    const match = LOG_KEY_PATTERN.exec(key);
    if (!match) return null;

    const fileName = match[2];
    const dateMatch = /^(\d{4}-\d{2}-\d{2})\.log$/.exec(fileName);

    return {
        key,
        instanceId: match[1],
        fileName,
        date: dateMatch ? dateMatch[1] : null,
    };
}

function buildListPrefix({ instanceId, date } = {}) {
    if (instanceId) {
        return `${PREFIX}/${instanceId}/`;
    }
    return `${PREFIX}/`;
}

function matchesFilters(parsed, { date, instanceId } = {}) {
    if (instanceId && parsed.instanceId !== instanceId) return false;
    if (date && parsed.date !== date) return false;
    return true;
}

async function listLogFiles(filters = {}) {
    if (!process.env.AWS_S3_BUCKET) {
        throw new Error('S3 bucket is not configured');
    }

    const prefix = buildListPrefix(filters);
    const files = [];
    let continuationToken;

    do {
        const listed = await s3.listObjectsV2({
            Bucket: process.env.AWS_S3_BUCKET,
            Prefix: prefix,
            ContinuationToken: continuationToken,
        }).promise();

        for (const object of listed.Contents || []) {
            const parsed = parseLogKey(object.Key);
            if (!parsed) continue;
            if (!matchesFilters(parsed, filters)) continue;

            files.push({
                key: parsed.key,
                instanceId: parsed.instanceId,
                fileName: parsed.fileName,
                date: parsed.date,
                size: object.Size,
                lastModified: object.LastModified,
            });
        }

        continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);

    files.sort((a, b) => {
        const dateCompare = (b.date || '').localeCompare(a.date || '');
        if (dateCompare !== 0) return dateCompare;
        return (b.lastModified?.getTime?.() || 0) - (a.lastModified?.getTime?.() || 0);
    });

    return files;
}

async function getLogDownloadUrl(key) {
    if (!isValidLogKey(key)) {
        throw new Error('Invalid log file key');
    }

    const signedUrl = await generateSignedUrl(key);
    return {
        key,
        signedUrl,
        expiresInSeconds: 604800,
        ...parseLogKey(key),
    };
}

async function getLogPreview(key, maxLines = 100) {
    if (!isValidLogKey(key)) {
        throw new Error('Invalid log file key');
    }

    const lineLimit = Math.min(Math.max(Number(maxLines) || 100, 1), 500);
    const res = await s3.getObject({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
    }).promise();

    const content = res.Body.toString('utf8');
    const lines = content.split('\n').filter((line) => line.trim().length > 0);
    const tail = lines.slice(-lineLimit);

    const entries = tail.map((line) => {
        try {
            return JSON.parse(line);
        } catch {
            return { raw: line };
        }
    });

    return {
        key,
        totalLines: lines.length,
        previewLines: entries.length,
        entries,
        ...parseLogKey(key),
    };
}

module.exports = {
    getLogPrefix,
    isValidLogKey,
    parseLogKey,
    listLogFiles,
    getLogDownloadUrl,
    getLogPreview,
};
