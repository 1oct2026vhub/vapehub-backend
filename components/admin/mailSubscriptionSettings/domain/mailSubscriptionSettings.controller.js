const { errorResponse, successResponse } = require('../../../../utils/responseUtils');
const { MailSubscriptionSettings, MailSubscription, NewsletterGroupUser, User, EmailCampaign } = require('../../../../models');
const sendEmail = require('../../../../library/sendEmail');
const logger = require('../../../../library/logger');
const utilsLogger = require('../../../../utils/logger');
const { 
    uploadPromotionalImages, 
    validatePromotionalImages, 
    generateCampaignId 
} = require('../helper/imageUpload.helper');
const { loadNewsletterTemplateById } = require('../../../../library/newsletterTemplates/newsletterTemplateStorage');

const EMAIL_CAMPAIGN_FAILED_SAMPLE_LIMIT = 100;

const resolveAudienceType = ({ sendToAll, groupId, selectedEmails }) => {
    if (sendToAll) return 'all';
    if (groupId != null) return 'group';
    if (selectedEmails && selectedEmails.length > 0) return 'selected';
    return 'selected';
};

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

    // Send promotional email to subscribers
    async sendPromotionalEmail(req, res) {
        let campaign = null;
        try {
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
                imageUrls = [], // Array of image URLs: [{url: 'image_url', alt: 'alt_text', isPrimary: boolean}]
                templateId
            } = req.body;

            // Handle both uploaded files and URL-based images
            let finalImages = [];

            // 1. Process uploaded files (if any)
            if (req.files && req.files.length > 0) {
                // Validate uploaded files
                const validation = validatePromotionalImages(req.files);
                if (!validation.isValid) {
                    return errorResponse(res, null, validation.errors.join(', '), 400);
                }

                // Upload files to S3
                const campaignId = generateCampaignId();
                const uploadedImages = await uploadPromotionalImages(req.files, campaignId);
                finalImages = finalImages.concat(uploadedImages);
            }

            // 2. Add URL-based images (if any)
            if (imageUrls && imageUrls.length > 0) {
                finalImages = finalImages.concat(imageUrls);
            }

            // Validate required fields
            if (!subject && !templateId) {
                return errorResponse(res, {}, 'Either subject or templateId must be provided', 400);
            }

            if (!content && !templateId) {
                return errorResponse(res, {}, 'Either content or templateId must be provided', 400);
            }

            // Resolve final subject and HTML content (template-based or raw content)
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
                    return errorResponse(res, err, err.message || 'Failed to load template', status);
                }
            }

            if (!effectiveSubject) {
                return errorResponse(res, {}, 'Subject is required (either in request or template)', 400);
            }

            if (!effectiveHtml) {
                return errorResponse(res, {}, 'Email HTML content is empty even after applying template', 400);
            }

            // Get subscribers based on criteria with pagination for large datasets
            let subscribers = [];

            if (sendToAll) {
                // Get all active subscribers with pagination for large datasets
                const whereClause = { deletedAt: null, subscribed: true };
                
                // If frequency is specified, filter by it
                if (frequency) {
                    const settings = await MailSubscriptionSettings.findAll({
                        where: {
                            email_frequency: frequency,
                            status: true
                        }
                    });
                    // For now, we'll send to all subscribers since there's no direct link
                    // In a real implementation, you'd filter by the settings
                }
                
                // Use pagination to handle large datasets
                const SUBSCRIBER_BATCH_SIZE = 1000; // Fetch 1000 subscribers at a time
                let offset = 0;
                let hasMore = true;
                
                while (hasMore) {
                    const batch = await MailSubscription.findAll({
                        where: whereClause,
                        attributes: ['id', 'email', 'user_id'],
                        limit: SUBSCRIBER_BATCH_SIZE,
                        offset: offset,
                        order: [['id', 'ASC']]
                    });
                    
                    if (batch.length === 0) {
                        hasMore = false;
                    } else {
                        subscribers = subscribers.concat(batch);
                        offset += SUBSCRIBER_BATCH_SIZE;
                        
                        // Log progress for large datasets
                        if (subscribers.length % 5000 === 0) {
                            logger.info(`Fetched ${subscribers.length} subscribers so far...`);
                        }
                    }
                }
                
                logger.info(`Total subscribers fetched: ${subscribers.length}`);
            } else if (groupId != null) {
                // Send to subscribers who belong to a single newsletter group (by subscriber_id)
                const parsedGroupId = Number(groupId);
                if (!Number.isFinite(parsedGroupId) || parsedGroupId <= 0) {
                    return errorResponse(res, null, 'groupId must be a positive number', 400);
                }

                // Load group membership (subscriber ids)
                const memberships = await NewsletterGroupUser.findAll({
                    where: { group_id: parsedGroupId },
                    attributes: ['subscriber_id']
                });

                const subscriberIds = [...new Set(memberships.map(m => m.subscriber_id).filter(Boolean))];
                if (subscriberIds.length === 0) {
                    return errorResponse(res, null, 'No subscribers found in the specified group', 404);
                }

                // Resolve to active subscribers; chunk large IN lists
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

                // De-dupe in case multiple subscription rows share email or user_id (safety)
                const seen = new Set();
                subscribers = subscribers.filter(s => {
                    const key = s.user_id != null ? `u:${s.user_id}` : `e:${s.email}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            } else if (selectedEmails && selectedEmails.length > 0) {
                // Send to selected emails - handle large email lists in chunks
                const EMAIL_CHUNK_SIZE = 500; // Process 500 emails at a time for database queries
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
                return errorResponse(res, null, 'Either sendToAll must be true, groupId must be provided, or selectedEmails must be provided', 400);
            }

            if (subscribers.length === 0) {
                return errorResponse(res, null, 'No subscribers found matching the criteria', 404);
            }

            const audienceType = resolveAudienceType({ sendToAll, groupId, selectedEmails });
            campaign = await EmailCampaign.create({
                campaign_key: buildCampaignKey(),
                type: 'promotional_newsletter',
                status: 'sending',
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
                initiated_by: req?.user?.id ?? null,
                started_at: new Date(),
            });

            // Resolve user first names once for token replacement in subject/content.
            const userIds = [...new Set(subscribers.map(s => s.user_id).filter(id => id != null))];
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

            logger.info(`Sending promotional email to ${subscribers.length} subscribers`);

            // Send emails in batches to handle large numbers efficiently
            const BATCH_SIZE = 50; // Process 50 emails at a time
            const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds delay between batches
            
            let successful = 0;
            let failed = 0;
            const failedEmails = [];
            
            // Process subscribers in batches
            for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
                const batch = subscribers.slice(i, i + BATCH_SIZE);
                
                logger.info(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(subscribers.length / BATCH_SIZE)} (${batch.length} emails)`);
                
                // Process current batch
                const batchPromises = batch.map(async (subscriber) => {
                    try {
                        const primaryEmailType = 'PROMOTIONAL_NEWSLETTER';
                        const rawFirstName = firstNameByUserId.get(subscriber.user_id) || '';
                        const firstName = rawFirstName
                            ? rawFirstName.charAt(0).toUpperCase() + rawFirstName.slice(1)
                            : '';
                        const personalizedSubject = String(effectiveSubject).replace(/\$\{first_name\}/g, firstName);
                        const personalizedHtml = String(effectiveHtml).replace(/\$\{first_name\}/g, firstName);
                        const emailData = {
                            to: subscriber.email,
                            emailTypes: primaryEmailType,
                            context: {
                                subject: personalizedSubject,
                                content: personalizedHtml,
                                highlightText: highlightText,
                                ctaText: ctaText,
                                ctaUrl: ctaUrl,
                                email: subscriber.email,
                                images: finalImages, // Pass S3 uploaded images to email template
                                templateId
                            },
                            attachments: [] // No attachments needed, images are hosted on S3
                        };

                        try {
                            await sendEmail(
                                emailData.to,
                                emailData.emailTypes,
                                emailData.context,
                                emailData.attachments
                            );
                        } catch (sendError) {
                            // Some environments may not yet have PROMOTIONAL_NEWSLETTER configured.
                            // Fallback keeps template-based campaigns deliverable.
                            const shouldFallbackToPromotional =
                                primaryEmailType === 'PROMOTIONAL_NEWSLETTER' &&
                                (sendError?.message === 'Unknown email type' ||
                                 sendError?.error?.message === 'Unknown email type');

                            if (!shouldFallbackToPromotional) {
                                throw sendError;
                            }

                            logger.warn(`Falling back to PROMOTIONAL email type for ${subscriber.email} due to missing PROMOTIONAL_NEWSLETTER config`);
                            await sendEmail(
                                emailData.to,
                                'PROMOTIONAL',
                                emailData.context,
                                emailData.attachments
                            );
                        }

                        logger.info(`Promotional email sent successfully to: ${subscriber.email}`);
                        return { success: true, email: subscriber.email };
                    } catch (error) {
                        logger.error(`Failed to send promotional email to ${subscriber.email}:`, error);
                        return { success: false, email: subscriber.email, error: error.message };
                    }
                });
                // Wait for current batch to complete
                const batchResults = await Promise.allSettled(batchPromises);
                // Count results
                batchResults.forEach(result => {
                    if (result.status === 'fulfilled' && result.value.success) {
                        successful++;
                    } else {
                        failed++;
                        if (result.status === 'fulfilled') {
                            failedEmails.push(result.value);
                        }
                    }
                });
                // Add delay between batches (except for the last batch)
                if (i + BATCH_SIZE < subscribers.length) {
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
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
                successful: successful,
                failed: failed,
                failedEmails: failedEmails.slice(0, 10), // Show first 10 failed emails for debugging
                batchesProcessed: Math.ceil(subscribers.length / 50),
                subject: subject,
                sendToAll: sendToAll,
                selectedEmails: selectedEmails,
                imagesProcessed: finalImages.length,
                processingInfo: {
                    batchSize: 50,
                    delayBetweenBatches: '2 seconds',
                    totalProcessingTime: 'Varies based on subscriber count',
                    imageStorage: 'S3 Cloud Storage',
                    campaignStatusTracking: 'enabled'
                }
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