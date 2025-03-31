const router = require("express").Router();
const userController = require('../domain/user.controller')
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const {validateProfileUpdate} = require("../helper/user.validator")

// router.get('/profile', async (req, res) => {
//     const user = await prisma.user.findUnique({ where: { id: req.user.id } });
//     res.json(user);
// });

// router.put('/profile', async (req, res) => {
//     const { name, lastName, phone, gender, dob } = req.body;

//     const updatedUser = await prisma.user.update({
//         where: { id: req.user.id },
//         data: { name, lastName, phone, gender, dob },
//     });

//     res.json(updatedUser);
// });

// router.delete('/profile', async (req, res) => {
//     await prisma.user.delete({ where: { id: req.user.id } });
//     res.json({ message: 'Profile deleted successfully' });
// });


/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get user profile details
 *     description: Fetch the first name, last name, email, and phone number of the authenticated user.
 *     tags:
 *       - User
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved user profile
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     first_name:
 *                       type: string
 *                       example: John
 *                     last_name:
 *                       type: string
 *                       example: Doe
 *                     email:
 *                       type: string
 *                       example: johndoe@example.com
 *                     phone:
 *                       type: string
 *                       example: 123-456-7890
 *       400:
 *         description: Invalid request or missing token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       msg:
 *                         type: string
 *                         example: Authorization token is required
 *       401:
 *         description: Unauthorized (invalid token or user not found)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Invalid token
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: User not found
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Internal server error
 */
router.get('/profile', authenticateJWT, userController.userProfile);

/**
 * @swagger
 * /api/users/profile:
 *   put:
 *     summary: Update user profile
 *     description: Allows authenticated users to update their first name, last name, email, and phone number.
 *     tags:
 *       - User
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *                 example: John
 *               last_name:
 *                 type: string
 *                 example: Doe
 *               email:
 *                 type: string
 *                 example: johndoe@example.com
 *               phone:
 *                 type: string
 *                 example: "123-456-7890"
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Profile updated successfully
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       msg:
 *                         type: string
 *                         example: "Email is required"
 *       401:
 *         description: Unauthorized (Invalid token)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Unauthorized
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Internal server error
 */

router.put('/profile', authenticateJWT,  userController.updateUserProfile)  // validateRequest(validateProfileUpdate),

/**
 * @swagger
 * /api/users/refer-a-friend:
 *   post:
 *     tags:
 *      - User
 *     security:
 *       - bearerAuth: []
 *     summary: refer a friend to vapeHub
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 description: The email of the user.
 *                 example: user31@example.com
 *     responses:
 *       200:
 *         description: refer a friend successfully
 *       400:
 *         description: Bad request (validation errors)
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       500:
 *         description: Internal server error
 */
router.post("/refer-a-friend",
    validateRequest([
        check("email").isEmail().withMessage("Invalid Email").notEmpty().withMessage("Email is required"),
    ]),
    authenticateJWT, userController.referFriend)

module.exports = router;