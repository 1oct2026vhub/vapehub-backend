const router = require("express").Router();
const vivaWalletRoutes = require("./vivaWallet.route");

// Mount Viva Wallet routes
router.use("/viva", vivaWalletRoutes);

module.exports = router; 