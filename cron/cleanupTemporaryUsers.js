const cron = require('node-cron');
const { User, Order } = require('../models');
const { Op } = require('sequelize');
const logger = require('../library/logger');
const moment = require('moment-timezone');

/**
 * Cleanup temporary users that:
 * 1. Are older than 30 days
 * 2. Have no orders
 * 3. Have no cart items (optional check)
 */
const cleanupTemporaryUsers = async () => {
    try {
        const thirtyDaysAgo = moment().tz(process.env.UK_TIMEZONE || 'Europe/London')
            .subtract(30, 'days')
            .startOf('day')
            .toDate();

        logger.info(`Starting cleanup of temporary users older than ${thirtyDaysAgo.toISOString()}`);

        // Find temporary users older than 30 days
        const temporaryUsers = await User.findAll({
            where: {
                is_temporary: true,
                createdAt: {
                    [Op.lt]: thirtyDaysAgo
                }
            },
            include: [{
                model: Order,
                as: 'orders',
                required: false,
                attributes: ['id']
            }],
            attributes: ['id', 'email', 'createdAt']
        });

        logger.info(`Found ${temporaryUsers.length} temporary users older than 30 days`);

        let deletedCount = 0;
        let keptCount = 0;

        for (const user of temporaryUsers) {
            // Only delete if user has no orders
            if (!user.orders || user.orders.length === 0) {
                try {
                    await user.destroy(); // Soft delete
                    deletedCount++;
                    logger.info(`Deleted temporary user: ${user.email} (ID: ${user.id})`);
                } catch (error) {
                    logger.error(`Error deleting temporary user ${user.id}:`, error);
                }
            } else {
                keptCount++;
                logger.info(`Kept temporary user ${user.email} (ID: ${user.id}) - has ${user.orders.length} order(s)`);
            }
        }

        logger.info(`Cleanup completed: Deleted ${deletedCount} temporary users, Kept ${keptCount} users with orders`);
        
        return { 
            deletedCount, 
            keptCount,
            totalChecked: temporaryUsers.length 
        };
    } catch (error) {
        logger.error('Error cleaning up temporary users:', error);
        throw error;
    }
};

// Run cleanup daily at 2 AM (UK time)
cron.schedule('0 2 * * *', async () => {
    try {
        logger.info('Running scheduled cleanup of temporary users...');
        const result = await cleanupTemporaryUsers();
        logger.info(`Scheduled cleanup completed:`, result);
    } catch (error) {
        logger.error('Error in scheduled temporary user cleanup:', error);
    }
}, {
    timezone: process.env.UK_TIMEZONE || 'Europe/London'
});

module.exports = {
    cleanupTemporaryUsers
};

