const router = require('express').Router();
const { authMiddleware } = require('../../../../library/middleware');
const { validateRequest } = require('../../../../utils/validationMiddleware');
const abandonedCartController = require('../domain/abandonedCart.controller');
const {
  listAbandonedCartsValidation,
  summaryValidation,
  orderIdValidation
} = require('../helper/abandonedCart.validator');

router.get(
  '/',
  [authMiddleware(true), validateRequest(listAbandonedCartsValidation)],
  abandonedCartController.listAbandonedCarts
);
router.get(
  '/summary',
  [authMiddleware(true), validateRequest(summaryValidation)],
  abandonedCartController.getAbandonedCartSummary
);
router.get(
  '/:orderId',
  [authMiddleware(true), validateRequest(orderIdValidation)],
  abandonedCartController.getAbandonedCartByOrderId
);

module.exports = router;
