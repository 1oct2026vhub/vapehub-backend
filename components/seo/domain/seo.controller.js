const { SitemapStream, SitemapIndexStream, streamToPromise } = require('sitemap');
const { createGzip } = require('zlib');
const { Readable } = require('stream');
const db = require('../../../models');
const { errorResponse, successResponse } = require('../../../utils/responseUtils');
const { cacheOrFetch } = require('../../../library/cache');
const {
  collectSitemapEntries,
  getChunk,
  chunkCount,
  CHUNK_SIZE
} = require('../helper/sitemap.generator');

const SITEMAP_ENTRIES_CACHE_KEY = 'sitemap:dynamic-entries:v3';
const SITEMAP_CACHE_TTL_SECONDS = 300;

async function getCachedSitemapEntries() {
  return cacheOrFetch(
    SITEMAP_ENTRIES_CACHE_KEY,
    () => collectSitemapEntries(),
    SITEMAP_CACHE_TTL_SECONDS
  );
}

function getHostnameBase() {
  const raw = process.env.FRONTEND_URL || 'https://www.vapehub.co.uk';
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

/**
 * Public base URL for child sitemap files (used in sitemap index XML).
 * Override if a reverse proxy serves chunks at a different path than /api/seo/.
 */
function getSitemapChunkPublicBase() {
  if (process.env.SITEMAP_CHUNK_BASE_URL) {
    return process.env.SITEMAP_CHUNK_BASE_URL.replace(/\/+$/, '');
  }
  return `${getHostnameBase()}/api/seo`;
}

function normalizeLastmod(value) {
  if (!value) return new Date();
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function writeSitemapStream(entries) {
  const hostname = getHostnameBase();
  const smStream = new SitemapStream({ hostname: `${hostname}/` });

  const links = entries.map((e) => ({
    url: e.path,
    lastmod: normalizeLastmod(e.lastmod),
    changefreq: 'weekly',
    priority: e.path === '/' ? 1.0 : 0.8
  }));

  return Readable.from(links).pipe(smStream);
}

const seoController = {
  // Get SEO metadata by slug (cached)
  async getSeoBySlug(req, res, next) {
    try {
      const { slug } = req.params;
      const sanitizedSlug = slug.trim().toLowerCase();
      const cacheKey = `seo:slug:${sanitizedSlug}`;

      const data = await cacheOrFetch(cacheKey, async () => {
        const seoMeta = await db.SeoMeta.findOne({
          where: {
            slug: sanitizedSlug,
            noIndex: false
          },
          attributes: ['id', 'slug', 'title', 'description', 'description_text', 'focusKeyword', 'noIndex']
        });
        return seoMeta ? seoMeta.toJSON() : null;
      }, 300);

      if (!data) {
        return errorResponse(res, {}, 'SEO metadata not found', 404);
      }

      successResponse(res, data, 'SEO metadata retrieved successfully');
    } catch (error) {
      console.error('Error fetching SEO metadata:', error);
      return errorResponse(res, error, 'Failed to fetch SEO metadata', 500);
    }
  },

  /**
   * Dynamic sitemap from DB: products, categories, brands, blogs, deals, static pages.
   * >50k URLs → sitemap index pointing at sitemap-chunk-N.xml routes.
   */
  async generateSitemap(req, res, next) {
    try {
      const entries = await getCachedSitemapEntries();
      const chunkBase = getSitemapChunkPublicBase();

      if (entries.length > CHUNK_SIZE) {
        const n = chunkCount(entries);
        const indexStream = new SitemapIndexStream();
        for (let i = 0; i < n; i++) {
          indexStream.write({ url: `${chunkBase}/sitemap-chunk-${i}.xml` });
        }
        indexStream.end();
        const buf = await streamToPromise(indexStream);
        res.header('Content-Type', 'application/xml; charset=utf-8');
        res.header('Cache-Control', 'public, max-age=120, s-maxage=120');
        return res.send(buf);
      }

      const pipeline = writeSitemapStream(entries).pipe(createGzip());
      res.header('Content-Type', 'application/xml; charset=utf-8');
      res.header('Content-Encoding', 'gzip');
      res.header('Cache-Control', 'public, max-age=120, s-maxage=120');
      pipeline.pipe(res).on('error', (e) => {
        console.error('Error piping sitemap:', e);
        if (!res.headersSent) {
          res.status(500).end();
        }
      });
    } catch (error) {
      console.error('Error generating sitemap:', error);
      return errorResponse(res, error, 'Failed to generate sitemap', 500);
    }
  },

  /**
   * One chunk of URLs (max CHUNK_SIZE). Used when total URLs exceed 50,000.
   */
  async generateSitemapChunk(req, res, next) {
    try {
      const chunkIndex = parseInt(req.params.chunkIndex, 10);
      if (Number.isNaN(chunkIndex) || chunkIndex < 0) {
        return res.status(400).type('text/plain').send('Invalid chunk index');
      }

      const entries = await getCachedSitemapEntries();
      const chunk = getChunk(entries, chunkIndex);

      if (!chunk.length) {
        return res.status(404).type('text/plain').send('Sitemap chunk not found');
      }

      const pipeline = writeSitemapStream(chunk).pipe(createGzip());
      res.header('Content-Type', 'application/xml; charset=utf-8');
      res.header('Content-Encoding', 'gzip');
      res.header('Cache-Control', 'public, max-age=120, s-maxage=120');
      pipeline.pipe(res).on('error', (e) => {
        console.error('Error piping sitemap chunk:', e);
        if (!res.headersSent) {
          res.status(500).end();
        }
      });
    } catch (error) {
      console.error('Error generating sitemap chunk:', error);
      return errorResponse(res, error, 'Failed to generate sitemap chunk', 500);
    }
  },

  // Serve robots.txt
  getRobotsTxt(req, res) {
    try {
      const sitemapUrl = `${getHostnameBase()}/sitemap.xml`;
      const robotsTxt = `User-agent: *
Disallow: /admin
# Allow pagination for crawl discovery
Allow: /*?page=
# Block all other parameterised URLs
Disallow: /*?
Sitemap: ${sitemapUrl}`;

      res.type('text/plain');
      res.header('Cache-Control', 'public, max-age=3600, s-maxage=3600');
      res.send(robotsTxt);
    } catch (error) {
      console.error('Error serving robots.txt:', error);
      return errorResponse(res, error, 'Failed to serve robots.txt', 500);
    }
  }
};

module.exports = seoController;
