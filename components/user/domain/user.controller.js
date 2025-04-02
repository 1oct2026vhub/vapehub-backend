const bcrypt = require('bcrypt');
const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { User, UserAddress } = require("../../../models");
const jwt = require("jsonwebtoken")
const sendEmail = require("../../../library/sendEmail");
const constants = require('../../../config/constants');
const { createSystemNotification } = require("../../notification/helper/notification.helper");

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
                    'street', 'apartment', 'town', 'county', 'post_code', 'phone'
                ]
            }]
        });

        if (!user) {
            return errorResponse(res, error, {message: 'User not found'}, 404);
        }

        successResponse(res, user,  'Success');
    } catch (error) {
        console.error('Error fetching user address:', error);
        return errorResponse(res, error, {message: 'Internal Server Error'}, 500);
    }

}


const createUserAddress = async (req, res, next) => {
    try {
        const userId = req.user.id; // Get authenticated user ID
        const { name, last_name, company_name, country, street, apartment, town, county, post_code, phone } = req.body;

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
            phone
        });
        console.log("newAddress>>>>>", newAddress)
        // Create notification for address creation
        await createSystemNotification({
            userId,
            title: "New Address Added",
            message: `A new shipping address has been added: ${street}, ${town}`,
            data: {
                addressId: newAddress.id,
                address: `${street}, ${town}, ${post_code}`
            }
        });

        successResponse(res, newAddress,  'Address added successfully', 201);

    } catch (error) {
        console.error('Error adding user address:', error);
        return errorResponse(res, error, {message: 'Internal Server Error'}, 500);
    }

}

const updateUserAddress = async (req, res, next) => {
    try {
        const userId = req.user.id; // Get authenticated user ID
        const addressId = req.params.id; // Get address ID from request params
        const { name, last_name, company_name, country, street, apartment, town, county, post_code, phone } = req.body;

        // Find the address in the database
        const userAddress = await UserAddress.findOne({
            where: { id: addressId, user_id: userId }
        });

        if (!userAddress) {
            return errorResponse(res, {}, {message: 'Address not found'}, 404);
        }

        // Store old address for notification
        const oldAddress = `${userAddress.street}, ${userAddress.town}, ${userAddress.post_code}`;

        // Update the address
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
            updated_by: userId
        });

        // Create notification for address update
        await createSystemNotification({
            userId,
            title: "Address Updated",
            message: `Your shipping address has been updated from ${oldAddress} to ${street}, ${town}`,
            data: {
                addressId: userAddress.id,
                oldAddress,
                newAddress: `${street}, ${town}, ${post_code}`
            }
        });

        successResponse(res, userAddress,  'Address updated successfully', 200);

    } catch (error) {
        console.error('Error updating user address:', error);
        return errorResponse(res, error, {message: 'Internal Server Error'}, 500);
    }

}

const deleteUserAddress = async (req, res, next) => {
    try {
        const userId = req.user.id; // Get user ID from JWT
        const addressId = req.params.id; // Get address ID from request params

        // Find the address in the database
        const userAddress = await UserAddress.findOne({
            where: { id: addressId, user_id: userId }
        });

        if (!userAddress) {
            console.log("userAddress enter>>>>", userAddress)
            return errorResponse(res, {}, {message: 'Address not found'}, 404);
        }

        // Store address details for notification
        const addressDetails = `${userAddress.street}, ${userAddress.town}, ${userAddress.post_code}`;

        // Delete the address
        await userAddress.destroy();

        // Create notification for address deletion
        await createSystemNotification({
            userId,
            title: "Address Deleted",
            message: `Your shipping address has been deleted: ${addressDetails}`,
            data: {
                addressId,
                deletedAddress: addressDetails
            }
        });

        successResponse(res, userAddress,  'Address deleted successfully', 200);

    } catch (error) {
        console.error('Error deleting user address:', error);
        return errorResponse(res, error, {message: 'Internal Server Error'}, 500);
    }

}

const changeUserPassword = async (req, res, next) => {
    const { email, currentPassword, newPassword } = req.body;
    const user_id = req.user.id; // Assuming `user` is added to `req` by authentication middleware
    try {
        // Find the user by ID
        const user = await User.findOne({where:{id:user_id, email}});
        if (!user) {
            return errorResponse(res, {}, {message: 'User not found'}, 404);
        }

        // Verify the current password
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
            return errorResponse(res, {}, {message: 'Current password is incorrect'}, 401);
        }

        // Hash the new password
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        // Update the user's password in the database
        user.password = hashedNewPassword;
        await user.save();

        successResponse(res, user,  'Password updated successfully', 200);

    } catch (error) {
        console.error('Error changing password:', error);
        return errorResponse(res, error, {message: 'Internal Server Error'}, 500);
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

const deleteAccount = async (req, res) => {
    const userId = req.user.id; // Assuming you have the user ID in the JWT token
    
    try {
        // Find the user
        const user = await User.findByPk(userId);

        if (!user) {
            return errorResponse(res, {}, {message: 'User not found'}, 401);
        }

        // Delete the user account
        await user.destroy();

        successResponse(res, user,  'Account deleted successfully', 200);
    } catch (error) {
        console.error('Error deleting account:', error);
        return res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = {userProfile, updateUserProfile, fetchUserAddress, createUserAddress, updateUserAddress, deleteUserAddress, changeUserPassword, referFriend, deleteAccount}