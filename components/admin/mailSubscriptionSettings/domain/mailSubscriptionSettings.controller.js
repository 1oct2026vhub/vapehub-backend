const { errorResponse, successResponse } = require('../../../../utils/responseUtils');
const { MailSubscriptionSettings, MailSubscription } = require('../../../../models');
const sendEmail = require('../../../../library/sendEmail');
const logger = require('../../../../library/logger');
const { 
    uploadPromotionalImages, 
    validatePromotionalImages, 
    generateCampaignId 
} = require('../helper/imageUpload.helper');

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

            // Create new setting
            const newSetting = await MailSubscriptionSettings.create({
                email_frequency: email_frequency || 'weekly',
                product_updates: product_updates !== undefined ? product_updates : true,
                discount_notifications: discount_notifications !== undefined ? discount_notifications : true,
                discount_amount: discount_amount !== undefined ? discount_amount : 0.00,
                discount_type: discount_type || 'percentage',
                status: status !== undefined ? status : true
            });

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
        try {
            const {
                subject,
                content,
                highlightText,
                ctaText,
                ctaUrl,
                selectedEmails = [],
                sendToAll = false,
                frequency = null,
                imageUrls = [] // Array of image URLs: [{url: 'image_url', alt: 'alt_text', isPrimary: boolean}]
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
            if (!subject || !content) {
                return errorResponse(res, null, 'Subject and content are required', 400);
            }

            // Get subscribers based on criteria with pagination for large datasets
            let subscribers = [];

            if (sendToAll) {
                // Get all active subscribers with pagination for large datasets
                const whereClause = { deletedAt: null };
                
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
                            deletedAt: null
                        },
                        attributes: ['id', 'email', 'user_id']
                    });
                    subscribers = subscribers.concat(chunkSubscribers);
                }
            } else {
                return errorResponse(res, null, 'Either sendToAll must be true or selectedEmails must be provided', 400);
            }

            if (subscribers.length === 0) {
                return errorResponse(res, null, 'No subscribers found matching the criteria', 404);
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
                        const emailData = {
                            to: subscriber.email,
                            emailTypes: 'PROMOTIONAL',
                            context: {
                                subject: subject,
                                content: content,
                                highlightText: highlightText,
                                ctaText: ctaText,
                                ctaUrl: ctaUrl,
                                email: subscriber.email,
                                images: finalImages // Pass S3 uploaded images to email template
                            },
                            attachments: [] // No attachments needed, images are hosted on S3
                        };

                        await sendEmail(
                            emailData.to,
                            emailData.emailTypes,
                            emailData.context,
                            emailData.attachments
                        );

                        logger.info(`Promotional email sent successfully to: ${subscriber.email}`);
                        return { success: true, email: subscriber.email };
                    } catch (error) {
                        logger.error(`Failed to send promotional email to ${subscriber.email}:`, error);
                        return { success: false, email: subscriber.email, error: error.message };
                    }
                });
                console.log("batchPromises>", batchPromises);
                // Wait for current batch to complete
                const batchResults = await Promise.allSettled(batchPromises);
                console.log("batchResults>", batchResults);
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
                console.log("batchResults>", batchResults);
                // Add delay between batches (except for the last batch)
                if (i + BATCH_SIZE < subscribers.length) {
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
                }
            }

            logger.info(`Promotional email campaign completed. Success: ${successful}, Failed: ${failed}`);

            return successResponse(res, {
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
                    imageStorage: 'S3 Cloud Storage'
                }
            }, 'Promotional emails sent successfully');

        } catch (error) {
            logger.error('Error sending promotional emails:', error);
            return errorResponse(res, error, error.message);
        }
    },

    // Get all subscribers for admin selection
    async getAllSubscribers(req, res) {
        try {
            const { page = 1, limit = 50, search = '' } = req.query;
            const offset = (page - 1) * limit;

            const whereClause = {
                deletedAt: null
            };

            if (search) {
                whereClause.email = {
                    [require('sequelize').Op.like]: `%${search}%`
                };
            }

            const { count, rows: subscribers } = await MailSubscription.findAndCountAll({
                where: whereClause,
                attributes: ['id', 'email', 'user_id', 'createdAt'],
                order: [['createdAt', 'DESC']],
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
                where: { deletedAt: null }
            });

            const recentSubscribers = await MailSubscription.count({
                where: {
                    deletedAt: null,
                    createdAt: {
                        [require('sequelize').Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
                    }
                }
            });

            const mailSettings = await MailSubscriptionSettings.findAll();
            const frequencyStats = mailSettings.reduce((acc, setting) => {
                acc[setting.email_frequency] = (acc[setting.email_frequency] || 0) + 1;
                return acc;
            }, {});

            return successResponse(res, {
                totalSubscribers,
                recentSubscribers,
                frequencyStats
            }, 'Subscriber statistics retrieved successfully');

        } catch (error) {
            logger.error('Error fetching subscriber statistics:', error);
            return errorResponse(res, error, error.message);
        }
    },

}; 