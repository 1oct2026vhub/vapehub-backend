const bcrypt = require('bcrypt');
const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { User, UserAddress } = require("../../../models");
const jwt = require("jsonwebtoken")
const sendEmail = require("../../../library/sendEmail");
const constants = require('../../../config/constants');
const { createNotification } = require('../../notification/helper/notification.helper');

const userProfile = async (req, res, next) => {
    try {
        const user_id = req.user.id; // Get user ID from authentication middleware

        const user = await User.findOne({
            where: { id: user_id },
            attributes: ['first_name', 'last_name', 'email', 'phone']
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
            title: 'Profile Updated'
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
            title: 'New Address Added'
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
            title: 'Address Updated'
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
            title: 'Address Deleted'
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
            title: 'Password Changed'
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
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
            return errorResponse(res, {}, 'User with this email already exists' , 400);
        }

        // Check if the referral code is valid
        const referrer = await User.findOne({ where: { referral_code } });
        if (!referrer) {
            return errorResponse(res, {}, 'Invalid referral code' , 400);
        }

        try {
            // Send referral email
            const username = email.split('@')[0];
            const referralLink = `${process.env.FRONTEND_URL}/my-account/register?token=${referral_code}`;
            const data = {
                emailTypes: constants.emailTypes.REFER_A_FRIEND,
                to: email,
                context: {
                    userName: username,
                    referralLink: referralLink,
                    token: referral_code,
                    // currentYear: new Date().getFullYear()
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
                title: 'Friend Referral'
            });

            successResponse(res, { message: "Referral invitation sent successfully" }, 'Success');
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
                title: 'Referral Email Failed'
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

        // Create notification before account deletion
        await createNotification({
            userId: userId,
            type: 'system',
            action: 'alert',
            data: {
                message: 'Your account has been deleted successfully'
            },
            title: 'Account Deleted'
        });

        // Delete the user account
        await user.destroy();

        successResponse(res, user, 'Account deleted successfully', 200);
    } catch (error) {
        console.error('Error deleting account:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = {userProfile, updateUserProfile, fetchUserAddress, createUserAddress, updateUserAddress, deleteUserAddress, changeUserPassword, referFriend, processReferral, awardFirstPurchasePoints, awardProfileCompletionPoints, deleteAccount}