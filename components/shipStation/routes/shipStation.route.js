const express = require('express');
const router = express.Router();
const { getShipStationProductById, listShipStationProducts, updateShipStationProduct, getShipStationOrderById, deleteShipStationOrderById, holdShipStationOrderUntil, restoreShipStationOrderFromHold, markShipStationOrderAsShipped, voidShipStationLabel } = require('../domain/shipStation.controller');
const authenticateJWT = require("../../auth/middleware/authMiddleware");

/**
 * @swagger
 * /api/shipstation/products/{productId}:
 *   get:
 *     summary: Get a product from ShipStation by product ID
 *     description: Retrieves detailed information about a specific product from ShipStation using the product ID
 *     tags: [ShipStation]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The system-generated identifier for the Product in ShipStation
 *         example: 12345678
 *     responses:
 *       200:
 *         description: Product retrieved successfully
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
 *                   example: Product retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     productId:
 *                       type: integer
 *                       description: The system-generated identifier for the Product
 *                       example: 12345678
 *                     sku:
 *                       type: string
 *                       description: Stock Keeping Unit
 *                       example: "1004"
 *                     name:
 *                       type: string
 *                       description: Product name
 *                       example: "Coffee Mug"
 *                     price:
 *                       type: number
 *                       description: Product price
 *                       example: 26
 *                     defaultCost:
 *                       type: number
 *                       description: Default cost of the product
 *                       example: 0
 *                     length:
 *                       type: number
 *                       description: Product length in inches
 *                       example: 3
 *                     width:
 *                       type: number
 *                       description: Product width in inches
 *                       example: 3
 *                     height:
 *                       type: number
 *                       description: Product height in inches
 *                       example: 3
 *                     weightOz:
 *                       type: number
 *                       description: Product weight in ounces
 *                       example: 26
 *                     internalNotes:
 *                       type: string
 *                       nullable: true
 *                       description: Internal notes about the product
 *                     fulfillmentSku:
 *                       type: string
 *                       description: Fulfillment SKU
 *                       example: "F1004"
 *                     createDate:
 *                       type: string
 *                       format: date-time
 *                       description: Product creation date
 *                       example: "2014-09-04T09:18:01.293"
 *                     modifyDate:
 *                       type: string
 *                       format: date-time
 *                       description: Product modification date
 *                       example: "2014-09-18T12:38:43.893"
 *                     active:
 *                       type: boolean
 *                       description: Whether the product is active
 *                       example: true
 *                     productCategory:
 *                       type: object
 *                       properties:
 *                         categoryId:
 *                           type: integer
 *                           description: Category ID
 *                           example: 9999
 *                         name:
 *                           type: string
 *                           description: Category name
 *                           example: "Door Closers"
 *                     productType:
 *                       type: string
 *                       nullable: true
 *                       description: Product type
 *                     warehouseLocation:
 *                       type: string
 *                       description: Warehouse location
 *                       example: "Bin 22"
 *                     defaultCarrierCode:
 *                       type: string
 *                       description: Default carrier code
 *                       example: "fedex"
 *                     defaultServiceCode:
 *                       type: string
 *                       description: Default service code
 *                       example: "fedex_home_delivery"
 *                     defaultPackageCode:
 *                       type: string
 *                       description: Default package code
 *                       example: "package"
 *                     defaultIntlCarrierCode:
 *                       type: string
 *                       description: Default international carrier code
 *                       example: "ups"
 *                     defaultIntlServiceCode:
 *                       type: string
 *                       description: Default international service code
 *                       example: "ups_worldwide_saver"
 *                     defaultIntlPackageCode:
 *                       type: string
 *                       description: Default international package code
 *                       example: "package"
 *                     defaultConfirmation:
 *                       type: string
 *                       description: Default confirmation type
 *                       example: "direct_signature"
 *                     defaultIntlConfirmation:
 *                       type: string
 *                       description: Default international confirmation type
 *                       example: "adult_signature"
 *                     customsDescription:
 *                       type: string
 *                       nullable: true
 *                       description: Customs description
 *                     customsValue:
 *                       type: number
 *                       nullable: true
 *                       description: Customs value
 *                     customsTariffNo:
 *                       type: string
 *                       nullable: true
 *                       description: Customs tariff number
 *                     customsCountryCode:
 *                       type: string
 *                       nullable: true
 *                       description: Customs country code
 *                     noCustoms:
 *                       type: boolean
 *                       nullable: true
 *                       description: Whether customs is not required
 *                     tags:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           tagId:
 *                             type: integer
 *                             description: Tag ID
 *                             example: 9180
 *                           name:
 *                             type: string
 *                             description: Tag name
 *                             example: "APItest"
 *                     upc:
 *                       type: string
 *                       description: Universal Product Code
 *                       example: "012345678905"
 *                     thumbnailURL:
 *                       type: string
 *                       description: URL to thumbnail image
 *                       example: "url_to_thumbnail_image"
 *       400:
 *         description: Bad request - Product ID is required
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
 *                   example: Product ID is required
 *       404:
 *         description: Product not found in ShipStation
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
 *                   example: Product not found in ShipStation
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
 *                   example: Failed to retrieve product from ShipStation
 *                 error:
 *                   type: string
 *                   example: "Error message details"
 */
router.get('/products/:productId', authenticateJWT, getShipStationProductById);

/**
 * @swagger
 * /api/shipstation/products:
 *   get:
 *     summary: List products from ShipStation
 *     description: Retrieves a paginated list of products from ShipStation with optional filtering
 *     tags: [ShipStation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *         example: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 500
 *           default: 50
 *         description: Number of products per page (max 500)
 *         example: 50
 *       - in: query
 *         name: sku
 *         schema:
 *           type: string
 *         description: Filter products by SKU (partial match)
 *         example: "1004"
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Filter products by name (partial match)
 *         example: "Coffee Mug"
 *       - in: query
 *         name: warehouseId
 *         schema:
 *           type: integer
 *         description: Filter products by warehouse ID
 *         example: 12345
 *       - in: query
 *         name: tagId
 *         schema:
 *           type: integer
 *         description: Filter products by tag ID
 *         example: 9180
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: integer
 *         description: Filter products by category ID
 *         example: 9999
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Filter products by active status
 *         example: true
 *     responses:
 *       200:
 *         description: Products retrieved successfully
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
 *                   example: Products retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       productId:
 *                         type: integer
 *                         description: The system-generated identifier for the Product
 *                         example: 12345678
 *                       sku:
 *                         type: string
 *                         description: Stock Keeping Unit
 *                         example: "1004"
 *                       name:
 *                         type: string
 *                         description: Product name
 *                         example: "Coffee Mug"
 *                       price:
 *                         type: number
 *                         description: Product price
 *                         example: 26
 *                       defaultCost:
 *                         type: number
 *                         description: Default cost of the product
 *                         example: 0
 *                       length:
 *                         type: number
 *                         description: Product length in inches
 *                         example: 3
 *                       width:
 *                         type: number
 *                         description: Product width in inches
 *                         example: 3
 *                       height:
 *                         type: number
 *                         description: Product height in inches
 *                         example: 3
 *                       weightOz:
 *                         type: number
 *                         description: Product weight in ounces
 *                         example: 26
 *                       internalNotes:
 *                         type: string
 *                         nullable: true
 *                         description: Internal notes about the product
 *                       fulfillmentSku:
 *                         type: string
 *                         description: Fulfillment SKU
 *                         example: "F1004"
 *                       createDate:
 *                         type: string
 *                         format: date-time
 *                         description: Product creation date
 *                         example: "2014-09-04T09:18:01.293"
 *                       modifyDate:
 *                         type: string
 *                         format: date-time
 *                         description: Product modification date
 *                         example: "2014-09-18T12:38:43.893"
 *                       active:
 *                         type: boolean
 *                         description: Whether the product is active
 *                         example: true
 *                       productCategory:
 *                         type: object
 *                         properties:
 *                           categoryId:
 *                             type: integer
 *                             description: Category ID
 *                             example: 9999
 *                           name:
 *                             type: string
 *                             description: Category name
 *                             example: "Door Closers"
 *                       productType:
 *                         type: string
 *                         nullable: true
 *                         description: Product type
 *                       warehouseLocation:
 *                         type: string
 *                         description: Warehouse location
 *                         example: "Bin 22"
 *                       defaultCarrierCode:
 *                         type: string
 *                         description: Default carrier code
 *                         example: "fedex"
 *                       defaultServiceCode:
 *                         type: string
 *                         description: Default service code
 *                         example: "fedex_home_delivery"
 *                       defaultPackageCode:
 *                         type: string
 *                         description: Default package code
 *                         example: "package"
 *                       defaultIntlCarrierCode:
 *                         type: string
 *                         description: Default international carrier code
 *                         example: "ups"
 *                       defaultIntlServiceCode:
 *                         type: string
 *                         description: Default international service code
 *                         example: "ups_worldwide_saver"
 *                       defaultIntlPackageCode:
 *                         type: string
 *                         description: Default international package code
 *                         example: "package"
 *                       defaultConfirmation:
 *                         type: string
 *                         description: Default confirmation type
 *                         example: "direct_signature"
 *                       defaultIntlConfirmation:
 *                         type: string
 *                         description: Default international confirmation type
 *                         example: "adult_signature"
 *                       customsDescription:
 *                         type: string
 *                         nullable: true
 *                         description: Customs description
 *                       customsValue:
 *                         type: number
 *                         nullable: true
 *                         description: Customs value
 *                       customsTariffNo:
 *                         type: string
 *                         nullable: true
 *                         description: Customs tariff number
 *                       customsCountryCode:
 *                         type: string
 *                         nullable: true
 *                         description: Customs country code
 *                       noCustoms:
 *                         type: boolean
 *                         nullable: true
 *                         description: Whether customs is not required
 *                       tags:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             tagId:
 *                               type: integer
 *                               description: Tag ID
 *                               example: 9180
 *                             name:
 *                               type: string
 *                               description: Tag name
 *                               example: "APItest"
 *                       upc:
 *                         type: string
 *                         description: Universal Product Code
 *                         example: "012345678905"
 *                       thumbnailURL:
 *                         type: string
 *                         description: URL to thumbnail image
 *                         example: "url_to_thumbnail_image"
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
 *                   example: Failed to retrieve products from ShipStation
 *                 error:
 *                   type: string
 *                   example: "Error message details"
 */
router.get('/products', authenticateJWT, listShipStationProducts);

/**
 * @swagger
 * /api/shipstation/products/{productId}:
 *   put:
 *     summary: Update a product in ShipStation
 *     description: Updates an existing product in ShipStation. This call does not support partial updates - the entire resource must be provided in the request body.
 *     tags: [ShipStation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The system-generated identifier for the Product in ShipStation
 *         example: 123456789
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - sku
 *               - name
 *               - price
 *               - active
 *             properties:
 *               aliases:
 *                 type: string
 *                 nullable: true
 *                 description: Product aliases
 *               productId:
 *                 type: integer
 *                 description: The system-generated identifier for the Product
 *                 example: 123456789
 *               sku:
 *                 type: string
 *                 description: Stock Keeping Unit
 *                 example: "BEAU-000"
 *               name:
 *                 type: string
 *                 description: Product name
 *                 example: "Beautiful"
 *               price:
 *                 type: number
 *                 description: Product price
 *                 example: 0
 *               defaultCost:
 *                 type: number
 *                 nullable: true
 *                 description: Default cost of the product
 *               length:
 *                 type: number
 *                 nullable: true
 *                 description: Product length in inches
 *               width:
 *                 type: number
 *                 nullable: true
 *                 description: Product width in inches
 *               height:
 *                 type: number
 *                 nullable: true
 *                 description: Product height in inches
 *               weightOz:
 *                 type: number
 *                 nullable: true
 *                 description: Product weight in ounces
 *               internalNotes:
 *                 type: string
 *                 nullable: true
 *                 description: Internal notes about the product
 *               fulfillmentSku:
 *                 type: string
 *                 nullable: true
 *                 description: Fulfillment SKU
 *               active:
 *                 type: boolean
 *                 description: Whether the product is active
 *                 example: true
 *               productCategory:
 *                 type: object
 *                 nullable: true
 *                 properties:
 *                   categoryId:
 *                     type: integer
 *                     description: Category ID
 *                     example: 9999
 *                   name:
 *                     type: string
 *                     description: Category name
 *                     example: "Door Closers"
 *               productType:
 *                 type: string
 *                 nullable: true
 *                 description: Product type
 *               warehouseLocation:
 *                 type: string
 *                 nullable: true
 *                 description: Warehouse location
 *                 example: "Bin 22"
 *               defaultCarrierCode:
 *                 type: string
 *                 nullable: true
 *                 description: Default carrier code
 *                 example: "fedex"
 *               defaultServiceCode:
 *                 type: string
 *                 nullable: true
 *                 description: Default service code
 *                 example: "fedex_home_delivery"
 *               defaultPackageCode:
 *                 type: string
 *                 nullable: true
 *                 description: Default package code
 *                 example: "package"
 *               defaultIntlCarrierCode:
 *                 type: string
 *                 nullable: true
 *                 description: Default international carrier code
 *                 example: "ups"
 *               defaultIntlServiceCode:
 *                 type: string
 *                 nullable: true
 *                 description: Default international service code
 *                 example: "ups_worldwide_saver"
 *               defaultIntlPackageCode:
 *                 type: string
 *                 nullable: true
 *                 description: Default international package code
 *                 example: "package"
 *               defaultConfirmation:
 *                 type: string
 *                 nullable: true
 *                 description: Default confirmation type
 *                 example: "direct_signature"
 *               defaultIntlConfirmation:
 *                 type: string
 *                 nullable: true
 *                 description: Default international confirmation type
 *                 example: "adult_signature"
 *               customsDescription:
 *                 type: string
 *                 nullable: true
 *                 description: Customs description
 *               customsValue:
 *                 type: number
 *                 nullable: true
 *                 description: Customs value
 *               customsTariffNo:
 *                 type: string
 *                 nullable: true
 *                 description: Customs tariff number
 *               customsCountryCode:
 *                 type: string
 *                 nullable: true
 *                 description: Customs country code
 *               noCustoms:
 *                 type: boolean
 *                 nullable: true
 *                 description: Whether customs is not required
 *               tags:
 *                 type: array
 *                 nullable: true
 *                 items:
 *                   type: object
 *                   properties:
 *                     tagId:
 *                       type: integer
 *                       description: Tag ID
 *                       example: 9180
 *                     name:
 *                       type: string
 *                       description: Tag name
 *                       example: "APItest"
 *               upc:
 *                 type: string
 *                 nullable: true
 *                 description: Universal Product Code
 *                 example: "012345678905"
 *               thumbnailURL:
 *                 type: string
 *                 nullable: true
 *                 description: URL to thumbnail image
 *                 example: "url_to_thumbnail_image"
 *           example:
 *             aliases: null
 *             productId: 123456789
 *             sku: "BEAU-000"
 *             name: "Beautiful"
 *             price: 0
 *             defaultCost: null
 *             length: null
 *             width: null
 *             height: null
 *             weightOz: null
 *             internalNotes: null
 *             fulfillmentSku: null
 *             active: true
 *             productCategory: null
 *             productType: null
 *             warehouseLocation: null
 *             defaultCarrierCode: null
 *             defaultServiceCode: null
 *             defaultPackageCode: null
 *             defaultIntlCarrierCode: null
 *             defaultIntlServiceCode: null
 *             defaultIntlPackageCode: null
 *             defaultConfirmation: null
 *             defaultIntlConfirmation: null
 *             customsDescription: null
 *             customsValue: null
 *             customsTariffNo: null
 *             customsCountryCode: null
 *             noCustoms: null
 *             tags: null
 *             upc: null
 *             thumbnailURL: null
 *     responses:
 *       200:
 *         description: Product updated successfully
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
 *                   example: Product updated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     message:
 *                       type: string
 *                       example: "The requested product has been updated"
 *       400:
 *         description: Bad request - Product ID or data is required, or invalid data provided
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
 *                   example: Product data is required
 *                 error:
 *                   type: string
 *                   example: "Error message details"
 *       404:
 *         description: Product not found in ShipStation
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
 *                   example: Product not found in ShipStation
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
 *                   example: Failed to update product in ShipStation
 *                 error:
 *                   type: string
 *                   example: "Error message details"
 */
router.put('/products/:productId', authenticateJWT, updateShipStationProduct);

/**
 * @swagger
 * /api/shipstation/orders/{orderId}:
 *   get:
 *     summary: Get an order from ShipStation by order ID
 *     description: Retrieve a single order from ShipStation using the order ID
 *     tags: [ShipStation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The system-generated identifier for the Order in ShipStation
 *         example: 94113592
 *     responses:
 *       200:
 *         description: Order retrieved successfully
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
 *                   example: Order retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     orderId:
 *                       type: integer
 *                       description: The system-generated identifier for the Order
 *                       example: 94113592
 *                     orderNumber:
 *                       type: string
 *                       description: The order number
 *                       example: "TEST-ORDER-API-DOCS"
 *                     orderKey:
 *                       type: string
 *                       description: Unique order key
 *                       example: "0f6bec18-9-4771-83aa-f392d84f4c74"
 *                     orderDate:
 *                       type: string
 *                       format: date-time
 *                       description: Date when the order was placed
 *                       example: "2015-06-29T08:46:27.0000000"
 *                     createDate:
 *                       type: string
 *                       format: date-time
 *                       description: Date when the order was created in ShipStation
 *                       example: "2015-07-16T14:00:34.8230000"
 *                     modifyDate:
 *                       type: string
 *                       format: date-time
 *                       description: Date when the order was last modified
 *                       example: "2015-09-08T11:03:12.3800000"
 *                     paymentDate:
 *                       type: string
 *                       format: date-time
 *                       description: Date when payment was received
 *                       example: "2015-06-29T08:46:27.0000000"
 *                     shipByDate:
 *                       type: string
 *                       format: date-time
 *                       description: Date by which the order should be shipped
 *                       example: "2015-07-05T00:00:00.0000000"
 *                     orderStatus:
 *                       type: string
 *                       description: Current status of the order
 *                       example: "awaiting_shipment"
 *                     customerId:
 *                       type: integer
 *                       description: Customer ID
 *                       example: 37701499
 *                     customerUsername:
 *                       type: string
 *                       description: Customer username/email
 *                       example: "customer@example.com"
 *                     customerEmail:
 *                       type: string
 *                       description: Customer email address
 *                       example: "customer@example.com"
 *                     billTo:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                           description: Billing address name
 *                           example: "The President"
 *                         company:
 *                           type: string
 *                           nullable: true
 *                           description: Company name
 *                         street1:
 *                           type: string
 *                           nullable: true
 *                           description: Street address line 1
 *                         street2:
 *                           type: string
 *                           nullable: true
 *                           description: Street address line 2
 *                         street3:
 *                           type: string
 *                           nullable: true
 *                           description: Street address line 3
 *                         city:
 *                           type: string
 *                           nullable: true
 *                           description: City
 *                         state:
 *                           type: string
 *                           nullable: true
 *                           description: State/province
 *                         postalCode:
 *                           type: string
 *                           nullable: true
 *                           description: Postal code
 *                         country:
 *                           type: string
 *                           nullable: true
 *                           description: Country
 *                         phone:
 *                           type: string
 *                           nullable: true
 *                           description: Phone number
 *                         residential:
 *                           type: boolean
 *                           nullable: true
 *                           description: Whether this is a residential address
 *                         addressVerified:
 *                           type: string
 *                           nullable: true
 *                           description: Address verification status
 *                     shipTo:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                           description: Shipping address name
 *                           example: "The President"
 *                         company:
 *                           type: string
 *                           nullable: true
 *                           description: Company name
 *                           example: "US Govt"
 *                         street1:
 *                           type: string
 *                           nullable: true
 *                           description: Street address line 1
 *                           example: "1600 Pennsylvania Ave"
 *                         street2:
 *                           type: string
 *                           nullable: true
 *                           description: Street address line 2
 *                           example: "Oval Office"
 *                         street3:
 *                           type: string
 *                           nullable: true
 *                           description: Street address line 3
 *                         city:
 *                           type: string
 *                           nullable: true
 *                           description: City
 *                           example: "Washington"
 *                         state:
 *                           type: string
 *                           nullable: true
 *                           description: State/province
 *                           example: "DC"
 *                         postalCode:
 *                           type: string
 *                           nullable: true
 *                           description: Postal code
 *                           example: "20500"
 *                         country:
 *                           type: string
 *                           nullable: true
 *                           description: Country
 *                           example: "US"
 *                         phone:
 *                           type: string
 *                           nullable: true
 *                           description: Phone number
 *                           example: "555-555-5555"
 *                         residential:
 *                           type: boolean
 *                           nullable: true
 *                           description: Whether this is a residential address
 *                           example: false
 *                         addressVerified:
 *                           type: string
 *                           nullable: true
 *                           description: Address verification status
 *                           example: "Address validation warning"
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           orderItemId:
 *                             type: integer
 *                             description: Order item ID
 *                             example: 128836912
 *                           lineItemKey:
 *                             type: string
 *                             nullable: true
 *                             description: Line item key
 *                             example: "vd08-MSLbtx"
 *                           sku:
 *                             type: string
 *                             description: Product SKU
 *                             example: "ABC123"
 *                           name:
 *                             type: string
 *                             description: Product name
 *                             example: "Test item #1"
 *                           imageUrl:
 *                             type: string
 *                             nullable: true
 *                             description: Product image URL
 *                           weight:
 *                             type: object
 *                             properties:
 *                               value:
 *                                 type: number
 *                                 description: Weight value
 *                                 example: 24
 *                               units:
 *                                 type: string
 *                                 description: Weight units
 *                                 example: "ounces"
 *                           quantity:
 *                             type: integer
 *                             description: Quantity ordered
 *                             example: 2
 *                           unitPrice:
 *                             type: number
 *                             description: Unit price
 *                             example: 99.99
 *                           taxAmount:
 *                             type: number
 *                             nullable: true
 *                             description: Tax amount
 *                           shippingAmount:
 *                             type: number
 *                             nullable: true
 *                             description: Shipping amount
 *                           warehouseLocation:
 *                             type: string
 *                             nullable: true
 *                             description: Warehouse location
 *                             example: "Aisle 1, Bin 7"
 *                           options:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 name:
 *                                   type: string
 *                                   description: Option name
 *                                   example: "Size"
 *                                 value:
 *                                   type: string
 *                                   description: Option value
 *                                   example: "Large"
 *                           productId:
 *                             type: integer
 *                             nullable: true
 *                             description: Product ID
 *                             example: 7239919
 *                           fulfillmentSku:
 *                             type: string
 *                             nullable: true
 *                             description: Fulfillment SKU
 *                           adjustment:
 *                             type: boolean
 *                             description: Whether this is an adjustment item
 *                             example: false
 *                           upc:
 *                             type: string
 *                             nullable: true
 *                             description: UPC code
 *                           createDate:
 *                             type: string
 *                             format: date-time
 *                             description: Item creation date
 *                             example: "2015-07-16T14:00:34.823"
 *                           modifyDate:
 *                             type: string
 *                             format: date-time
 *                             description: Item modification date
 *                             example: "2015-07-16T14:00:34.823"
 *                     orderTotal:
 *                       type: number
 *                       description: Total order amount
 *                       example: 194.43
 *                     amountPaid:
 *                       type: number
 *                       description: Amount paid by customer
 *                       example: 218.73
 *                     taxAmount:
 *                       type: number
 *                       description: Total tax amount
 *                       example: 5
 *                     shippingAmount:
 *                       type: number
 *                       description: Shipping cost
 *                       example: 10
 *                     customerNotes:
 *                       type: string
 *                       nullable: true
 *                       description: Customer notes
 *                       example: "Please ship as soon as possible!"
 *                     internalNotes:
 *                       type: string
 *                       nullable: true
 *                       description: Internal notes
 *                       example: "Customer called and would like to upgrade shipping"
 *                     gift:
 *                       type: boolean
 *                       description: Whether this is a gift order
 *                       example: true
 *                     giftMessage:
 *                       type: string
 *                       nullable: true
 *                       description: Gift message
 *                       example: "Thank you!"
 *                     paymentMethod:
 *                       type: string
 *                       description: Payment method used
 *                       example: "Credit Card"
 *                     requestedShippingService:
 *                       type: string
 *                       nullable: true
 *                       description: Requested shipping service
 *                       example: "Priority Mail"
 *                     carrierCode:
 *                       type: string
 *                       nullable: true
 *                       description: Carrier code
 *                       example: "fedex"
 *                     serviceCode:
 *                       type: string
 *                       nullable: true
 *                       description: Service code
 *                       example: "fedex_home_delivery"
 *                     packageCode:
 *                       type: string
 *                       nullable: true
 *                       description: Package code
 *                       example: "package"
 *                     confirmation:
 *                       type: string
 *                       nullable: true
 *                       description: Confirmation type
 *                       example: "delivery"
 *                     shipDate:
 *                       type: string
 *                       nullable: true
 *                       description: Ship date
 *                       example: "2015-07-02"
 *                     holdUntilDate:
 *                       type: string
 *                       nullable: true
 *                       description: Date to hold until
 *                     weight:
 *                       type: object
 *                       properties:
 *                         value:
 *                           type: number
 *                           description: Weight value
 *                           example: 48
 *                         units:
 *                           type: string
 *                           description: Weight units
 *                           example: "ounces"
 *                     dimensions:
 *                       type: object
 *                       properties:
 *                         units:
 *                           type: string
 *                           description: Dimension units
 *                           example: "inches"
 *                         length:
 *                           type: number
 *                           description: Package length
 *                           example: 7
 *                         width:
 *                           type: number
 *                           description: Package width
 *                           example: 5
 *                         height:
 *                           type: number
 *                           description: Package height
 *                           example: 6
 *                     insuranceOptions:
 *                       type: object
 *                       properties:
 *                         provider:
 *                           type: string
 *                           description: Insurance provider
 *                           example: "carrier"
 *                         insureShipment:
 *                           type: boolean
 *                           description: Whether shipment is insured
 *                           example: true
 *                         insuredValue:
 *                           type: number
 *                           description: Insured value
 *                           example: 200
 *                     internationalOptions:
 *                       type: object
 *                       properties:
 *                         contents:
 *                           type: string
 *                           nullable: true
 *                           description: Contents description
 *                         customsItems:
 *                           type: array
 *                           nullable: true
 *                           description: Customs items
 *                         nonDelivery:
 *                           type: string
 *                           nullable: true
 *                           description: Non-delivery option
 *                     advancedOptions:
 *                       type: object
 *                       properties:
 *                         warehouseId:
 *                           type: integer
 *                           nullable: true
 *                           description: Warehouse ID
 *                           example: 24079
 *                         nonMachinable:
 *                           type: boolean
 *                           description: Whether package is non-machinable
 *                           example: false
 *                         saturdayDelivery:
 *                           type: boolean
 *                           description: Whether Saturday delivery is requested
 *                           example: false
 *                         containsAlcohol:
 *                           type: boolean
 *                           description: Whether package contains alcohol
 *                           example: false
 *                         mergedOrSplit:
 *                           type: boolean
 *                           description: Whether order is merged or split
 *                           example: false
 *                         mergedIds:
 *                           type: array
 *                           items:
 *                             type: integer
 *                           description: IDs of merged orders
 *                         parentId:
 *                           type: integer
 *                           nullable: true
 *                           description: Parent order ID
 *                         storeId:
 *                           type: integer
 *                           nullable: true
 *                           description: Store ID
 *                           example: 26815
 *                         customField1:
 *                           type: string
 *                           nullable: true
 *                           description: Custom field 1
 *                           example: "Custom data that you can add to an order"
 *                         customField2:
 *                           type: string
 *                           nullable: true
 *                           description: Custom field 2
 *                         customField3:
 *                           type: string
 *                           nullable: true
 *                           description: Custom field 3
 *                         source:
 *                           type: string
 *                           nullable: true
 *                           description: Order source
 *                           example: "Webstore"
 *                         billToParty:
 *                           type: string
 *                           nullable: true
 *                           description: Bill to party
 *                         billToAccount:
 *                           type: string
 *                           nullable: true
 *                           description: Bill to account
 *                         billToPostalCode:
 *                           type: string
 *                           nullable: true
 *                           description: Bill to postal code
 *                         billToCountryCode:
 *                           type: string
 *                           nullable: true
 *                           description: Bill to country code
 *                     tagIds:
 *                       type: array
 *                       nullable: true
 *                       items:
 *                         type: integer
 *                       description: Tag IDs associated with the order
 *                     userId:
 *                       type: integer
 *                       nullable: true
 *                       description: User ID assigned to the order
 *                     externallyFulfilled:
 *                       type: boolean
 *                       description: Whether order is externally fulfilled
 *                       example: false
 *                     externallyFulfilledBy:
 *                       type: string
 *                       nullable: true
 *                       description: External fulfillment provider
 *                     externallyFulfilledById:
 *                       type: integer
 *                       nullable: true
 *                       description: External fulfillment provider ID
 *                       example: 12345
 *                     externallyFulfilledByName:
 *                       type: string
 *                       nullable: true
 *                       description: External fulfillment provider name
 *                       example: "Example Fulfillment Provider Name"
 *       400:
 *         description: Bad request - Order ID is required
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
 *                   example: Order ID is required
 *       404:
 *         description: Order not found in ShipStation
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
 *                   example: Order not found in ShipStation
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
 *                   example: Failed to retrieve order from ShipStation
 *                 error:
 *                   type: string
 *                   example: "Error message details"
 */
router.get('/orders/:orderId', authenticateJWT, getShipStationOrderById);

/**
 * @swagger
 * /api/shipstation/orders/{orderId}:
 *   delete:
 *     summary: Delete an order from ShipStation
 *     description: Removes order from ShipStation's UI. Note this is a "soft" delete action so the order will still exist in the database, but will be set to inactive.
 *     tags: [ShipStation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The system-generated identifier for the Order in ShipStation
 *         example: 94113592
 *     responses:
 *       200:
 *         description: Order deleted successfully
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
 *                   example: Order deleted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     message:
 *                       type: string
 *                       example: "The requested order has been deleted."
 *       400:
 *         description: Bad request - Order ID is required, or order cannot be deleted
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
 *                   example: Order ID is required
 *                 error:
 *                   type: string
 *                   example: "Error message details"
 *       404:
 *         description: Order not found in ShipStation
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
 *                   example: Order not found in ShipStation
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
 *                   example: Failed to delete order from ShipStation
 *                 error:
 *                   type: string
 *                   example: "Error message details"
 */
router.delete('/orders/:orderId', authenticateJWT, deleteShipStationOrderById);

/**
 * @swagger
 * /api/shipstation/orders/{orderId}/hold:
 *   post:
 *     summary: Hold an order until a specific date
 *     description: This method will change the status of the given order to On Hold status until the date you have specified, when the status will automatically change to Awaiting Shipment status.
 *     tags: [ShipStation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The system-generated identifier for the Order in ShipStation
 *         example: 1072467
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - holdUntilDate
 *             properties:
 *               holdUntilDate:
 *                 type: string
 *                 format: date
 *                 pattern: '^\d{4}-\d{2}-\d{2}$'
 *                 description: Date when order is moved from on_hold status to awaiting_shipment (YYYY-MM-DD format)
 *                 example: "2014-12-01"
 *           example:
 *             holdUntilDate: "2014-12-01"
 *     responses:
 *       200:
 *         description: Order held successfully
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
 *                   example: Order held successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     message:
 *                       type: string
 *                       example: "Order held successfully."
 *       400:
 *         description: Bad request - Order ID or holdUntilDate is required, invalid date format, or date is in the past
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
 *                   example: holdUntilDate is required
 *                 error:
 *                   type: string
 *                   example: "Error message details"
 *       404:
 *         description: Order not found in ShipStation
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
 *                   example: Order not found in ShipStation
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
 *                   example: Failed to hold order in ShipStation
 *                 error:
 *                   type: string
 *                   example: "Error message details"
 */
router.post('/orders/:orderId/hold', authenticateJWT, holdShipStationOrderUntil);

/**
 * @swagger
 * /api/shipstation/orders/{orderId}/restore:
 *   post:
 *     summary: Restore an order from hold status
 *     description: This method will change the status of the given order from On Hold status to Awaiting Shipment status. This endpoint is used when a holdUntilDate is attached to an order.
 *     tags: [ShipStation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The system-generated identifier for the Order in ShipStation
 *         example: 1234567
 *     responses:
 *       200:
 *         description: Order restored from hold successfully
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
 *                   example: Order restored from hold successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     message:
 *                       type: string
 *                       example: "The requested order has been restored"
 *       400:
 *         description: Bad request - Order ID is required, or order is not on hold
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
 *                   example: Order ID is required
 *                 error:
 *                   type: string
 *                   example: "Error message details"
 *       404:
 *         description: Order not found in ShipStation
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
 *                   example: Order not found in ShipStation
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
 *                   example: Failed to restore order from hold in ShipStation
 *                 error:
 *                   type: string
 *                   example: "Error message details"
 */
router.post('/orders/:orderId/restore', authenticateJWT, restoreShipStationOrderFromHold);

/**
 * @swagger
 * /api/shipstation/orders/{orderId}/mark-shipped:
 *   post:
 *     summary: Mark an order as shipped
 *     description: Marks an order as Shipped without creating a label in ShipStation. This is useful when you have shipped an order outside of ShipStation and want to update the order status.
 *     tags: [ShipStation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The system-generated identifier for the Order in ShipStation
 *         example: 93348442
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - carrierCode
 *             properties:
 *               carrierCode:
 *                 type: string
 *                 description: Code of the carrier that is marked as having shipped the order
 *                 example: "usps"
 *               shipDate:
 *                 type: string
 *                 format: date
 *                 pattern: '^\d{4}-\d{2}-\d{2}$'
 *                 description: Date order was shipped (YYYY-MM-DD format). Cannot be in the future.
 *                 example: "2014-04-01"
 *               trackingNumber:
 *                 type: string
 *                 description: Tracking number of shipment
 *                 example: "913492493294329421"
 *               notifyCustomer:
 *                 type: boolean
 *                 description: Specifies whether the customer should be notified of the shipment. Default value is false.
 *                 example: true
 *               notifySalesChannel:
 *                 type: boolean
 *                 description: Specifies whether the sales channel should be notified of the shipment. Default value is false.
 *                 example: true
 *           example:
 *             carrierCode: "usps"
 *             shipDate: "2014-04-01"
 *             trackingNumber: "913492493294329421"
 *             notifyCustomer: true
 *             notifySalesChannel: true
 *     responses:
 *       200:
 *         description: Order marked as shipped successfully
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
 *                   example: Order marked as shipped successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     orderId:
 *                       type: integer
 *                       description: The order ID that was marked as shipped
 *                       example: 123456789
 *                     orderNumber:
 *                       type: string
 *                       description: The order number
 *                       example: "ABC123"
 *       400:
 *         description: Bad request - Order ID or carrierCode is required, invalid date format, or date is in the future
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
 *                   example: carrierCode is required
 *                 error:
 *                   type: string
 *                   example: "Error message details"
 *       404:
 *         description: Order not found in ShipStation
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
 *                   example: Order not found in ShipStation
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
 *                   example: Failed to mark order as shipped in ShipStation
 *                 error:
 *                   type: string
 *                   example: "Error message details"
 */
router.post('/orders/:orderId/mark-shipped', authenticateJWT, markShipStationOrderAsShipped);

/**
 * @swagger
 * /api/shipstation/shipments/void-label:
 *   post:
 *     summary: Void a shipment label
 *     description: Voids the specified label by shipmentId. This is useful when you need to cancel a shipment label that has been created but not yet used.
 *     tags: [ShipStation]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - shipmentId
 *             properties:
 *               shipmentId:
 *                 type: integer
 *                 description: ID of the shipment to void
 *                 example: 12345
 *           example:
 *             shipmentId: 12345
 *     responses:
 *       200:
 *         description: Shipment label voided successfully
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
 *                   example: Shipment label voided successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     approved:
 *                       type: boolean
 *                       description: Whether the void request was approved
 *                       example: true
 *                     message:
 *                       type: string
 *                       description: Response message from ShipStation
 *                       example: "Label voided successfully"
 *       400:
 *         description: Bad request - shipmentId is required or invalid
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
 *                   example: shipmentId is required
 *                 error:
 *                   type: string
 *                   example: "Error message details"
 *       404:
 *         description: Shipment not found in ShipStation
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
 *                   example: Shipment not found in ShipStation
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
 *                   example: Failed to void shipment label in ShipStation
 *                 error:
 *                   type: string
 *                   example: "Error message details"
 */
router.post('/shipments/void-label', authenticateJWT, voidShipStationLabel);



module.exports = router; 