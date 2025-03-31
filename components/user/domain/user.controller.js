const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { User } = require("../../../models");
const jwt = require("jsonwebtoken")
const sendEmail = require("../../../library/sendEmail");
const constants = require('../../../config/constants');

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

        const user = await User.findByPk(user_id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Update fields
        user.first_name = first_name || user.first_name;
        user.last_name = last_name || user.last_name;
        user.email = email || user.email;
        user.phone = phone || user.phone;

        await user.save();

        return res.status(200).json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Error updating profile:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }

}

const referFriend = async (req, res, next) => {
    try {
        const { email } = req.body;
        const { referral_code } = req.user
        // check if the user email already exists
        const user = await User.findOne({ where: { email } })
        if (user) {
            throw {
                message: "user already exists",
                statusCode: 400,
                errors: { email: "user already exists" },
            }
        }

        const username = email.split('@')[0];
        const data = {
            emailTypes: constants.emailTypes.REFER_A_FRIEND,
            to: email,
            context: {
                userName: username,
                referralLink: `${process.env.FRONTEND_URL}/my-account/register?token=${referral_code}`,
                token: referral_code
            },
            attachments: ""
        }
        await sendEmail(data.to, data.emailTypes, data.context, data.attachments);
        console.log("Invitation email sent.");
        successResponse(res, { message: "invitation email sent" }, 'Success');
    } catch (error) {
        console.log("🚀 ~ module.exports.listAllblogs= ~ error:", error)
        return errorResponse(res, error, error.message);
    }

}

module.exports = {userProfile, updateUserProfile, referFriend}