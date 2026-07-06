const axios = require('axios');
const { createDomainLogger } = require('../../../library/logging/domainLogger');

const paymentQueryLog = createDomainLogger('payment-reconcile');

const SETTLED_EVENT_HINTS = new Set([
    'sentforsettlement',
    'settlementrequested',
    'settled',
    'authorized',
    'captured',
    'success'
]);

const getWorldpayAuthHeader = () => {
    const username = process.env.WORLDPAY_USERNAME;
    const password = process.env.WORLDPAY_PASSWORD;
    if (!username || !password) {
        return null;
    }
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
};

const getWorldpayBaseUrl = () => (process.env.WORLDPAY_URL || '').replace(/\/$/, '');

const parseAmountFromWorldpayValue = (value) => {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const raw = value.amount != null ? Number(value.amount) : null;
    if (raw == null || Number.isNaN(raw)) {
        return null;
    }
    // Worldpay amounts are typically minor units (pence).
    return raw >= 100 ? raw / 100 : raw;
};

const extractPaymentCandidates = (data) => {
    if (!data || typeof data !== 'object') {
        return [];
    }

    const candidates = [];

    if (Array.isArray(data._embedded?.payments)) {
        candidates.push(...data._embedded.payments);
    }
    if (data.payment) {
        candidates.push(data.payment);
    }
    if (data.lastEvent || data.status || data.transactionReference) {
        candidates.push(data);
    }

    return candidates;
};

const isSettledPayment = (payment) => {
    if (!payment || typeof payment !== 'object') {
        return false;
    }

    const hints = [
        payment.lastEvent,
        payment.status,
        payment.paymentStatus,
        payment.outcome,
        payment?.settlement?.status
    ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());

    return hints.some((hint) => {
        if (SETTLED_EVENT_HINTS.has(hint)) {
            return true;
        }
        return [...SETTLED_EVENT_HINTS].some((token) => hint.includes(token));
    });
};

const pickMatchingPayment = (candidates, transactionReference) => {
    const ref = String(transactionReference || '').toUpperCase();
    const matched = candidates.find((payment) => {
        const paymentRef = String(
            payment?.transactionReference || payment?.reference || ''
        ).toUpperCase();
        return paymentRef && paymentRef === ref;
    });

    return matched || candidates[0] || null;
};

/**
 * Query Worldpay for payment state by transaction reference (order_code).
 */
async function getWorldpayPaymentState(transactionReference) {
    const baseUrl = getWorldpayBaseUrl();
    const auth = getWorldpayAuthHeader();

    if (!baseUrl || !auth || !transactionReference) {
        return {
            settled: false,
            queryUnavailable: true,
            reason: 'MISSING_CONFIG_OR_REFERENCE'
        };
    }

    const timeout = Number(process.env.WORLDPAY_TIMEOUT_MS) || 15000;
    const headers = {
        Authorization: auth,
        Accept: 'application/vnd.worldpay.payment-queries-v1.hal+json, application/vnd.worldpay.payments-v1.hal+json',
        'User-Agent': 'VapeHub/1.0'
    };

    const endpoints = [
        {
            name: 'paymentQueries',
            url: `${baseUrl}/paymentQueries/payments`,
            params: { transactionReference }
        },
        {
            name: 'payments',
            url: `${baseUrl}/payments/${encodeURIComponent(transactionReference)}`,
            params: undefined
        }
    ];

    let lastError = null;

    for (const endpoint of endpoints) {
        try {
            const response = await axios({
                method: 'GET',
                url: endpoint.url,
                params: endpoint.params,
                timeout,
                headers,
                validateStatus: (status) => status < 500
            });

            if (response.status === 404) {
                continue;
            }

            if (response.status >= 400) {
                lastError = {
                    endpoint: endpoint.name,
                    status: response.status,
                    data: response.data
                };
                continue;
            }

            const candidates = extractPaymentCandidates(response.data);
            const payment = pickMatchingPayment(candidates, transactionReference);
            const settled = isSettledPayment(payment);

            return {
                settled,
                queryUnavailable: false,
                amount: parseAmountFromWorldpayValue(payment?.value) || null,
                currency: payment?.value?.currency || payment?.currency || 'GBP',
                lastEvent: payment?.lastEvent || payment?.status || null,
                endpoint: endpoint.name,
                raw: payment || response.data
            };
        } catch (error) {
            lastError = {
                endpoint: endpoint.name,
                message: error.message,
                status: error?.response?.status || null,
                data: error?.response?.data || null
            };
            paymentQueryLog.logError({
                event: 'worldpay_payment_query_error',
                transactionReference,
                ...lastError
            });
        }
    }

    return {
        settled: false,
        queryUnavailable: true,
        reason: 'QUERY_FAILED',
        lastError
    };
}

module.exports = {
    getWorldpayPaymentState
};
