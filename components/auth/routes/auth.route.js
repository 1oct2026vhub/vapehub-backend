const router = require("express").Router();
const { check, query, param } = require("express-validator");
const { validateRequest } = require("../../../utils/validationMiddleware");

const authController = require('../domain/auth.controller')

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Logs in a user
 *     description: Logs in a user by validating email and password.
 *     tags:
 *      - Authentication
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
 *                 example: see@vapeuser.com
 *               password:
 *                 type: string
 *                 description: The password of the user.
 *                 minLength: 8
 *                 example: Best123$
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
router.post("/login", authController.login);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Registers a new user
 *     description: Registers a new user by accepting email and password, then hashing the password and returning a JWT token.
 *     tags:
 *      - Authentication
 *     parameters:
 *       - in: query
 *         name: referral_code
 *         schema:
 *           type: string
 *         required: false
 *         description: Optional referral code from an existing user
 *         example: ABC123
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The email of the user
 *                 example: user31@example.com
 *               password:
 *                 type: string
 *                 description: The password of the user (must be at least 8 characters)
 *                 minLength: 8
 *                 example: Password@123
 *     responses:
 *       201:
 *         description: User successfully registered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: A success message
 *                 token:
 *                   type: string
 *                   description: The JWT token generated for the user
 *       400:
 *         description: Invalid input, password must be at least 8 characters
 *       500:
 *         description: Internal server error
 */
router.post('/register',
  validateRequest([
    check("email").isEmail().withMessage("Invalid Email").notEmpty().withMessage("Email is required").normalizeEmail(),
    check("password").notEmpty().withMessage("Password is required").isLength({ min: 8 }).withMessage("Password must be at least 8 characters").matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/).withMessage("Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character"),
    query("referral_code").optional().isString().withMessage("Referral code must be a string")
  ]),
  authController.register
);
/**
 * @swagger
 * /api/auth/verify-email:
 *   get:
 *     summary: Verify a user's email address.
 *     description: This endpoint is used to verify a user's email address using a verification token.
 *     tags:
 *       - Authentication
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
router.get("/verify-email",
  validateRequest([
    query("token").isString().notEmpty().withMessage("Token is required in query params")
  ]),
  authController.verifyEmail);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request a password reset.
 *     description: This endpoint allows a user to request a password reset. An email with a reset password link will be sent if the email is associated with an existing user account.
 *     tags:
 *       - Authentication
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
router.post('/forgot-password', validateRequest([
  check('email')
    .isEmail()
    .withMessage('Please provide a valid email address.')
    .normalizeEmail(),
]), authController.forgotPassword);

/**
   * @swagger
   * /api/auth/reset-password:
   *   post:
   *     summary: Reset password for the user
   *     description: Endpoint to reset the user's password using a token and a new password.
   *     tags:
   *      - Authentication
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
router.post('/reset-password',
  validateRequest([
    check('token').isString().notEmpty().withMessage('Token is required in query params'),
    check("password").notEmpty().withMessage("Password is required").isLength({ min: 8 }).withMessage("Password must be at least 8 characters").matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/).withMessage("Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character"),
  ])
  , authController.resetPassword);

/**
 * @swagger
 * /api/auth/refresh-token:
 *   post:
 *     summary: Refresh user access token
 *     description: Refreshes the user's access token using the refresh token.
 *     tags:
 *      - Authentication 
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
router.post("/refresh-token",
  validateRequest([
    check('refreshToken').isString().notEmpty().withMessage('refreshToken is required in request body'),
  ]),
  authController.refreshToken);

module.exports = router;