const RECONCILE_ELIGIBLE_STATUSES = ['pending', 'cancel'];

const RECONCILE_MAX_AGE_DAYS = 7;
const DEFAULT_RECONCILE_MIN_AGE_MINUTES = 2;
const DEFAULT_RECONCILE_CRON = '*/5 * * * *';
const RECONCILE_ABANDONED_STATUS = 'reconcile_abandoned';
const RECONCILE_EXHAUSTED_LABEL = 'Payment abandoned after reconcile retries';

const AUTOMATED_PAYMENT_SOURCES = new Set([
    'webhook:settlement',
    'cron:webhook-retry',
    'cron:reconcile'
]);

function isWorldpayPaymentFinalizeEligible(order) {
    if (!order) {
        return false;
    }
    return RECONCILE_ELIGIBLE_STATUSES.includes(order.status);
}

function isAutomatedPaymentSource(source) {
    return AUTOMATED_PAYMENT_SOURCES.has(source);
}

function requiresPaymentFinalizeEligibility(source) {
    return isAutomatedPaymentSource(source);
}

module.exports = {
    RECONCILE_ELIGIBLE_STATUSES,
    RECONCILE_MAX_AGE_DAYS,
    DEFAULT_RECONCILE_MIN_AGE_MINUTES,
    DEFAULT_RECONCILE_CRON,
    RECONCILE_ABANDONED_STATUS,
    RECONCILE_EXHAUSTED_LABEL,
    AUTOMATED_PAYMENT_SOURCES,
    isWorldpayPaymentFinalizeEligible,
    isAutomatedPaymentSource,
    requiresPaymentFinalizeEligibility
};
