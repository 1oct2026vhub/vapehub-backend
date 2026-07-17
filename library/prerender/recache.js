'use strict';

const axios = require('axios');
const logger = require('../logger');
const { buildPublicUrl, buildHomeUrl, urlsForEntity } = require('./urlBuilder');

const RECACHE_URL = process.env.PRERENDER_RECACHE_URL || 'https://api.prerender.io/recache';
const MAX_URLS_PER_REQUEST = 1000;
const REQUEST_TIMEOUT_MS = 15000;

function isEnabled() {
    return process.env.PRERENDER_ENABLED === 'true' && !!process.env.PRERENDER_TOKEN;
}

function buildPayload(urls) {
    const payload = {
        prerenderToken: process.env.PRERENDER_TOKEN,
        urls
    };

    if (process.env.PRERENDER_RECACHE_MOBILE === 'true') {
        payload.adaptiveType = 'mobile';
    }

    return payload;
}

async function postRecache(urls) {
    if (!urls.length) {
        return;
    }

    const response = await axios.post(
        RECACHE_URL,
        buildPayload(urls),
        {
            headers: { 'Content-Type': 'application/json' },
            timeout: REQUEST_TIMEOUT_MS
        }
    );

    return response.data;
}

async function recacheUrls(urls = []) {
    if (!isEnabled()) {
        return;
    }

    const unique = [...new Set(urls.filter(Boolean))];
    if (!unique.length) {
        return;
    }

    for (let i = 0; i < unique.length; i += MAX_URLS_PER_REQUEST) {
        const chunk = unique.slice(i, i + MAX_URLS_PER_REQUEST);
        await postRecache(chunk);
    }
}

async function recachePaths(paths = []) {
    const urls = [...new Set(paths.filter(Boolean).map(buildPublicUrl))];
    return recacheUrls(urls);
}

function recacheUrlsFireAndForget(urls, context = {}) {
    if (!isEnabled()) {
        return;
    }

    const unique = [...new Set((urls || []).filter(Boolean))];
    if (!unique.length) {
        return;
    }

    recacheUrls(unique)
        .then(() => {
            logger.info({ ...context, count: unique.length }, 'Prerender recache queued');
        })
        .catch((error) => {
            logger.warn({
                ...context,
                count: unique.length,
                error: error.message
            }, 'Prerender recache failed');
        });
}

function recacheEntityFireAndForget(entityType, slug, oldSlug, context = {}) {
    const urls = urlsForEntity(entityType, slug, oldSlug);
    recacheUrlsFireAndForget(urls, { entityType, slug, oldSlug, ...context });
}

function recacheProductFireAndForget(productSlug, oldSlug, context = {}) {
    recacheEntityFireAndForget('product', productSlug, oldSlug, context);
}

function recacheHomeFireAndForget(context = {}) {
    recacheUrlsFireAndForget([buildHomeUrl()], { path: '/', ...context });
}

module.exports = {
    recacheUrls,
    recachePaths,
    recacheUrlsFireAndForget,
    recacheEntityFireAndForget,
    recacheProductFireAndForget,
    recacheHomeFireAndForget,
    buildPublicUrl,
    buildHomeUrl,
    isEnabled
};
