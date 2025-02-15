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
<<<<<<< HEAD
router.use("/admin", require("./admin/admin.route"))
=======
router.use("/mailSubscription", require("./mailSubcription/routes/mailSubscription.route"))
>>>>>>> 43e49c16a666587de9c00b358557afe553a366ef

router.use("/email", require("../library/mailsInDev/index").emailRouter)

module.exports = router;
