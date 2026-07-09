/**
 * Query Worldpay payment state for a transaction reference (order_code).
 * Usage: npm run query:worldpay -- LP99D2U14BO9YYWF
 */
require('../config/dotenv')
    .loadEnvFile()
    .then(async () => {
        const transactionReference = process.argv[2];

        if (!transactionReference) {
            console.error('Usage: npm run query:worldpay -- <transactionReference>');
            process.exit(1);
        }

        const { getWorldpayPaymentState } = require('../components/payment/helper/worldpayPaymentQuery.helper');
        const result = await getWorldpayPaymentState(transactionReference);
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
    })
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
