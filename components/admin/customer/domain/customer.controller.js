const { v4: uuid } = require('uuid')
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { User, Role, Order, Product, ProductImage, UserAddress } = require("../../../../models");
const sendEmail = require("../../../../library/sendEmail");
const constants = require('../../../../config/constants');
const moment = require('moment');
const { Sequelize, Op } = require("sequelize");


//List all users (with pagination)
module.exports.listUsers = async (req, res) => {
    try {
        const { sort_by = 'createdAt', order = 'DESC', page = 1, limit = 10, search, deleted = "false", blocked = "false" } = req.query;

        const offset = (page - 1) * limit;

        const whereCondition = {};

        // Fetch non-admin roles
        const adminRoles = await Role.findAll({
            where: { deleted: false, is_admin_panel: true },
        });
        const roleIds = adminRoles.map(role => role.id);
        if (roleIds.length > 0) {
            whereCondition.roleId = { [Op.notIn]: roleIds };
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

        // Filter by blocked status
        if (blocked !== undefined) {
            whereCondition.blocked = blocked === "true";
        }

        const totalUsers = await User.count({
            where: whereCondition,
        });

        const users = await User.findAll({
            where: whereCondition,
            attributes: [
                "id", 
                "first_name", 
                "last_name", 
                "gender",
                "email", 
                "phone",
                "blocked", 
                "email_verified_at",
                "profile_pic_url",
                "dob",
                "createdAt", 
                "updatedAt",
            ],
            include: [{
                model: Order, 
                as: "orders", 
                attributes: [
                    "id", 
                    "order_status", 
                    "createdAt", 
                    "updatedAt" 
                ],
                required: false 
            }],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [[Sequelize.col(sort_by), order.toUpperCase()]],
            paranoid: false,
        });

        // Format the response to include order details if they exist
        const formattedUsers = users.map(user => {
            return {
                ...user.get(), // Get user data
                orders: user.orders || [] // Include orders if they exist, otherwise an empty array
            };
        });

        return successResponse(res, {
            total: totalUsers,
            page: parseInt(page),
            limit: parseInt(limit),
            users: formattedUsers,
        }, "Customers retrieved successfully", 200);

    } catch (error) {
        console.error("Error listing customers:", error);
        return errorResponse(res, { message: "An error occurred while retrieving customers." }, 500);
    }
};

//Soft Delete a User
module.exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findByPk(id);
        if (!user) {
            return errorResponse(res, { message: "User not found" }, 404);
        }

        await user.destroy(); // Soft delete enabled because `paranoid: true`
        return successResponse(res, { }, "Customer deleted successfully", 200);
    } catch (error) {
        console.error("Error deleting customer:", error);
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
            return errorResponse(res, { message: "User not found" }, 404);
        }
        
        await user.restore(); // Restores the soft-deleted user
        return successResponse(res, { }, "User restored successfully", 200);
    } catch (error) {
        console.error("Error restoring customer:", error);
        return errorResponse(res, error);
    }
};

//Soft block a User
module.exports.blockUser = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findByPk(id);
        if (!user) {            
            return res.status(404).json({ message: "User not found" });
        }
        if (user.blocked) {            
            return res.status(400).json({ message: "User is already blocked" });
        }
        user.blocked = true;
        await user.save();
        return successResponse(res, { }, "User blocked successfully", 200);
    } catch (error) {
        console.error("Error blocking customer:", error);
        return errorResponse(res, error);
    }
};

// Restore a block user
module.exports.unblockUser = async (req, res) => {
    try {
        const { id } = req.params;
        
        const user = await User.findByPk(id);

        if (!user) {            
            return res.status(404).json({ message: "User not found" });
        }
        
        if (!user.blocked) {            
            return res.status(400).json({ message: "User is active" });
        }
        
        user.blocked = false;
        await user.save();

        return successResponse(res, { }, "User unblocked successfully", 200);
    } catch (error) {
        console.error("Error unblocking customer:", error);
        return errorResponse(res, error);
    }
};

/**
 * Controller function to get user details with order information
 */
module.exports.getUserDetails = async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findByPk(id, {
            include: [
                { 
                    model: Order, 
                    as: "orders", 
                    include: [
                        { 
                            model: Product,
                            as: "products",
                            include: [
                                {
                                    model: ProductImage,
                                    as: "ProductImages",
                                    attributes: ["id", "image_url", "is_primary"]
                                }
                            ]
                        }
                    ]
                },
                {
                    model: UserAddress,
                    as: "UserAddresses", // Ensure alias matches model association
                    attributes: ["id", "name", "last_name", "company_name", "country", "street", "apartment", "town", "county", "post_code", "phone"]
                }
            ]
        });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        return successResponse(res, user, "User details retrieved successfully", 200);
    } catch (error) {
        console.error("Error fetching user details:", error);
        return errorResponse(res, error);
    }
};