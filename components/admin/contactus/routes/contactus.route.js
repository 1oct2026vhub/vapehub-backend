const express = require('express');
const router = express.Router();
const contactusController = require('../domain/contactus.controller');
const { authMiddleware } = require('../../../../library/middleware');

const adminAuth = [authMiddleware(true)];

/**
 * @swagger
 * /api/admin/contactus:
 *   post:
 *     summary: Create a new Contact Us info
 *     tags: [ADMIN - ContactUs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               send_us_a_message:
 *                 type: string
 *               call_us:
 *                 type: string
 *               social_media:
 *                 type: string
 *               facebook:
 *                 type: string
 *                 example: "https://facebook.com/example"
 *               whatsapp:
 *                 type: string
 *                 example: "https://wa.me/1234567890"
 *               instagram:
 *                 type: string
 *                 example: "https://instagram.com/example"
 *               email:
 *                 type: string
 *                 example: "info@example.com"
 *               phone_number:
 *                 type: string
 *                 example: "+1234567890"
 *     responses:
 *       201:
 *         description: Contact info created successfully
 */
router.post('/', adminAuth, contactusController.createConnect);

/**
 * @swagger
 * /api/admin/contactus:
 *   get:
 *     summary: Get all Contact Us info
 *     tags: [ADMIN - ContactUs]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All contact info retrieved successfully
 */
router.get('/', adminAuth, contactusController.getAllConnects);

/**
 * @swagger
 * /api/admin/contactus/{id}:
 *   get:
 *     summary: Get Contact Us info by ID
 *     tags: [ADMIN - ContactUs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the contact info
 *     responses:
 *       200:
 *         description: Contact info retrieved successfully
 *       404:
 *         description: Contact info not found
 */
router.get('/:id', adminAuth, contactusController.getConnectById);

/**
 * @swagger
 * /api/admin/contactus/{id}:
 *   put:
 *     summary: Update Contact Us info by ID
 *     tags: [ADMIN - ContactUs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the contact info
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               send_us_a_message:
 *                 type: string
 *               call_us:
 *                 type: string
 *               social_media:
 *                 type: string
 *               facebook:
 *                 type: string
 *                 example: "https://facebook.com/example"
 *               whatsapp:
 *                 type: string
 *                 example: "https://wa.me/1234567890"
 *               instagram:
 *                 type: string
 *                 example: "https://instagram.com/example"
 *               email:
 *                 type: string
 *                 example: "info@example.com"
 *               phone_number:
 *                 type: string
 *                 example: "+1234567890"
 *     responses:
 *       200:
 *         description: Contact info updated successfully
 *       404:
 *         description: Contact info not found
 */
router.put('/:id', adminAuth, contactusController.updateConnect);

/**
 * @swagger
 * /api/admin/contactus/{id}:
 *   delete:
 *     summary: Delete Contact Us info by ID
 *     tags: [ADMIN - ContactUs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the contact info
 *     responses:
 *       200:
 *         description: Contact info deleted successfully
 *       404:
 *         description: Contact info not found
 */
router.delete('/:id', adminAuth, contactusController.deleteConnect);

module.exports = router; 