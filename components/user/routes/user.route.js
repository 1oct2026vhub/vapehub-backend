const router = require("express").Router();
const userController = require('../domain/user.controller')
const { validateRequest} = require("../../../utils/validationMiddleware");
const { check, query, param } = require("express-validator");
const authenticateJWT = require("../../auth/middleware/authMiddleware");
const {validateProfileUpdate,  validateCreateUserAddress, validateUpdateUserAddress, validateChangePassword } = require("../helper/user.validator")

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
 *               phone:
 *                 type: string
 *                 description: User's phone number (10-15 digits, + and hyphens allowed)
 *                 example: "+1-234-567-8901"
 *                 pattern: "^\\+?[\\d-]{10,15}$"
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

router.put('/profile', authenticateJWT, validateRequest(validateProfileUpdate),  userController.updateUserProfile)  // validateRequest(validateProfileUpdate),

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
 *             required:
 *               - email
 *               - referral_code
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address of the friend to refer
 *                 example: friend@example.com
 *               referral_code:
 *                 type: string
 *                 description: Unique referral code of the referrer
 *                 example: ABC123XYZ
 *     responses:
 *       200:
 *         description: Referral invitation sent successfully
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
 *                   example: Referral invitation sent successfully
 *       400:
 *         description: Invalid input or user already exists
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
 *                   example: User with this email already exists
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       500:
 *         description: Server error
 */
router.post("/refer-a-friend",
    validateRequest([
        check("email").isEmail().withMessage("Invalid Email").notEmpty().withMessage("Email is required"),
        check("referral_code").notEmpty().withMessage("Referral code is required"),
    ]),
    authenticateJWT, userController.referFriend)

/**
 * @swagger
 * /api/users/user-address:
 *   get:
 *     summary: Get user address details
 *     description: Fetches the user's first name, last name, and address details excluding sensitive data.
 *     tags:
 *       - User Address
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User address details fetched successfully.
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
 *                     last_name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     phone:
 *                       type: string
 *                     addresses:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           last_name:
 *                             type: string
 *                           company_name:
 *                             type: string
 *                           country:
 *                             type: string
 *                           street:
 *                             type: string
 *                           apartment:
 *                             type: string
 *                           town:
 *                             type: string
 *                           county:
 *                             type: string
 *                           post_code:
 *                             type: string
 *                           phone:
 *                             type: string
 *       401:
 *         description: Unauthorized - Missing or invalid token.
 *       500:
 *         description: Internal Server Error.
 */
router.get('/user-address', authenticateJWT, userController.fetchUserAddress)

/**
 * @swagger
 * /api/users/user-address:
 *   post:
 *     summary: Add a new user address
 *     description: Adds a new address for the authenticated user.
 *     tags:
 *       - User Address
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - street
 *               - town
 *               - post_code
 *               - phone
 *               - region
 *             properties:
 *               name:
 *                 type: string
 *                 example: "John"
 *               last_name:
 *                 type: string
 *                 example: "Doe"
 *               company_name:
 *                 type: string
 *                 example: "Doe Inc."
 *               country:
 *                 type: string
 *                 example: "USA"
 *               street:
 *                 type: string
 *                 example: "123 Main St"
 *               apartment:
 *                 type: string
 *                 example: "Apt 4B"
 *               town:
 *                 type: string
 *                 example: "New York"
 *               county:
 *                 type: string
 *                 example: "New York"
 *               post_code:
 *                 type: string
 *                 example: "10001"
 *               phone:
 *                 type: string
 *                 example: "1234567890"
 *               region:
 *                 type: string
 *                 description: The region/state of the address
 *                 example: "New York"
 *     responses:
 *       201:
 *         description: Address added successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     last_name:
 *                       type: string
 *                     street:
 *                       type: string
 *                     region:
 *                       type: string
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized - Missing or invalid token.
 *       500:
 *         description: Internal Server Error.
 */


router.post('/user-address', authenticateJWT, validateRequest(validateCreateUserAddress), userController.createUserAddress)

/**
 * @swagger
 * /api/users/user-address/{id}:
 *   put:
 *     summary: Update user address
 *     description: Updates an existing address for the authenticated user.
 *     tags:
 *       - User Address
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Address ID to be updated
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "John"
 *               last_name:
 *                 type: string
 *                 example: "Doe"
 *               company_name:
 *                 type: string
 *                 example: "Doe Inc."
 *               country:
 *                 type: string
 *                 example: "USA"
 *               street:
 *                 type: string
 *                 example: "123 Main St"
 *               apartment:
 *                 type: string
 *                 example: "Apt 4B"
 *               town:
 *                 type: string
 *                 example: "New York"
 *               county:
 *                 type: string
 *                 example: "New York"
 *               post_code:
 *                 type: string
 *                 example: "10001"
 *               phone:
 *                 type: string
 *                 example: "1234567890"
 *               region:
 *                 type: string
 *                 example: "New York"
 *     responses:
 *       200:
 *         description: Address updated successfully.
 *       400:
 *         description: Validation error.
 *       401:
 *         description: Unauthorized - Missing or invalid token.
 *       404:
 *         description: Address not found.
 *       500:
 *         description: Internal Server Error.
 */
router.put('/user-address/:id', authenticateJWT, validateRequest(validateUpdateUserAddress), userController.updateUserAddress)

/**
 * @swagger
 * /api/users/user-address/{id}:
 *   delete:
 *     summary: Delete user address
 *     description: Deletes a user address for the authenticated user.
 *     tags:
 *       - User Address
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Address ID to be deleted
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Address deleted successfully.
 *       401:
 *         description: Unauthorized - Missing or invalid token.
 *       404:
 *         description: Address not found.
 *       500:
 *         description: Internal Server Error.
 */
router.delete('/user-address/:id', authenticateJWT,  userController.deleteUserAddress)

/**
 * @swagger
 * /api/users/change-password:
 *   put:
 *     summary: Change user password
 *     description: Allows a user to change their password, requiring the correct current password and email.
 *     tags:
 *       - User
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: User's email, current password, new password, and confirmation of new password.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@example.com
 *               currentPassword:
 *                 type: string
 *                 example: oldpassword123
 *               newPassword:
 *                 type: string
 *                 example: newpassword456
 *               confirmPassword:
 *                 type: string
 *                 example: newpassword456
 *     responses:
 *       200:
 *         description: Password updated successfully
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
 *                   example: Password updated successfully
 *       400:
 *         description: Validation error or invalid data (e.g., email doesn't match, passwords don't match)
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
 *                         example: Password should be at least 6 characters
 *                       param:
 *                         type: string
 *                         example: newPassword
 *       401:
 *         description: Unauthorized (incorrect current password)
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
 *                   example: Current password is incorrect
 *       403:
 *         description: Forbidden (invalid or expired token)
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
 *                   example: Invalid or expired token
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
 *     requestHeaders:
 *       - name: Authorization
 *         in: header
 *         required: true
 *         description: Bearer token for authentication
 *         schema:
 *           type: string
 *           example: Bearer <your-jwt-token>
 */


router.put('/change-password', authenticateJWT, validateRequest(validateChangePassword), userController.changeUserPassword);

// Delete user account

/**
 * @swagger
 * /api/users/delete-account:
 *   delete:
 *     summary: Delete user account
 *     description: Deletes the account of the currently authenticated user.
 *     tags:
 *       - User
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account deleted successfully
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
 *                   example: Account deleted successfully
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
 *     requestHeaders:
 *       - name: Authorization
 *         in: header
 *         required: true
 *         description: Bearer token for authentication
 *         schema:
 *           type: string
 *           example: Bearer <your-jwt-token>
 */

router.delete('/delete-account', authenticateJWT, userController.deleteAccount);

/**
 * @swagger
 * /api/users/referral-stats:
 *   get:
 *     summary: Get user's referral statistics
 *     description: Retrieve statistics about users who registered through this user's referral
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Referral statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     total_referrals:
 *                       type: integer
 *                       example: 5
 *                     pending_referrals:
 *                       type: integer
 *                       example: 2
 *                     total_points:
 *                       type: integer
 *                       example: 1500
 *                     recent_referrals:
 *                       type: object
 *                       properties:
 *                         data:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 1
 *                               status:
 *                                 type: string
 *                                 example: "completed"
 *                               points_awarded:
 *                                 type: integer
 *                                 example: 100
 *                               created_at:
 *                                 type: string
 *                                 format: date-time
 *                               user:
 *                                 type: object
 *                                 properties:
 *                                   id:
 *                                     type: integer
 *                                   name:
 *                                     type: string
 *                                   email:
 *                                     type: string
 *                                   joined_at:
 *                                     type: string
 *                                     format: date-time
 *                         pagination:
 *                           type: object
 *                           properties:
 *                             total:
 *                               type: integer
 *                               description: Total number of records
 *                               example: 50
 *                             page:
 *                               type: integer
 *                               description: Current page number
 *                               example: 1
 *                             limit:
 *                               type: integer
 *                               description: Number of items per page
 *                               example: 10
 *                             total_pages:
 *                               type: integer
 *                               description: Total number of pages
 *                               example: 5
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/referral-stats", authenticateJWT, userController.getReferralStats);

// /**
//  * @swagger
//  * /api/users/referral-methods:
//  *   get:
//  *     summary: Get all referral methods
//  *     description: Retrieve all referral methods with their details
//  *     tags: [User]
//  *     security:
//  *       - bearerAuth: []
//  *     responses:
//  *       200:
//  *         description: Referral methods retrieved successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: true
//  *                 data:
//  *                   type: array
//  *                   items:
//  *                     type: object
//  *                     properties:
//  *                       id:
//  *                         type: integer
//  *                         example: 1
//  *                       referral_value_type:
//  *                         type: string
//  *                         enum: [percentage, fixed]
//  *                         example: percentage
//  *                       referral_value:
//  *                         type: number
//  *                         example: 10
//  *                       status:
//  *                         type: string
//  *                         enum: [active, inactive]
//  *                         example: active
//  *                       primary:
//  *                         type: boolean
//  *                         example: true
//  *                       created_at:
//  *                         type: string
//  *                         format: date-time
//  *                       updated_at:
//  *                         type: string
//  *                         format: date-time
//  *       401:
//  *         description: Unauthorized
//  *       500:
//  *         description: Internal server error
//  */
// router.get('/referral-methods', authenticateJWT, userController.getReferralMethods);

// /**
//  * @swagger
//  * /api/users/referral-methods:
//  *   post:
//  *     summary: Create a new referral method
//  *     description: Create a new referral method with specified value type and value
//  *     tags: [User]
//  *     security:
//  *       - bearerAuth: []
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             required:
//  *               - referral_value_type
//  *               - referral_value
//  *             properties:
//  *               referral_value_type:
//  *                 type: string
//  *                 enum: [percentage, fixed]
//  *                 description: Type of referral value (percentage or fixed amount)
//  *                 example: percentage
//  *               referral_value:
//  *                 type: number
//  *                 description: Value of the referral (percentage or fixed amount)
//  *                 example: 10
//  *               status:
//  *                 type: string
//  *                 enum: [active, inactive]
//  *                 description: Status of the referral method
//  *                 example: active
//  *               primary:
//  *                 type: boolean
//  *                 description: Whether this is the primary referral method
//  *                 example: true
//  *     responses:
//  *       201:
//  *         description: Referral method created successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: true
//  *                 data:
//  *                   type: object
//  *                   properties:
//  *                     id:
//  *                       type: integer
//  *                       example: 1
//  *                     referral_value_type:
//  *                       type: string
//  *                       example: percentage
//  *                     referral_value:
//  *                       type: number
//  *                       example: 10
//  *                     status:
//  *                       type: string
//  *                       example: active
//  *                     primary:
//  *                       type: boolean
//  *                       example: true
//  *       400:
//  *         description: Invalid input data
//  *       401:
//  *         description: Unauthorized
//  *       500:
//  *         description: Internal server error
//  */
// router.post('/referral-methods', authenticateJWT, userController.createReferralMethod);

// /**
//  * @swagger
//  * /api/users/referral-methods/{id}:
//  *   put:
//  *     summary: Update a referral method
//  *     description: Update an existing referral method by ID
//  *     tags: [User]
//  *     security:
//  *       - bearerAuth: []
//  *     parameters:
//  *       - in: path
//  *         name: id
//  *         required: true
//  *         schema:
//  *           type: integer
//  *         description: ID of the referral method to update
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             properties:
//  *               referral_value_type:
//  *                 type: string
//  *                 enum: [percentage, fixed]
//  *                 description: Type of referral value (percentage or fixed amount)
//  *                 example: percentage
//  *               referral_value:
//  *                 type: number
//  *                 description: Value of the referral (percentage or fixed amount)
//  *                 example: 10
//  *               status:
//  *                 type: string
//  *                 enum: [active, inactive]
//  *                 description: Status of the referral method
//  *                 example: active
//  *               primary:
//  *                 type: boolean
//  *                 description: Whether this is the primary referral method
//  *                 example: true
//  *     responses:
//  *       200:
//  *         description: Referral method updated successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: true
//  *                 data:
//  *                   type: object
//  *                   properties:
//  *                     id:
//  *                       type: integer
//  *                       example: 1
//  *                     referral_value_type:
//  *                       type: string
//  *                       example: percentage
//  *                     referral_value:
//  *                       type: number
//  *                       example: 10
//  *                     status:
//  *                       type: string
//  *                       example: active
//  *                     primary:
//  *                       type: boolean
//  *                       example: true
//  *       400:
//  *         description: Invalid input data
//  *       401:
//  *         description: Unauthorized
//  *       404:
//  *         description: Referral method not found
//  *       500:
//  *         description: Internal server error
//  */
// router.put('/referral-methods/:id', authenticateJWT, userController.updateReferralMethod);

/**
 * @swagger
 * /api/users/contact-us:
 *   get:
 *     summary: Get public Contact Us info
 *     tags: [USER - ContactUs]
 *     description: Returns the latest Contact Us information (send us a message, call us, social media) for the user side.
 *     responses:
 *       200:
 *         description: Contact info retrieved successfully
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
 *                     send_us_a_message:
 *                       type: string
 *                     call_us:
 *                       type: string
 *                     social_media:
 *                       type: string
 *                 message:
 *                   type: string
 *       404:
 *         description: Contact info not found
 */
router.get('/contact-us', userController.getContactUsInfo);

/**
 * @swagger
 * /api/users/contact-social-info:
 *   get:
 *     summary: Get public social/contact info
 *     tags: [USER - ContactUs]
 *     description: Returns the latest social/contact info (instagram, whatsapp, facebook, email, phone_number) for the user side.
 *     responses:
 *       200:
 *         description: Social contact info retrieved successfully
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
 *                     instagram:
 *                       type: string
 *                       example: "https://instagram.com/example"
 *                     whatsapp:
 *                       type: string
 *                       example: "https://wa.me/1234567890"
 *                     facebook:
 *                       type: string
 *                       example: "https://facebook.com/example"
 *                     email:
 *                       type: string
 *                       example: "info@example.com"
 *                     phone_number:
 *                       type: string
 *                       example: "+1234567890"
 *                 message:
 *                   type: string
 *       404:
 *         description: Contact info not found
 */
router.get('/contact-social-info', userController.getConnectSocialInfo);

module.exports = router;