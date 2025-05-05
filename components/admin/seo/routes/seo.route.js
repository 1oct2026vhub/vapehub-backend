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
 *         - entityType
 *       properties:
 *         entityType:
 *           type: string
 *           enum: [page, product, category, brand, blog_category, blog_post]
 *           description: Type of entity
 *         entityId:
 *           type: string
 *           description: ID of the entity (required for all entity types except 'page')
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
 * /api/admin/seo:
 *   post:
 *     summary: Create or update SEO metadata for an entity
 *     tags:
 *       - ADMIN - SEO
 *     security:
 *       - bearerAuth: []
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
 *         description: Invalid input - entityId is required for non-page entities
 *       401:
 *         description: Unauthorized access
 *       404:
 *         description: Entity not found
 */
router.post(
    "/",
    [authMiddleware(true), validateRequest(validationRules.upsertSeoMeta)],
    (req, res, next) => {
        // If entityType is 'page', set entityId to null
        if (req.body.entityType === 'page') {
            req.body.entityId = null;
        }
        seoController.upsertSeoMeta(req, res, next);
    }
);

/**
 * @swagger
 * /api/admin/seo:
 *   get:
 *     summary: List SEO metadata with filtering and pagination
 *     tags:
 *       - ADMIN - SEO
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *           enum: [page, product, category, brand, blog_category, blog_post]
 *         description: Filter by entity type
 *       - in: query
 *         name: entityId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by entity ID
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: Search keyword for title, description, focus keyword, or slug
 *       - in: query
 *         name: noIndex
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Filter by noIndex status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of SEO metadata retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/SeoMeta'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Unauthorized access
 */
router.get(
    "/",
    [authMiddleware(true), validateRequest(validationRules.listSeoMeta)],
    seoController.listSeoMeta
);

module.exports = router; 