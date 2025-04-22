const router = require("express").Router();
const vivaWalletRoutes = require("./vivaWallet.route");
const vivaWalletController = require("../domain/vivaWallet.controller");


// Mount Viva Wallet routes
router.use("/viva", vivaWalletRoutes);

module.exports = router; 