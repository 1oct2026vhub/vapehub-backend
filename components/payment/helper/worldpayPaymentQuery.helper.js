const axios = require('axios');
const { createDomainLogger } = require('../../../library/logging/domainLogger');

const paymentQueryLog = createDomainLogger('payment-reconcile');

const PAYMENT_QUERIES_ACCEPT = 'application/vnd.worldpay.payment-queries-v1.hal+json';
const PAYMENTS_ACCEPT = 'application/vnd.worldpay.payments-v1.hal+json';

const buildWorldpayHeaders = (auth, accept) => ({
    Authorization: auth,
    Accept: accept,
    'User-Agent': 'VapeHub/1.0'
});

const resolveAcceptHeaderForUrl = (url) => {
    const normalized = String(url || '').toLowerCase();
    if (normalized.includes('/paymentqueries/')) {
        return PAYMENT_QUERIES_ACCEPT;
    }
    if (normalized.includes('/payments/')) {
        return PAYMENTS_ACCEPT;
    }
    return PAYMENT_QUERIES_ACCEPT;
};

/**
 * Webhook event names and Payment Queries API lastEvent values that indicate
 * a successful payable state for reconcile finalization.
 */
const SETTLED_EVENT_HINTS = new Set([
    'sentforsettlement',
    'settlementrequested',
    'settlementrequestsubmitted',
    'settlementsucceeded',
    'authorizationsucceeded',
    'salesucceeded',
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

const getWorldpayEntityReference = () => process.env.WORLDPAY_MERCHANT_ID || null;

const parseAmountFromWorldpayValue = (value) => {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const raw = value.amount != null ? Number(value.amount) : null;
    if (raw == null || Number.isNaN(raw)) {
        return null;
    }
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
    if (Array.isArray(data.payments)) {
        candidates.push(...data.payments);
    }
    if (data.payment) {
        candidates.push(data.payment);
    }
    if (data.lastEvent || data.status || data.transactionReference || data.paymentId) {
        candidates.push(data);
    }

    return candidates;
};

const collectLastEventHints = (payment) => {
    if (!payment || typeof payment !== 'object') {
        return [];
    }

    const hints = [
        payment.lastEvent,
        payment.status,
        payment.paymentStatus,
        payment.outcome,
        payment?.settlement?.status,
        payment?.authorization?.status
    ];

    if (Array.isArray(payment.events)) {
        for (const event of payment.events) {
            hints.push(event?.type, event?.name, event?.status, event?.eventName);
        }
    }

    return hints.filter(Boolean).map((v) => String(v).toLowerCase());
};

const isSettledHint = (hint) => {
    if (!hint) {
        return false;
    }

    const normalized = String(hint).toLowerCase();

    if (SETTLED_EVENT_HINTS.has(normalized)) {
        return true;
    }

    if (
        normalized.includes('settlement') &&
        (normalized.includes('submitted') ||
            normalized.includes('succeeded') ||
            normalized.includes('requested'))
    ) {
        return true;
    }

    if (normalized.includes('sentforsettlement')) {
        return true;
    }

    if (normalized.includes('authorizationsucceeded') || normalized.includes('salesucceeded')) {
        return true;
    }

    return [...SETTLED_EVENT_HINTS].some((token) => normalized.includes(token));
};

const isSettledPayment = (payment) => {
    if (!payment || typeof payment !== 'object') {
        return false;
    }

    const hints = collectLastEventHints(payment);
    return hints.some(isSettledHint);
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

const resolveWorldpayUrl = (baseUrl, href) => {
    if (!href) {
        return null;
    }
    if (href.startsWith('http://') || href.startsWith('https://')) {
        return href;
    }
    return `${baseUrl}${href.startsWith('/') ? href : `/${href}`}`;
};

const worldpayGet = async (url, headers, timeout, params) => {
    return axios({
        method: 'GET',
        url,
        params,
        timeout,
        headers,
        validateStatus: (status) => status < 500
    });
};

const buildPaymentStateResult = (payment, endpoint, transactionReference) => {
    const hints = collectLastEventHints(payment);
    const settled = isSettledPayment(payment);

    return {
        settled,
        queryUnavailable: false,
        amount: parseAmountFromWorldpayValue(payment?.value) || null,
        currency: payment?.value?.currency || payment?.currency || 'GBP',
        lastEvent: payment?.lastEvent || hints[0] || payment?.status || null,
        paymentId: payment?.paymentId || null,
        eventHints: hints,
        endpoint,
        reason: settled ? 'SETTLED' : 'NOT_SETTLED',
        raw: payment
    };
};

const logPaymentQueryResult = (transactionReference, result) => {
    paymentQueryLog.logInfo({
        event: 'worldpay_payment_query_result',
        transactionReference,
        settled: result.settled,
        queryUnavailable: result.queryUnavailable,
        reason: result.reason || null,
        lastEvent: result.lastEvent || null,
        eventHints: result.eventHints || null,
        endpoint: result.endpoint || null,
        paymentId: result.paymentId || null
    });
};

async function fetchPaymentDetail(baseUrl, auth, timeout, payment) {
    const detailHref = payment?._links?.self?.href;
    if (!detailHref) {
        return payment;
    }

    try {
        const detailUrl = resolveWorldpayUrl(baseUrl, detailHref);
        const detailHeaders = buildWorldpayHeaders(auth, resolveAcceptHeaderForUrl(detailUrl));
        const detailResponse = await worldpayGet(detailUrl, detailHeaders, timeout);

        if (detailResponse.status >= 400 || !detailResponse.data) {
            return payment;
        }

        return {
            ...payment,
            ...detailResponse.data,
            value: detailResponse.data?.value || payment?.value,
            lastEvent: detailResponse.data?.lastEvent || payment?.lastEvent
        };
    } catch (error) {
        paymentQueryLog.logError({
            event: 'worldpay_payment_detail_query_error',
            transactionReference: payment?.transactionReference || null,
            paymentId: payment?.paymentId || null,
            message: error.message
        });
        return payment;
    }
}

async function queryPaymentsByTransactionReference(baseUrl, headers, timeout, transactionReference) {
    return worldpayGet(
        `${baseUrl}/paymentQueries/payments`,
        headers,
        timeout,
        { transactionReference }
    );
}

async function queryArchivedPayments(baseUrl, headers, timeout, transactionReference, entityReference) {
    return worldpayGet(
        `${baseUrl}/paymentQueries/archivedPayments`,
        headers,
        timeout,
        { transactionReference, entityReference }
    );
}

/**
 * Query Worldpay for payment state by transaction reference (order_code).
 */
async function getWorldpayPaymentState(transactionReference) {
    const baseUrl = getWorldpayBaseUrl();
    const auth = getWorldpayAuthHeader();
    const entityReference = getWorldpayEntityReference();

    if (!baseUrl || !auth || !transactionReference) {
        const result = {
            settled: false,
            queryUnavailable: true,
            reason: 'MISSING_CONFIG_OR_REFERENCE'
        };
        logPaymentQueryResult(transactionReference, result);
        return result;
    }

    const timeout = Number(process.env.WORLDPAY_TIMEOUT_MS) || 15000;
    const headers = buildWorldpayHeaders(auth, PAYMENT_QUERIES_ACCEPT);

    let lastError = null;

    try {
        const response = await queryPaymentsByTransactionReference(
            baseUrl,
            headers,
            timeout,
            transactionReference
        );

        if (response.status >= 400) {
            lastError = {
                endpoint: 'paymentQueries',
                status: response.status,
                data: response.data
            };
        } else {
            let candidates = extractPaymentCandidates(response.data);

            if (candidates.length === 0 && entityReference) {
                const archiveResponse = await queryArchivedPayments(
                    baseUrl,
                    headers,
                    timeout,
                    transactionReference,
                    entityReference
                );

                if (archiveResponse.status < 400) {
                    candidates = extractPaymentCandidates(archiveResponse.data);
                } else if (!lastError) {
                    lastError = {
                        endpoint: 'paymentQueries:archive',
                        status: archiveResponse.status,
                        data: archiveResponse.data
                    };
                }
            }

            let payment = pickMatchingPayment(candidates, transactionReference);

            if (payment) {
                payment = await fetchPaymentDetail(baseUrl, auth, timeout, payment);
                const result = buildPaymentStateResult(payment, 'paymentQueries', transactionReference);
                logPaymentQueryResult(transactionReference, result);
                return result;
            }

            if (candidates.length === 0) {
                lastError = {
                    endpoint: 'paymentQueries',
                    status: response.status,
                    reason: 'NO_PAYMENTS_FOUND',
                    data: response.data
                };
            } else {
                const result = {
                    settled: false,
                    queryUnavailable: false,
                    reason: 'NO_MATCHING_PAYMENT',
                    lastEvent: null,
                    eventHints: [],
                    endpoint: 'paymentQueries'
                };
                logPaymentQueryResult(transactionReference, result);
                return result;
            }
        }
    } catch (error) {
        lastError = {
            endpoint: 'paymentQueries',
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

    const result = {
        settled: false,
        queryUnavailable: true,
        reason: 'QUERY_FAILED',
        lastError
    };
    logPaymentQueryResult(transactionReference, result);
    return result;
}

module.exports = {
    getWorldpayPaymentState,
    isSettledHint,
    isSettledPayment,
    collectLastEventHints
};
