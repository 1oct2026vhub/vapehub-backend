const router = require("express").Router();
const { validateRequest } = require("../../../../utils/validationMiddleware");
const authValidation = require("../helper/auth.validator");
const authController = require('../domain/auth.controller')

/**
 * @swagger
 * /api/admin/auth/login:
 *   post:
 *     summary: Logs in a user
 *     description: Logs in a user by validating email and password.
 *     tags:
 *      - ADMIN 
 *        - Authentication
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
 *                 example: admin@ateamvape.com
 *               password:
 *                 type: string
 *                 description: The password of the user.
 *                 minLength: 8
 *                 example: Password@123
 *               resendVerificationEmail:
 *                 type: boolean
 *                 description: resend verificatin email.
 *                 example: false
 *     responses:
 *       200:
 *         description: Successfully logged in
 *       400:
 *         description: Bad request, validation errors
 *       500:
 *         description: Internal server error
 */
router.post("/login", validateRequest(authValidation.login), authController.login
);

/**
 * @swagger
 * /api/admin/auth/verify-email:
 *   get:
 *     summary: Verify a user's email address.
 *     description: This endpoint is used to verify a user's email address using a verification token.
 *     tags:
 *      - ADMIN 
 *        - Authentication
 *     parameters:
 *       - in: query
 *         name: token
 *         schema:
 *           type: string
 *         required: true
 *         description: The verification token sent to the user's email.
 *     responses:
 *       200:
 *         description: Email verification successful.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Email verified successfully.
 *       400:
 *         description: Invalid link or link expired.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Invalid link or link expired.
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Something went wrong.
 */
router.get("/verify-email", validateRequest(authValidation.emailVerify), authController.verifyEmail);

/**
 * @swagger
 * /api/admin/auth/forgot-password:
 *   post:
 *     summary: Request a password reset.
 *     description: This endpoint allows a user to request a password reset. An email with a reset password link will be sent if the email is associated with an existing user account.
 *     tags:
 *      - ADMIN 
 *        - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: user@example.com
 *                 description: The email address of the user requesting a password reset.
 *     responses:
 *       200:
 *         description: Password reset email sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password reset email sent successfully.
 *       404:
 *         description: User not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                       example: User not found
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Something went wrong.
 */
router.post('/forgot-password', validateRequest(authValidation.forgotPassword), authController.forgotPassword);

/**
   * @swagger
   * /api/admin/auth/reset-password:
   *   post:
   *     summary: Reset password for the user
   *     description: Endpoint to reset the user's password using a token and a new password.
   *     tags:
 *      - ADMIN 
 *        - Authentication
*     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *                 format: string
 *                 description: token sent to the user's email
 *                 example: 62af6dd0-f7fc-49ff-9fdf-ceb2331c9180
 *               password:
 *                 type: string
 *                 description: The new password of the user (must be at least 8 characters)
 *                 minLength: 8
 *                 example: password123
   *     responses:
   *       200:
   *         description: Password reset successful
   *       400:
   *         description: Invalid request (e.g., invalid token or password)
   *       500:
   *         description: Internal server error
   */
router.post('/reset-password', validateRequest(authValidation.resetPassword), authController.resetPassword);

/**
 * @swagger
 * /api/admin/auth/refresh-token:
 *   post:
 *     summary: Refresh user access token
 *     description: Refreshes the user's access token using the refresh token.
 *     tags:
 *      - ADMIN 
 *        - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: The refresh token to obtain a new access token.  
 *                 example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiaWF0IjoxNzM3NTI5MzkzLCJleHAiOjE3NDAxMjEzOTN9.xYGc_TerVZbE-3kzagCYIZSZxVspY80AblO5Yfm83S0"
 *     responses:
 *       200:
 *         description: Access token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   example: "newAccessToken12345"
 *                 refreshToken:
 *                   type: string
 *                   example: "newAccessToken12345"
 *       400:
 *         description: Invalid or missing refresh token
 */
router.post("/refresh-token", validateRequest(authValidation.refreshToken), authController.refreshToken);

module.exports = router;