const { MailSubscriptionSettings, MailSubscription, NewsletterGroupUser } = require('../../models');
const logger = require('../logger');
const {
    uploadPromotionalImages,
    validatePromotionalImages,
    generateCampaignId
} = require('../../components/admin/mailSubscriptionSettings/helper/imageUpload.helper');
const { loadNewsletterTemplateById } = require('../newsletterTemplates/newsletterTemplateStorage');

/**
 * Shared validation + audience resolution for sync and async promotional sends.
 * @returns {{ ok: true, data: object } | { ok: false, res: { status: number, message: string, errors?: any } }}
 */
async function preparePromotionalCampaign(req) {
    const {
        subject,
        content,
        highlightText,
        ctaText,
        ctaUrl,
        selectedEmails = [],
        sendToAll = false,
        groupId = null,
        frequency = null,
        imageUrls = [],
        templateId
    } = req.body;

    let finalImages = [];

    if (req.files && req.files.length > 0) {
        const validation = validatePromotionalImages(req.files);
        if (!validation.isValid) {
            return {
                ok: false,
                res: { status: 400, message: validation.errors.join(', ') }
            };
        }

        const uploadCampaignId = generateCampaignId();
        const uploadedImages = await uploadPromotionalImages(req.files, uploadCampaignId);
        finalImages = finalImages.concat(uploadedImages);
    }

    if (imageUrls && imageUrls.length > 0) {
        finalImages = finalImages.concat(imageUrls);
    }

    if (!subject && !templateId) {
        return { ok: false, res: { status: 400, message: 'Either subject or templateId must be provided' } };
    }

    if (!content && !templateId) {
        return { ok: false, res: { status: 400, message: 'Either content or templateId must be provided' } };
    }

    let effectiveSubject = subject || null;
    let effectiveHtml = content || null;

    if (templateId) {
        try {
            const template = await loadNewsletterTemplateById(templateId);

            if (!effectiveSubject && template.subject) {
                effectiveSubject = template.subject;
            }

            if (template.html) {
                effectiveHtml = template.html;
            }
        } catch (err) {
            const status = err.statusCode || 500;
            return {
                ok: false,
                res: { status, message: err.message || 'Failed to load template', errors: err }
            };
        }
    }

    if (!effectiveSubject) {
        return { ok: false, res: { status: 400, message: 'Subject is required (either in request or template)' } };
    }

    if (!effectiveHtml) {
        return { ok: false, res: { status: 400, message: 'Email HTML content is empty even after applying template' } };
    }

    let subscribers = [];

    if (sendToAll) {
        const whereClause = { deletedAt: null, subscribed: true };

        if (frequency) {
            await MailSubscriptionSettings.findAll({
                where: {
                    email_frequency: frequency,
                    status: true
                }
            });
        }

        const SUBSCRIBER_BATCH_SIZE = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
            const batch = await MailSubscription.findAll({
                where: whereClause,
                attributes: ['id', 'email', 'user_id'],
                limit: SUBSCRIBER_BATCH_SIZE,
                offset,
                order: [['id', 'ASC']]
            });

            if (batch.length === 0) {
                hasMore = false;
            } else {
                subscribers = subscribers.concat(batch);
                offset += SUBSCRIBER_BATCH_SIZE;

                if (subscribers.length % 5000 === 0) {
                    logger.info(`Fetched ${subscribers.length} subscribers so far...`);
                }
            }
        }

        logger.info(`Total subscribers fetched: ${subscribers.length}`);
    } else if (groupId != null) {
        const parsedGroupId = Number(groupId);
        if (!Number.isFinite(parsedGroupId) || parsedGroupId <= 0) {
            return { ok: false, res: { status: 400, message: 'groupId must be a positive number' } };
        }

        const memberships = await NewsletterGroupUser.findAll({
            where: { group_id: parsedGroupId },
            attributes: ['subscriber_id']
        });

        const subscriberIds = [...new Set(memberships.map((m) => m.subscriber_id).filter(Boolean))];
        if (subscriberIds.length === 0) {
            return { ok: false, res: { status: 404, message: 'No subscribers found in the specified group' } };
        }

        const SUBSCRIBER_ID_CHUNK_SIZE = 500;
        for (let i = 0; i < subscriberIds.length; i += SUBSCRIBER_ID_CHUNK_SIZE) {
            const chunk = subscriberIds.slice(i, i + SUBSCRIBER_ID_CHUNK_SIZE);
            const chunkSubscribers = await MailSubscription.findAll({
                where: {
                    id: chunk,
                    subscribed: true,
                    deletedAt: null
                },
                attributes: ['id', 'email', 'user_id']
            });
            subscribers = subscribers.concat(chunkSubscribers);
        }

        const seen = new Set();
        subscribers = subscribers.filter((s) => {
            const key = s.user_id != null ? `u:${s.user_id}` : `e:${s.email}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    } else if (selectedEmails && selectedEmails.length > 0) {
        const EMAIL_CHUNK_SIZE = 500;
        const emailChunks = [];

        for (let i = 0; i < selectedEmails.length; i += EMAIL_CHUNK_SIZE) {
            emailChunks.push(selectedEmails.slice(i, i + EMAIL_CHUNK_SIZE));
        }

        for (const emailChunk of emailChunks) {
            const chunkSubscribers = await MailSubscription.findAll({
                where: {
                    email: emailChunk,
                    subscribed: true,
                    deletedAt: null
                },
                attributes: ['id', 'email', 'user_id']
            });
            subscribers = subscribers.concat(chunkSubscribers);
        }
    } else {
        return {
            ok: false,
            res: {
                status: 400,
                message: 'Either sendToAll must be true, groupId must be provided, or selectedEmails must be provided'
            }
        };
    }

    if (subscribers.length === 0) {
        return { ok: false, res: { status: 404, message: 'No subscribers found matching the criteria' } };
    }

    return {
        ok: true,
        data: {
            effectiveSubject,
            effectiveHtml,
            highlightText,
            ctaText,
            ctaUrl,
            templateId,
            finalImages,
            subscribers,
            sendToAll,
            groupId,
            selectedEmails,
            frequency,
            subject
        }
    };
}

module.exports = { preparePromotionalCampaign };
