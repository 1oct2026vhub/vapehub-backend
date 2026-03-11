const { SitemapStream, streamToPromise } = require('sitemap');
const { createGzip } = require('zlib');
const db = require('../../../models');
const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { cacheOrFetch } = require('../../../library/cache');

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

  // Generate sitemap
  async generateSitemap(req, res, next) {
    try {
      const smStream = new SitemapStream({
        hostname: process.env.FRONTEND_URL || 'https://www.vapehub.co.uk'
      });

      const pipeline = smStream.pipe(createGzip());

      // Add homepage first (not stored in SeoMeta)
      smStream.write({
        url: '/',
        changefreq: 'daily',
        priority: 1
      });

      // Get all SEO entries that should be indexed
      const seoEntries = await db.SeoMeta.findAll({
        where: { noIndex: false }
      });

      // Add each URL to the sitemap
      seoEntries.forEach(entry => {
        // Default URL
        let url = `/${entry.slug}/`;

        // If this SEO entry is for a brand, prefix with /brand
        if (entry.entityType === 'brand') {
          url = `/brand/${entry.slug}/`;
        }

        smStream.write({
          url,
          changefreq: 'weekly',
          priority: 0.8
        });
      });

      smStream.end();

      // Stream the sitemap
      res.header('Content-Type', 'application/xml');
      res.header('Content-Encoding', 'gzip');
      pipeline.pipe(res).on('error', (e) => {
        throw e;
      });
    } catch (error) {
      console.error('Error generating sitemap:', error);
      return errorResponse(res, error, 'Failed to generate sitemap', 500);
    }
  },

  // Serve robots.txt
  getRobotsTxt(req, res) {
    try {
      const sitemapUrl = `${process.env.FRONTEND_URL || 'https://www.vapehub.co.uk'}/sitemap.xml`;
      const robotsTxt = `User-agent: *
Disallow: /admin
Disallow: /*?vahukId=
Disallow: /*?attribute_pa_flavour=
Disallow: /*?order=
Disallow: /*?sort_by=
Disallow: /*?page=
Disallow: /*?offset=
Disallow: /*?price_range=
Disallow: /*?categories=
Disallow: /*?brand=
Disallow: /*?deal_id=
Disallow: /*?attribute_pa_
Disallow: /*?attribute_1=
Disallow: /*?attribute_2=
Disallow: /*?attribute_3=
Disallow: /*?attribute_4=
Disallow: /*?attribute_5=
Disallow: /*?attribute_6=
Disallow: /*?attribute_7=
Disallow: /*?attribute_8=
Disallow: /*?attribute_9=
Sitemap: ${sitemapUrl}`;

      res.type('text/plain');
      res.send(robotsTxt);
    } catch (error) {
      console.error('Error serving robots.txt:', error);
      return errorResponse(res, error, 'Failed to serve robots.txt', 500);
    }
  }
};

module.exports = seoController; 