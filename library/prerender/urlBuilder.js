'use strict';

const { normalizeSitePath } = require('../../components/seo/helper/sitemap.generator');

const DEAL_PATH_PREFIX = 'product-deals';

function getFrontendOrigin() {
    return (process.env.FRONTEND_URL || 'https://www.vapehub.co.uk').replace(/\/+$/, '');
}

function buildPublicUrl(path) {
    const origin = getFrontendOrigin();
    const normalized = normalizeSitePath(path);
    if (normalized === '/') {
        return `${origin}/`;
    }
    return `${origin}${normalized}`;
}

function buildHomeUrl() {
    return buildPublicUrl('/');
}

function pathForEntity(entityType, slug) {
    if (entityType === 'home') {
        return '/';
    }

    if (!slug) {
        return null;
    }

    switch (entityType) {
        case 'product':
        case 'category':
        case 'blog_post':
        case 'blog_category':
        case 'page':
            return normalizeSitePath(`/${slug}`);
        case 'brand':
            return normalizeSitePath(`/brand/${slug}`);
        case 'deals':
            return normalizeSitePath(`/${DEAL_PATH_PREFIX}/${slug}`);
        default:
            return null;
    }
}

function urlsForEntity(entityType, slug, oldSlug) {
    const urls = [];
    const currentPath = pathForEntity(entityType, slug);
    if (currentPath) {
        urls.push(buildPublicUrl(currentPath));
    }

    if (oldSlug && oldSlug !== slug) {
        const oldPath = pathForEntity(entityType, oldSlug);
        if (oldPath) {
            urls.push(buildPublicUrl(oldPath));
        }
    }

    return [...new Set(urls)];
}

module.exports = {
    buildPublicUrl,
    buildHomeUrl,
    pathForEntity,
    urlsForEntity,
    getFrontendOrigin
};
