const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid')
const bcrypt = require('bcrypt');
const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { User } = require("../../../models");
const sendEmail = require("../../../library/sendEmail");
const constants = require('../../../config/constants');
const moment = require('moment');


module.exports.login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        console.log("🚀 ~ module.exports.login= ~ email, password:", email, password)

        // Validate user credentials (this is just an example, use your actual validation method)
        const user = await User.findOne({ where: { email } });
        if (!user || !user.verifyPassword(password)) {
            return res.status(401).json({ message: "Invalid username or password" });
        }

        const accessToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "15m" });
        const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });

        // res, data, message, statusCode
        return successResponse(res, { accessToken, refreshToken });


    } catch (error) {
        return errorResponse(res, error);
    }
}

module.exports.register = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        //  check email already exists
        const userExists = await User.findOne({ where: { email } });
        if (userExists) {
            throw {
                message: "User already exists",
                statusCode: 400,
                errors: { email: "User eamil already exists" },
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const token = uuid()
        const token_expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        const user = await User.create({
            email,
            password: password,
            token,
            token_expiry
        });
        const accessToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "15m" });
        const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: "30d" });

        const username = user?.first_name ?? user.email.split('@')[0];

        const data = {
            emailTypes: constants.emailTypes.REGISTER,
            to: user.email,
            context: {
                userName: username,
                verificationLink: `${process.env.HOST_URL}/api/auth/verify-email?token=${token}`,
                expiryTime: moment(token_expiry).format('LLLL'),
            },
            attachments: ""
        }
        await sendEmail(data.to, data.emailTypes, data.context, data.attachments);
        return successResponse(res, { ...user, accessToken, refreshToken }, "User created successfully", 201);

    } catch (error) {
        return errorResponse(res, error);
    }
}

module.exports.verifyEmail = async (req, res, next) => {
    try {
        const { token } = req.query;
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
        return successResponse(res, { message: "Email verified successfully", email: user?.email, id: user?.id }, "Email verified successfully", 200);

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
                resetPasswordLink: `${process.env.HOST_URL}/api/auth/reset-password?token=${token}`,
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
        console.log("🚀 ~ module.exports.resetPassword= ~ token, password:", token, password)
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
        user.password = password;
        user.token = null;
        user.token_expiry = null;
        await user.save();
        return successResponse(res, { message: "Password reset successfully" }, "Password reset successfully", 200);
    } catch (error) {
        return errorResponse(res, error);
    }

}