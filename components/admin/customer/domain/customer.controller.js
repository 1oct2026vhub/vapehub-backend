const { v4: uuid } = require('uuid')
const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { User, Role, Order, Product, ProductImage, UserAddress, ProductVariant, OrderItem, MailSubscription } = require("../../../../models");
const sendEmail = require("../../../../library/sendEmail");
const constants = require('../../../../config/constants');
const moment = require('moment');
const { Sequelize, Op } = require("sequelize");


//List all users (with pagination)
module.exports.listUsers = async (req, res) => {
    try {
        const { 
            sort_by = 'createdAt', 
            order = 'DESC', 
            page = 1, 
            limit = 10, 
            search, 
            deleted = "false", 
            blocked = "all",
            verified = "all" 
        } = req.query;

        // Validate sort_by parameter and set default if invalid
        const allowedSortFields = [
            'id', 'first_name', 'last_name', 'email', 'phone', 
            'gender', 'createdAt', 'updatedAt', 'deletedAt',
            'email_verified_at', 'blocked', 'dob',
            'aov', 'total_order_count', 'total_spend', 'last_ordered_at'
        ];
        
        const validatedSortBy = allowedSortFields.includes(sort_by) ? sort_by : 'createdAt';

        // Validate order parameter and set default if invalid
        const validOrders = ['ASC', 'DESC'];
        const validatedOrder = validOrders.includes(order.toUpperCase()) ? order.toUpperCase() : 'DESC';

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

        // Exclude guest users (temporary users)
        whereCondition.is_temporary = false;

        // Search by first name, last name, email, phone number, or gender
        if (search) {
            whereCondition[Op.or] = [
                { id: { [Op.like]: `%${search}%` } },
                { first_name: { [Op.like]: `%${search}%` } },
                { last_name: { [Op.like]: `%${search}%` } },
                { email: { [Op.like]: `%${search}%` } },
                { phone: { [Op.like]: `%${search}%` } },
                { gender: { [Op.like]: `%${search}%` } }
            ];
        }

        // Filter by deleted flag if provided
        if (deleted !== undefined && deleted !== "all") {
            whereCondition.deletedAt = deleted === "true" ? { [Op.ne]: null } : null;
        }

        // Filter by blocked status
        if (blocked !== undefined && blocked !== "all") {
            whereCondition.blocked = blocked === true || blocked === "true";
        }

        // Filter by email verification status
        if (verified !== "all") {
            whereCondition.email_verified_at = verified === "true" ? 
                { [Op.ne]: null } : 
                null;              
        }

        const totalUsers = await User.count({ where: whereCondition });

        // Build attributes array with calculated fields
        const attributes = [
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
            "deletedAt",
            // Add total order count
            [
                Sequelize.literal(`(
                    SELECT COUNT(*)
                    FROM orders
                    WHERE orders.user_id = User.id
                    AND orders.deletedAt IS NULL
                )`),
                'total_order_count'
            ],
            // Add total spend
            [
                Sequelize.literal(`(
                    SELECT COALESCE(SUM(total), 0)
                    FROM orders
                    WHERE orders.user_id = User.id
                    AND orders.deletedAt IS NULL
                )`),
                'total_spend'
            ],
            // Add AOV (Average Order Value) - calculated in database for sorting
            [
                Sequelize.literal(`(
                    CASE 
                        WHEN (
                            SELECT COUNT(*)
                            FROM orders
                            WHERE orders.user_id = User.id
                            AND orders.deletedAt IS NULL
                        ) > 0
                        THEN (
                            SELECT COALESCE(SUM(total), 0)
                            FROM orders
                            WHERE orders.user_id = User.id
                            AND orders.deletedAt IS NULL
                        ) / (
                            SELECT COUNT(*)
                            FROM orders
                            WHERE orders.user_id = User.id
                            AND orders.deletedAt IS NULL
                        )
                        ELSE 0
                    END
                )`),
                'aov'
            ],
            // Add last ordered date
            [
                Sequelize.literal(`(
                    SELECT MAX(createdAt)
                    FROM orders
                    WHERE orders.user_id = User.id
                    AND orders.deletedAt IS NULL
                )`),
                'last_ordered_at'
            ]
        ];

        // Build order clause - handle calculated fields with Sequelize.literal
        let orderClause;
        if (['aov', 'total_order_count', 'total_spend', 'last_ordered_at'].includes(validatedSortBy)) {
            // For calculated fields, use the same literal expression as in attributes
            if (validatedSortBy === 'aov') {
                orderClause = [
                    [
                        Sequelize.literal(`(
                            CASE 
                                WHEN (
                                    SELECT COUNT(*)
                                    FROM orders
                                    WHERE orders.user_id = User.id
                                    AND orders.deletedAt IS NULL
                                ) > 0
                                THEN (
                                    SELECT COALESCE(SUM(total), 0)
                                    FROM orders
                                    WHERE orders.user_id = User.id
                                    AND orders.deletedAt IS NULL
                                ) / (
                                    SELECT COUNT(*)
                                    FROM orders
                                    WHERE orders.user_id = User.id
                                    AND orders.deletedAt IS NULL
                                )
                                ELSE 0
                            END
                        )`),
                        validatedOrder
                    ]
                ];
            } else if (validatedSortBy === 'total_order_count') {
                orderClause = [
                    [
                        Sequelize.literal(`(
                            SELECT COUNT(*)
                            FROM orders
                            WHERE orders.user_id = User.id
                            AND orders.deletedAt IS NULL
                        )`),
                        validatedOrder
                    ]
                ];
            } else if (validatedSortBy === 'total_spend') {
                orderClause = [
                    [
                        Sequelize.literal(`(
                            SELECT COALESCE(SUM(total), 0)
                            FROM orders
                            WHERE orders.user_id = User.id
                            AND orders.deletedAt IS NULL
                        )`),
                        validatedOrder
                    ]
                ];
            } else if (validatedSortBy === 'last_ordered_at') {
                orderClause = [
                    [
                        Sequelize.literal(`(
                            SELECT MAX(createdAt)
                            FROM orders
                            WHERE orders.user_id = User.id
                            AND orders.deletedAt IS NULL
                        )`),
                        validatedOrder
                    ]
                ];
            }
        } else {
            // For regular fields, use standard sorting
            orderClause = [[validatedSortBy, validatedOrder]];
        }

        const users = await User.findAll({
            where: whereCondition,
            attributes: attributes,
            include: [{
                model: Order, 
                as: "orders", 
                attributes: [
                    "id", 
                    "status", 
                    "createdAt", 
                    "updatedAt" 
                ],
                required: false 
            }],
            limit: parseInt(limit),
            offset: parseInt(offset),
            order: orderClause,
            paranoid: false,
        });

        // Format the response to include order details if they exist
        const formattedUsers = users.map(user => {
            const userData = user.get({ plain: true });
            const totalOrderCount = parseInt(userData.total_order_count) || 0;
            const totalSpend = parseFloat(userData.total_spend) || 0;
            const aov = parseFloat(userData.aov) || 0;
            
            return {
                ...userData,
                total_order_count: totalOrderCount,
                total_spend: totalSpend,
                aov: parseFloat(aov.toFixed(2)), // Round to 2 decimal places
                orders: user.orders || [] 
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
        const requestingUser = req.user;

        const user = await User.findByPk(id);
        if (!user) {
            return errorResponse(res, { message: "User not found" }, 404);
        }

        // Check if requesting user has permission to delete the target user
        if (!requestingUser.super_user && user.super_user) {
            return errorResponse(res, { message: "You don't have permission to delete a super user" }, 403);
        }

        // Check for existing orders with specific statuses
        const restrictedStatuses = [
            constants.orderStatus.PENDING,
            constants.orderStatus.PROCESSING,
            constants.orderStatus.PACKED,
            constants.orderStatus.SHIPPED,
            constants.orderStatus.OUT_FOR_DELIVERY,
            constants.orderStatus.RETURN_REQUESTED,
            constants.orderStatus.RETURN_RECEIVED
        ];

        const existingOrders = await Order.findAll({
            where: {
                user_id: id,
                status: {
                    [Op.in]: restrictedStatuses
                }
            }
        });

        if (existingOrders.length > 0) {
            return errorResponse(res, { 
                message: "Cannot delete user. User has active orders that are pending, processing, packed, shipped, out for delivery, or in return process." 
            }, 400);
        }

        // Soft delete all mail subscriptions associated with this user
        const mailSubscriptions = await MailSubscription.findAll({
            where: { user_id: id }
        });
        for (const subscription of mailSubscriptions) {
            await subscription.destroy();
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
        const requestingUser = req.user;

        const user = await User.findByPk(id);
        if (!user) {            
            return res.status(404).json({ message: "User not found" });
        }
        if (user.blocked) {            
            return res.status(400).json({ message: "User is already blocked" });
        }

        // Check if requesting user has permission to block the target user
        if (!requestingUser.super_user && user.super_user) {
            return errorResponse(res, { message: "You don't have permission to block a super user" }, 403);
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
    const { id } = req.params;

    try {
        const user = await User.findByPk(id, {
            include: [
                { 
                    model: Order, 
                    as: "orders", 
                    include: [
                        { 
                            model: OrderItem,
                            as: "orderItems",
                            include: [
                                { 
                                    model: ProductVariant,
                                    as: "variant",
                                    include: [
                                        {
                                            model: Product,
                                            as: "product",
                                            include: [
                                                {
                                                    model: ProductImage,
                                                    as: "ProductImages",
                                                    attributes: ["id", "image_url", "is_primary"],
                                                    required: false
                                                }
                                            ],
                                            required: false
                                        }
                                    ],
                                    attributes: ["id", "price", "stock", "stock_status"],
                                    required: false
                                }
                            ],
                            attributes: ["id", "quantity"], 
                            required: false
                        }
                    ]
                },
                {
                    model: UserAddress,
                    as: "UserAddresses",
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