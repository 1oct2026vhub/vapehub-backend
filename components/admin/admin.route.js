// Your router setup
const router = require("express").Router();

router.get("/", (req, res) => {
    res.send("Vape Hub restricted requests");
});

router.post("/", (req, res) => {
    res.send("Vape Hub restricted requests");
});

// This should be under the correct path
router.use('/auth', require('./auth/routes/auth.route'));
router.use('/user', require('./user/routes/user.route'));
router.use('/customer', require('./customer/routes/customer.route'));
router.use('/category', require('./category/routes/category.route'));
router.use('/brand', require('./brand/routes/brand.route'));
router.use('/products', require('./product/routes/product.route'));
router.use('/attributes', require('./productAttributes/routes/attribute.route'));
router.use('/attribute-terms', require('./productAttributes/routes/attributeTerms.route'));
router.use('/stock-management', require('./product/routes/stockManagement.route'));
router.use('/product-variants', require('./product/routes/productVariant.route'));
router.use('/shipping-methods', require('./shippingMethod/routes/shippingMethod.route'));
router.use('/banners', require('./banner/routes/banner.route'));
router.use('/carousels', require('./carousels/routes/carousel.route'));
router.use('/blog', require('./blog/routes/blog.route'));
router.use('/orders', require('./order/routes/order.route'));
router.use('/transactions', require('./transaction/routes/transaction.route'));
module.exports = router;
