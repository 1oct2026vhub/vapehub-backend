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

router.use("/email", require("../library/mailsInDev/index").emailRouter)

module.exports = router;
