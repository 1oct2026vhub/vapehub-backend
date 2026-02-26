const bcrypt = require('bcrypt');
const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { User, UserAddress, Referral, ReferralMethod, Role, Connect, MailSubscription } = require("../../../models");
const jwt = require("jsonwebtoken")
const sendEmail = require("../../../library/sendEmail");
const constants = require('../../../config/constants');
const { createNotification } = require('../../notification/helper/notification.helper');
const { Op } = require('sequelize');
const { Order, Transaction } = require('../../../models');

// Contact us API - Get admin contact information
const getContactInfo = async (req, res) => {
    try {
        // Get admin users with contact information
        const adminUsers = await User.findAll({
            include: [{
                model: Role,
                as: "roles",
                where: { is_admin_panel: true },
                attributes: ["role", "permission"]
            }],
            attributes: [
                "id", 
                "first_name", 
                "last_name", 
                "email", 
                "phone",
                "super_user"
            ],
            where: {
                blocked: false, // Only active admin users
                email_verified_at: { [Op.ne]: null } // Only verified users
            },
            order: [
                ['super_user', 'DESC'] // Super users first
            ]
        });

        // Get primary admin contact (super user or first admin)
        const primaryAdmin = adminUsers.find(user => user.super_user) || adminUsers[0];

        // Get all admin contacts
        const adminContacts = adminUsers.map(user => ({
            id: user.id,
            name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Admin',
            email: user.email,
            phone: user.phone,
            role: user.roles?.role || 'Admin',
            is_primary: user.super_user || false
        }));

        // Get company contact information from environment variables
        const companyInfo = {
            name: process.env.COMPANY_NAME || 'VapeHub',
            email: process.env.COMPANY_EMAIL || primaryAdmin?.email,
            phone: process.env.COMPANY_PHONE || primaryAdmin?.phone,
            address: process.env.COMPANY_ADDRESS || '',
            website: process.env.COMPANY_WEBSITE || process.env.FRONTEND_URL,
            support_email: process.env.SUPPORT_EMAIL || primaryAdmin?.email,
            support_phone: process.env.SUPPORT_PHONE || primaryAdmin?.phone
        };

        // Business hours (can be customized)
        const businessHours = {
            monday: { open: '09:00', close: '18:00', closed: false },
            tuesday: { open: '09:00', close: '18:00', closed: false },
            wednesday: { open: '09:00', close: '18:00', closed: false },
            thursday: { open: '09:00', close: '18:00', closed: false },
            friday: { open: '09:00', close: '18:00', closed: false },
            saturday: { open: '10:00', close: '16:00', closed: false },
            sunday: { open: '00:00', close: '00:00', closed: true }
        };

        // Social media links (can be customized)
        const socialMedia = {
            facebook: process.env.FACEBOOK_URL || '',
            twitter: process.env.TWITTER_URL || '',
            instagram: process.env.INSTAGRAM_URL || '',
            linkedin: process.env.LINKEDIN_URL || ''
        };

        const contactInfo = {
            company: companyInfo,
            primary_contact: primaryAdmin ? {
                name: `${primaryAdmin.first_name || ''} ${primaryAdmin.last_name || ''}`.trim() || 'Admin',
                email: primaryAdmin.email,
                phone: primaryAdmin.phone,
                role: primaryAdmin.roles?.role || 'Admin'
            } : null,
            admin_contacts: adminContacts,
            business_hours: businessHours,
            social_media: socialMedia,
            support: {
                email: companyInfo.support_email,
                phone: companyInfo.support_phone,
                response_time: '24-48 hours',
                available_hours: 'Monday to Friday, 9 AM - 6 PM'
            }
        };

        successResponse(res, contactInfo, 'Contact information retrieved successfully');
    } catch (error) {
        console.error('Error fetching contact information:', error);
        return errorResponse(res, error, 'Failed to fetch contact information', 500);
    }
};

// Submit contact form
const submitContactForm = async (req, res) => {
    try {
        const { 
            name, 
            email, 
            phone, 
            subject, 
            message, 
            contact_type = 'general' // general, support, sales, technical
        } = req.body;

        // Validate required fields
        if (!name || !email || !subject || !message) {
            return errorResponse(res, {}, 'Name, email, subject, and message are required', 400);
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return errorResponse(res, {}, 'Please provide a valid email address', 400);
        }

        // Get admin users to send notification
        const adminUsers = await User.findAll({
            include: [{
                model: Role,
                as: "roles",
                where: { is_admin_panel: true },
                attributes: ["role"]
            }],
            attributes: ["id", "email", "first_name", "super_user"],
            where: {
                blocked: false,
                email_verified_at: { [Op.ne]: null }
            }
        });

        // Get primary admin for email
        const primaryAdmin = adminUsers.find(user => user.super_user) || adminUsers[0];

        if (!primaryAdmin) {
            return errorResponse(res, {}, 'No admin contact found', 500);
        }

        // Prepare email data
        const emailData = {
            emailTypes: 'CONTACT_FORM',
            to: primaryAdmin.email,
            context: {
                adminName: primaryAdmin.first_name || 'Admin',
                customerName: name,
                customerEmail: email,
                customerPhone: phone || 'Not provided',
                subject: subject,
                message: message,
                contactType: contact_type,
                submittedAt: new Date().toLocaleString(),
                adminEmail: primaryAdmin.email
            },
            attachments: ""
        };

        // Send email to admin
        await sendEmail(emailData.to, emailData.emailTypes, emailData.context, emailData.attachments);

        // Send confirmation email to customer
        const customerEmailData = {
            emailTypes: 'CONTACT_CONFIRMATION',
            to: email,
            context: {
                customerName: name,
                subject: subject,
                message: message,
                adminEmail: primaryAdmin.email,
                adminPhone: primaryAdmin.phone || 'Available on request',
                responseTime: '24-48 hours',
                submittedAt: new Date().toLocaleString(),
                reference: `CF-${Date.now()}`
            },
            attachments: ""
        };

        await sendEmail(customerEmailData.to, customerEmailData.emailTypes, customerEmailData.context, customerEmailData.attachments);

        // Create notifications for all admin users
        const notificationPromises = adminUsers.map(admin => 
            createNotification({
                userId: admin.id,
                type: 'contact',
                action: 'received',
                data: {
                    customerName: name,
                    customerEmail: email,
                    subject: subject,
                    contactType: contact_type,
                    message: message.length > 100 ? message.substring(0, 100) + '...' : message
                },
                title: `New Contact Form: ${subject}`,
                url: '/admin/contacts'
            })
        );

        await Promise.all(notificationPromises);

        // Log the contact form submission
        console.info('Contact form submitted:', {
            customerName: name,
            customerEmail: email,
            subject: subject,
            contactType: contact_type,
            adminNotified: adminUsers.length
        });

        successResponse(res, {
            message: 'Contact form submitted successfully',
            reference: `CF-${Date.now()}`,
            response_time: '24-48 hours'
        }, 'Contact form submitted successfully');

    } catch (error) {
        console.error('Error submitting contact form:', error);
        return errorResponse(res, error, 'Failed to submit contact form', 500);
    }
};

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

        // Fetch MailSubscription data for this user
        const subscription = await MailSubscription.findOne({
            where: { user_id },
            attributes: ['email', 'subscribed', 'isDiscountUsed', 'createdAt', 'updatedAt']
        });

        // return res.status(200).json({ success: true, data: user });
        successResponse(res, {
            ...user.toJSON(),
            subscription: subscription ? subscription.toJSON() : null
        },  'Success');

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

        // Check if this email has already been referred
        const existingReferral = await Referral.findOne({
            where: { 
                email: email,
                referrer_id: referrer_id,
                status: {
                    [Op.in]: ['pending', 'completed']
                }
            }
        });

        if (existingReferral) {
            return errorResponse(res, {}, 'You have already referred this email address' , 400);
        }

        // Get the referral method
        const referralMethod = await ReferralMethod.findOne({
            where: { 
                status: 'active',
                // primary: true,  //previous is false
                refer_type: 'referral'  //new
            },
            attributes: ['id', 'referral_value_type', 'referral_value', 'refer_type', 'minimum_purchase', 'maximum_purchase']
        });

        // if (!referralMethod) {
        //     return errorResponse(res, {}, 'No active referral method found' , 400);
        // }

        try {
            // Generate unique 8-letter referral coupon code using email and timestamp
            const timestamp = Date.now().toString(36).toUpperCase(); // Convert timestamp to base36
            const emailHash = Buffer.from(email).toString('base64')
                .replace(/[^A-Za-z]/g, '')  // Remove non-letters
                .slice(0, 4)                // Take first 4 letters
                .toUpperCase();             // Convert to uppercase
            
            const referral_coupon_code =  `${emailHash}${timestamp.slice(-4)}`; // Combine email hash and last 4 chars of timestamp;
            // Get active referral method
            const activeReferrerMethod = await ReferralMethod.findOne({
                where: { 
                    status: 'active',
                    // primary: true,
                    refer_type: 'referrer'
                },
                attributes: ['id', 'referral_value_type', 'referral_value', 'minimum_purchase', 'maximum_purchase', 'refer_type']
            });
            const referral_coupon = await Referral.create({
                email: email,
                referrer_id: referrer_id,
                referred_user_id: null, // Set to null since user hasn't registered yet
                referral_code: referral_code,
                referral_coupon_code: referral_coupon_code,
                status: 'pending',
                referral_value_type: referralMethod ? referralMethod.referral_value_type : 'percentage',
                referral_value: referralMethod ? referralMethod.referral_value : '0',
                minimum_purchase: referralMethod?.refer_type === 'referral' ? referralMethod.minimum_purchase : 0,
                maximum_purchase: referralMethod?.refer_type === 'referral' ? referralMethod.maximum_purchase : null,
                referrer_data: activeReferrerMethod ? {
                    id: activeReferrerMethod.id,
                    referral_value_type: activeReferrerMethod.referral_value_type,
                    referral_value: activeReferrerMethod.referral_value,
                    minimum_purchase: activeReferrerMethod.minimum_purchase,
                    maximum_purchase: activeReferrerMethod.maximum_purchase,
                    refer_type: activeReferrerMethod.refer_type
                } : null
            });
            // Send referral email with coupon code
            const username = email.split('@')[0];
            const referralLink = `${process.env.FRONTEND_URL}/?referral_code=${referral_code}`;
            const referralValue = referralMethod ? referralMethod.referral_value : '0';
            const referralValueType = referralMethod ? referralMethod.referral_value_type === 'percentage' ? '%' : '' : '';
            const poundsymbol = referralMethod ? referralMethod.referral_value_type === 'fixed' ? '£' : '' : '';
            const data = {
                emailTypes: constants.emailTypes.REFER_A_FRIEND,
                to: email,
                context: {
                    userName: username,
                    referralLink: referralLink,
                    token: referralMethod ? referral_coupon_code : null,
                    referralValue: referralMethod ? referralMethod.referral_value : '0',
                    referralValueType: referralMethod ? referralMethod.referral_value_type === 'percentage' ? '%' : '' : '',
                    minimumPurchase: referralMethod ? referralMethod.minimum_purchase : '0',
                    maximumPurchase: referralMethod ? referralMethod.maximum_purchase : null,
                    emailContent1: "Just when you thought your friend hasn't gifted you in a while, well here you have it! You have been invited to shop at VapeHub",
                    emailContent2: referralMethod ? 
                        `and you've got a ${poundsymbol}${referralValue}${referralValueType} discount waiting for you!` +
                        (parseFloat(referralMethod.minimum_purchase) > 0 || parseFloat(referralMethod.maximum_purchase) ? 
                            ' This coupon can only be applied when your purchase amount is' +
                            (parseFloat(referralMethod.minimum_purchase) > 0 ? ` at least minimum purchase amount of ${poundsymbol}${referralMethod.minimum_purchase}` : '') +
                            (parseFloat(referralMethod.minimum_purchase) > 0 && parseFloat(referralMethod.maximum_purchase) ? ' and' : '') +
                            (parseFloat(referralMethod.maximum_purchase) ? ` up to maximum purchase amount of ${poundsymbol}${referralMethod.maximum_purchase}` : '') +
                            '.' : '') +
                        ' Use the coupon code below to claim your offer.' : ''
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
                    value_type: referralMethod ? referralMethod.referral_value_type : '',
                    value: referralMethod ? referralMethod.referral_value : ''
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

        // Soft delete all mail subscriptions associated with this user
        const mailSubscriptions = await MailSubscription.findAll({
            where: { user_id: userId }
        });
        for (const subscription of mailSubscriptions) {
            await subscription.destroy();
        }

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
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        // Execute all queries in parallel for better performance
        const [
            referrer,
            totalReferrals,
            pendingReferrals,
            referralMethods,
            totalRecentReferrals,
            recentReferrals
        ] = await Promise.all([
            // Get referrer info
            Referral.findOne({
                where: {
                    referred_user_id: userId
                }
            }),

            // Get total referrals count
            Referral.count({
                where: {
                    referrer_id: userId,
                    status: 'completed'
                }
            }),

            // Get pending referrals count
            Referral.count({
                where: {
                    referrer_id: userId,
                    status: 'pending'
                }
            }),

            // Get active referral methods
            ReferralMethod.findAll({
                where: { status: 'active'}, //, primary: true
                order: [['created_at', 'DESC']],
                attributes: ['id', 'referral_value_type', 'referral_value', 'refer_type', 'status']
            }),

            // Get total count of recent referrals for pagination
            Referral.count({
                where: {
                    referrer_id: userId,
                    status: {
                        [Op.in]: ['completed', 'applied']
                    }
                }
            }),

            // Get recent referrals with user details (paginated)
            Referral.findAll({
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
                limit,
                offset
            })
        ]);

        // Separate referral methods based on refer_type
        const referralMethod = referralMethods.find(method => method.refer_type === 'referral');
        const referrerMethod = referralMethods.find(method => method.refer_type === 'referrer');

        const response = {
            total_referrals: totalReferrals || 0,
            pending_referrals: pendingReferrals || 0,
            referred_coupon_code: referrer ? referrer.referral_coupon_code : null,
            referrer: referrer ? referrer : null,
            referral_methods: referralMethods,
            referred_user_method: referralMethod ? {
                id: referralMethod.id,
                referral_value_type: referralMethod.referral_value_type,
                referral_value: referralMethod.referral_value,
                refer_type: referralMethod.refer_type,
                status: referralMethod.status,
                // primary: referralMethod.primary
            } : null,
            referrer_user_method: referrerMethod ? {
                id: referrerMethod.id,
                referral_value_type: referrerMethod.referral_value_type,
                referral_value: referrerMethod.referral_value,
                refer_type: referrerMethod.refer_type,
                status: referrerMethod.status,
                // primary: referrerMethod.primary
            } : null,
            recent_referrals: {
                data: recentReferrals.length > 0 ? recentReferrals.map(referral => ({
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
                })) : [],
                pagination: {
                    total: totalRecentReferrals,
                    page,
                    limit,
                    total_pages: Math.ceil(totalRecentReferrals / limit)
                }
            }
        };

        successResponse(res, response, 'Referral statistics retrieved successfully');
    } catch (error) {
        // Log error
        errorResponse(res, error, 'Failed to fetch referral statistics');
    }
};

// const createReferralMethod = async (req, res) => {
//     try {
//         const { referral_value_type, referral_value, status, primary } = req.body;

//         // Validate required fields
//         if (!referral_value_type || !referral_value) {
//             throw {
//                 statusCode: 400,
//                 message: 'Referral value type and value are required'
//             };
//         }

//         // Validate referral_value_type
//         if (!['percentage', 'fixed'].includes(referral_value_type)) {
//             throw {
//                 statusCode: 400,
//                 message: 'Referral value type must be either percentage or fixed'
//             };
//         }

//         // If this is set as primary, unset any existing primary methods
//         if (primary) {
//             await ReferralMethod.update(
//                 { primary: false },
//                 { where: { primary: true } }
//             );
//         }

//         // Create new referral method
//         const referralMethod = await ReferralMethod.create({
//             referral_value_type,
//             referral_value,
//             status: status || 'active',
//             primary: primary || false
//         });

//         // Create notification for new referral method
//         await createNotification({
//             userId: req.user.id,
//             type: 'system',
//             action: 'alert',
//             data: {
//                 message: 'New referral method has been created successfully'
//             },
//             title: 'Referral Method Created',
//             url: '/admin/referral-methods'
//         });

//         successResponse(res, referralMethod, 'Referral method created successfully');
//     } catch (error) {
//         console.error('Error creating referral method:', error);
//         return errorResponse(res, error, error.message);
//     }
// };

// const updateReferralMethod = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const { referral_value_type, referral_value, status, primary } = req.body;

//         // Find the referral method
//         const referralMethod = await ReferralMethod.findByPk(id);
//         if (!referralMethod) {
//             throw {
//                 statusCode: 404,
//                 message: 'Referral method not found'
//             };
//         }

//         // Validate referral_value_type if provided
//         if (referral_value_type && !['percentage', 'fixed'].includes(referral_value_type)) {
//             throw {
//                 statusCode: 400,
//                 message: 'Referral value type must be either percentage or fixed'
//             };
//         }

//         // If setting as primary, unset any existing primary methods
//         if (primary) {
//             await ReferralMethod.update(
//                 { primary: false },
//                 { 
//                     where: { 
//                         primary: true,
//                         id: { [Op.ne]: id } // Exclude current method
//                     }
//                 }
//             );
//         }

//         // Update the referral method
//         const updateData = {};
//         if (referral_value_type) updateData.referral_value_type = referral_value_type;
//         if (referral_value) updateData.referral_value = referral_value;
//         if (status) updateData.status = status;
//         if (typeof primary === 'boolean') updateData.primary = primary;

//         await referralMethod.update(updateData);

//         // Create notification for referral method update
//         await createNotification({
//             userId: req.user.id,
//             type: 'system',
//             action: 'alert',
//             data: {
//                 message: 'Referral method has been updated successfully'
//             },
//             title: 'Referral Method Updated',
//             url: '/admin/referral-methods'
//         });

//         // Fetch updated record
//         const updatedMethod = await ReferralMethod.findByPk(id);

//         successResponse(res, updatedMethod, 'Referral method updated successfully');
//     } catch (error) {
//         console.error('Error updating referral method:', error);
//         return errorResponse(res, error, error.message);
//     }
// };

// const getReferralMethods = async (req, res) => {
//     try {
//         const referralMethods = await ReferralMethod.findAll({
//             order: [['created_at', 'DESC']]
//         });

//         successResponse(res, referralMethods, 'Referral methods retrieved successfully');
//     } catch (error) {
//         console.error('Error fetching referral methods:', error);
//         return errorResponse(res, error, error.message);
//     }
// };

// Get public contact us info for user side
const getContactUsInfo = async (req, res) => {
    try {
        const connect = await Connect.findOne({ order: [['updated_at', 'DESC']] });
        if (!connect) {
            return errorResponse(res, {}, 'Contact info not found', 404);
        }
        return successResponse(res, connect, 'Contact info retrieved successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Get only social/contact info for user side
const getConnectSocialInfo = async (req, res) => {
    try {
        const connect = await Connect.findOne({
            order: [['updated_at', 'DESC']],
            attributes: ['instagram', 'whatsapp', 'facebook', 'email', 'phone_number']
        });
        if (!connect) {
            return errorResponse(res, {}, 'Contact info not found', 404);
        }
        return successResponse(res, connect, 'Social contact info retrieved successfully');
    } catch (error) {
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
    getContactInfo,
    submitContactForm,
    getContactUsInfo,
    getConnectSocialInfo,
    // createReferralMethod,
    // updateReferralMethod,
    // getReferralMethods
};