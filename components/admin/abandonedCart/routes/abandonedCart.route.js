const router = require('express').Router();
const { authMiddleware } = require('../../../../library/middleware');
const abandonedCartController = require('../domain/abandonedCart.controller');

router.get('/', authMiddleware(true), abandonedCartController.listAbandonedCarts);
router.get('/summary', authMiddleware(true), abandonedCartController.getAbandonedCartSummary);
router.get('/:orderId', authMiddleware(true), abandonedCartController.getAbandonedCartByOrderId);

module.exports = router;
