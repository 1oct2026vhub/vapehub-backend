const cron = require('node-cron');
const { Op } = require('sequelize');
const { 
    MailSubscription, 
    MailSubscriptionSettings, 
    Product, 
    ProductImage, 
    Category, 
    Brand,
    ProductVariant 
} = require('../models');
const sendEmail = require('../library/sendEmail');
const constants = require('../config/constants');
const moment = require('moment-timezone');
const logger = require('../library/logger');

/**
 * Get latest products based on the specified time period
 * @param {string} frequency - 'daily', 'weekly', 'monthly'
 * @returns {Promise<Array>} Array of latest products
 */
async function getLatestProducts(frequency) {
    const now = moment().tz(process.env.UK_TIMEZONE || 'Europe/London');
    let startDate;

    switch (frequency) {
        case 'daily':
            startDate = now.clone().subtract(30, 'day').startOf('day');
            break;
        case 'weekly':
            startDate = now.clone().subtract(7, 'days').startOf('day');
            break;
        case 'monthly':
            startDate = now.clone().subtract(30, 'days').startOf('day');
            break;
        default:
            startDate = now.clone().subtract(7, 'days').startOf('day');
    }

    try {
        const products = await Product.findAll({
            where: {
                status: 'published',
                createdAt: {
                    [Op.gte]: startDate.toDate()
                }
            },
            include: [
                {
                    model: ProductImage,
                    as: 'ProductImages',
                    where: { is_primary: true },
                    required: false,
                    attributes: ['image_url']
                },
                {
                    model: Category,
                    as: 'Categories',
                    attributes: ['name', 'slug'],
                    through: { attributes: ['is_primary'] }
                },
                {
                    model: Brand,
                    as: 'Brands',
                    attributes: ['name', 'slug'],
                    through: { attributes: ['is_primary'] }
                },
                {
                    model: ProductVariant,
                    as: 'variants',
                    where: { status: 'active' },
                    required: false,
                    attributes: ['id', 'price', 'discount_price', 'stock']
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: 12 // Limit to 12 latest products
        });
        // Process products to include primary image and pricing
        return products.map(product => {
            const primaryImage = product.ProductImages?.[0]?.image_url;
            const variants = product.variants || [];
            
            // Get the lowest price from variants
            let minPrice = product.price || 0;
            let minDiscountPrice = product.discount_price || 0;
            
            if (variants.length > 0) {
                const prices = variants.map(v => parseFloat(v.price) || 0).filter(p => p > 0);
                const discountPrices = variants.map(v => parseFloat(v.discount_price) || 0).filter(p => p > 0);
                
                if (prices.length > 0) {
                    minPrice = Math.min(...prices);
                }
                if (discountPrices.length > 0) {
                    minDiscountPrice = Math.min(...discountPrices);
                }
            }

            return {
                id: product.id,
                name: product.name,
                slug: product.slug,
                description: product.description,
                price: minPrice,
                discount_price: minDiscountPrice > 0 ? minDiscountPrice : null,
                primaryImage: primaryImage,
                category: product.Categories && product.Categories.length > 0 ? product.Categories[0].name : null,
                brand: product.Brands && product.Brands.length > 0 ? product.Brands[0].name : null,
                createdAt: product.createdAt
            };
        });
    } catch (error) {
        logger.error('Error fetching latest products:', error);
        return [];
    }
}

/**
 * Send product update emails to subscribers based on their frequency settings
 * Handles large subscriber lists with batch processing and rate limiting
 * @param {string} frequency - 'daily', 'weekly', 'monthly'
 */
async function sendProductUpdateEmails(frequency) {
    try {
        logger.info(`Starting product update email job for frequency: ${frequency}`);
        // Get latest products for this frequency first
        const latestProducts = await getLatestProducts(frequency);
        if (latestProducts.length === 0) {
            logger.info(`No new products found for frequency: ${frequency}`);
            return;
        }

        // Get subscribers with pagination for large datasets
        const SUBSCRIBER_BATCH_SIZE = 1000; // Fetch 1000 subscribers at a time
        let allSubscribers = [];
        let offset = 0;
        let hasMore = true;

        logger.info(`Fetching subscribers in batches of ${SUBSCRIBER_BATCH_SIZE}...`);

        while (hasMore) {
            const batch = await MailSubscription.findAll({
                where: {
                    deletedAt: null
                },
                attributes: ['id', 'email', 'user_id'],
                limit: SUBSCRIBER_BATCH_SIZE,
                offset: offset,
                order: [['id', 'ASC']]
            });

            if (batch.length === 0) {
                hasMore = false;
            } else {
                allSubscribers = allSubscribers.concat(batch);
                offset += SUBSCRIBER_BATCH_SIZE;

                // Log progress for large datasets
                if (allSubscribers.length % 5000 === 0) {
                    logger.info(`Fetched ${allSubscribers.length} subscribers so far...`);
                }
            }
        }

        if (allSubscribers.length === 0) {
            logger.info(`No subscribers found for frequency: ${frequency}`);
            return;
        }

        logger.info(`Found ${latestProducts.length} new products and ${allSubscribers.length} subscribers for frequency: ${frequency}`);

        // Send emails in batches to handle large numbers efficiently
        const EMAIL_BATCH_SIZE = 50; // Process 50 emails concurrently per batch
        const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds delay between batches
        
        let successful = 0;
        let failed = 0;
        const failedEmails = [];
        const totalBatches = Math.ceil(allSubscribers.length / EMAIL_BATCH_SIZE);

        logger.info(`Processing ${allSubscribers.length} emails in ${totalBatches} batches of ${EMAIL_BATCH_SIZE}`);

        // Process subscribers in batches with Promise.all for concurrent processing
        for (let i = 0; i < allSubscribers.length; i += EMAIL_BATCH_SIZE) {
            const batch = allSubscribers.slice(i, i + EMAIL_BATCH_SIZE);
            const batchNumber = Math.floor(i / EMAIL_BATCH_SIZE) + 1;
            
            logger.info(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} emails)`);
            
            // Process current batch concurrently with Promise.all
            const batchPromises = batch.map(async (subscriber) => {
                try {
                    const emailData = {
                        to: subscriber.email,
                        emailTypes: constants.emailTypes.PRODUCT_UPDATES,
                        context: {
                            products: latestProducts,
                            email: subscriber.email,
                            frequency: frequency,
                            totalProducts: latestProducts.length
                        },
                        attachments: []
                    };
                    await sendEmail(
                        emailData.to, 
                        emailData.emailTypes, 
                        emailData.context, 
                        emailData.attachments
                    );

                    return { success: true, email: subscriber.email };
                } catch (error) {
                    logger.error(`Failed to send product update email to ${subscriber.email}:`, error);
                    return { success: false, email: subscriber.email, error: error.message };
                }
            });
            // Wait for current batch to complete concurrently
            const batchResults = await Promise.all(batchPromises);
            // Count results from this batch
            batchResults.forEach(result => {
                if (result.success) {
                    successful++;
                } else {
                    failed++;
                    failedEmails.push(result);
                }
            });
            // Add delay between batches (except for the last batch)
            if (i + EMAIL_BATCH_SIZE < allSubscribers.length && DELAY_BETWEEN_BATCHES > 0) {
                logger.info(`Waiting ${DELAY_BETWEEN_BATCHES}ms before next batch...`);
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
            }
        }

        logger.info(`Product update email job completed for frequency: ${frequency}`);
        logger.info(`Total processed: ${allSubscribers.length}`);
        logger.info(`Successful: ${successful}`);
        logger.info(`Failed: ${failed}`);
        
        if (failedEmails.length > 0) {
            logger.warn(`Failed emails (first 10): ${JSON.stringify(failedEmails.slice(0, 10))}`);
        }

    } catch (error) {
        logger.error(`Error in product update email job for frequency ${frequency}:`, error);
    }
}


// Schedule cron jobs to check MailSubscriptionSettings and send emails accordingly
// Daily check at 9 AM UK time
cron.schedule('0 9 * * *', async () => {
    try {
        const globalSettings = await MailSubscriptionSettings.findOne({
            where: { status: true }
        });
        
        if (globalSettings && globalSettings.email_frequency === 'daily' && globalSettings.product_updates) {
            await sendProductUpdateEmails(globalSettings.email_frequency);
        } else {
            logger.info('Daily product update emails skipped - frequency not set to daily or product updates disabled');
        }
    } catch (error) {
        logger.error('Error in daily product update cron job:', error);
    }
}, {
    timezone: process.env.UK_TIMEZONE || 'Europe/London'
});

// Weekly check on Monday at 10 AM UK time
cron.schedule('0 10 * * 1', async () => {
    try {
        const globalSettings = await MailSubscriptionSettings.findOne({
            where: { status: true }
        });
        
        if (globalSettings && globalSettings.email_frequency === 'weekly' && globalSettings.product_updates) {
            await sendProductUpdateEmails(globalSettings.email_frequency);
        } else {
            logger.info('Weekly product update emails skipped - frequency not set to weekly or product updates disabled');
        }
    } catch (error) {
        logger.error('Error in weekly product update cron job:', error);
    }
}, {
    timezone: process.env.UK_TIMEZONE || 'Europe/London'
});

// Monthly check on the 1st of each month at 11 AM UK time
cron.schedule('0 11 1 * *', async () => {
    try {
        const globalSettings = await MailSubscriptionSettings.findOne({
            where: { status: true }
        });
        
        if (globalSettings && globalSettings.email_frequency === 'monthly' && globalSettings.product_updates) {
            await sendProductUpdateEmails(globalSettings.email_frequency);
        } else {
            logger.info('Monthly product update emails skipped - frequency not set to monthly or product updates disabled');
        }
    } catch (error) {
        logger.error('Error in monthly product update cron job:', error);
    }
}, {
    timezone: process.env.UK_TIMEZONE || 'Europe/London'
});

// Export functions for manual testing
module.exports = {
    sendProductUpdateEmails,
    getLatestProducts
}; 