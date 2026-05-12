/**
 * Serializable snapshot for async workers (SQS/Lambda) to send without the original HTTP body.
 */
function buildCampaignPayload({
    effectiveSubject,
    effectiveHtml,
    highlightText,
    ctaText,
    ctaUrl,
    finalImages,
    templateId
}) {
    return {
        version: 1,
        effectiveSubject: String(effectiveSubject),
        effectiveHtml: String(effectiveHtml),
        highlightText: highlightText ?? null,
        ctaText: ctaText ?? null,
        ctaUrl: ctaUrl ?? null,
        finalImages: Array.isArray(finalImages) ? finalImages : [],
        templateId: templateId || null
    };
}

function serializeCampaignPayload(payload) {
    return JSON.stringify(payload);
}

function parseCampaignPayload(payloadJson) {
    if (!payloadJson || typeof payloadJson !== 'string') {
        throw new Error('Campaign payload is missing');
    }
    const data = JSON.parse(payloadJson);
    if (!data || data.version !== 1 || !data.effectiveSubject || !data.effectiveHtml) {
        throw new Error('Invalid campaign payload');
    }
    return data;
}

module.exports = {
    buildCampaignPayload,
    serializeCampaignPayload,
    parseCampaignPayload
};
