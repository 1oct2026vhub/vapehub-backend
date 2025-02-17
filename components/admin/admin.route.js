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

module.exports = router;
