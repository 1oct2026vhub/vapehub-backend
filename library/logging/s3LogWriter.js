const s3 = require('../../config/awsConfig');
const { getInstanceId } = require('./instanceId');

const BUCKET = process.env.AWS_S3_BUCKET;
const PREFIX = (process.env.S3_LOG_PREFIX || 'logs/app').replace(/\/$/, '');
const FLUSH_INTERVAL_MS = Number(process.env.S3_LOG_FLUSH_INTERVAL_MS || 60000);
const ENABLED = process.env.S3_LOG_ENABLED !== 'false';

const buffers = new Map();
let flushTimer = null;
let flushing = false;
let shutdownHookRegistered = false;

function isConfigured() {
    return ENABLED && Boolean(BUCKET);
}

function buildS3Key(fileName) {
    const instanceId = getInstanceId();
    const safeFileName = fileName.replace(/[/\\]/g, '_');
    return `${PREFIX}/${instanceId}/${safeFileName}`;
}

function appendLog(fileName, line) {
    if (!isConfigured()) return false;

    const key = buildS3Key(fileName);
    if (!buffers.has(key)) buffers.set(key, []);
    buffers.get(key).push(line);
    return true;
}

async function flushKey(key) {
    const pending = buffers.get(key);
    if (!pending?.length) return;

    const chunk = pending.splice(0, pending.length).join('');
    if (!chunk) return;

    let existing = '';
    try {
        const res = await s3.getObject({ Bucket: BUCKET, Key: key }).promise();
        existing = res.Body.toString('utf8');
    } catch (error) {
        if (error.code !== 'NoSuchKey' && error.statusCode !== 404) {
            pending.unshift(chunk);
            throw error;
        }
    }

    await s3.upload({
        Bucket: BUCKET,
        Key: key,
        Body: existing + chunk,
        ContentType: 'application/x-ndjson; charset=utf-8',
        ServerSideEncryption: 'AES256',
    }).promise();
}

async function flushAll() {
    if (!isConfigured() || flushing) return;
    flushing = true;

    try {
        for (const key of [...buffers.keys()]) {
            try {
                await flushKey(key);
            } catch (error) {
                console.error('S3 log flush failed:', key, error.message);
            }
        }
    } finally {
        flushing = false;
    }
}

function startFlushLoop() {
    if (!isConfigured() || flushTimer) return;

    flushTimer = setInterval(() => {
        flushAll().catch((error) => {
            console.error('S3 periodic flush error:', error.message);
        });
    }, FLUSH_INTERVAL_MS);

    if (typeof flushTimer.unref === 'function') {
        flushTimer.unref();
    }
}

function registerShutdownHooks() {
    if (!isConfigured() || shutdownHookRegistered) return;
    shutdownHookRegistered = true;

    const onSignal = async (signal) => {
        try {
            await flushAll();
        } catch (error) {
            console.error(`S3 flush on ${signal} failed:`, error.message);
        }
    };

    process.once('SIGTERM', () => onSignal('SIGTERM'));
    process.once('SIGINT', () => onSignal('SIGINT'));
}

if (isConfigured()) {
    startFlushLoop();
    registerShutdownHooks();
}

module.exports = {
    appendLog,
    flushAll,
    isConfigured,
    buildS3Key,
};
