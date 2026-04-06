'use strict';

const { Op } = require('sequelize');
const {
  SeoMeta,
  Product,
  Category,
  Brand,
  Blog,
  BlogCategory,
  Deal,
  Redirect
} = require('../../../models');

const CHUNK_SIZE = 50000;

/** Public URL path prefix for deal pages (matches SeoMeta slug: product-deals/{dealSlug}) */
const DEAL_PATH_PREFIX = 'product-deals';

/**
 * Normalize a site path to a comparable form: leading slash, trailing slash (except '/').
 * @param {string} path
 * @returns {string}
 */
function normalizeSitePath(path) {
  if (!path || path === '/') return '/';
  let p = String(path).trim();
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/{2,}/g, '/');
  if (p.length > 1 && !p.endsWith('/')) p = `${p}/`;
  return p;
}

/**
 * Extract pathname from a redirect source (path or absolute URL).
 * @param {string} sources
 * @returns {string|null}
 */
function pathFromRedirectSource(sources) {
  if (!sources || typeof sources !== 'string') return null;
  const s = sources.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) {
    try {
      return normalizeSitePath(new URL(s).pathname);
    } catch {
      return null;
    }
  }
  return normalizeSitePath(s);
}

/**
 * Whether SeoMeta canonical URL points to this path (self-canonical for sitemap inclusion).
 * @param {string|null|undefined} canonicalUrl
 * @param {string} expectedPath normalized path like /foo/
 * @param {string} origin e.g. https://www.vapehub.co.uk
 */
function isCanonicalSelf(canonicalUrl, expectedPath, origin) {
  if (!canonicalUrl || !String(canonicalUrl).trim()) return true;
  try {
    const base = origin.endsWith('/') ? origin.slice(0, -1) : origin;
    const u = /^https?:\/\//i.test(canonicalUrl)
      ? new URL(canonicalUrl)
      : new URL(canonicalUrl.startsWith('/') ? canonicalUrl : `/${canonicalUrl}`, `${base}/`);
    const path = normalizeSitePath(u.pathname);
    return path === expectedPath;
  } catch {
    return false;
  }
}

function maxDate(dates) {
  const valid = dates.filter((d) => d instanceof Date && !Number.isNaN(d.getTime()));
  if (!valid.length) return null;
  return new Date(Math.max(...valid.map((d) => d.getTime())));
}

/**
 * @returns {Promise<Array<{ path: string, lastmod: Date }>>}
 */
async function collectSitemapEntries() {
  const origin = (process.env.FRONTEND_URL || 'https://www.vapehub.co.uk').replace(/\/+$/, '');

  const redirectRows = await Redirect.findAll({
    where: { status: 'active', deletedAt: null },
    attributes: ['sources']
  });
  const redirectPaths = new Set();
  for (const r of redirectRows) {
    const p = pathFromRedirectSource(r.sources);
    if (p) redirectPaths.add(p);
  }

  /** @type {Map<string, Date>} */
  const byPath = new Map();

  const add = (path, lastmod) => {
    const p = normalizeSitePath(path);
    if (p === '/') {
      const lm = lastmod instanceof Date ? lastmod : new Date();
      const prev = byPath.get('/');
      if (!prev || lm > prev) byPath.set('/', lm);
      return;
    }
    if (p.includes('?')) return;
    if (p.startsWith('/admin')) return;
    if (redirectPaths.has(p)) return;

    const lm = lastmod instanceof Date && !Number.isNaN(lastmod.getTime()) ? lastmod : new Date();
    const prev = byPath.get(p);
    if (!prev || lm > prev) byPath.set(p, lm);
  };

  // Full SEO table: need noIndex true rows to exclude entities from entity tables
  const seoRows = await SeoMeta.findAll({
    attributes: [
      'id',
      'entityType',
      'entityId',
      'slug',
      'canonicalUrl',
      'noIndex',
      'updatedAt'
    ]
  });

  const seoByKey = (type, id) =>
    seoRows.find((s) => s.entityType === type && String(s.entityId) === String(id));

  // --- Products (published): include all; respect SEO noindex/canonical when SeoMeta exists ---
  const products = await Product.findAll({
    where: { status: 'published' },
    attributes: ['id', 'slug', 'updatedAt']
  });

  for (const p of products) {
    const path = normalizeSitePath(`/${p.slug}`);
    const seo = seoByKey('product', p.id);
    if (seo?.noIndex) continue;
    if (seo && !isCanonicalSelf(seo.canonicalUrl, path, origin)) continue;
    if (!seo) {
      add(path, p.updatedAt);
    } else {
      add(path, maxDate([p.updatedAt, seo.updatedAt]));
    }
  }

  // --- Categories ---
  const categories = await Category.findAll({
    attributes: ['id', 'slug', 'updatedAt']
  });
  for (const c of categories) {
    const path = normalizeSitePath(`/${c.slug}`);
    const seo = seoByKey('category', c.id);
    if (seo?.noIndex) continue;
    if (seo && !isCanonicalSelf(seo.canonicalUrl, path, origin)) continue;
    if (!seo) {
      add(path, c.updatedAt);
    } else {
      add(path, maxDate([c.updatedAt, seo.updatedAt]));
    }
  }

  // --- Brands ---
  const brands = await Brand.findAll({
    attributes: ['id', 'slug', 'updatedAt']
  });
  for (const b of brands) {
    const path = normalizeSitePath(`/brand/${b.slug}`);
    const seo = seoByKey('brand', b.id);
    if (seo?.noIndex) continue;
    if (seo && !isCanonicalSelf(seo.canonicalUrl, path, origin)) continue;
    if (!seo) {
      add(path, b.updatedAt);
    } else {
      add(path, maxDate([b.updatedAt, seo.updatedAt]));
    }
  }

  // --- Blog posts (published) ---
  const blogs = await Blog.findAll({
    where: { status: 'published' },
    attributes: ['id', 'slug', 'updatedAt', 'published_at']
  });
  for (const b of blogs) {
    const path = normalizeSitePath(`/${b.slug}`);
    const seo = seoByKey('blog_post', b.id);
    if (seo?.noIndex) continue;
    if (seo && !isCanonicalSelf(seo.canonicalUrl, path, origin)) continue;
    const contentDate = maxDate([b.updatedAt, b.published_at ? new Date(b.published_at) : null]);
    if (!seo) {
      add(path, contentDate || b.updatedAt);
    } else {
      add(path, maxDate([contentDate, b.updatedAt, seo.updatedAt]));
    }
  }

  // --- Blog categories (active) ---
  const blogCategories = await BlogCategory.findAll({
    where: { status: 'active' },
    attributes: ['id', 'slug', 'updatedAt']
  });
  for (const bc of blogCategories) {
    const path = normalizeSitePath(`/${bc.slug}`);
    const seo = seoByKey('blog_category', bc.id);
    if (seo?.noIndex) continue;
    if (seo && !isCanonicalSelf(seo.canonicalUrl, path, origin)) continue;
    if (!seo) {
      add(path, bc.updatedAt);
    } else {
      add(path, maxDate([bc.updatedAt, seo.updatedAt]));
    }
  }

  // --- Deals (active & in date window) ---
  const now = new Date();
  const deals = await Deal.findAll({
    where: {
      is_active: true,
      is_deleted: false,
      valid_from: { [Op.lte]: now },
      valid_to: { [Op.gte]: now }
    },
    attributes: ['id', 'slug', 'updatedAt']
  });
  for (const d of deals) {
    const path = normalizeSitePath(`/${DEAL_PATH_PREFIX}/${d.slug}`);
    const seo = seoByKey('deals', d.id);
    if (seo?.noIndex) continue;
    if (seo && !isCanonicalSelf(seo.canonicalUrl, path, origin)) continue;
    if (!seo) {
      add(path, d.updatedAt);
    } else {
      add(path, maxDate([d.updatedAt, seo.updatedAt]));
    }
  }

  // --- Static / CMS pages (entityType page): slug only from SeoMeta ---
  for (const row of seoRows) {
    if (row.entityType !== 'page') continue;
    if (row.noIndex) continue;
    const path = normalizeSitePath(`/${row.slug}`);
    if (path === '/' || path.includes('?') || path.startsWith('/admin')) continue;
    if (redirectPaths.has(path)) continue;
    if (!isCanonicalSelf(row.canonicalUrl, path, origin)) continue;
    add(path, row.updatedAt);
  }

  // --- Homepage ---
  if (!redirectPaths.has('/')) {
    add('/', new Date());
  }

  const entries = Array.from(byPath.entries()).map(([path, lastmod]) => ({
    path,
    lastmod: lastmod || new Date()
  }));

  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}

/**
 * @param {Array<{ path: string, lastmod: Date }>} entries
 * @param {number} chunkIndex 0-based
 * @param {number} size
 */
function getChunk(entries, chunkIndex, size = CHUNK_SIZE) {
  const start = chunkIndex * size;
  return entries.slice(start, start + size);
}

function chunkCount(entries, size = CHUNK_SIZE) {
  if (entries.length === 0) return 0;
  return Math.ceil(entries.length / size);
}

module.exports = {
  collectSitemapEntries,
  normalizeSitePath,
  CHUNK_SIZE,
  getChunk,
  chunkCount
};
