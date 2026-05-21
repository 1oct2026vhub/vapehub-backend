const sendEmail = require('../sendEmail');
const logger = require('../logger');

const TRANSIENT_SMTP_CODES = new Set(['EPROTOCOL', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ECONNRESET']);

// SMTP 4xx is a transient class per RFC 5321 — safe to retry once.
// Covers SendGrid/Postfix "421 Timeout. Try talking faster" bursts, brief
// pool stalls, and most TLS-renegotiation hiccups.
function isTransientSmtpError(err) {
    const responseCode = err?.responseCode ?? err?.error?.responseCode;
    const code = err?.code ?? err?.error?.code;
    if (typeof responseCode === 'number' && responseCode >= 400 && responseCode < 500) {
        return true;
    }
    return typeof code === 'string' && TRANSIENT_SMTP_CODES.has(code);
}

const RETRY_BACKOFF_MS = Math.max(0, Number(process.env.EMAIL_RETRY_BACKOFF_MS || 500));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendWithTransientRetry(to, type, context) {
    try {
        return await sendEmail(to, type, context, []);
    } catch (err) {
        if (!isTransientSmtpError(err)) throw err;
        logger.warn({
            to,
            type,
            responseCode: err?.responseCode ?? err?.error?.responseCode,
            code: err?.code ?? err?.error?.code
        }, 'Transient SMTP error; retrying once');
        if (RETRY_BACKOFF_MS > 0) await sleep(RETRY_BACKOFF_MS);
        return sendEmail(to, type, context, []);
    }
}

/**
 * Send one promotional newsletter to a subscriber (same behaviour as legacy inline loop).
 * Replaces `${first_name}`, `{{email}}`, and `{{emailEncoded}}` in subject and HTML body.
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
        const subscriberEmail = String(subscriber.email ?? '');
        const emailEncoded =
            subscriberEmail !== '' ? encodeURIComponent(subscriberEmail) : '';
        const personalize = (str) =>
            String(str)
                .replace(/\$\{first_name\}/g, firstName)
                .replace(/\{\{email\}\}/g, subscriberEmail)
                .replace(/\{\{emailEncoded\}\}/g, emailEncoded);
        const personalizedSubject = personalize(effectiveSubject);
        const personalizedHtml = personalize(effectiveHtml);
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
            await sendWithTransientRetry(subscriber.email, primaryEmailType, context);
        } catch (sendError) {
            const shouldFallbackToPromotional =
                primaryEmailType === 'PROMOTIONAL_NEWSLETTER' &&
                (sendError?.message === 'Unknown email type' ||
                    sendError?.error?.message === 'Unknown email type');

            if (!shouldFallbackToPromotional) {
                throw sendError;
            }

            logger.warn(`Falling back to PROMOTIONAL email type for ${subscriber.email} due to missing PROMOTIONAL_NEWSLETTER config`);
            await sendWithTransientRetry(subscriber.email, 'PROMOTIONAL', context);
        }

        logger.info(`Promotional email sent successfully to: ${subscriber.email}`);
        return { success: true, email: subscriber.email };
    } catch (error) {
        logger.error(`Failed to send promotional email to ${subscriber.email}:`, error);
        return { success: false, email: subscriber.email, error: error.message };
    }
}

module.exports = { sendPromotionalToSubscriber };
