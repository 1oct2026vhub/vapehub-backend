const { v4: uuid } = require('uuid')
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { User, Role } = require("../../../../models");
const sendEmail = require("../../../../library/sendEmail");
const constants = require('../../../../config/constants');
const moment = require('moment');
const { Sequelize, Op } = require("sequelize");


module.exports.roles = async (req, res, next) => {
    try {
        let { deleted = "false" } = req.query;

        // Convert deleted query parameter to a boolean
        deleted = deleted === "true";

        // Fetch roles based on the deleted flag
        const roles = await Role.findAll({
            where: { deleted },
        });

        // Check if no roles were found
        if (roles.length === 0) {
            return errorResponse(res, { message: "No roles found" }, "Not Found", 404);
        }

        // Return success response
        return successResponse(res, { roles }, "Roles retrieved successfully");
    } catch (error) {
        console.log(error);
        return errorResponse(res, error, error.message);
    }
}



//Create a new user
module.exports.createUser = async (req, res) => {
    try {
        const { first_name, last_name, email, password, phone, roleId, gender = 'male', dob = null } = req.body;

        //  check email already exists
        const userExists = await User.findOne({ where: { email } });
        if (userExists) {
            throw {
                message: "User email already exists",
                statusCode: 400,
                errors: { email: "User email already exists" },
            }
        }

        const token = uuid()
        const token_expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours


        const newUser = await User.create({
            first_name,
            last_name,
            email,
            password: password,
            phone,
            roleId,
            gender,
            dob,
            token,
            token_expiry
        });

        if(newUser){
            const username = newUser?.first_name ?? newUser.email.split('@')[0];
            
            const data = {
                emailTypes: constants.emailTypes.REGISTER,
                to: newUser.email,
                context: {
                    userName: username,
                    verificationLink: `${process.env.HOST_URL}/api/admin/auth/verify-email?token=${token}`,
                    expiryTime: moment(token_expiry).format('LLLL'),
                },
                attachments: ""
            }
            await sendEmail(data.to, data.emailTypes, data.context, data.attachments);

            return successResponse(res, { newUser }, "User created successfully", 200);
        }
        else{
            throw {
                message: "Failed to create user",
                statusCode: 400,
                errors: { email: "Failed to create user" },
            }
        }

        
    } catch (error) {
        console.error("Error creating user:", error);
        return errorResponse(res, error);
    }
};

// Update an existing user
module.exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { first_name, last_name, email, password, phone, roleId, gender, dob } = req.body;

        // Find the user
        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Update fields
        if (first_name) user.first_name = first_name;
        if (last_name) user.last_name = last_name;
        if (email) user.email = email;
        if (phone) user.phone = phone;
        if (roleId) user.roleId = roleId;
        if (gender) user.gender = gender;
        if (dob) user.dob = dob;
        if (password) user.password = password;

        await user.save();

        return successResponse(res, { user }, "User updated successfully", 200);
    } catch (error) {
        console.error("Error updating user:", error);
        return errorResponse(res, error);
    }
};

//List all users (with pagination)
module.exports.listUsers = async (req, res) => {
    try {
        const { sort_by = 'createdAt', order = 'DESC',page = 1, limit = 10, roleId, search, deleted } = req.query;

        const offset = (page - 1) * limit;

        const whereCondition = {};

        // Filter by roleId if provided
        if (roleId) {
            whereCondition.roleId = roleId;
        }

        // Search by first name, last name, email, phone number, or gender
        if (search) {
            whereCondition[Op.or] = [
                { first_name: { [Op.like]: `%${search}%` } },
                { last_name: { [Op.like]: `%${search}%` } },
                { email: { [Op.like]: `%${search}%` } },
                { phone: { [Op.like]: `%${search}%` } },
                { gender: { [Op.like]: `%${search}%` } }
            ];
        }

        // Filter by deleted flag if provided
        if (deleted !== undefined) {
            whereCondition.deletedAt = deleted === "true" ? { [Op.ne]: null } : null;
        }

        const users = await User.findAndCountAll({
            where: whereCondition,
            include: [{ model: Role, as: "roles", attributes: ["id", "role"] }],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [[sort_by, order]],
        });

        return successResponse(res, {  
            total: users.count,
            page: parseInt(page),
            limit: parseInt(limit),
            users: users.rows }, 
            "Users retrieved successfully", 200);

    } catch (error) {
        console.error("Error listing users:", error);
        return errorResponse(res, error);
    }
};

//Soft Delete a User
module.exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findByPk(id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        await user.destroy(); // Soft delete enabled because `paranoid: true`
        return successResponse(res, { }, "User deleted successfully", 200);
    } catch (error) {
        console.error("Error deleting user:", error);
        return errorResponse(res, error);
    }
};

// Restore a soft-deleted user
module.exports.restoreUser = async (req, res) => {
    try {
        const { id } = req.params;
        
        const user = await User.findOne({
            where: { id },
            paranoid: false // Allows retrieving soft-deleted records
        });
        
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        
        await user.restore(); // Restores the soft-deleted user
        return successResponse(res, { }, "User restored successfully", 200);
    } catch (error) {
        console.error("Error restoring user:", error);
        return errorResponse(res, error);
    }
};