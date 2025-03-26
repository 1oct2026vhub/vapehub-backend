const router = require("express").Router();
const { validateRequest } = require("../../../../utils/validationMiddleware");
const validationRules = require("../helper/user.validator");
const { authMiddleware } = require('../../../../library/middleware');
const userController = require('../domain/user.controller');

/**
 * @swagger
 * /api/admin/user/roles:
 *   get:
 *     summary: Retrieve a list of roles
 *     tags:
 *       - ADMIN - Role
 *     parameters:
 *       - in: query
 *         name: deleted
 *         required: false
 *         schema:
 *           type: boolean
 *         description: Filter roles based on deleted status
 *     responses:
 *       200:
 *         description: A list of roles
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized access
 */
router.get(
    "/roles",
    [authMiddleware(true), validateRequest(validationRules.roleValidation)],
    userController.roles
);


/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       required:
 *         - first_name
 *         - last_name
 *         - email
 *         - password
 *         - phone
 *         - roleId
 *       properties:
 *         first_name:
 *           type: string
 *           description: First name of the user
 *         last_name:
 *           type: string
 *           description: Last name of the user
 *         email:
 *           type: string
 *           description: Email address of the user
 *         password:
 *           type: string
 *           description: User's password
 *         phone:
 *           type: string
 *           description: Phone number of the user
 *         roleId:
 *           type: integer
 *           description: Role ID assigned to the user
 *         gender:
 *           type: string
 *           enum: [male, female, other]
 *           description: Gender of the user
 *         dob:
 *           type: string
 *           format: date
 *           description: Date of birth of the user
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     UpdateUser:
 *       type: object
 *       required:
 *         - first_name
 *         - last_name
 *         - password
 *         - phone
 *         - roleId
 *       properties:
 *         first_name:
 *           type: string
 *           description: First name of the user
 *         last_name:
 *           type: string
 *           description: Last name of the user
 *         password:
 *           type: string
 *           description: User's password
 *         phone:
 *           type: string
 *           description: Phone number of the user
 *         roleId:
 *           type: integer
 *           description: Role ID assigned to the user
 *         gender:
 *           type: string
 *           enum: [male, female, other]
 *           description: Gender of the user
 *         dob:
 *           type: string
 *           format: date
 *           description: Date of birth of the user
 */

/**
 * @swagger
 * /api/admin/user:
 *   post:
 *     summary: Create a new user
 *     tags:
 *       - ADMIN - User
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/User'
 *     responses:
 *       201:
 *         description: User created successfully
 *       400:
 *         description: Email already exists
 *       401:
 *         description: Unauthorized access
 */
router.post(
    "/",
    [authMiddleware(true), validateRequest(validationRules.userValidationRules)],
    userController.createUser
);
  


/**
 * @swagger
 * /api/admin/user/{id}:
 *   put:
 *     summary: Update an existing user
 *     tags: 
 *       - ADMIN - User
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUser'
 *     responses:
 *       200:
 *         description: User updated successfully
 *       404:
 *         description: User not found
 */
router.put(
    "/:id",
    [authMiddleware(true), validateRequest(validationRules.userUpdateValidationRules)],
    userController.updateUser
);

/**
 * @swagger
 * /api/admin/user:
 *   get:
 *     summary: List all users with filtering, sorting, and pagination
 *     tags: 
 *       - ADMIN - User
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number for pagination (default - 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of records per page (default - 10)
 *       - in: query
 *         name: roleId
 *         schema:
 *           type: integer
 *         description: Filter users by role ID
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search users by Id, first name, last name, email, phone, or gender
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [id, first_name, last_name, email, phone, gender, createdAt, updatedAt]
 *         description: Sort users by field (default - createdAt)
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *         description: Order of sorting (default - DESC)
 *       - in: query
 *         name: deleted
 *         schema:
 *           type: boolean
 *         description: Filter users based on soft delete flag (true = only deleted users, false = only active users)
 *       - in: query
 *         name: verified
 *         schema:
 *           type: string
 *           enum: [all, true, false]
 *         description: Filter users by email verification status
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *       400:
 *         description: Validation error
 */

router.get(
    "/",
    [authMiddleware(true), validateRequest(validationRules.userListValidationRules)],
    userController.listUsers
);

/**
 * @swagger
 * /api/admin/user/{id}:
 *   delete:
 *     summary: Delete a user (soft delete)
 *     tags: 
 *       - ADMIN - User
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to delete
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       404:
 *         description: User not found
 */
router.delete("/:id", [authMiddleware(true), validateRequest(validationRules.restoreUserValidation)], userController.deleteUser);

/**
 * @swagger
 * /api/admin/user/{id}/restore:
 *   put:
 *     summary: Restore a soft-deleted user
 *     tags: 
 *       - ADMIN - User
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to restore
 *     responses:
 *       200:
 *         description: User restored successfully
 *       404:
 *         description: User not found
 *       400:
 *         description: Validation error
 */
router.put("/:id/restore", [authMiddleware(true), validateRequest(validationRules.restoreUserValidation)], userController.restoreUser);

module.exports = router;

