require('dotenv').config();
const Redis = require('ioredis');
const logger = require('./logger');

// Create Redis client — use environment variable for connection
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    lazyConnect: true,
    retryStrategy(times) {
        if (times > 10) return null;
        return Math.min(times * 200, 2000);
    },
    tls: {
        rejectUnauthorized: false
    }
});

redis.on('error', (err) => {
    logger.error({ message: 'Redis connection error', error: err.message }, 'Redis connection error');
});

redis.on('connect', () => {
    logger.info({ message: 'Redis connected successfully' }, 'Redis connected');
});

redis.connect().catch(() => {
    logger.info({ message: 'Redis not available — caching disabled, falling through to DB' }, 'Redis unavailable');
});

/**
 * Get data from cache, or execute the fetcher function and cache the result
 * @param {string} key - Cache key
 * @param {Function} fetcherFn - Async function that fetches data from DB
 * @param {number} ttlSeconds - Cache TTL in seconds (default: 60)
 * @returns {Promise<any>} - Cached or freshly fetched data
 */
const cacheOrFetch = async (key, fetcherFn, ttlSeconds = 60) => {
    try {
        if (redis.status === 'ready') {
            const cached = await redis.get(key);
            if (cached) {
                return JSON.parse(cached);
            }
        }
    } catch (err) {
        logger.error({ message: 'Cache read error', key, error: err.message }, 'Cache read error');
    }

    const data = await fetcherFn();

    try {
        if (redis.status === 'ready') {
            redis.setex(key, ttlSeconds, JSON.stringify(data)).catch(() => {});
        }
    } catch (err) {
        // Silently ignore cache write failures
    }
    return data;
};

/**
 * Invalidate specific cache keys
 * @param {string|string[]} keys - Key or array of keys to delete
 */
const invalidateCache = async (keys) => {
    try {
        if (redis.status === 'ready') {
            const keysArray = Array.isArray(keys) ? keys : [keys];
            if (keysArray.length > 0) {
                await redis.del(...keysArray);
            }
        }
    } catch (err) {
        logger.error({ message: 'Cache invalidation error', error: err.message }, 'Cache invalidation error');
    }
};

/**
 * Invalidate all cache keys matching a pattern
 * @param {string} pattern - Glob pattern (e.g., "products:*")
 */
const invalidateCachePattern = async (pattern) => {
    try {
        if (redis.status === 'ready') {
            const keys = await redis.keys(pattern);
            if (keys.length > 0) {
                await redis.del(...keys);
            }
        }
    } catch (err) {
        logger.error({ message: 'Cache pattern invalidation error', error: err.message }, 'Cache pattern invalidation error');
    }
};

module.exports = {
    redis,
    cacheOrFetch,
    invalidateCache,
    invalidateCachePattern
};
