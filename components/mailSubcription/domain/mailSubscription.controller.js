const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { MailSubscription, MailSubscriptionSettings, User } = require("../../../models");
const { Op } = require("sequelize");
const validator = require("validator");
const logger = require("../../../library/logger");



module.exports.listMailSubscriptionItems = async (req, res, next) => {
    try {
        const mailLists = await MailSubscription.findAll();
        if (!mailLists?.[0]) {
            throw {
                message: "mailLists is empty"
            }
        }
        successResponse(res, mailLists, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }

}
module.exports.createMailSubscription = async (req, res, next) => {
    try {
        const user_id = req?.user?.id;
        const { email } = req.body;
        // findEmail already exists
        const existingEmail = await MailSubscription.findOne({ where: { email } });
        if (existingEmail) {
            throw {
                statusCode: 400,
                message: 'Email already exists'
            }
        }
        // create new mailList
        // if user is authenticated, add user_id to mailList record
        // else, set null for user_id
        const mailList = await MailSubscription.create({
            email,
            ...(user_id ? user_id : null),
            subscribed: true
        });
        successResponse(res, mailList, 'Mail subscription added successfully', 200);

    } catch (error) {
        console.log("🚀 ~ module.exports.createMailSubscription= ~ error:", error)
        return errorResponse(res, error, error.message);
    }
}
module.exports.updateMailSubscription = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { email } = req.body;
        // findEmail already exists
        const existingEmail = await MailSubscription.findOne({ where: { email } });
        if (existingEmail) {
            throw {
                statusCode: 400,
                message: 'Email already exists'
            }
        }
        const mailList = await MailSubscription.findByPk(id);
        if (!mailList) {
            throw {
                statusCode: 404,
                message: 'mailList not found'
            }
        }
        mailList.email = email || mailList.email;
        await mailList.save();
        successResponse(res, mailList, 'mailList updated successfully',);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

module.exports.deleteMailSubscription = async (req, res, next) => {
    try {
        const { email } = req.params;
        const mailList = await MailSubscription.findOne({ email });
        if (!mailList) {
            throw {
                statusCode: 404,
                message: 'mailList not found'
            }
        }
        await mailList.destroy({ force: true });
        successResponse(res, { message: 'mailList deleted successfully' });
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

module.exports.toggleMailSubscription = async (req, res, next) => {
    try {
        const user_id = req.user.id;
        // Find the mail subscription by user_id
        let mailSubscription = await MailSubscription.findOne({ where: { user_id } });
        
        let isNewlyCreated = false;
        
        if (!mailSubscription) {
            // Get user details to create new subscription
            const user = await User.findByPk(user_id);
            if (!user) {
                throw {
                    statusCode: 404,
                    message: 'User not found'
                }
            }
            // Create new mail subscription with isDiscountUsed set to true
            mailSubscription = await MailSubscription.create({
                user_id: user_id,
                email: user.email,
                subscribed: true,
                isDiscountUsed: true
            });
            isNewlyCreated = true;
        }
        
        // Only toggle the subscribed status if it's not newly created
        let newStatus = mailSubscription.subscribed;
        if (!isNewlyCreated) {
            newStatus = !mailSubscription.subscribed;
            mailSubscription.subscribed = newStatus;
            await mailSubscription.save();
        }

        const action = newStatus ? 'subscribed' : 'unsubscribed';
        const message = `Successfully ${action} from mail subscription`;

        successResponse(res, { 
            message: message,
            user_id: user_id,
            email: mailSubscription.email,
            subscribed: newStatus
        }, `${action.charAt(0).toUpperCase() + action.slice(1)} successfully`);
    } catch (error) {
        console.log("🚀 ~ module.exports.toggleMailSubscription= ~ error:", error)
        return errorResponse(res, error, error.message);
    }
}

function redirectUrls() {
    const frontendBase = String(process.env.FRONTEND_URL || "").replace(/\/$/, "");
    if (!frontendBase) {
        return { successUrl: null, invalidUrl: null };
    }
    return {
        successUrl: `${frontendBase}/unsubscribe/?success=true`,
        invalidUrl: `${frontendBase}/unsubscribe`,
    };
}

/**
 * Public unsubscribe from email link (GET or POST for RFC 8058 one-click).
 * Query `email` is preserved on one-click POST requests.
 * When `source=app`, returns JSON (frontend/API); otherwise redirects to the storefront.
 */
module.exports.publicUnsubscribeByEmail = async (req, res) => {
    const source = req.query?.source ?? req.body?.source;
    const isApp = source === "app";

    const { successUrl, invalidUrl } = redirectUrls();
    const fallbackInvalid = invalidUrl || "/unsubscribe";

    try {
        if (!isApp && (!successUrl || !invalidUrl)) {
            logger.warn("publicUnsubscribeByEmail: FRONTEND_URL is not set");
            return res.redirect(302, fallbackInvalid);
        }

        const rawEmail = req.query?.email ?? req.body?.email;
        const trimmed = typeof rawEmail === "string" ? rawEmail.trim() : "";

        if (!trimmed || !validator.isEmail(trimmed)) {
            if (isApp) {
                return errorResponse(res, { statusCode: 400 }, "Invalid email address", 400);
            }
            return res.redirect(302, invalidUrl || fallbackInvalid);
        }

        const sequelize = MailSubscription.sequelize;
        const subscription = await MailSubscription.findOne({
            where: sequelize.where(
                sequelize.fn("LOWER", sequelize.col("email")),
                Op.eq,
                trimmed.toLowerCase(),
            ),
        });

        if (!subscription) {
            if (isApp) {
                return errorResponse(
                    res,
                    { statusCode: 404 },
                    "Subscription not found for this email",
                    404,
                );
            }
            return res.redirect(302, invalidUrl || fallbackInvalid);
        }

        subscription.subscribed = false;
        await subscription.save();

        if (isApp) {
            return successResponse(
                res,
                { email: subscription.email, subscribed: false, source: "app" },
                "Successfully unsubscribed from promotional emails",
            );
        }

        return res.redirect(302, successUrl || fallbackInvalid);
    } catch (error) {
        logger.error("publicUnsubscribeByEmail:", error);
        if (isApp) {
            return errorResponse(
                res,
                error,
                error.message || "Unsubscribe failed",
                error.statusCode || 500,
            );
        }
        return res.redirect(302, (redirectUrls().invalidUrl) || fallbackInvalid);
    }
};

module.exports.getOneMailSubscriptionSetting = async (req, res, next) => {
    try {
        const setting = await MailSubscriptionSettings.findOne({
            where: { status: true }
        });

        if (!setting) {
            throw {
                message: "No active mail subscription setting found"
            };
        }

        successResponse(res, setting, 'Success');
    } catch (error) {
        errorResponse(res, error, error.message || 'Error retrieving subscription setting');
    }
};