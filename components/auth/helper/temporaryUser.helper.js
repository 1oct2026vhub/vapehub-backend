const { User } = require('../../../models');
const { generateAuthJwtToken } = require('./jwt.helper');
const bcrypt = require('bcrypt');
const { v4: uuid } = require('uuid');

/**
 * Creates a temporary user for guest checkout
 * @param {Object} guestData - Guest information
 * @param {string} guestData.email - Guest email
 * @param {string} guestData.phone - Guest phone (optional)
 * @param {string} guestData.first_name - Guest first name
 * @param {string} guestData.last_name - Guest last name
 * @returns {Promise<Object>} User object with JWT tokens
 */
module.exports.createTemporaryUser = async (guestData) => {
    const { email, phone, first_name, last_name } = guestData;
    
    // Check if email already exists (could be existing user or temporary)
    const existingUser = await User.findOne({
        where: { email },
        paranoid: false // Include soft-deleted users
    });

    // If user exists and is not temporary, throw error
    if (existingUser && !existingUser.is_temporary) {
        throw {
            statusCode: 400,
            message: 'An account with this email already exists. Please login instead.',
            errors: { email: 'Email already registered' }
        };
    }

    // If temporary user exists, reuse it (or create new one)
    let user;
    if (existingUser && existingUser.is_temporary) {
        // Update existing temporary user
        await existingUser.update({
            first_name,
            last_name,
            phone: phone || existingUser.phone,
            email_verified_at: null, // Reset verification
            blocked: false,
            deletedAt: null // Restore if soft-deleted
        });
        user = existingUser;
    } else {
        // Generate a random password for temporary users
        const randomPassword = uuid() + Math.random().toString(36).substring(2, 15);
        const hashedPassword = await bcrypt.hash(randomPassword, 10);
        
        // Create new temporary user
        user = await User.create({
            email,
            password: hashedPassword,
            first_name,
            last_name,
            phone,
            is_temporary: true,
            email_verified_at: null, // Temporary users don't need email verification
            blocked: false,
            // roleId can be null or set to default customer role
        });
    }

    // Generate JWT tokens
    const tokens = generateAuthJwtToken({ id: user.id });
    
    return {
        user: {
            id: user.id,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name,
            phone: user.phone,
            is_temporary: user.is_temporary
        },
        ...tokens
    };
};

/**
 * Converts a temporary user to a permanent account
 * @param {number} userId - Temporary user ID
 * @param {string} password - New password for permanent account
 * @returns {Promise<Object>} Updated user object
 */
module.exports.convertTemporaryToPermanent = async (userId, password) => {
    const user = await User.findByPk(userId);
    
    if (!user) {
        throw {
            statusCode: 404,
            message: 'User not found'
        };
    }

    if (!user.is_temporary) {
        throw {
            statusCode: 400,
            message: 'User is already a permanent account'
        };
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Update user to permanent
    await user.update({
        is_temporary: false,
        password: hashedPassword,
        email_verified_at: null // User needs to verify email
    });

    return user;
};

/**
 * Finds or creates temporary user by email
 * Useful for order tracking without full registration
 * @param {string} email - User email
 * @param {Object} userData - Optional user data
 * @returns {Promise<Object>} User object
 */
module.exports.findOrCreateTemporaryUser = async (email, userData = {}) => {
    let user = await User.findOne({
        where: { 
            email,
            is_temporary: true 
        },
        paranoid: false
    });

    if (!user) {
        const randomPassword = uuid() + Math.random().toString(36).substring(2, 15);
        const hashedPassword = await bcrypt.hash(randomPassword, 10);
        
        user = await User.create({
            email,
            password: hashedPassword,
            first_name: userData.first_name || null,
            last_name: userData.last_name || null,
            phone: userData.phone || null,
            is_temporary: true,
            email_verified_at: null,
            blocked: false
        });
    } else {
        // Update existing temporary user with new data if provided
        if (userData.first_name || userData.last_name || userData.phone) {
            await user.update({
                first_name: userData.first_name || user.first_name,
                last_name: userData.last_name || user.last_name,
                phone: userData.phone || user.phone,
                deletedAt: null // Restore if soft-deleted
            });
        }
    }

    return user;
};

