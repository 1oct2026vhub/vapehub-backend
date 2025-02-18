const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { User } = require("../../../models");
const jwt = require("jsonwebtoken")
const sendEmail = require("../../../library/sendEmail");
const constants = require('../../../config/constants');

module.exports.referFriend = async (req, res, next) => {
    try {
        const { email } = req.body;
        const { id: user_id } = req.user
        const payload = { email: email, referer_id: user_id }
        const token = await jwt.sign(payload, process.env.JWT_KEY_SECRET)
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
                referralLink: `${process.env.FRONTEND_URL}/my-account/register?token=${token}`,
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