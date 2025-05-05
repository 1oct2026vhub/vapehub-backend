const { SitemapStream, streamToPromise } = require('sitemap');
const { createGzip } = require('zlib');
const db = require('../../../models');
const { errorResponse, successResponse } = require("../../../utils/responseUtils");



const seoController = {
  // Get SEO metadata by slug
  async getSeoBySlug(req, res, next) {
    try {
      const { slug } = req.params;
      
      const seoMeta = await db.SeoMeta.findOne({
        where: {
          slug,
          noIndex: false
        }
      });
      
      if (!seoMeta) {
        return res.status(404).json({ message: 'SEO metadata not found' });
      }

      res.json(seoMeta);
    } catch (error) {
      next(errorResponse(500, error.message));
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
      next(errorResponse(500, error.message));
    }
  },

  // Serve robots.txt
  getRobotsTxt(req, res) {
    const sitemapUrl = `${process.env.FRONTEND_URL || 'https://www.vapehub.co.uk'}/sitemap.xml`;
    const robotsTxt = `User-agent: *
Disallow: /admin
Sitemap: ${sitemapUrl}`;

    res.type('text/plain');
    res.send(robotsTxt);
  }
};

module.exports = seoController; 