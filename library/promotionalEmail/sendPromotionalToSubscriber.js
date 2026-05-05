const sendEmail = require('../sendEmail');
const logger = require('../logger');

/**
 * Send one promotional newsletter to a subscriber (same behaviour as legacy inline loop).
 * @param {{ id: number, email: string, user_id: number|null }} subscriber
 * @param {Map<number,string>} firstNameByUserId
 * @param {object} campaignFields from buildCampaignPayload / parseCampaignPayload
 */
async function sendPromotionalToSubscriber(subscriber, firstNameByUserId, campaignFields) {
    const {
        effectiveSubject,
        effectiveHtml,
        highlightText,
        ctaText,
        ctaUrl,
        finalImages,
        templateId
    } = campaignFields;

    try {
        const primaryEmailType = 'PROMOTIONAL_NEWSLETTER';
        const rawFirstName = firstNameByUserId.get(subscriber.user_id) || '';
        const firstName = rawFirstName
            ? rawFirstName.charAt(0).toUpperCase() + rawFirstName.slice(1)
            : '';
        const personalizedSubject = String(effectiveSubject).replace(/\$\{first_name\}/g, firstName);
        const personalizedHtml = String(effectiveHtml).replace(/\$\{first_name\}/g, firstName);
        const context = {
            subject: personalizedSubject,
            content: personalizedHtml,
            highlightText,
            ctaText,
            ctaUrl,
            email: subscriber.email,
            images: finalImages,
            templateId
        };

        try {
            await sendEmail(subscriber.email, primaryEmailType, context, []);
        } catch (sendError) {
            const shouldFallbackToPromotional =
                primaryEmailType === 'PROMOTIONAL_NEWSLETTER' &&
                (sendError?.message === 'Unknown email type' ||
                    sendError?.error?.message === 'Unknown email type');

            if (!shouldFallbackToPromotional) {
                throw sendError;
            }

            logger.warn(`Falling back to PROMOTIONAL email type for ${subscriber.email} due to missing PROMOTIONAL_NEWSLETTER config`);
            await sendEmail(subscriber.email, 'PROMOTIONAL', context, []);
        }

        logger.info(`Promotional email sent successfully to: ${subscriber.email}`);
        return { success: true, email: subscriber.email };
    } catch (error) {
        logger.error(`Failed to send promotional email to ${subscriber.email}:`, error);
        return { success: false, email: subscriber.email, error: error.message };
    }
}

module.exports = { sendPromotionalToSubscriber };
