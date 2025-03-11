const router = require("express").Router();
const { validateRequest } = require("../../../../utils/validationMiddleware");
const validationRules = require("../helper/customer.validator");
const { authMiddleware } = require('../../../../library/middleware');
const customerController = require('../domain/customer.controller');

/**
 * @swagger
 * /api/admin/customer:
 *   get:
 *     summary: List all users with filtering, sorting, and pagination
 *     tags: 
 *       - ADMIN - Customer
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Search users by first name, last name, email, phone, or gender
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [createdAt, first_name, last_name, email]
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
 *         name: blocked
 *         schema:
 *           type: boolean
 *         description: Filter users by blocked status
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
    customerController.listUsers
);

/**
 * @swagger
 * /api/admin/customer/{id}:
 *   delete:
 *     summary: Delete a user (soft delete)
 *     tags: 
 *       - ADMIN - Customer
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
router.delete("/:id", [authMiddleware(true), validateRequest(validationRules.userIDValidation)], customerController.deleteUser);

/**
 * @swagger
 * /api/admin/customer/{id}/restore:
 *   put:
 *     summary: Restore a soft-deleted user
 *     tags: 
 *       - ADMIN - Customer
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
router.put("/:id/restore", [authMiddleware(true), validateRequest(validationRules.userIDValidation)], customerController.restoreUser);



/**
 * @swagger
 * /api/admin/customer/{id}/block:
 *   put:
 *     summary: Block a customer
 *     tags: 
 *       - ADMIN - Customer
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the customer to block
 *     responses:
 *       200:
 *         description: Customer blocked successfully
 */
router.put("/:id/block", [authMiddleware(true), validateRequest(validationRules.userIDValidation)], customerController.blockUser);

/**
 * @swagger
 * /api/admin/customer/{id}/unblock:
 *   put:
 *     summary: Unblock a customer
 *     tags: 
 *       - ADMIN - Customer
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the customer to unblock
 *     responses:
 *       200:
 *         description: Customer unblocked successfully
 */
router.put("/:id/unblock",  [authMiddleware(true), validateRequest(validationRules.userIDValidation)], customerController.unblockUser);

/**
 * @swagger
 * /api/admin/customer/{id}:
 *   get:
 *     summary: Get user details with order information
 *     tags: 
 *       - ADMIN - Customer
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the user to retrieve
 *     responses:
 *       200:
 *         description: User details retrieved successfully
 *       404:
 *         description: User not found
 */
router.get("/:id", [authMiddleware(true), validateRequest(validationRules.userIDValidation)], customerController.getUserDetails);

module.exports = router;

