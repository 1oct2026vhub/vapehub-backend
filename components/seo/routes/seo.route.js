const router = require("express").Router();
const { validateRequest } = require("../../../utils/validationMiddleware");
const validationRules = require("../helper/seo.validator");
const seoController = require('../domain/seo.controller');

/**
 * @swagger
 * components:
 *   schemas:
 *     SeoMeta:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *           description: SEO title
 *         description:
 *           type: string
 *           description: Meta description
 *         description_text:
 *           type: string
 *           description: Additional description text for SEO purposes
 *         focusKeyword:
 *           type: string
 *           description: Focus keyword for SEO
 *         slug:
 *           type: string
 *           description: URL slug
 *         canonicalUrl:
 *           type: string
 *           description: Canonical URL
 *         ogImage:
 *           type: string
 *           description: Open Graph image URL
 *         noIndex:
 *           type: boolean
 *           description: Whether to prevent search engines from indexing
 */

/**
 * @swagger
 * /api/seo/slug/{slug}:
 *   get:
 *     summary: Get SEO metadata by slug
 *     tags:
 *       - SEO
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         description: URL slug to fetch SEO metadata for
 *     responses:
 *       200:
 *         description: SEO metadata retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SeoMeta'
 *       404:
 *         description: SEO metadata not found
 */
router.get(
    "/slug/:slug",
    [validateRequest(validationRules.getSeoBySlug)],
    seoController.getSeoBySlug
);

/**
 * @swagger
 * /api/seo/sitemap.xml:
 *   get:
 *     summary: Get sitemap XML
 *     tags:
 *       - SEO
 *     responses:
 *       200:
 *         description: Sitemap XML generated successfully
 *         content:
 *           application/xml:
 *             schema:
 *               type: string
 */
router.get(
    "/sitemap.xml",
    seoController.generateSitemap
);

/**
 * Chunked sitemap (when total URLs exceed 50,000). Referenced from sitemap index XML.
 */
router.get(
    "/sitemap-chunk-:chunkIndex.xml",
    seoController.generateSitemapChunk
);

/**
 * @swagger
 * /api/seo/robots.txt:
 *   get:
 *     summary: Get robots.txt
 *     tags:
 *       - SEO
 *     responses:
 *       200:
 *         description: Robots.txt content
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 */
router.get(
    "/robots.txt",
    seoController.getRobotsTxt
);

module.exports = router; 