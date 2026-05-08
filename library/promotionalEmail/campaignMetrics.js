const EMAIL_CAMPAIGN_FAILED_SAMPLE_LIMIT = 100;

const resolveCampaignStatus = (successful, failed) => {
    if (failed === 0) return 'completed';
    if (successful === 0) return 'failed';
    return 'partial_failed';
};

const buildErrorSummary = (failedEmails = []) => {
    const summaryMap = new Map();
    failedEmails.forEach((failedEmail) => {
        const message = String(failedEmail?.error || 'Unknown error').slice(0, 200);
        summaryMap.set(message, (summaryMap.get(message) || 0) + 1);
    });
    return [...summaryMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([message, count]) => ({ message, count }));
};

module.exports = {
    EMAIL_CAMPAIGN_FAILED_SAMPLE_LIMIT,
    resolveCampaignStatus,
    buildErrorSummary
};
