const { Cart } = require('../../../models');
const { createTemporaryUser } = require('../../auth/helper/temporaryUser.helper');

/**
 * Migrate cart items from localStorage to database for guest user
 * @param {number} userId - Temporary user ID
 * @param {Array} cartItems - Cart items from localStorage
 * @param {Object} transaction - Sequelize transaction
 * @returns {Promise<void>}
 */
const migrateGuestCartToDatabase = async (userId, cartItems, transaction) => {
    for (const item of cartItems) {
        const { product_id, variant_id, quantity } = item;
        
        if (!product_id || !quantity) {
            continue; // Skip invalid items
        }

        // Check if item already exists in cart
        const existingCartItem = await Cart.findOne({
            where: {
                user_id: userId,
                product_id,
                variant_id: variant_id || null
            },
            transaction
        });

        if (existingCartItem) {
            // Update quantity
            await existingCartItem.update({ quantity }, { transaction });
        } else {
            // Create new cart item
            await Cart.create({
                user_id: userId,
                product_id,
                variant_id: variant_id || null,
                quantity
            }, { transaction });
        }
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

