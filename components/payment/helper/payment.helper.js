const axios = require("axios");
const logger = require("../../../library/logger");

/**
 * Get Viva Wallet access token
 * @returns {Promise<string>} Access token
 */
exports.getVivaAccessToken = async () => {
    try {
        const response = await axios.post(
            `${process.env.VIVA_API_BASE_URL}/connect/token`,
            {
                grant_type: "client_credentials",
                client_id: process.env.VIVA_CLIENT_ID,
                client_secret: process.env.VIVA_CLIENT_SECRET
            },
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            }
        );

        return response.data.access_token;
    } catch (error) {
        logger.error("Error getting Viva Wallet access token:", error);
        throw error;
    }
};

/**
 * Create a Viva Wallet order
 * @param {string} accessToken - Viva Wallet access token
 * @param {number} amount - Order amount
 * @returns {Promise<string>} Order code
 */
exports.createVivaOrder = async (accessToken, amount) => {
    try {
        const response = await axios.post(
            `${process.env.VIVA_API_BASE_URL}/checkout/v2/orders`,
            {
                amount: amount,
                customerTrns: "Order payment",
                merchantTrns: "Order payment",
                sourceCode: process.env.VIVA_SOURCE_CODE,
                currencyCode: process.env.VIVA_CURRENCY_CODE || "978", // Default to EUR
                paymentTimeout: 1800, // 30 minutes
                allowRecurring: false,
                maxInstallments: 0,
                disableCash: true,
                disableWallet: true,
                cardTokens: [],
                preauth: false,
                isCardPayment: true,
                installments: {
                    enabled: false
                }
            },
            {
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                }
            }
        );

        return response.data.orderCode;
    } catch (error) {
        logger.error("Error creating Viva Wallet order:", error);
        throw error;
    }
};

/**
 * Verify Viva Wallet webhook signature
 * @param {string} signature - Webhook signature
 * @param {object} payload - Webhook payload
 * @returns {boolean} Whether the signature is valid
 */
exports.verifyVivaWebhookSignature = (signature, payload) => {
    try {
        const hmac = crypto.createHmac("sha256", process.env.VIVA_WEBHOOK_SECRET);
        const computedSignature = hmac.update(JSON.stringify(payload)).digest("hex");
        return signature === computedSignature;
    } catch (error) {
        logger.error("Error verifying Viva Wallet webhook signature:", error);
        return false;
    }
}; 