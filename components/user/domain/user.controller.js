const bcrypt = require('bcrypt');
const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { User, UserAddress, Referral, ReferralMethod } = require("../../../models");
const jwt = require("jsonwebtoken")
const sendEmail = require("../../../library/sendEmail");
const constants = require('../../../config/constants');
const { createNotification } = require('../../notification/helper/notification.helper');
const { Op } = require('sequelize');
const { Order, Transaction } = require('../../../models');

const userProfile = async (req, res, next) => {
    try {
        const user_id = req.user.id; // Get user ID from authentication middleware

        const user = await User.findOne({
            where: { id: user_id },
            attributes: ['first_name', 'last_name', 'email', 'phone', 'referral_code', 'referred_by', 'referral_points', ]
        });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // return res.status(200).json({ success: true, data: user });
        successResponse(res, user,  'Success');

    } catch (error) {
        console.error('Error fetching user profile:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }

}

const updateUserProfile = async (req, res, next) => {
    try {
        const user_id = req.user.id;
        const { first_name, last_name, email, phone } = req.body;
        const user = await User.findOne({where: { id: user_id }});
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Update fields
        user.first_name = first_name || user.first_name;
        user.last_name = last_name || user.last_name;
        // user.email = email || user.email;
        user.phone = phone || user.phone;

        await user.save();

        // Create notification for profile update
        await createNotification({
            userId: user_id,
            type: 'system',
            action: 'alert',
            data: {
                message: 'Your profile has been updated successfully'
            },
            title: 'Profile Updated',
            url: '/my-account/personal-info'
        });

        return res.status(200).json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Error updating profile:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
}

const fetchUserAddress = async (req, res, next) => {
    try {
        // Assuming the user ID comes from the authenticated request (e.g., from a JWT token)
        const userId = req.user.id;

        const user = await User.findOne({
            where: { id: userId },
            attributes: ['id', 'first_name', 'last_name', 'email', 'phone'], // Exclude sensitive data
            include: [{
                model: UserAddress, // Ensure UserAddress is correctly referenced (Uppercase 'U')
                as: 'UserAddresses', // Must match the alias defined in the model association
                attributes: [
                    'id', 'name', 'last_name', 'company_name', 'country', 
                    'street', 'apartment', 'town', 'county', 'post_code', 'phone', 'region'
                ]
            }]
        });

        if (!user) {
            return errorResponse(res, error, 'User not found', 404);
        }

        successResponse(res, user,  'Success');
    } catch (error) {
        console.error('Error fetching user address:', error);
        return errorResponse(res, error, {message: 'Internal Server Error'}, 500);
    }

}

const createUserAddress = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { name, last_name, company_name, country, street, apartment, town, county, post_code, phone, region } = req.body;

        // Create new address
        const newAddress = await UserAddress.create({
            user_id: userId,
            updated_by: userId,
            name,
            last_name,
            company_name,
            country,
            street,
            apartment,
            town,
            county,
            post_code,
            phone,
            region
        });

        // Create notification for new address
        await createNotification({
            userId: userId,
            type: 'system',
            action: 'alert',
            data: {
                message: 'New address has been added successfully'
            },
            title: 'New Address Added',
            url: '/my-account/addresses'
        });

        successResponse(res, newAddress, 'Address added successfully', 201);

    } catch (error) {
        console.error('Error adding user address:', error);
        return errorResponse(res, error, {message: 'Internal Server Error'}, 500);
    }

}

const updateUserAddress = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const addressId = req.params.id;
        const { name, last_name, company_name, country, street, apartment, town, county, post_code, phone, region } = req.body;

        const userAddress = await UserAddress.findOne({
            where: { id: addressId, user_id: userId }
        });

        if (!userAddress) {
            return errorResponse(res, {},  'Address not found', 404);
        }

        await userAddress.update({
            name: name || userAddress.name,
            last_name: last_name || userAddress.last_name,
            company_name: company_name || userAddress.company_name,
            country: country || userAddress.country,
            street: street || userAddress.street,
            apartment: apartment || userAddress.apartment,
            town: town || userAddress.town,
            county: county || userAddress.county,
            post_code: post_code || userAddress.post_code,
            phone: phone || userAddress.phone,
            region: region || userAddress.region,
            updated_by: userId
        });

        // Create notification for address update
        await createNotification({
            userId: userId,
            type: 'system',
            action: 'alert',
            data: {
                message: 'Address has been updated successfully'
            },
            title: 'Address Updated',
            url: '/my-account/addresses'
        });

        successResponse(res, userAddress, 'Address updated successfully', 200);
    } catch (error) {
        console.error('Error updating user address:', error);
        return errorResponse(res, error, {message: 'Internal Server Error'}, 500);
    }
}

const deleteUserAddress = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const addressId = req.params.id;

        const userAddress = await UserAddress.findOne({
            where: { id: addressId, user_id: userId }
        });

        if (!userAddress) {
            return errorResponse(res, {}, {message: 'Address not found'}, 404);
        }

        await userAddress.destroy();

        // Create notification for address deletion
        await createNotification({
            userId: userId,
            type: 'system',
            action: 'alert',
            data: {
                message: 'Address has been deleted successfully'
            },
            title: 'Address Deleted',
            url: '/my-account/addresses'
        });

        successResponse(res, userAddress, 'Address deleted successfully', 200);
    } catch (error) {
        console.error('Error deleting user address:', error);
        return errorResponse(res, error, {message: 'Internal Server Error'}, 500);
    }
}

const changeUserPassword = async (req, res, next) => {
    const { email, currentPassword, newPassword } = req.body;
    const user_id = req.user.id;
    try {
        const user = await User.findOne({where:{id:user_id, email}});
        if (!user) {
            return errorResponse(res, {}, 'User not found', 404);
        }

        // Check if current and new passwords are the same
        if (currentPassword === newPassword) {
            return errorResponse(res, {}, 'New password cannot be the same as current password', 400);
        }

        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
            return errorResponse(res, {}, 'Current password is incorrect', 400);
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedNewPassword;
        await user.save();

        // Create notification for password change
        await createNotification({
            userId: user_id,
            type: 'system',
            action: 'alert',
            data: {
                message: 'Your password has been changed successfully'
            },
            title: 'Password Changed',
            url: '/my-account/security'
        });

        successResponse(res, user, 'Password updated successfully', 200);
    } catch (error) {
        console.error('Error changing password:', error);
        return errorResponse(res, error, {message: 'Internal Server Error'}, 500);
    }
}

const referFriend = async (req, res, next) => {
    try {
        const { email, referral_code } = req.body;
        const referrer_id = req.user.id;

        // Check if the email is already registered
        const existingUser = await User.findOne({ 
            where: { email },
            attributes: ['id', 'email']
        });
        if (existingUser) {
            return errorResponse(res, {}, 'User with this email already exists' , 400);
        }

        // Check if the referral code is valid
        const referrer = await User.findOne({ where: { referral_code } });
        if (!referrer) {
            return errorResponse(res, {}, 'Invalid referral code' , 400);
        }

        // Get the primary active referral method
        const referralMethod = await ReferralMethod.findOne({
            where: { 
                status: 'active',
                primary: true
            },
            attributes: ['id', 'referral_value_type', 'referral_value']
        });

        if (!referralMethod) {
            return errorResponse(res, {}, 'No active referral method found' , 400);
        }

        try {
            // Generate unique 8-letter referral coupon code using email and timestamp
            const timestamp = Date.now().toString(36).toUpperCase(); // Convert timestamp to base36
            const emailHash = Buffer.from(email).toString('base64')
                .replace(/[^A-Za-z]/g, '')  // Remove non-letters
                .slice(0, 4)                // Take first 4 letters
                .toUpperCase();             // Convert to uppercase
            
            const referral_coupon_code =  `${emailHash}${timestamp.slice(-4)}`; // Combine email hash and last 4 chars of timestamp;
            const referral_coupon = await Referral.create({
                email: email,
                referrer_id: referrer_id,
                referral_code: referral_code,
                referral_coupon_code: referral_coupon_code
            });
            // Send referral email with coupon code
            const username = email.split('@')[0];
            const referralLink = `${process.env.FRONTEND_URL}/?referral_code=${referral_code}`;
            const data = {
                emailTypes: constants.emailTypes.REFER_A_FRIEND,
                to: email,
                context: {
                    userName: username,
                    referralLink: referralLink,
                    token: referral_coupon_code,
                    referralValue: referralMethod.referral_value,
                    referralValueType: referralMethod.referral_value_type === 'percentage' ? '%' : ''
                },
                attachments: ""
            };
            await sendEmail(data.to, data.emailTypes, data.context, data.attachments);

            // Create notification for referrer
            await createNotification({
                userId: referrer_id,
                type: 'system',
                action: 'alert',
                data: {
                    message: `Referral invitation sent to ${email}`
                },
                title: 'Friend Referral',
                url: '/my-account/referrals'
            });

            successResponse(res, { 
                message: "Referral invitation sent successfully",
                referral_coupon_code: referral_coupon_code,
                referral_method: {
                    value_type: referralMethod.referral_value_type,
                    value: referralMethod.referral_value
                }
            }, 'Success');
        } catch (emailError) {
            console.error('Error sending referral email:', emailError);
            // Still create notification but indicate email failed
            await createNotification({
                userId: referrer_id,
                type: 'system',
                action: 'alert',
                data: {
                    message: `Failed to send referral invitation to ${email}. Please try again later.`
                },
                title: 'Referral Email Failed',
                url: '/my-account/referrals'
            });
            return errorResponse(res, emailError, { message: 'Failed to send referral email' }, 500);
        }
    } catch (error) {
        console.error('Error in referFriend:', error);
        return errorResponse(res, error, { message: 'Internal Server Error' }, 500);
    }
};

const processReferral = async (userId, referralCode) => {
    try {
        const referrer = await User.findOne({ where: { referral_code: referralCode } });
        if (!referrer) {
            return;
        }

        // Define point values for different actions
        const POINTS = {
            SIGNUP: 100,           // Points for successful signup
            FIRST_PURCHASE: 200,   // Points for first purchase
            COMPLETE_PROFILE: 50   // Points for completing profile
        };

        // Update referred user
        await User.update(
            { referred_by: referrer.id },
            { where: { id: userId } }
        );

        // Add signup points to referrer
        await referrer.addReferralPoints(POINTS.SIGNUP);

        // Create notification for referrer
        await createNotification({
            userId: referrer.id,
            type: 'system',
            action: 'alert',
            data: {
                message: `You earned ${POINTS.SIGNUP} points for a successful referral signup!`
            },
            title: 'Referral Points Earned'
        });

        // Create notification for referred user
        await createNotification({
            userId: userId,
            type: 'system',
            action: 'alert',
            data: {
                message: `You joined through ${referrer.first_name}'s referral!`
            },
            title: 'Welcome Through Referral'
        });

        return POINTS;
    } catch (error) {
        console.error('Error processing referral:', error);
    }
};

// Add function to award points for first purchase
const awardFirstPurchasePoints = async (userId) => {
    try {
        const user = await User.findByPk(userId);
        if (!user || !user.referred_by) return;

        const referrer = await User.findByPk(user.referred_by);
        if (!referrer) return;

        const POINTS = {
            FIRST_PURCHASE: 200
        };

        await referrer.addReferralPoints(POINTS.FIRST_PURCHASE);

        // Create notification for referrer
        await createNotification({
            userId: referrer.id,
            type: 'system',
            action: 'alert',
            data: {
                message: `You earned ${POINTS.FIRST_PURCHASE} points for your referral's first purchase!`
            },
            title: 'Referral Purchase Points'
        });

        return POINTS.FIRST_PURCHASE;
    } catch (error) {
        console.error('Error awarding first purchase points:', error);
    }
};

// Add function to award points for profile completion
const awardProfileCompletionPoints = async (userId) => {
    try {
        const user = await User.findByPk(userId);
        if (!user || !user.referred_by) return;

        const referrer = await User.findByPk(user.referred_by);
        if (!referrer) return;

        const POINTS = {
            COMPLETE_PROFILE: 50
        };

        await referrer.addReferralPoints(POINTS.COMPLETE_PROFILE);

        // Create notification for referrer
        await createNotification({
            userId: referrer.id,
            type: 'system',
            action: 'alert',
            data: {
                message: `You earned ${POINTS.COMPLETE_PROFILE} points for your referral completing their profile!`
            },
            title: 'Profile Completion Points'
        });

        return POINTS.COMPLETE_PROFILE;
    } catch (error) {
        console.error('Error awarding profile completion points:', error);
    }
};

const deleteAccount = async (req, res) => {
    const userId = req.user.id;
    
    try {
        const user = await User.findByPk(userId);

        if (!user) {
            return errorResponse(res, {}, {message: 'User not found'}, 401);
        }

        // Prevent super users from deleting their own account
        if (user.super_user) {
            return errorResponse(res, {}, {message: 'Super users cannot delete their own account'}, 403);
        }

        // Check for active orders
        const activeOrders = await Order.findAll({
            where: {
                user_id: user.id,
                status: {
                    [Op.notIn]: ['cancel', 'fail', 'refunded', 'delivered', 'pending', 'completed', 'draft', 'return_received' ]
                }
            }
        });

        if (activeOrders.length > 0) {
            return errorResponse(res, {}, 'Account with active orders cannot be deleted. Please cancel or complete all orders first.', 400);
        }

        // Check for pending refunds
        const pendingRefunds = await Transaction.findAll({
            where: {
                userId: user.id,
                transactionType: 'refund',
                status: 'pending'
            },
            include: [{
                model: Order,
                as: 'order',
                attributes: ['order_unique_id']
            }]
        });

        if (pendingRefunds.length > 0) {
            const orderIds = pendingRefunds.map(refund => refund.order.order_unique_id).join(', ');
            return errorResponse(res, {}, "Your account has pending refunds. Please wait for all refunds to be processed before deleting your account.", 400);
        }

        // Store user email and name before deletion
        const userEmail = user.email;
        const userName = user.first_name || user.email.split('@')[0];

        // Create notification before account deletion
        await createNotification({
            userId: userId,
            type: 'system',
            action: 'alert',
            data: {
                message: 'Your account has been deleted successfully'
            },
            title: 'Account Deleted',
            url: '/my-account/personal-info'
        });

        // Delete the user account
        await user.destroy();

        // Send account deletion confirmation email
        try {
            await sendEmail(userEmail, constants.emailTypes.ACCOUNT_DELETION, {
                userName: userName
            });
        } catch (emailError) {
            console.error('Error sending account deletion email:', emailError);
            // Log the error but don't fail the account deletion
        }

        successResponse(res, user, 'Account deleted successfully', 200);
    } catch (error) {
        console.error('Error deleting account:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

const getReferralStats = async (req, res) => {
    try {
        const userId = req.user.id;
        // Get total referrals count
        const referrer = await Referral.findOne({
            where: {
                referred_user_id: userId
            }
        });
        // Get total referrals count
        const totalReferrals = await Referral.count({
            where: {
                referrer_id: userId,
                status: 'completed'
            }
        });
        // Get pending referrals count
        const pendingReferrals = await Referral.count({
            where: {
                referrer_id: userId,
                status: 'pending'
            }
        });
        // Get total points earned
        const totalPoints = await Referral.sum('points_awarded', {
            where: {
                referrer_id: userId,
                status: 'completed'
            }
        });

        // Get active referral methods
        const referralMethods = await ReferralMethod.findAll({
            where: { status: 'active' },
            order: [['primary', 'DESC'], ['created_at', 'DESC']],
            attributes: ['id', 'referral_value_type', 'referral_value', 'status', 'primary']
        });

        // Get recent referrals with user details
        const recentReferrals = await Referral.findAll({
            where: {
                referrer_id: userId,
                status: {
                    [Op.in]: ['completed', 'applied']
                }
            },
            include: [{
                model: User,
                as: 'referredUser',
                attributes: ['id', 'first_name', 'last_name', 'email', 'phone']
            }],
            order: [['created_at', 'DESC']],
            limit: 10
        });

        const response = {
            total_referrals: totalReferrals || 0,
            pending_referrals: pendingReferrals || 0,
            referred_coupon_code: referrer ? referrer.referral_coupon_code : null,
            referrer: referrer ? referrer : null,
            referral_methods: referralMethods,
            recent_referrals: recentReferrals.length > 0 ? recentReferrals.map(referral => ({
                id: referral.id,
                referrer_id: referral.referrer_id,
                referred_user_id: referral.referred_user_id,
                referral_code: referral.referral_code,
                referral_coupon_code: referral.referral_coupon_code,
                status: referral.status,
                points_awarded: referral.points_awarded,
                referral_value_type: referral.referral_value_type,
                referral_value: referral.referral_value,
                created_at: referral.created_at,
                referred_user: referral.referredUser ? {
                    id: referral.referredUser.id,
                    name: `${referral.referredUser.first_name} ${referral.referredUser.last_name}`,
                    email: referral.referredUser.email,
                    phone: referral.referredUser.phone
                } : null
            })) : []
        };

        successResponse(res, response, 'Referral statistics retrieved successfully');
    } catch (error) {
        console.error('Error fetching referral stats:', error);
        errorResponse(res, error, 'Failed to fetch referral statistics');
    }
};

const createReferralMethod = async (req, res) => {
    try {
        const { referral_value_type, referral_value, status, primary } = req.body;

        // Validate required fields
        if (!referral_value_type || !referral_value) {
            throw {
                statusCode: 400,
                message: 'Referral value type and value are required'
            };
        }

        // Validate referral_value_type
        if (!['percentage', 'fixed'].includes(referral_value_type)) {
            throw {
                statusCode: 400,
                message: 'Referral value type must be either percentage or fixed'
            };
        }

        // If this is set as primary, unset any existing primary methods
        if (primary) {
            await ReferralMethod.update(
                { primary: false },
                { where: { primary: true } }
            );
        }

        // Create new referral method
        const referralMethod = await ReferralMethod.create({
            referral_value_type,
            referral_value,
            status: status || 'active',
            primary: primary || false
        });

        // Create notification for new referral method
        await createNotification({
            userId: req.user.id,
            type: 'system',
            action: 'alert',
            data: {
                message: 'New referral method has been created successfully'
            },
            title: 'Referral Method Created',
            url: '/admin/referral-methods'
        });

        successResponse(res, referralMethod, 'Referral method created successfully');
    } catch (error) {
        console.error('Error creating referral method:', error);
        return errorResponse(res, error, error.message);
    }
};

const updateReferralMethod = async (req, res) => {
    try {
        const { id } = req.params;
        const { referral_value_type, referral_value, status, primary } = req.body;

        // Find the referral method
        const referralMethod = await ReferralMethod.findByPk(id);
        if (!referralMethod) {
            throw {
                statusCode: 404,
                message: 'Referral method not found'
            };
        }

        // Validate referral_value_type if provided
        if (referral_value_type && !['percentage', 'fixed'].includes(referral_value_type)) {
            throw {
                statusCode: 400,
                message: 'Referral value type must be either percentage or fixed'
            };
        }

        // If setting as primary, unset any existing primary methods
        if (primary) {
            await ReferralMethod.update(
                { primary: false },
                { 
                    where: { 
                        primary: true,
                        id: { [Op.ne]: id } // Exclude current method
                    }
                }
            );
        }

        // Update the referral method
        const updateData = {};
        if (referral_value_type) updateData.referral_value_type = referral_value_type;
        if (referral_value) updateData.referral_value = referral_value;
        if (status) updateData.status = status;
        if (typeof primary === 'boolean') updateData.primary = primary;

        await referralMethod.update(updateData);

        // Create notification for referral method update
        await createNotification({
            userId: req.user.id,
            type: 'system',
            action: 'alert',
            data: {
                message: 'Referral method has been updated successfully'
            },
            title: 'Referral Method Updated',
            url: '/admin/referral-methods'
        });

        // Fetch updated record
        const updatedMethod = await ReferralMethod.findByPk(id);

        successResponse(res, updatedMethod, 'Referral method updated successfully');
    } catch (error) {
        console.error('Error updating referral method:', error);
        return errorResponse(res, error, error.message);
    }
};

const getReferralMethods = async (req, res) => {
    try {
        const referralMethods = await ReferralMethod.findAll({
            order: [['created_at', 'DESC']]
        });

        successResponse(res, referralMethods, 'Referral methods retrieved successfully');
    } catch (error) {
        console.error('Error fetching referral methods:', error);
        return errorResponse(res, error, error.message);
    }
};

module.exports = {
    userProfile, 
    updateUserProfile, 
    fetchUserAddress, 
    createUserAddress, 
    updateUserAddress, 
    deleteUserAddress, 
    changeUserPassword, 
    referFriend, 
    processReferral, 
    awardFirstPurchasePoints, 
    awardProfileCompletionPoints, 
    deleteAccount, 
    getReferralStats,
    createReferralMethod,
    updateReferralMethod,
    getReferralMethods
};