
const router = require('express').Router();
const { validateRequest } = require('../../../../utils/validationMiddleware');
const { createAttributeValidator, updateAttributeValidator, deleteAttributeValidator, getAttributeValidator, getAttributesValidator } = require('../helper/attribute.validatior');
const attributeController = require('../domain/attribute.controller');
const { authMiddleware } = require('../../../../library/middleware');

/**
 * @swagger
 * /api/admin/attributes:
 *   post:
 *     summary: Create a new product attribute
 *     tags:
 *       - ADMIN - Attributes
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
 *               - slug
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the attribute
 *                 example: "Color"
 *               slug:
 *                 type: string
 *                 description: URL-friendly version of the name
 *                 example: "color"
 *               description:
 *                 type: string
 *                 description: Detailed description of the attribute
 *                 example: "Product color variations"
 *               type:
 *                 type: string
 *                 enum: [select, text, number, textarea, date]
 *                 default: select
 *                 description: Type of the attribute
 *               sort_order:
 *                 type: string
 *                 enum: [custom, name, name_num, id]
 *                 default: custom
 *                 description: Sort order for attribute terms
 *     responses:
 *       201:
 *         description: Attribute created successfully
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
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     name:
 *                       type: string
 *                       example: "Color"
 *                     slug:
 *                       type: string
 *                       example: "color"
 *                     description:
 *                       type: string
 *                       example: "Product color variations"
 *                     type:
 *                       type: string
 *                       example: "select"
 *                     sort_order:
 *                       type: string
 *                       example: "custom"
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                     updated_by:
 *                       type: integer
 *                       example: 1
 *                 message:
 *                   type: string
 *                   example: "Attribute created successfully"
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Attribute with this slug already exists"
 *                 message:
 *                   type: string
 *                   example: "Duplicate attribute slug"
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       403:
 *         description: Forbidden - User doesn't have required permissions
 *       500:
 *         description: Internal server error
 */
router.post('/', 
    [ 
        authMiddleware(true), 
        validateRequest(createAttributeValidator)
    ],
    attributeController.createAttribute
);

/**
 * @swagger
 * /api/admin/attributes/{id}:
 *   put:
 *     summary: Update an existing product attribute
 *     tags:
 *       - ADMIN - Attributes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Attribute ID
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the attribute
 *                 example: "Updated Color"
 *               slug:
 *                 type: string
 *                 description: URL-friendly version of the name
 *                 example: "updated-color"
 *               description:
 *                 type: string
 *                 description: Detailed description of the attribute
 *                 example: "Updated product color variations"
 *               type:
 *                 type: string
 *                 enum: [select, text, number, textarea, date]
 *                 description: Type of the attribute
 *                 example: "select"
 *               sort_order:
 *                 type: string
 *                 enum: [custom, name, name_num, id]
 *                 description: Sort order for attribute terms
 *                 example: "name"
 *     responses:
 *       200:
 *         description: Attribute updated successfully
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
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     name:
 *                       type: string
 *                       example: "Updated Color"
 *                     slug:
 *                       type: string
 *                       example: "updated-color"
 *                     description:
 *                       type: string
 *                       example: "Updated product color variations"
 *                     type:
 *                       type: string
 *                       example: "select"
 *                     sort_order:
 *                       type: string
 *                       example: "name"
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                     updated_by:
 *                       type: integer
 *                       example: 1
 *                 message:
 *                   type: string
 *                   example: "Attribute updated successfully"
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Attribute with this slug already exists"
 *                 message:
 *                   type: string
 *                   example: "Duplicate slug"
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       403:
 *         description: Forbidden - User doesn't have required permissions
 *       404:
 *         description: Attribute not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Attribute not found"
 *                 message:
 *                   type: string
 *                   example: "Not found"
 *       500:
 *         description: Internal server error
 */
router.put('/:id', 
    [ 
        authMiddleware(true), 
        validateRequest(updateAttributeValidator)
    ],
    attributeController.updateAttribute
);

/**
 * @swagger
 * /api/admin/attributes/{id}:
 *   delete:
 *     summary: Soft delete a product attribute
 *     description: Soft deletes an attribute if it's not being used in any product variants and has no terms
 *     tags:
 *       - ADMIN - Attributes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Attribute ID to delete
 *         example: 1
 *     responses:
 *       200:
 *         description: Attribute deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: null
 *                   example: null
 *                 message:
 *                   type: string
 *                   example: "Attribute deleted successfully"
 *       400:
 *         description: Cannot delete attribute due to existing relationships
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Cannot delete attribute that has terms. Please delete all terms first."
 *                 message:
 *                   type: string
 *                   example: "Deletion restricted"
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       403:
 *         description: Forbidden - User doesn't have required permissions
 *       404:
 *         description: Attribute not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Attribute not found"
 *                 message:
 *                   type: string
 *                   example: "Not found"
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', 
    [ 
        authMiddleware(true), 
        validateRequest(deleteAttributeValidator)
    ],
    attributeController.deleteAttribute
);

/**
 * @swagger
 * /api/admin/attributes/{id}/restore:
 *   patch:
 *     summary: Restore a soft-deleted product attribute
 *     description: Restores a previously deleted attribute if the slug is still unique
 *     tags:
 *       - ADMIN - Attributes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Attribute ID to restore
 *         example: 1
 *     responses:
 *       200:
 *         description: Attribute restored successfully
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
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     name:
 *                       type: string
 *                       example: "Color"
 *                     slug:
 *                       type: string
 *                       example: "color"
 *                     description:
 *                       type: string
 *                       example: "Product color variations"
 *                     type:
 *                       type: string
 *                       example: "select"
 *                     sort_order:
 *                       type: string
 *                       example: "custom"
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                     updated_by:
 *                       type: integer
 *                       example: 1
 *                 message:
 *                   type: string
 *                   example: "Attribute restored successfully"
 *       400:
 *         description: Cannot restore attribute
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Cannot restore attribute. An attribute with this slug already exists."
 *                 message:
 *                   type: string
 *                   example: "Duplicate slug"
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       403:
 *         description: Forbidden - User doesn't have required permissions
 *       404:
 *         description: Attribute not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Attribute not found"
 *                 message:
 *                   type: string
 *                   example: "Not found"
 *       500:
 *         description: Internal server error
 */
router.patch('/:id/restore', 
    [ 
        authMiddleware(true), 
        validateRequest(deleteAttributeValidator)
    ],
    attributeController.restoreAttribute
);

/**
 * @swagger
 * /api/admin/attributes/{id}:
 *   get:
 *     summary: Get a product attribute by ID
 *     description: Retrieves detailed information about a specific attribute including its terms
 *     tags:
 *       - ADMIN - Attributes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Attribute ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Attribute retrieved successfully
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
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     name:
 *                       type: string
 *                       example: "Color"
 *                     slug:
 *                       type: string
 *                       example: "color"
 *                     description:
 *                       type: string
 *                       example: "Product color variations"
 *                     type:
 *                       type: string
 *                       example: "select"
 *                     sort_order:
 *                       type: string
 *                       example: "custom"
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                     terms:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           name:
 *                             type: string
 *                             example: "Red"
 *                           slug:
 *                             type: string
 *                             example: "red"
 *                           description:
 *                             type: string
 *                             example: "Red color variant"
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                           updated_at:
 *                             type: string
 *                             format: date-time
 *                     updatedByUser:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 1
 *                         first_name:
 *                           type: string
 *                           example: "John"
 *                         last_name:
 *                           type: string
 *                           example: "Doe"
 *                         email:
 *                           type: string
 *                           example: "john@example.com"
 *                 message:
 *                   type: string
 *                   example: "Attribute retrieved successfully"
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       403:
 *         description: Forbidden - User doesn't have required permissions
 *       404:
 *         description: Attribute not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Attribute not found"
 *                 message:
 *                   type: string
 *                   example: "Not found"
 *       500:
 *         description: Internal server error
 */
router.get('/:id', 
    [ 
        authMiddleware(true), 
        validateRequest(getAttributeValidator)
    ],
    attributeController.getAttribute
);

/**
 * @swagger
 * /api/admin/attributes:
 *   get:
 *     summary: Get list of product attributes
 *     description: Retrieves a paginated list of attributes with filtering and sorting options
 *     tags:
 *       - ADMIN - Attributes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [id, name, slug, type, sort_order, created_at, updated_at]
 *           default: created_at
 *         description: Field to sort the attributes by
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort order (ascending or descending)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 10
 *         description: Number of records per page
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of records to skip for pagination
 *       - in: query
 *         name: keyword
 *         schema:
 *           type: string
 *         description: Search attributes by name, slug, or description
 *       - in: query
 *         name: show_deleted
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include soft-deleted attributes
 *     responses:
 *       200:
 *         description: Attributes retrieved successfully
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
 *                     attributes:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           name:
 *                             type: string
 *                             example: "Color"
 *                           slug:
 *                             type: string
 *                             example: "color"
 *                           description:
 *                             type: string
 *                             example: "Product color variations"
 *                           type:
 *                             type: string
 *                             example: "select"
 *                           sort_order:
 *                             type: string
 *                             example: "custom"
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                           updated_at:
 *                             type: string
 *                             format: date-time
 *                           deleted_at:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                           terms:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: integer
 *                                   example: 1
 *                                 name:
 *                                   type: string
 *                                   example: "Red"
 *                           updatedByUser:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 1
 *                               first_name:
 *                                 type: string
 *                                 example: "John"
 *                               last_name:
 *                                 type: string
 *                                 example: "Doe"
 *                               email:
 *                                 type: string
 *                                 example: "john@example.com"
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: integer
 *                           example: 50
 *                         per_page:
 *                           type: integer
 *                           example: 10
 *                         current_page:
 *                           type: integer
 *                           example: 1
 *                         total_pages:
 *                           type: integer
 *                           example: 5
 *                         has_more:
 *                           type: boolean
 *                           example: true
 *                 message:
 *                   type: string
 *                   example: "Attributes retrieved successfully"
 *       400:
 *         description: Invalid request parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: "Invalid sort_by parameter"
 *                 message:
 *                   type: string
 *                   example: "Invalid request parameters"
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       403:
 *         description: Forbidden - User doesn't have required permissions
 *       500:
 *         description: Internal server error
 */
router.get('/', 
    [ 
        authMiddleware(true), 
        validateRequest(getAttributesValidator)
    ],
    attributeController.getAttributes
);

module.exports = router;