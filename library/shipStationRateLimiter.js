const { redis } = require('./cache');
const logger = require('../utils/logger');

const MIN_INTERVAL_MS = Number(process.env.SHIPSTATION_MIN_INTERVAL_MS || 1600);
const REDIS_RATE_LIMIT_ENABLED = process.env.SHIPSTATION_RATE_LIMIT_REDIS === 'true';

const REDIS_RATE_LIMIT_KEY =
    process.env.SHIPSTATION_RATE_LIMIT_REDIS_KEY || 'shipstation:rate_limit:next_slot';

const ACQUIRE_SLOT_LUA = `
local key = KEYS[1]
local interval = tonumber(ARGV[1])
local now = tonumber(ARGV[2])
local next_slot = tonumber(redis.call('GET', key) or '0')
local start_at = now
if next_slot > now then
    start_at = next_slot
end
local wait_ms = start_at - now
redis.call('SET', key, tostring(start_at + interval))
return wait_ms
`;

let lastRequestAt = 0;
let chain = Promise.resolve();
let redisFallbackLogged = false;

function delay(ms) {
    if (ms <= 0) {
        return Promise.resolve();
    }
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForInMemorySlot() {
    const now = Date.now();
    const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - now);
    if (wait > 0) {
        await delay(wait);
    }
    lastRequestAt = Date.now();
}

async function waitForRedisSlot() {
    const now = Date.now();
    const waitMs = await redis.eval(ACQUIRE_SLOT_LUA, 1, REDIS_RATE_LIMIT_KEY, MIN_INTERVAL_MS, now);
    const wait = Number(waitMs) || 0;
    if (wait > 0) {
        await delay(wait);
    }
}

function logRedisFallback(reason) {
    if (redisFallbackLogged) {
        return;
    }
    redisFallbackLogged = true;
    logger.logInfo({
        message: 'ShipStation Redis rate limit unavailable — using in-memory fallback',
        reason
    });
}

async function waitForGlobalSlot() {
    if (!REDIS_RATE_LIMIT_ENABLED) {
        await waitForInMemorySlot();
        return;
    }

    if (redis.status !== 'ready') {
        logRedisFallback('redis_not_ready');
        await waitForInMemorySlot();
        return;
    }

    try {
        await waitForRedisSlot();
    } catch (err) {
        logRedisFallback(err.message);
        await waitForInMemorySlot();
    }
}

/**
 * Serialize ShipStation API calls to stay under rate limits (~40/min).
 * With SHIPSTATION_RATE_LIMIT_REDIS=true, coordinates across API pods via Redis.
 */
function scheduleShipStationRequest(requestFn) {
    const run = chain.then(async () => {
        await waitForGlobalSlot();
        return requestFn();
    });

    chain = run.catch(() => {});
    return run;
}

module.exports = { scheduleShipStationRequest };
