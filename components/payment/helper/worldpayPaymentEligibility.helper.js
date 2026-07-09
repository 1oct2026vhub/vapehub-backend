const RECONCILE_ELIGIBLE_STATUSES = ['pending', 'cancel'];

const RECONCILE_MAX_AGE_DAYS = 7;
const DEFAULT_RECONCILE_MIN_AGE_MINUTES = 2;
const DEFAULT_RECONCILE_CRON = '*/5 * * * *';

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
    AUTOMATED_PAYMENT_SOURCES,
    isWorldpayPaymentFinalizeEligible,
    isAutomatedPaymentSource,
    requiresPaymentFinalizeEligibility
};
