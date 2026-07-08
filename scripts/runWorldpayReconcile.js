/**
 * Run Worldpay orphan-order reconcile once (same logic as the cron job).
 * Usage: npm run reconcile:worldpay
 */
require('../config/dotenv')
    .loadEnvFile()
    .then(async () => {
        const { reconcileUnpaidWorldpayOrders } = require('../cron/reconcileUnpaidWorldpayOrders');
        const summary = await reconcileUnpaidWorldpayOrders();
        console.log(JSON.stringify(summary, null, 2));
        await require('../models').sequelize.close();
        process.exit(0);
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
