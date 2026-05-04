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
const { enqueuePromotionalChunks } = require('../../../../library/promotionalEmail/sqsEnqueue');

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

            const rawChunk = parseInt(process.env.EMAIL_CAMPAIGN_CHUNK_SIZE || '200', 10);
            const CHUNK_SIZE = Math.min(500, Math.max(1, Number.isFinite(rawChunk) ? rawChunk : 200));

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

            const messages = createdChunks.map((c) => ({
                campaignId: Number(campaign.id),
                chunkId: Number(c.id)
            }));

            const enqueueResult = await enqueuePromotionalChunks(messages);

            // Catastrophic: nothing made it to SQS — fail fast, don't flip to "sending"
            if (enqueueResult.enqueued === 0) {
                await campaign.update({
                    status: 'failed',
                    finished_at: new Date(),
                    error_summary: [{
                        message: `SQS enqueue failed for all ${messages.length} chunks`,
                        count: messages.length
                    }],
                });
                return errorResponse(
                    res,
                    { failedItems: enqueueResult.failedItems.slice(0, 10) },
                    'Failed to enqueue chunks to SQS',
                    502
                );
            }

            // Partial: mark un-enqueued chunks failed and pre-advance counters so the
            // last successful worker can still finalize the campaign (chunks_done >= chunks_total).
            if (enqueueResult.failed > 0) {
                const failedChunkIds = enqueueResult.failedItems.map((f) => f.chunkId);

                const failedChunkRows = await EmailCampaignChunk.findAll({
                    where: { id: failedChunkIds },
                    attributes: ['id', 'subscriber_ids']
                });
                const lostRecipients = failedChunkRows.reduce(
                    (n, c) => n + (Array.isArray(c.subscriber_ids) ? c.subscriber_ids.length : 0),
                    0
                );

                await EmailCampaignChunk.update(
                    { status: 'failed', last_error: 'SQS enqueue failed' },
                    { where: { id: failedChunkIds } }
                );

                await campaign.increment({
                    chunks_done: failedChunkIds.length,
                    failed_count: lostRecipients
                });

                logger.warn(
                    `Promotional campaign ${campaign.id}: ${enqueueResult.failed}/${messages.length} chunks failed to enqueue (${lostRecipients} recipients lost)`
                );
            }

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
                    chunksEnqueued: enqueueResult.enqueued,
                    chunksFailedToEnqueue: enqueueResult.failed,
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

    // Get a single promotional campaign's status (admin polling endpoint).
    // Returns the campaign metadata, lifecycle counts, a chunk-by-status
    // breakdown, and a progress convenience block. Designed to be polled
    // every few seconds by the admin UI while a campaign is in flight.
    async getPromotionalCampaign(req, res) {
        try {
            const id = parseInt(req.params.id, 10);
            if (!Number.isFinite(id) || id <= 0) {
                return errorResponse(res, {}, 'Invalid campaign id', 400);
            }

            const campaign = await EmailCampaign.findByPk(id, {
                attributes: [
                    'id',
                    'campaign_key',
                    'subject',
                    'status',
                    'delivery_mode',
                    'audience_type',
                    'audience_meta',
                    'total_recipients',
                    'sent_count',
                    'failed_count',
                    'chunks_total',
                    'chunks_done',
                    'failed_emails_sample',
                    'error_summary',
                    'started_at',
                    'finished_at',
                    'createdAt'
                ]
            });

            if (!campaign) {
                return errorResponse(res, {}, 'Campaign not found', 404);
            }

            // Group chunks by status. Cheap thanks to the
            // (email_campaign_id, status) composite index.
            const sequelize = require('sequelize');
            const breakdownRows = await EmailCampaignChunk.findAll({
                where: { email_campaign_id: id },
                attributes: [
                    'status',
                    [sequelize.fn('COUNT', sequelize.col('id')), 'count']
                ],
                group: ['status'],
                raw: true
            });

            const chunkBreakdown = { pending: 0, processing: 0, done: 0, failed: 0 };
            for (const row of breakdownRows) {
                if (row.status in chunkBreakdown) {
                    chunkBreakdown[row.status] = Number(row.count) || 0;
                }
            }

            const TERMINAL_STATUSES = new Set(['completed', 'partial_failed', 'failed']);
            const IN_FLIGHT_STATUSES = new Set(['queued', 'sending']);
            const isFinal = TERMINAL_STATUSES.has(campaign.status);
            const isInFlight = IN_FLIGHT_STATUSES.has(campaign.status);
            const total = Number(campaign.chunks_total) || 0;
            const done = Number(campaign.chunks_done) || 0;
            const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : (isFinal ? 100 : 0);

            return successResponse(
                res,
                {
                    campaignId: campaign.id,
                    campaignKey: campaign.campaign_key,
                    subject: campaign.subject,
                    status: campaign.status,
                    deliveryMode: campaign.delivery_mode,
                    audienceType: campaign.audience_type,
                    audienceMeta: campaign.audience_meta,
                    totalRecipients: campaign.total_recipients,
                    sentCount: campaign.sent_count,
                    failedCount: campaign.failed_count,
                    chunksTotal: total,
                    chunksDone: done,
                    chunkBreakdown,
                    progress: { percent, isFinal, isInFlight },
                    failedEmailsSample: campaign.failed_emails_sample || [],
                    errorSummary: campaign.error_summary || [],
                    startedAt: campaign.started_at,
                    finishedAt: campaign.finished_at,
                    createdAt: campaign.createdAt
                },
                'Campaign status retrieved successfully'
            );
        } catch (error) {
            logger.error('Error retrieving promotional campaign:', error);
            return errorResponse(res, error, error.message || 'Failed to retrieve campaign');
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