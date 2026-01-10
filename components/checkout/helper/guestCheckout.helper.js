const { Cart } = require('../../../models');
const { createTemporaryUser } = require('../../auth/helper/temporaryUser.helper');

/**
 * Migrate cart items from localStorage to database for guest user
 * Clears existing cart items first to ensure database matches request exactly,
 * preventing removed items from being added to orders
 * @param {number} userId - Temporary user ID
 * @param {Array} cartItems - Cart items from localStorage
 * @param {Object} transaction - Sequelize transaction
 * @returns {Promise<void>}
 */
const migrateGuestCartToDatabase = async (userId, cartItems, transaction) => {
    // Clear existing cart items first to ensure database matches request exactly
    // This prevents removed items from being included in orders
    await Cart.destroy({
        where: { user_id: userId },
        transaction,
        force: true // Hard delete to completely remove records
    });

    // Now add only the items from the request
    for (const item of cartItems) {
        const { product_id, variant_id, quantity } = item;
        
        if (!product_id || !quantity) {
            continue; // Skip invalid items
        }

        // Create new cart item (no need to check for existing since we cleared them)
        await Cart.create({
            user_id: userId,
            product_id,
            variant_id: variant_id || null,
            quantity
        }, { transaction });
    }
};

/**
 * Create temporary user for guest checkout/order
 * @param {Object} guestData - Guest information
 * @returns {Promise<Object>} User object with tokens
 */
const createGuestUser = async (guestData) => {
    return await createTemporaryUser({
        email: guestData.email,
        first_name: guestData.first_name,
        last_name: guestData.last_name,
        phone: guestData.phone
    });
};

module.exports = {
    migrateGuestCartToDatabase,
    createGuestUser
};

