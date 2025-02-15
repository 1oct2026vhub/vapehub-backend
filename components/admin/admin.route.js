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

module.exports = router;
