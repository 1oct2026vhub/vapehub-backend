const router = require("express").Router();
const { validateRequest } = require("../../../../utils/validationMiddleware");
const validationRules = require("../helper/seo.validator");
const { authMiddleware } = require('../../../../library/middleware');
const seoController = require('../domain/seo.controller');

/**
 * @swagger
 * components:
 *   schemas:
 *     SeoMeta:
 *       type: object
 *       required:
 *         - slug
 *       properties:
 *         title:
 *           type: string
 *           description: SEO title
 *         description:
 *           type: string
 *           description: Meta description
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
 * /api/admin/seo/{entityType}/{entityId}:
 *   get:
 *     summary: Get SEO metadata for an entity
 *     tags:
 *       - ADMIN - SEO
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [page, product, category, brand, blog_category, blog_post]
 *         description: Type of entity
 *       - in: path
 *         name: entityId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID of the entity (optional for pages)
 *       - in: query
 *         name: slug
 *         required: false
 *         schema:
 *           type: string
 *         description: URL slug to find SEO metadata (required if entityId is not provided for non-page entities)
 *     responses:
 *       200:
 *         description: SEO metadata retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SeoMeta'
 *       400:
 *         description: Bad request - Either entityId or slug is required for non-page entities
 *       404:
 *         description: SEO metadata not found
 *       401:
 *         description: Unauthorized access
 */
router.get(
    "/:entityType/:entityId?",
    [authMiddleware(true), validateRequest(validationRules.getSeoMeta)],
    seoController.getSeoMeta
);

/**
 * @swagger
 * /api/admin/seo/{entityType}/{entityId}:
 *   put:
 *     summary: Create or update SEO metadata for an entity
 *     tags:
 *       - ADMIN - SEO
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [page, product, category, brand, blog_category, blog_post]
 *         description: Type of entity
 *       - in: path
 *         name: entityId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID of the entity
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SeoMeta'
 *     responses:
 *       200:
 *         description: SEO metadata updated successfully
 *       201:
 *         description: SEO metadata created successfully
 *       400:
 *         description: Invalid input
 *       401:
 *         description: Unauthorized access
 */
router.put(
    "/:entityType/:entityId?",
    [authMiddleware(true), validateRequest(validationRules.upsertSeoMeta)],
    seoController.upsertSeoMeta
);

module.exports = router; 