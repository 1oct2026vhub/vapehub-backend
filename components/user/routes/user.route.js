const router = require("express").Router();
const userController = require('../domain/user.controller')
const { validateRequest } = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");
const authenticateJWT = require("../../auth/middleware/authMiddleware");


router.get('/profile', async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    res.json(user);
});

router.put('/profile', async (req, res) => {
    const { name, lastName, phone, gender, dob } = req.body;

    const updatedUser = await prisma.user.update({
        where: { id: req.user.id },
        data: { name, lastName, phone, gender, dob },
    });

    res.json(updatedUser);
});

router.delete('/profile', async (req, res) => {
    await prisma.user.delete({ where: { id: req.user.id } });
    res.json({ message: 'Profile deleted successfully' });
});

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