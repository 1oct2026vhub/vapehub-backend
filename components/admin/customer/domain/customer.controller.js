const { v4: uuid } = require('uuid')
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { User, Role } = require("../../../../models");
const sendEmail = require("../../../../library/sendEmail");
const constants = require('../../../../config/constants');
const moment = require('moment');
const { Op } = require("sequelize");


//List all users (with pagination)
module.exports.listUsers = async (req, res) => {
    try {
        const { sort_by = 'createdAt', order = 'DESC',page = 1, limit = 10, search, deleted, blocked } = req.query;

        const offset = (page - 1) * limit;

        const whereCondition = {};

        deleted = false;

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
            whereCondition.deletedAt = deleted === "true";
        }

        // Filter by blocked status
        if (blocked !== undefined) {
            whereCondition.blocked = blocked === "true";
        }

        const users = await User.findAndCountAll({
            where: whereCondition,
            include: [
                { model: Role, as: "roles", attributes: ["id", "role"] },
                { model: Order, as: "orders", attributes: [[sequelize.fn("COUNT", sequelize.col("orders.id")), "order_count"]] }
            ],
            group: ["User.id"],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: [[sort_by, order]],
        });

        return successResponse(res, {  
            total: users.count,
            page: parseInt(page),
            limit: parseInt(limit),
            users: users.rows }, 
            "Customers retrieved successfully", 200);

    } catch (error) {
        console.error("Error listing customer:", error);
        return errorResponse(res, error);
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
        
        user.blocked = false;
        await user.save();

        return successResponse(res, { }, "User unblocked successfully", 200);
    } catch (error) {
        console.error("Error unblocking customer:", error);
        return errorResponse(res, error);
    }
};