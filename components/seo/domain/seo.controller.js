const { SitemapStream, streamToPromise } = require('sitemap');
const { createGzip } = require('zlib');
const db = require('../../../models');
const { errorResponse, successResponse } = require("../../../utils/responseUtils");

const seoController = {
  // Get SEO metadata by slug
  async getSeoBySlug(req, res, next) {
    try {
      console.log('Fetching SEO metadata');
      const { slug } = req.params;
      
      // Sanitize the slug
      const sanitizedSlug = slug.trim().toLowerCase();
      
      const seoMeta = await db.SeoMeta.findOne({
        where: {
          slug: sanitizedSlug,
          noIndex: false
        },
        attributes: ['id', 'slug', 'title', 'description', 'description_text', 'focusKeyword', 'noIndex']
      });
      
      if (!seoMeta) {
        console.log(`No SEO metadata found for slug: ${sanitizedSlug}`);
        return errorResponse(res, {}, 'SEO metadata not found', 404);
      }

      console.log(`Successfully retrieved SEO metadata for slug: ${sanitizedSlug}`);
      successResponse(res, seoMeta, 'SEO metadata retrieved successfully');
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

      // Get all SEO entries that should be indexed
      const seoEntries = await db.SeoMeta.findAll({
        where: { noIndex: false }
      });

      // Add each URL to the sitemap
      seoEntries.forEach(entry => {
        const url = `/${entry.slug}`;

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