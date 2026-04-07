const router = require("express").Router();
const { check, query, param } = require("express-validator");
const { validateRequest } = require("../../../utils/validationMiddleware");
const rateLimit = require('express-rate-limit');

const authController = require('../domain/auth.controller')

const authLoginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // per-IP per window
  standardHeaders: true,
  legacyHeaders: false,
});

const authPasswordLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // stricter for password reset flows
  standardHeaders: true,
  legacyHeaders: false,
});

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
router.post("/login", authLoginLimiter, authController.login);

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Registers a new user
 *     description: Registers a new user by accepting email, password, and phone, then hashing the password and returning a JWT token.
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
 *             required:
 *               - email
 *               - password
 *               - phone
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
 *               mail_subscription:
 *                 type: boolean
 *                 description: Whether the user wants to subscribe to promotional emails. Defaults to false if not provided.
 *                 example: true
 *               phone:
 *                 type: string
 *                 description: Phone number of the user (required; must be between 10 to 15 digits excluding +, hyphens and spaces)
 *                 example: "+1234567890"
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
  authLoginLimiter,
  validateRequest([
    check("email").isEmail().withMessage("Invalid Email").notEmpty().withMessage("Email is required"),
    check("password").notEmpty().withMessage("Password is required").isLength({ min: 8 }).withMessage("Password must be at least 8 characters").matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/).withMessage("Password must contain at least one uppercase letter, one lowercase letter, one digit, and one special character"),
    check("phone").notEmpty().withMessage("Phone is required").custom((value) => {
        if (!value || value.trim() === '') {
            throw new Error('Phone is required');
        }
        const digitCount = value.replace(/[-\+\s]/g, '').length;
        if (digitCount < 10 || digitCount > 15) {
            throw new Error('Phone number must be between 10 to 15 digits (excluding +, hyphens and spaces)');
        }
        return true;
    }),
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
router.post('/forgot-password', authPasswordLimiter, validateRequest([
  check('email')
    .isEmail()
    .withMessage('Please provide a valid email address.'),
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
  authPasswordLimiter,
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

/**
 * @swagger
 * /api/auth/convert-guest-account:
 *   post:
 *     summary: Convert temporary guest account to permanent account
 *     description: Allows guest users to set a password and convert their temporary account to permanent. An email verification link will be sent.
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 description: Password for the permanent account (must be at least 8 characters with uppercase, lowercase, digit, and special character)
 *                 example: "Password@123"
 *     responses:
 *       200:
 *         description: Account converted successfully
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
 *                   example: "Account converted successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Account converted successfully. Please verify your email."
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         email:
 *                           type: string
 *                         is_temporary:
 *                           type: boolean
 *                           example: false
 *       400:
 *         description: Bad Request - Account already permanent or invalid password
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       500:
 *         description: Internal Server Error
 */
const authenticateJWT = require('../middleware/authMiddleware');
router.post('/convert-guest-account',
    authenticateJWT,
    validateRequest([
        check('password')
            .isLength({ min: 8 })
            .withMessage('Password must be at least 8 characters')
            .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/)
            .withMessage('Password must contain uppercase, lowercase, digit, and special character')
    ]),
    authController.convertGuestAccount
);

/**
 * @swagger
 * /api/auth/ckeditor-token:
 *   get:
 *     summary: Get CKEditor collaboration token
 *     description: Generates a JWT token for CKEditor Cloud Services collaboration features for the authenticated user.
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CKEditor token generated successfully
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       500:
 *         description: Internal server error
 */
router.get('/ckeditor-token', authenticateJWT, authController.getCkEditorToken);

module.exports = router;