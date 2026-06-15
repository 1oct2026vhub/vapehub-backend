const axios = require('axios');
const orderPlacementLogger = require('../../../utils/orderPlacementLogger');

const WORLDPAY_PAYMENT_PAGES_ACCEPT = 'application/vnd.worldpay.payment_pages-v1.hal+json';

const getWorldpayTimeoutMs = () => Number(process.env.WORLDPAY_TIMEOUT_MS) || 15000;

const extractWorldpayPaymentUrl = (data) => {
    if (!data) return null;
    return (
        data.url ||
        data._links?.payment?.href ||
        data._links?.['payment-pages:redirect']?.href ||
        null
    );
};

const generateTransactionReference = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 16; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

const parseWorldpayErrorMessage = (error) => {
    if (error?.code === 'ECONNABORTED') {
        return 'Payment provider timed out; please try again.';
    }

    const data = error?.response?.data;

    if (typeof data === 'string') {
        return data;
    }

    if (data && typeof data === 'object') {
        return (
            data.message ||
            data.error?.message ||
            data.error_description ||
            JSON.stringify(data)
        );
    }

    return error?.message || 'Failed to process payment with Worldpay';
};

const serializeWorldpayErrorForLog = (error) => ({
    name: error?.name || null,
    message: error?.message || null,
    code: error?.code || null,
    axios: error?.isAxiosError
        ? {
            method: error?.config?.method || null,
            url: error?.config?.url || null,
            timeout: error?.config?.timeout || null,
            response_status: error?.response?.status || null,
            response_data: error?.response?.data || null
        }
        : null
});

const buildWorldpayResultUrls = (orderCode, calculatedTotal) => {
    const frontendBase = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    const query = `orderCode=${orderCode}&transactionId=${orderCode}&amount=${calculatedTotal}&currency=GBP`;
    const base = `${frontendBase}/payment-failed?${query}`;

    return {
        successURL: `${frontendBase}/payment-success?${query}`,
        failureURL: base,
        errorURL: base,
        cancelURL: base,
        expiryURL: base
    };
};

const createWorldpayPaymentPage = async ({
    transactionReference,
    calculatedTotal,
    billingAddrForPayment,
    countryCode,
    logContext = {}
}) => {
    const WORLDPAY_USERNAME = process.env.WORLDPAY_USERNAME;
    const WORLDPAY_PASSWORD = process.env.WORLDPAY_PASSWORD;
    const timeout = getWorldpayTimeoutMs();

    orderPlacementLogger.logWorldpay({
        event: 'worldpay_payment_pages_request',
        transactionReference,
        amount: Math.round(calculatedTotal * 100),
        currency: 'GBP',
        timeoutMs: timeout,
        ...logContext
    });

    try {
        const response = await axios({
            method: 'POST',
            url: `${process.env.WORLDPAY_URL}/payment_pages`,
            timeout,
            headers: {
                'Content-Type': WORLDPAY_PAYMENT_PAGES_ACCEPT,
                'Accept': WORLDPAY_PAYMENT_PAGES_ACCEPT,
                'User-Agent': 'VapeHub/1.0',
                'Authorization': `Basic ${Buffer.from(`${WORLDPAY_USERNAME}:${WORLDPAY_PASSWORD}`).toString('base64')}`
            },
            data: {
                transactionReference,
                merchant: { entity: process.env.WORLDPAY_MERCHANT_ID },
                narrative: { line1: 'VapeHub Order' },
                value: {
                    currency: 'GBP',
                    amount: Math.round(calculatedTotal * 100)
                },
                description: 'VapeHub Order',
                billingAddressName: billingAddrForPayment.first_name,
                billingAddress: {
                    address1: billingAddrForPayment.address_line_1,
                    address2: billingAddrForPayment.address_line_2 || '',
                    address3: billingAddrForPayment.region,
                    postalCode: billingAddrForPayment.post_code,
                    city: billingAddrForPayment.city,
                    state: billingAddrForPayment.region,
                    countryCode
                },
                resultURLs: buildWorldpayResultUrls(transactionReference, calculatedTotal)
            }
        });

        const paymentUrl = extractWorldpayPaymentUrl(response.data);

        orderPlacementLogger.logWorldpay({
            event: 'worldpay_payment_pages_response',
            transactionReference,
            httpStatus: response.status,
            paymentUrlPresent: Boolean(paymentUrl),
            ...logContext
        });

        if (!response.data) {
            throw new Error('No response data from Worldpay');
        }

        if (!paymentUrl) {
            throw new Error('Worldpay did not return a payment URL');
        }

        return {
            paymentUrl,
            response
        };
    } catch (error) {
        orderPlacementLogger.logWorldpay({
            event: 'worldpay_payment_pages_error',
            transactionReference,
            ...serializeWorldpayErrorForLog(error),
            ...logContext
        });

        throw new Error(parseWorldpayErrorMessage(error));
    }
};

const completeWorldpayCheckout = async (orderResult) => {
    if (!orderResult?.worldpayCheckoutRequest) {
        return orderResult;
    }

    const { worldpayCheckoutRequest, ...rest } = orderResult;
    const { paymentUrl } = await createWorldpayPaymentPage(worldpayCheckoutRequest);

    return {
        ...rest,
        worldpay_url: paymentUrl
    };
};

module.exports = {
    extractWorldpayPaymentUrl,
    generateTransactionReference,
    createWorldpayPaymentPage,
    completeWorldpayCheckout,
    parseWorldpayErrorMessage,
    serializeWorldpayErrorForLog,
    getWorldpayTimeoutMs
};
