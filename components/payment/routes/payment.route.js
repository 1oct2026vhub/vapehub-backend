const router = require("express").Router();
const vivaWalletRoutes = require("./vivaWallet.route");
const worldpayRoutes = require("./worldpay.route");

// Mount Viva Wallet routes
router.use("/viva", vivaWalletRoutes);

// Mount Worldpay routes
router.use("/worldpay", worldpayRoutes);

module.exports = router; 