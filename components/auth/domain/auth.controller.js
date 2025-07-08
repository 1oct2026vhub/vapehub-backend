const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid')
const bcrypt = require('bcrypt');
const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { User, Role, Referral, ReferralMethod, Coupon } = require("../../../models");
const sendEmail = require("../../../library/sendEmail");
const constants = require('../../../config/constants');
const moment = require('moment');
const { generateAuthJwtToken, verifyAuthJwtToken } = require('../helper/jwt.helper');
const referral_method = require('../../../models/referral_method');
const { createNotification } = require('../../notification/helper/notification.helper');
const logger = require('../../../utils/logger');


module.exports.login = async (req, res, next) => {
    try {
        const { email, password, resendVerificationEmail = false } = req.body;

        // Find user by email, including soft-deleted records
        const user = await User.findOne({
            where: { email },
            paranoid: false // Include soft-deleted records
        });
        if (!user) {
            return errorResponse(res, {}, "Invalid email or password", 400);
        }

        // Check if user is soft-deleted
        if (user.deletedAt) {
            return errorResponse(res, {}, "Account is deleted", 400);
        }

        if (user.blocked) {
            return errorResponse(res, { message: "Your account has been blocked. Please reach out to support for assistance." }, 400);
        }

        // Verify password
        const isPasswordValid = await user.verifyPassword(password);
        if (!isPasswordValid) {
            return errorResponse(res, {},"Invalid email or password", 400);
        }

        if (!user?.email_verified_at) {
            const tokenExpiryDate = new Date(user?.token_expiry);
            const currentTime = new Date();
            if (resendVerificationEmail || tokenExpiryDate < currentTime) {
                // Token expiry is more than 5 minutes away, send a new verification email
                const token = uuid()
                const token_expiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
                user.token = token;
                user.token_expiry = token_expiry;
                await user.save();
                const username = user?.first_name ?? user.email.split('@')[0];
                const data = {
                    emailTypes: constants.emailTypes.REGISTER,
                    to: user.email,
                    context: {
                        userName: username,
                        verificationLink: `${process.env.FRONTEND_URL}/my-account/verify-email?token=${token}`,
                        expiryTime: moment(token_expiry).format('LLLL'),
                    },
                    attachments: ""
                }
                await sendEmail(data.to, data.emailTypes, data.context, data.attachments);
                return errorResponse(res, { message: "Email not verified. A new verification email has been sent to your email address" }, 400);
            } else if (tokenExpiryDate > currentTime) {
                // Email not verified and token is still valid
                throw {
                    message: "Email not verified! Please verify your email",
                    statusCode: 400,
                    errors: {
                        email: "Email not verified! Please verify your email",
                    }
                };
            }
        }
        const { accessToken, refreshToken } = generateAuthJwtToken({ id: user.id });
        const userData = {
            id: user.id,
            first_name: user?.first_name,
            last_name: user?.last_name,
            email: user?.email,
            phone: user?.phone,
            profile_pic_url: user?.profile_pic_url,
            gender: user?.gender,
            dob: user?.dob,
        }
        // res, data, message, statusCode
        return successResponse(res, { ...userData, accessToken, refreshToken });
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

module.exports.register = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        let{ referral_code } = req.query;
        if (!referral_code) {
            referral_code = null;
        }

        //  check email already exists
        const userExists = await User.findOne({ where: { email }, paranoid: false });
        if (userExists && userExists.deletedAt) {
            return errorResponse(res, {}, "This user email already deleted", 400);
        }
        if (userExists) {
            throw {
                message: "User email already exists",
                statusCode: 400,
                errors: { email: "User email already exists" },
            }
        }

        let referrer = null;
        if (referral_code) {
            referrer = await User.findOne({
                where: { referral_code },
                attributes: ['id', 'referral_code', 'referral_points', 'email']
            });

        }

        const role = await Role.findOne({
            attributes: ['id'],
            where: { permission: 'user' },
        });
        const roleId = role?.id || null;

        const token = uuid()
        const token_expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        
        // Create user with initial data
        const user = await User.create({
            email,
            password: password,
            token,
            token_expiry,
            roleId,
            referred_by: referrer ? referrer.id : null
        });
        const username = user?.first_name ?? user.email.split('@')[0];

        // Create notifications for all admin users
        await createNotification({
            user_id: null,
            type: 'system',
            action: 'alert',
            data: {
                message: `New user registered: ${email}`
            },
            title: 'New User Registration',
            url: '/admin/users',
            is_admin: true
        });

        // If referral code is provided, find the referrer
        if (referral_code && referrer) {
            const referral_method = await Referral.findOne({
                where: {
                    email: email,
                    referral_code: referral_code,
                },
                attributes: ['id', 'referrer_id', 'referral_code', 'referral_coupon_code', 'email', 'status', 'minimum_purchase', 'maximum_purchase', 'referral_value_type', 'referral_value']
            });

            // Get active referral method
            const activeReferralMethod = await ReferralMethod.findOne({
                where: { 
                    status: 'active',
                    // primary: true,  //primary true and refer_type = 'referral' means it is referred person    //previous is false  
                    refer_type: 'referral'  //new
                },
                attributes: ['id', 'referral_value_type', 'referral_value', 'minimum_purchase', 'maximum_purchase', 'refer_type']
            });
            // Get active referral method
            const activeReferrerMethod = await ReferralMethod.findOne({
                where: { 
                    status: 'active',
                    // primary: true,
                    refer_type: 'referrer'
                },
                attributes: ['id', 'referral_value_type', 'referral_value', 'minimum_purchase', 'maximum_purchase', 'refer_type']
            });

            if(referral_method){   //email referral 
                await Referral.update({
                    referred_user_id: user.id,
                    // referral_value_type: activeReferralMethod ? activeReferralMethod.referral_value_type : 'percentage',
                    // referral_value: activeReferralMethod ? activeReferralMethod.referral_value : '0',
                    // minimum_purchase: activeReferralMethod?.refer_type === 'referral' ? activeReferralMethod.minimum_purchase : 0,
                    // maximum_purchase: activeReferralMethod?.refer_type === 'referral' ? activeReferralMethod.maximum_purchase : null,
                    // referrer_data: activeReferrerMethod ? {
                    //     id: activeReferrerMethod.id,
                    //     referral_value_type: activeReferrerMethod.referral_value_type,
                    //     referral_value: activeReferrerMethod.referral_value,
                    //     minimum_purchase: activeReferrerMethod.minimum_purchase,
                    //     maximum_purchase: activeReferrerMethod.maximum_purchase,
                    //     refer_type: activeReferrerMethod.refer_type
                    // } : null
                }, {
                    where: {
                        email: email,
                        referral_code: referral_code
                    }
                });
            }
            else{   //social media referral
                // Generate unique 8-letter referral coupon code using email and timestamp
                const timestamp = Date.now().toString(36).toUpperCase(); // Convert timestamp to base36
                const emailHash = Buffer.from(email).toString('base64')
                    .replace(/[^A-Za-z]/g, '')  // Remove non-letters
                    .slice(0, 4)                // Take first 4 letters
                    .toUpperCase();             // Convert to uppercase
                
                const referral_coupon = `${emailHash}${timestamp.slice(-4)}`;              
                await Referral.create({
                    email: email,
                    referrer_id: referrer.id,
                    referral_code: referral_code,
                    referral_coupon_code: referral_coupon,
                    status: 'pending',
                    referred_user_id: user.id,
                    points_awarded: 10,
                    referral_value_type: activeReferralMethod ? activeReferralMethod.referral_value_type : 'percentage',
                    referral_value: activeReferralMethod ? activeReferralMethod.referral_value : '0',
                    minimum_purchase: activeReferralMethod?.refer_type === 'referral' ? activeReferralMethod.minimum_purchase : 0,
                    maximum_purchase: activeReferralMethod?.refer_type === 'referral' ? activeReferralMethod.maximum_purchase : null,
                    referrer_data: activeReferrerMethod ? {
                        id: activeReferrerMethod.id,
                        referral_value_type: activeReferrerMethod.referral_value_type,
                        referral_value: activeReferrerMethod.referral_value,
                        minimum_purchase: activeReferrerMethod.minimum_purchase,
                        maximum_purchase: activeReferrerMethod.maximum_purchase,
                        refer_type: activeReferrerMethod.refer_type
                    } : null
                });
            }
            
            // Delete any existing referral data for this email where referred_user_id is null
            // This ensures only the current referrer-referred pair can use the coupon
            await Referral.destroy({
                where: {
                    email: email,
                    referred_user_id: null
                }
            });
            // Create notification for admin about referral registration
            await createNotification({
                user_id: null,
                type: 'system',
                action: 'alert',
                data: {
                    message: `New user ${email} registered using referral code ${referral_code} from user ${referrer.email}`
                },
                title: 'New Referral Registration',
                url: '/admin/users',  // URL to the admin users list
                is_admin: true
            });
            const welcomeData = {
                emailTypes: constants.emailTypes.WELCOME,
                to: user.email,
                context: {
                    userName: username,
                    couponCode: null,
                    
                },
                attachments: ""
            };
            await sendEmail(welcomeData.to, welcomeData.emailTypes, welcomeData.context, welcomeData.attachments);
        }
        else{
            // Create a random coupon code for the new user
            const generateCouponCode = () => {
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$&';
                let result = '';
                for (let i = 0; i < 8; i++) {
                    result += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                return result;
            };

            // Generate unique coupon code
            let couponCode;
            let isUnique = false;
            while (!isUnique) {
                couponCode = generateCouponCode();
                const existingCoupon = await Coupon.findOne({ where: { code: couponCode } });
                if (!existingCoupon) {
                    isUnique = true;
                }
            }
            const activeReferrersMethod = await ReferralMethod.findOne({
                where: { 
                    status: 'active',
                    // primary: true,
                    refer_type: 'referrer'
                },
                attributes: ['id', 'referral_value_type', 'referral_value', 'minimum_purchase', 'maximum_purchase', 'refer_type']
            });
            // Create coupon for the new user
            await Coupon.create({
                code: couponCode,
                description: `Welcome coupon for ${username}`,
                discount_type: 'percentage',
                discount_value: activeReferrersMethod ? parseFloat(activeReferrersMethod.referral_value) : 10.00,
                minimum_purchase: activeReferrersMethod ? parseFloat(activeReferrersMethod.minimum_purchase) : 50.00,
                // maximum_discount: 25.00, // Maximum discount of $25
                usage_limit: 1, // Single use coupon
                usage_count: 0,
                is_single_use: true,
                start_date: new Date(),
                end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // Valid for 30 days
                status: 'active',
                coupon_user: user.id, // Assign to the specific user
                created_by: null // System created
            });

            // Send welcome email after successful verification
            const welcomeEmailData = {
                emailTypes: constants.emailTypes.WELCOME,
                to: user.email,
                context: {
                    userName: username,
                    couponCode: couponCode,
                    discountValue: activeReferrersMethod ? `${activeReferrersMethod.referral_value}%` : '10%',
                    minimumPurchase: activeReferrersMethod ? `$${activeReferrersMethod.minimum_purchase}` : '$50',
                    // maximumDiscount: '$25'
                },
                attachments: ""
            };
            console.log(username);  
            await sendEmail(welcomeEmailData.to, welcomeEmailData.emailTypes, welcomeEmailData.context, welcomeEmailData.attachments);
        
        }


        const data = {
            emailTypes: constants.emailTypes.REGISTER,
            to: user.email,
            context: {
                userName: username,
                verificationLink: `${process.env.FRONTEND_URL}/my-account/verify-email?token=${token}`,
                expiryTime: moment(token_expiry).format('LLLL'),
            },
            attachments: ""
        }
        
        await sendEmail(data.to, data.emailTypes, data.context, data.attachments);

        return successResponse(res, { message: "Verification email has been sent to your email address." }, "Verification email has been sent! Please verify your email to log in.", 201);
    } catch (error) {
        return errorResponse(res, error);
    }
}

module.exports.verifyEmail = async (req, res, next) => {
    try {
        const { token } = req.query;
        // Additional security checks for browser vs automated requests
        const securityChecks = {
            referer: req.headers.referer || req.headers.referrer,
            origin: req.headers.origin,
            secFetchDest: req.headers['sec-fetch-dest'],
            secFetchMode: req.headers['sec-fetch-mode'],
            secFetchSite: req.headers['sec-fetch-site'],
            secFetchUser: req.headers['sec-fetch-user'],
            acceptLanguage: req.headers['accept-language'],
            connection: req.headers.connection,
            cookie: req.headers.cookie,
            host: req.headers.host,
            userAgent: req.headers['user-agent']
        };

        // Check if request is from a browser or valid client
        const userAgent = req.headers['user-agent'];
        const validUserAgents = [
            // Browsers
            'Mozilla', // Firefox, Chrome, Safari, Edge
            'Chrome',
            'Safari',
            'Edge',
            'Opera',
            'Firefox',
            'MSIE', // Internet Explorer
            'Trident', // Internet Explorer
            'Mobile Safari', // Mobile Safari
            'Android', // Android Browser
            'Edg', // Microsoft Edge
            // API Clients
            'node', // Node.js
            'axios', // Axios HTTP client
            'PostmanRuntime', // Postman
            'curl', // cURL
            'python-requests', // Python Requests
            'Java-http-client', // Java HTTP Client
            'Go-http-client', // Go HTTP Client
            'PHP-http-client', // PHP HTTP Client
            'Ruby', // Ruby HTTP Client
            'fetch', // Fetch API
            'XMLHttpRequest' // XHR
        ];

        // Check if user agent exists and contains any valid identifier
        const isValidUserAgent = userAgent && validUserAgents.some(agent => {
            // Case insensitive check
            return userAgent.toLowerCase().includes(agent.toLowerCase());
        });

        if (!isValidUserAgent) {
            throw {
                message: "Invalid request source",
                statusCode: 403,
                errors: {
                    source: "Verification must be done through a valid client"
                }
            }
        }

        // Check if request has proper headers
        const acceptHeader = req.headers.accept || '';
        const validAcceptTypes = [
            'text/html',
            'application/json',
            '*/*',
            'text/*',
            'application/*'
        ];

        if (!validAcceptTypes.some(type => acceptHeader.includes(type))) {
            throw {
                message: "Invalid request format",
                statusCode: 403,
                errors: {
                    format: "Request must be made through a valid client"
                }
            }
        }

        const user = await User.findOne({ where: { token } });
        if (!user) {
            throw {
                message: "Invalid link or link expired",
                statusCode: 400,
                errors: {
                    token: "Invalid link or link expired",
                }
            }
        }

        // check is user verified email
        if (user?.email_verified_at) {
            throw {
                message: "Email already verified",
                statusCode: 400,
                errors: {
                    email: "Email already verified",
                }
            }
        }

        if (user.token_expiry < new Date()) {
            throw {
                message: "Invalid link or link expired",
                statusCode: 400,
                errors: {
                    token: "Invalid link or link expired",
                }
            }
        }

        user.email_verified_at = new Date();
        user.token = null;
        user.token_expiry = null;
        await user.save();
        
        // update referral record if referrer exists
        // let referral_code = null;
        // let referrer = null;
        // if (user.referred_by) {
        //     referrer = await User.findOne({
        //         where: { id: user.referred_by },
        //         attributes: ['id', 'referral_code', 'referral_points']
        //     });
        //     if (referrer) {
        //         referral_code = referrer.referral_code;
        //     }
        // }
        // if (referral_code) {
        //     await Referral.update(
        //         { 
        //             points_awarded: 10,
        //             status: 'completed'
        //         },
        //         { 
        //             where: { 
        //                 referrer_id: referrer.id,
        //                 referred_user_id: user.id,
        //                 referral_code: referral_code
        //             }
        //         }
        //     );
        //     await referrer.addReferralPoints(10); // Add 10 points for successful referral
        // }
        const userData = {
            id: user.id,
            first_name: user?.first_name,
            last_name: user?.last_name,
            email: user?.email,
            phone: user?.phone,
            profile_pic_url: user?.profile_pic_url,
            gender: user?.gender,
            dob: user?.dob,
        }
        const { accessToken, refreshToken } = generateAuthJwtToken({ id: user.id });
        return successResponse(res, { message: "Email verified successfully", ...userData, accessToken, refreshToken }, "Email verified successfully", 200);

    } catch (error) {
        return errorResponse(res, error);
    }
}

module.exports.forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ where: { email } });
        if (!user) {
            throw {
                message: "User not found",
                statusCode: 404,
                errors: {
                    email: "User not found",
                }
            }
        }
        if (!user?.email_verified_at) {
            throw {
                message: "Email is not verified. Please verify your email",
                statusCode: 400,
                errors: {
                    email: "Email is not verified. Please verify your email",
                }
            }
        }
        const token = uuid()
        const token_expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hours
        user.token = token;
        user.token_expiry = token_expiry;
        await user.save();

        const data = {
            emailTypes: constants.emailTypes.FORGOT_PASSWORD,
            to: user.email,
            context: {
                userName: user?.first_name ?? user.email.split('@')[0],
                resetPasswordLink: `${process.env.FRONTEND_URL}/my-account/reset-password?token=${token}`,
                expiryTime: moment(token_expiry).format('LLLL'),
            },
            attachments: ""
        }
        await sendEmail(data.to, data.emailTypes, data.context, data.attachments);

        return successResponse(res, { message: "Password reset email sent successfully" }, "Password reset email sent successfully", 200);

    } catch (error) {
        return errorResponse(res, error);
    }
}

module.exports.resetPassword = async (req, res, next) => {
    try {
        const { token, password } = req.body;
        const user = await User.findOne({ where: { token } });
        if (!user || user.token_expiry < new Date()) {
            throw {
                message: "Invalid link or link expired",
                statusCode: 400,
                errors: {
                    token: "Invalid link or link expired",
                }
            }
        }
        // compare to current user password
        const passwordMatch = await bcrypt.compareSync(password, user.password);
        if (passwordMatch) {
            throw {
                message: "New password cannot be same as current password",
                statusCode: 400,
                errors: {
                    password: "New password cannot be same as current password",
                }
            }
        }
        const hashedPassword = await bcrypt.hashSync(password, 10);
        user.password = hashedPassword;
        user.token = null;
        user.token_expiry = null;
        await user.save();
        const userData = {
            id: user.id,
            first_name: user?.first_name,
            last_name: user?.last_name,
            email: user?.email,
            phone: user?.phone,
            profile_pic_url: user?.profile_pic_url,
            gender: user?.gender,
            dob: user?.dob,
        }
        const { accessToken, refreshToken } = generateAuthJwtToken({ id: user.id });
        return successResponse(res, { message: "Password reset successful.", ...userData, accessToken, refreshToken }, "Password reset successful.", 200);
    } catch (error) {
        return errorResponse(res, error);
    }

}

module.exports.refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        // Verify the refresh token
        const decoded = verifyAuthJwtToken(refreshToken, process.env.JWT_REFRESH_SECRET);
        const user = await User.findByPk(decoded.id);
        if (!user) {
            throw {
                message: "User not found",
                statusCode: 404,
                errors: {
                    refreshToken: "User not found",
                }
            }
        }
        const { accessToken, refreshToken: newRefreshToken } = generateAuthJwtToken({ id: user.id });
        return successResponse(res, { accessToken, refreshToken: newRefreshToken }, "Token refreshed successfully", 200);
    } catch (error) {
        return errorResponse(res, error);
    }
}