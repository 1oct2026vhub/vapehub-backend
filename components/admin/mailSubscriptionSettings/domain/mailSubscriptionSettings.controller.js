const { errorResponse, successResponse } = require('../../../../utils/responseUtils');
const {
    MailSubscriptionSettings,
    MailSubscription,
    User,
    EmailCampaign,
    EmailCampaignChunk
} = require('../../../../models');
const logger = require('../../../../library/logger');
const utilsLogger = require('../../../../utils/logger');
const { preparePromotionalCampaign } = require('../../../../library/promotionalEmail/preparePromotionalCampaign');
const {
    buildCampaignPayload,
    serializeCampaignPayload
} = require('../../../../library/promotionalEmail/campaignPayload');
const { sendPromotionalToSubscriber } = require('../../../../library/promotionalEmail/sendPromotionalToSubscriber');
const { enqueuePromotionalChunks } = require('../../../../library/promotionalEmail/sqsEnqueue');
const {
    EMAIL_CAMPAIGN_FAILED_SAMPLE_LIMIT,
    resolveCampaignStatus,
    buildErrorSummary
} = require('../../../../library/promotionalEmail/campaignMetrics');

const resolveAudienceType = ({ sendToAll, groupId, selectedEmails }) => {
    if (sendToAll) return 'all';
    if (groupId != null) return 'group';
    if (selectedEmails && selectedEmails.length > 0) return 'selected';
    return 'selected';
};

const buildCampaignKey = () => `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

module.exports = {
    // List all mail subscription settings with pagination
    async listMailSubscriptionSettings(req, res) {
        try {
            const { page = 1, limit = 10 } = req.query;
            const offset = (page - 1) * limit;

            const { count, rows: settings } = await MailSubscriptionSettings.findAndCountAll({
                order: [['createdAt', 'DESC']],
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            const response = {
                settings: settings,
                pagination: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total_pages: Math.ceil(count / limit)
                }
            };

            return successResponse(res, response, 'Mail subscription settings retrieved successfully');
        } catch (error) {
            logger.error('Error listing mail subscription settings:', error);
            return errorResponse(res, error, 'Failed to retrieve mail subscription settings');
        }
    },

    // Get single mail subscription setting by ID
    async getMailSubscriptionSetting(req, res) {
        try {
            const { id } = req.params;

            const setting = await MailSubscriptionSettings.findByPk(id);

            if (!setting) {
                return errorResponse(res, {}, 'Mail subscription setting not found', 404);
            }

            return successResponse(res, setting, 'Mail subscription setting retrieved successfully');
        } catch (error) {
            logger.error('Error getting mail subscription setting:', error);
            return errorResponse(res, error, 'Failed to retrieve mail subscription setting');
        }
    },

    // Create new mail subscription setting
    async createMailSubscriptionSetting(req, res) {
        try {
            const {
                email_frequency,
                product_updates,
                discount_notifications,
                discount_amount,
                discount_type,
                status
            } = req.body;

            const userId = req?.user?.id;

            // Check if mail subscription settings already exist with status true
            const existingSettings = await MailSubscriptionSettings.findOne();
            if (existingSettings) {
                return errorResponse(res, {}, 'Mail subscription settings already exist. You can only create settings once. Use update endpoint to modify existing settings.', 409);
            }

            // Validate email frequency
            if (email_frequency && !['daily', 'weekly', 'monthly', 'never'].includes(email_frequency)) {
                return errorResponse(res, {}, 'Email frequency must be daily, weekly, monthly, or never', 400);
            }

            // Validate discount type
            if (discount_type && !['percentage', 'fixed'].includes(discount_type)) {
                return errorResponse(res, {}, 'Discount type must be percentage or fixed', 400);
            }

            // Validate discount amount
            if (discount_amount !== undefined && discount_amount < 0) {
                return errorResponse(res, {}, 'Discount amount cannot be negative', 400);
            }

            const updated_by = req?.user?.id ?? null;
            const createData = {
                email_frequency: email_frequency || 'weekly',
                product_updates: product_updates !== undefined ? product_updates : true,
                discount_notifications: discount_notifications !== undefined ? discount_notifications : true,
                discount_amount: discount_amount !== undefined ? discount_amount : 0.00,
                discount_type: discount_type || 'percentage',
                status: true
            };
            if (updated_by != null) createData.updated_by = updated_by;
            const newSetting = await MailSubscriptionSettings.create(createData);

            logger.info('Mail subscription setting created', {
                user_id: userId,
                setting_id: newSetting.id
            });

            return successResponse(res, newSetting, 'Mail subscription setting created successfully', 201);
        } catch (error) {
            logger.error('Error creating mail subscription setting:', error);
            return errorResponse(res, error, 'Failed to create mail subscription setting');
        }
    },

    // Update mail subscription setting
    async updateMailSubscriptionSetting(req, res) {
        try {
            const { id } = req.params;
            const {
                email_frequency,
                product_updates,
                discount_notifications,
                discount_amount,
                discount_type,
                status
            } = req.body;

            const userId = req?.user?.id;

            // Check if setting exists
            const existingSetting = await MailSubscriptionSettings.findByPk(id);
            if (!existingSetting) {
                return errorResponse(res, {}, 'Mail subscription setting not found', 404);
            }

            // Validate email frequency
            if (email_frequency !== undefined && !['daily', 'weekly', 'monthly', 'never'].includes(email_frequency)) {
                return errorResponse(res, {}, 'Email frequency must be daily, weekly, monthly, or never', 400);
            }

            // Validate discount type
            if (discount_type !== undefined && !['percentage', 'fixed'].includes(discount_type)) {
                return errorResponse(res, {}, 'Discount type must be percentage or fixed', 400);
            }

            // Validate discount amount
            if (discount_amount !== undefined && discount_amount < 0) {
                return errorResponse(res, {}, 'Discount amount cannot be negative', 400);
            }

            // Update setting
            const updateData = {};
            
            if (email_frequency !== undefined) updateData.email_frequency = email_frequency;
            if (product_updates !== undefined) updateData.product_updates = product_updates;
            if (discount_notifications !== undefined) updateData.discount_notifications = discount_notifications;
            if (discount_amount !== undefined) updateData.discount_amount = discount_amount;
            if (discount_type !== undefined) updateData.discount_type = discount_type;
            if (status !== undefined) updateData.status = status;
            if (userId != null) updateData.updated_by = userId;

            await existingSetting.update(updateData);

            logger.info('Mail subscription setting updated', {
                user_id: userId,
                setting_id: id,
                changes: req.body
            });

            return successResponse(res, existingSetting, 'Mail subscription setting updated successfully');
        } catch (error) {
            logger.error('Error updating mail subscription setting:', error);
            return errorResponse(res, error, 'Failed to update mail subscription setting');
        }
    },

    // Delete mail subscription setting
    async deleteMailSubscriptionSetting(req, res) {
        try {
            const { id } = req.params;
            const userId = req?.user?.id;

            // Check if setting exists
            const existingSetting = await MailSubscriptionSettings.findByPk(id);
            if (!existingSetting) {
                return errorResponse(res, {}, 'Mail subscription setting not found', 404);
            }

            if (userId != null) await existingSetting.update({ updated_by: userId });
            // Soft delete the setting
            await existingSetting.destroy();

            logger.info('Mail subscription setting deleted', {
                user_id: userId,
                setting_id: id
            });

            return successResponse(res, {}, 'Mail subscription setting deleted successfully');
        } catch (error) {
            logger.error('Error deleting mail subscription setting:', error);
            return errorResponse(res, error, 'Failed to delete mail subscription setting');
        }
    },

    // Send promotional email to subscribers (synchronous — same HTTP request until complete)
    async sendPromotionalEmail(req, res) {
        let campaign = null;
        try {
            const prepared = await preparePromotionalCampaign(req);
            if (!prepared.ok) {
                return errorResponse(res, prepared.res.errors || {}, prepared.res.message, prepared.res.status);
            }

            const {
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
            } = prepared.data;

            const audienceType = resolveAudienceType({ sendToAll, groupId, selectedEmails });
            campaign = await EmailCampaign.create({
                campaign_key: buildCampaignKey(),
                type: 'promotional_newsletter',
                status: 'sending',
                delivery_mode: 'sync',
                subject: String(effectiveSubject),
                template_id: templateId || null,
                audience_type: audienceType,
                audience_meta: {
                    sendToAll: Boolean(sendToAll),
                    groupId: groupId != null ? Number(groupId) : null,
                    selectedEmailsCount: Array.isArray(selectedEmails) ? selectedEmails.length : 0,
                    frequency: frequency || null,
                },
                total_recipients: subscribers.length,
                sent_count: 0,
                failed_count: 0,
                chunks_total: 0,
                chunks_done: 0,
                initiated_by: req?.user?.id ?? null,
                started_at: new Date(),
            });

            const userIds = [...new Set(subscribers.map((s) => s.user_id).filter((id) => id != null))];
            const firstNameByUserId = new Map();
            if (userIds.length > 0) {
                const users = await User.findAll({
                    where: { id: userIds },
                    attributes: ['id', 'first_name']
                });
                users.forEach((user) => {
                    firstNameByUserId.set(user.id, (user.first_name || '').trim());
                });
            }

            const campaignFields = buildCampaignPayload({
                effectiveSubject,
                effectiveHtml,
                highlightText,
                ctaText,
                ctaUrl,
                finalImages,
                templateId
            });

            logger.info(`Sending promotional email to ${subscribers.length} subscribers`);

            const BATCH_SIZE = 50;
            const DELAY_BETWEEN_BATCHES = 2000;

            let successful = 0;
            let failed = 0;
            const failedEmails = [];

            for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
                const batch = subscribers.slice(i, i + BATCH_SIZE);

                logger.info(
                    `Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(subscribers.length / BATCH_SIZE)} (${batch.length} emails)`
                );

                const batchPromises = batch.map((subscriber) =>
                    sendPromotionalToSubscriber(subscriber, firstNameByUserId, campaignFields)
                );
                const batchResults = await Promise.allSettled(batchPromises);
                batchResults.forEach((result) => {
                    if (result.status === 'fulfilled' && result.value.success) {
                        successful++;
                    } else {
                        failed++;
                        if (result.status === 'fulfilled') {
                            failedEmails.push(result.value);
                        }
                    }
                });
                if (i + BATCH_SIZE < subscribers.length) {
                    await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
                }
            }

            logger.info(`Promotional email campaign completed. Success: ${successful}, Failed: ${failed}`);

            await campaign.update({
                status: resolveCampaignStatus(successful, failed),
                sent_count: successful,
                failed_count: failed,
                failed_emails_sample: failedEmails.slice(0, EMAIL_CAMPAIGN_FAILED_SAMPLE_LIMIT),
                error_summary: buildErrorSummary(failedEmails),
                finished_at: new Date(),
            });

            return successResponse(res, {
                campaignId: campaign.id,
                campaignKey: campaign.campaign_key,
                totalSubscribers: subscribers.length,
                successful,
                failed,
                failedEmails: failedEmails.slice(0, 10),
                batchesProcessed: Math.ceil(subscribers.length / BATCH_SIZE),
                subject,
                sendToAll,
                selectedEmails,
                imagesProcessed: finalImages.length,
                processingInfo: {
                    batchSize: BATCH_SIZE,
                    delayBetweenBatches: '2 seconds',
                    totalProcessingTime: 'Varies based on subscriber count',
                    imageStorage: 'S3 Cloud Storage',
                    campaignStatusTracking: 'enabled',
                    deliveryMode: 'sync',
                },
            }, 'Promotional emails sent successfully');
        } catch (error) {
            logger.error('Error sending promotional emails:', error);
            utilsLogger.logError(error);
            if (campaign) {
                try {
                    await campaign.update({
                        status: 'failed',
                        finished_at: new Date(),
                        error_summary: [{ message: String(error?.message || 'Unknown error').slice(0, 200), count: 1 }],
                    });
                } catch (campaignUpdateError) {
                    logger.error('Failed to update email campaign status:', campaignUpdateError);
                }
            }
            return errorResponse(res, error, error.message);
        }
    },

    // Queue promotional campaign: persists payload + chunk rows, enqueues SQS messages (requires env vars).
    async sendPromotionalEmailAsync(req, res) {
        let campaign = null;
        try {
            const prepared = await preparePromotionalCampaign(req);
            if (!prepared.ok) {
                return errorResponse(res, prepared.res.errors || {}, prepared.res.message, prepared.res.status);
            }

            const {
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
            } = prepared.data;

            if (!process.env.EMAIL_CAMPAIGN_SQS_QUEUE_URL || !process.env.EMAIL_CHUNK_INTERNAL_KEY) {
                return errorResponse(
                    res,
                    {},
                    'Async campaigns require EMAIL_CAMPAIGN_SQS_QUEUE_URL and EMAIL_CHUNK_INTERNAL_KEY',
                    503
                );
            }

            const rawChunk = parseInt(process.env.EMAIL_CAMPAIGN_CHUNK_SIZE || '50', 10);
            const CHUNK_SIZE = Math.min(500, Math.max(1, Number.isFinite(rawChunk) ? rawChunk : 50));

            const audienceType = resolveAudienceType({ sendToAll, groupId, selectedEmails });
            const payloadSnapshot = buildCampaignPayload({
                effectiveSubject,
                effectiveHtml,
                highlightText,
                ctaText,
                ctaUrl,
                finalImages,
                templateId
            });
            const payloadStr = serializeCampaignPayload(payloadSnapshot);
            const chunksTotal = Math.ceil(subscribers.length / CHUNK_SIZE);

            campaign = await EmailCampaign.create({
                campaign_key: buildCampaignKey(),
                type: 'promotional_newsletter',
                status: 'queued',
                delivery_mode: 'async_sqs',
                subject: String(effectiveSubject),
                template_id: templateId || null,
                audience_type: audienceType,
                audience_meta: {
                    sendToAll: Boolean(sendToAll),
                    groupId: groupId != null ? Number(groupId) : null,
                    selectedEmailsCount: Array.isArray(selectedEmails) ? selectedEmails.length : 0,
                    frequency: frequency || null,
                },
                total_recipients: subscribers.length,
                sent_count: 0,
                failed_count: 0,
                chunks_total: chunksTotal,
                chunks_done: 0,
                payload_json: payloadStr,
                initiated_by: req?.user?.id ?? null,
                started_at: null,
            });

            const chunkRows = [];
            for (let i = 0; i < chunksTotal; i++) {
                const slice = subscribers.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
                chunkRows.push({
                    email_campaign_id: campaign.id,
                    chunk_index: i,
                    subscriber_ids: slice.map((s) => s.id),
                    status: 'pending',
                });
            }
            await EmailCampaignChunk.bulkCreate(chunkRows);

            const createdChunks = await EmailCampaignChunk.findAll({
                where: { email_campaign_id: campaign.id },
                attributes: ['id'],
                order: [['chunk_index', 'ASC']],
            });

            const messages = createdChunks.map((c) => ({ campaignId: Number(campaign.id), chunkId: Number(c.id) }));
            await enqueuePromotionalChunks(messages);

            await campaign.update({
                status: 'sending',
                started_at: new Date(),
            });

            return successResponse(
                res,
                {
                    campaignId: campaign.id,
                    campaignKey: campaign.campaign_key,
                    queued: true,
                    chunksEnqueued: messages.length,
                    chunkSize: CHUNK_SIZE,
                    totalSubscribers: subscribers.length,
                    subject,
                    sendToAll,
                    selectedEmails,
                    imagesProcessed: finalImages.length,
                    deliveryMode: 'async_sqs',
                },
                'Promotional campaign queued for background delivery',
                202
            );
        } catch (error) {
            logger.error('Error queueing promotional emails:', error);
            utilsLogger.logError(error);
            if (campaign) {
                try {
                    await campaign.update({
                        status: 'failed',
                        finished_at: new Date(),
                        error_summary: [{ message: String(error?.message || 'Unknown error').slice(0, 200), count: 1 }],
                    });
                } catch (campaignUpdateError) {
                    logger.error('Failed to update email campaign status:', campaignUpdateError);
                }
            }
            return errorResponse(res, error, error.message);
        }
    },

    // Get all subscribers for admin selection
    async getAllSubscribers(req, res) {
        try {
            const { page = 1, limit = 50, search = '', subscribed } = req.query;
            const offset = (page - 1) * limit;
            
            const whereClause = {
                deletedAt: null,
                subscribed: true
            };

            if (search) {
                whereClause.email = {
                    [require('sequelize').Op.like]: `%${search}%`
                };
            }

            // Default is subscribed=true; only when explicitly false list unsubscribers
            if (typeof subscribed !== 'undefined') {
                const normalized = String(subscribed).toLowerCase();
                if (['false', '0'].includes(normalized)) {
                    whereClause.subscribed = false;
                } else {
                    whereClause.subscribed = true;
                }
            }

            const { count, rows: subscribers } = await MailSubscription.findAndCountAll({
                where: whereClause,
                attributes: ['id', 'email', 'user_id', 'createdAt', 'subscribed'],
                order: [['createdAt', 'DESC'], ['id', 'ASC']],
                limit: parseInt(limit),
                offset: parseInt(offset)
            });

            const totalPages = Math.ceil(count / limit);

            return successResponse(res, {
                subscribers,
                pagination: {
                    total: count,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages
                }
            }, 'Subscribers retrieved successfully');

        } catch (error) {
            logger.error('Error fetching subscribers:', error);
            return errorResponse(res, error, error.message);
        }
    },

    // Get subscriber statistics
    async getSubscriberStats(req, res) {
        try {
            const totalSubscribers = await MailSubscription.count({
                where: { deletedAt: null, subscribed: true }
            });

            const unsubscribersCount = await MailSubscription.count({
                where: { deletedAt: null, subscribed: false }
            });

            const recentSubscribers = await MailSubscription.count({
                where: {
                    deletedAt: null,
                    createdAt: {
                        [require('sequelize').Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
                    },
                    subscribed: true
                }
            });

            // Calculate the start and end of the current week (Monday to Sunday)
            const now = new Date();
            const dayOfWeek = now.getDay(); // 0 (Sun) - 6 (Sat)
            const diffToMonday = (dayOfWeek + 6) % 7; // 0 (Mon) - 6 (Sun)
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - diffToMonday);
            startOfWeek.setHours(0, 0, 0, 0);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6);
            endOfWeek.setHours(23, 59, 59, 999);

            // Count subscribers created this week in the format { weekly: <count> }
            const weeklyCount = await MailSubscription.count({
                where: {
                    createdAt: {
                        [require('sequelize').Op.between]: [startOfWeek, endOfWeek]
                    },
                    subscribed: true
                }
            });
            const frequencyStats = { weekly: weeklyCount };

            return successResponse(res, {
                totalSubscribers,
                recentSubscribers,
                frequencyStats,
                unsubscribersCount
            }, 'Subscriber statistics retrieved successfully');

        } catch (error) {
            logger.error('Error fetching subscriber statistics:', error);
            return errorResponse(res, error, error.message);
        }
    },

    // Unsubscribe a subscriber (admin) - sets subscribed = false
    async unsubscribeSubscriber(req, res) {
        try {
            const { subscriberId } = req.params;
            const subscription = await MailSubscription.findOne({
                where: { id: subscriberId, deletedAt: null }
            });
            if (!subscription) {
                return errorResponse(res, null, 'Subscriber not found', 404);
            }
            subscription.subscribed = false;
            await subscription.save();
            return successResponse(res, {
                id: subscription.id,
                email: subscription.email,
                subscribed: false
            }, 'Subscriber unsubscribed successfully');
        } catch (error) {
            logger.error('Error unsubscribing subscriber:', error);
            return errorResponse(res, error, error.message);
        }
    },

    // Delete a subscriber (admin) - soft-deletes the subscriber record
    async deleteSubscriber(req, res) {
        try {
            const { subscriberId } = req.params;
            const subscription = await MailSubscription.findOne({
                where: { id: subscriberId, deletedAt: null }
            });
            if (!subscription) {
                return errorResponse(res, null, 'Subscriber not found', 404);
            }
            await subscription.destroy();
            return successResponse(res, { id: Number(subscriberId) }, 'Subscriber deleted successfully');
        } catch (error) {
            logger.error('Error deleting subscriber:', error);
            return errorResponse(res, error, error.message);
        }
    }

}; 