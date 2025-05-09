// Your router setup
const router = require("express").Router();

router.get("/", (req, res) => {
    res.send("Hello World! from GET");
});

router.post("/", (req, res) => {
    res.send("Hello World from POST!");
});

// This should be under the correct path
router.use('/auth', require('./auth/routes/auth.route'));
router.use("/brands", require("./brand/routes/brand.route"))
router.use("/category", require("./category/routes/category.route"))
router.use("/product", require("./product/routes/product.route"))
router.use("/faqs", require("./FAQ/routes/faqs.route"))
router.use("/cart", require("./Cart/routes/cart.route"))
router.use("/admin", require("./admin/admin.route"))
router.use("/mailSubscription", require("./mailSubcription/routes/mailSubscription.route"))
router.use("/testimonials", require("./testimonial/routes/testimonial.route"))
router.use("/blogs", require("./blog/routes/blog.route"))
router.use("/users", require("./user/routes/user.route"))
router.use("/home", require("./homePage/routes/homePage.route"))
router.use("/checkout", require("./checkout/routes/checkout.route"))
router.use("/order", require("./order/routes/order.route"))
router.use("/shipping-method", require("./shippingMethod/routes/shippingMethod.route"))
router.use("/email", require("../library/mailsInDev/index").emailRouter)
router.use("/notifications", require("./notification/routes/notification.route"))
router.use("/payment", require("./payment/routes/payment.route"))
router.use("/menu", require("./menu/routes/menu.route"))
router.use("/footer", require("./footer/routes/footer.route"))
router.use("/review", require("./review/routes/review.route"))
router.use("/seo", require("./seo/routes/seo.route"))
module.exports = router;
