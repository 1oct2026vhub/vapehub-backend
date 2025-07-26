const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { MailSubscription, User } = require("../../../models");



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
            console.log("mailSubscription>>>", mailSubscription);
            // Create new mail subscription with isDiscountUsed set to true
            mailSubscription = await MailSubscription.create({
                user_id: user_id,
                email: user.email,
                subscribed: true,
                isDiscountUsed: true
            });
            console.log("mailSubscription>>>", mailSubscription);
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