const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid')
const bcrypt = require('bcrypt');
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { User, Role } = require("../../../../models");
const sendEmail = require("../../../../library/sendEmail");
const constants = require('../../../../config/constants');
const moment = require('moment');
const { generateAuthJwtToken, verifyAuthJwtToken } = require('../../../auth/helper/jwt.helper');


module.exports.login = async (req, res, next) => {
    try {
        const { email, password, resendVerificationEmail = false } = req.body;

        // Find user by email, include role
        const user = await User.findOne({
            where: { email },
            include: [
            {
                model: Role,
                as: "roles", // Correct association name from User model
                attributes: ["id", "role", "permission", "is_admin_panel"], // Fetch role details
            },
            ],
        });
        
        if (!user) {
            return errorResponse(res, { message: "Invalid email or password" },"Invalid email or password",400);
        }
        
        // Ensure user has a role and is part of the admin panel
        if (!user.roles) {
            return errorResponse(res, { message: "Unauthorized: No role assigned" },"Unauthorized: No role assigned",403);
        }
        
        // Handle MySQL BOOLEAN stored as tinyint (0/1) vs JavaScript boolean (true/false)
        const isAdminPanel = user.roles.is_admin_panel;
        if (isAdminPanel !== 1 && isAdminPanel !== true) {
            return errorResponse(res, { message: "Unauthorized: Admin access required" },"Unauthorized: Admin access required",403);
        }

        if (user.blocked) {
            return errorResponse(res, { message: "Your account has been blocked. Please reach out to support for assistance." },"Your account has been blocked. Please reach out to support for assistance.",400);
        }
        // Verify password
        const isPasswordValid = await user.verifyPassword(password);
        if (!isPasswordValid) {
            return errorResponse(res, { message: "Invalid email or password" },"Invalid email or password", 400);
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
                        verificationLink: `${process.env.ADMIN_FRONTEND_URL}/email-verify?token=${token}`,
                        expiryTime: moment(token_expiry).format('LLLL'),
                    },
                    attachments: ""
                }
                await sendEmail(data.to, data.emailTypes, data.context, data.attachments);
                return errorResponse(res, { message: "Email not verified. A new verification email has been sent to your email address" },"Email not verified. A new verification email has been sent to your email address", 400);
            } else if (tokenExpiryDate > currentTime) {
                // Email not verified and token is still valid
                throw new Error("Email not verified! Please verify your email");
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
        return errorResponse(res, error, error.message, 500);
    }
}

module.exports.verifyEmail = async (req, res, next) => {
    try {
        const { token } = req.query;
        const user = await User.findOne({ where: { token } });
        if (!user) {
            throw new Error("Invalid link or link expired");
        }

        if (user.token_expiry < new Date()) {
            throw new Error("Invalid link or link expired");
        }
        user.email_verified_at = new Date();
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
        return successResponse(res, { message: "Email verified successfully", ...userData, accessToken, refreshToken }, "Email verified successfully", 200);

    } catch (error) {
        return errorResponse(res, error, error.message, 500);
    }
}

module.exports.forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({
            where: { email },
            include: [
                {
                    model: Role,
                    as: "roles",
                    attributes: ["is_admin_panel"],
                },
            ],
        });
        
        if (!user) {
            throw new Error("User not found");
        }

        // Check if user has admin panel access
        if (!user.roles?.is_admin_panel) {
            return errorResponse(res, { message: "Unauthorized: Admin access required" }, "Unauthorized: Admin access required", 403);
        }

        if (!user?.email_verified_at) {
            throw new Error("Email is not verified. Please verify your email first.");
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
                resetPasswordLink: `${process.env.ADMIN_FRONTEND_URL}/reset-password?token=${token}`,
                expiryTime: moment(token_expiry).format('LLLL'),
            },
            attachments: ""
        }
        await sendEmail(data.to, data.emailTypes, data.context, data.attachments);

        return successResponse(res, { message: "Password reset email sent successfully" }, "Password reset email sent successfully", 200);

    } catch (error) {
        return errorResponse(res, error, error.message, 500);
    }
}

module.exports.resetPassword = async (req, res, next) => {
    try {
        const { token, password, confirmPassword } = req.body;
        
        if (password !== confirmPassword) {
            throw new Error("Password and confirm password do not match");
        }

        const user = await User.findOne({ 
            where: { token },
            include: [
                {
                    model: Role,
                    as: "roles",
                    attributes: ["is_admin_panel"],
                },
            ],
        });

        if (!user || user.token_expiry < new Date()) {
            throw new Error("Invalid link or link expired");
        }

        // Check if user has admin panel access
        if (!user.roles?.is_admin_panel) {
            return errorResponse(
                res, 
                { message: "This email is not registered for admin access" }, 
                "This email is not registered for admin access", 
                403
            );
        }

        // Only compare to current user password if password exists
        if (user.password !== null && user.password !== undefined) {
            const passwordMatch = await bcrypt.compare(password, user.password);
            if (passwordMatch) {
                throw new Error("New password cannot be same as current password");
            }
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        user.password = hashedPassword;
        user.token = null;
        user.token_expiry = null;
        await user.save();

        const { accessToken, refreshToken } = generateAuthJwtToken({ id: user.id });
        return successResponse(res, { message: "Password reset successful! Please log in to continue.", accessToken, refreshToken }, "Password reset successful! Please log in to continue.", 200);
    } catch (error) {
        return errorResponse(res, error, error.message, 500 );
    }
}

module.exports.refreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;
        // Verify the refresh token
        const decoded = verifyAuthJwtToken(refreshToken, process.env.JWT_REFRESH_SECRET);
        const user = await User.findByPk(decoded.id);
        if (!user) {
            throw new Error("User not found");
        }
        const { accessToken, refreshToken: newRefreshToken } = generateAuthJwtToken({ id: user.id });
        return successResponse(res, { accessToken, refreshToken: newRefreshToken }, "Token refreshed successfully", 200);
    } catch (error) {
        return errorResponse(res, error, error.message, 500 );
    }
}