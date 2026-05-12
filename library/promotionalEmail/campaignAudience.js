/**
 * Audience classification + campaign key generation for promotional sends.
 * Lives outside the controller so merges cannot duplicate `const` helpers.
 */

function resolveAudienceType({ sendToAll, groupId, selectedEmails }) {
    if (sendToAll) return 'all';
    if (groupId != null) return 'group';
    if (selectedEmails && selectedEmails.length > 0) return 'selected';
    return 'selected';
}

function buildCampaignKey() {
    return `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = { resolveAudienceType, buildCampaignKey };
