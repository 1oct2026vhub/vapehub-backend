const router = require("express").Router();
const homePageController = require("../domain/homePage.controller");
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");
const { authMiddleware } = require('../../../library/middleware');

/**
 * @swagger
 * /api/home/carousel:
 *   get:
 *     tags:
 *      - HomePage
 *     summary: home page carousel
 *     responses:
 *       200:
 *         description: success
 *       400:
 *         description: Bad request (validation errors)
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       500:
 *         description: Internal server error
 */
router.get("/carousel", homePageController.getHomeCarousel)

/**
 * @swagger
 * /api/home/carousel:
 *   post:
 *     tags:
 *       - HomePage
 *     summary: Create a home page carousel item
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - image_url
 *               - display_order
 *             properties:
 *               image_url:
 *                 type: string
 *                 format: uri
 *                 example: "https://example.com/image.jpg"
 *               display_order:
 *                 type: integer
 *                 example: 1
 *               image_url_mid:
 *                 type: string
 *                 format: uri
 *                 example: "https://example.com/image_mid.jpg"
 *               image_url_low:
 *                 type: string
 *                 format: uri
 *                 example: "https://example.com/image_low.jpg"
 *               title:
 *                 type: string
 *                 example: "Homepage Banner"
 *               description:
 *                 type: string
 *                 example: "This is a description for the homepage carousel."
 *     responses:
 *       200:
 *         description: Successfully created a carousel item
 *       400:
 *         description: Bad request (validation errors)
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       500:
 *         description: Internal server error
 */
router.post("/carousel",
    authMiddleware(true),
    validateRequest([
        check("display_order").notEmpty().withMessage("Order is required").isInt().withMessage("Order must be an integer"),
        check("image_url").notEmpty().withMessage("Image URL is required").isURL().withMessage("Invalid image URL"),
        check("title").optional().isString().withMessage("Title should be a string"),
        check("description").optional().isString().withMessage("Description should be a string"),
        check("image_url_mid").optional().isURL().withMessage("Invalid image_url_mid format"),
        check("image_url_low").optional().isURL().withMessage("Invalid image_url_low format")
    ]),
    homePageController.createHomeCarousel
)


module.exports = router