const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { ShippingMethod, User } = require("../../../../models");
const { Op } = require("sequelize");

// Helper function to calculate shipping cost based on rules
const calculateShippingCost = (shippingMethod, orderTotal) => {
    // Check if order total meets free shipping threshold
    if (shippingMethod.free_shipping_threshold && orderTotal >= shippingMethod.free_shipping_threshold) {
        return 0;
    }

    // Check if order total is within min/max range
    if (shippingMethod.min_order_total && orderTotal < shippingMethod.min_order_total) {
        return null; // Shipping method not applicable
    }
    if (shippingMethod.max_order_total && orderTotal > shippingMethod.max_order_total) {
        return null; // Shipping method not applicable
    }

    // Check shipping rules if they exist
    if (shippingMethod.shipping_rules && Array.isArray(shippingMethod.shipping_rules)) {
        for (const rule of shippingMethod.shipping_rules) {
            if (orderTotal >= rule.min_total && (!rule.max_total || orderTotal <= rule.max_total)) {
                return rule.shipping_cost;
            }
        }
    }

    // Return default shipping cost if no rules match
    return shippingMethod.shipping_cost;
};

// Create a shipping method
module.exports.createShippingMethod = async (req, res) => {
    try {
        const { 
            shipping_method, 
            description, 
            display_text,
            shipping_cost, 
            method_order,
            is_enabled,
            service_code,
            carrier_code,
            api_key, 
            api_secret 
        } = req.body;
        
        const { id: updated_by } = req.user;
        
        // Validate required fields
        if (!shipping_method || !shipping_cost) {
            const error = new Error("Shipping method name and cost are required");
            error.statusCode = 400;
            throw error;
        }
        
        // Simple approach for small dataset
        const orderValue = method_order !== undefined ? method_order : 
            await ShippingMethod.max('method_order') + 1 || 1;
        
        const shippingMethod = await ShippingMethod.create({ 
            shipping_method, 
            description, 
            display_text,
            shipping_cost, 
            method_order: orderValue,
            is_enabled: is_enabled !== undefined ? is_enabled : true,
            service_code,
            carrier_code,
            api_key, 
            api_secret, 
            updated_by 
        });
        
        return successResponse(res, shippingMethod, "Shipping method created successfully", 201);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Get all shipping methods (admin view - includes disabled methods)
module.exports.getAllShippingMethods = async (req, res) => {
    try {
        const { include_disabled = false } = req.query;
        
        const whereClause = include_disabled === 'true' ? {} : { is_enabled: true };
        
        const shippingMethods = await ShippingMethod.findAll({
            where: whereClause,
            order: [['method_order', 'ASC'], ['createdAt', 'DESC']],
            include: [
                {
                    model: User,
                    as: "updatedBy",
                    attributes: ['id', 'first_name', 'last_name', 'email']
                }
            ]
        });
        
        return successResponse(res, shippingMethods, "Shipping methods retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Get a shipping method by ID
module.exports.getShippingMethodById = async (req, res) => {
    try {
        const shippingMethod = await ShippingMethod.findByPk(req.params.id, {
            include: [
                {
                    model: User,
                    as: "updatedBy",
                    attributes: ['id', 'first_name', 'last_name', 'email']
                }
            ]
        });
        
        if (!shippingMethod) {
            const error = new Error("Shipping method not found");
            error.statusCode = 404;
            throw error;
        }
        
        return successResponse(res, shippingMethod, "Shipping method retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Update a shipping method
module.exports.updateShippingMethod = async (req, res) => {
    try {
        const shippingMethod = await ShippingMethod.findByPk(req.params.id);
        if (!shippingMethod) {
            const error = new Error("Shipping method not found");
            error.statusCode = 404;
            throw error;
        }
        
        const { 
            shipping_method, 
            description, 
            display_text,
            shipping_cost, 
            method_order,
            is_enabled,
            service_code,
            carrier_code,
            api_key, 
            api_secret 
        } = req.body;
        
        const { id: updated_by } = req.user;
        
        const updatedFields = {
            ...(shipping_method && { shipping_method }),
            ...(description !== undefined && { description }),
            ...(display_text !== undefined && { display_text }),
            ...(shipping_cost !== undefined && { shipping_cost }),
            ...(method_order !== undefined && { method_order }),
            ...(is_enabled !== undefined && { is_enabled }),
            ...(service_code !== undefined && { service_code }),
            ...(carrier_code !== undefined && { carrier_code }),
            ...(api_key !== undefined && { api_key }),
            ...(api_secret !== undefined && { api_secret }),
            updated_by
        };
        
        await shippingMethod.update(updatedFields);
        
        // Reload the updated shipping method with associations
        await shippingMethod.reload({
            include: [
                {
                    model: User,
                    as: "updatedBy",
                    attributes: ['id', 'first_name', 'last_name', 'email']
                }
            ]
        });
        
        return successResponse(res, shippingMethod, "Shipping method updated successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Calculate shipping cost for an order
module.exports.calculateShippingCost = async (req, res) => {
    try {
        const { order_total } = req.body;
        
        if (!order_total || isNaN(order_total) || order_total < 0) {
            const error = new Error("Invalid order total");
            error.statusCode = 400;
            throw error;
        }

        const shippingMethods = await ShippingMethod.findAll({
            where: { is_enabled: true },
            order: [['method_order', 'ASC']]
        });

        const availableShippingMethods = shippingMethods
            .map(method => ({
                ...method.toJSON(),
                calculated_cost: calculateShippingCost(method, order_total)
            }))
            .filter(method => method.calculated_cost !== null)
            .sort((a, b) => a.calculated_cost - b.calculated_cost);

        return successResponse(res, availableShippingMethods, "Shipping costs calculated successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Delete a shipping method (soft delete)
module.exports.deleteShippingMethod = async (req, res) => {
    try {
        const shippingMethod = await ShippingMethod.findByPk(req.params.id);
        if (!shippingMethod) {
            const error = new Error("Shipping method not found");
            error.statusCode = 404;
            throw error;
        }
        
        await shippingMethod.destroy();
        return successResponse(res, { message: "Shipping method deleted successfully" });
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Restore shipping method
module.exports.restoreShippingMethod = async (req, res) => {
    try {
        const { id } = req.params;
        
        const shippingMethod = await ShippingMethod.findByPk(id, { paranoid: false });

        if (!shippingMethod) {
            const error = new Error('Shipping method not found');
            error.statusCode = 404;
            throw error;
        }

        if (!shippingMethod.deletedAt) {
            return successResponse(res, shippingMethod, 'Shipping method is already active');
        }

        await shippingMethod.restore();
        return successResponse(res, shippingMethod, 'Shipping method restored successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Toggle shipping method enabled/disabled status
module.exports.toggleShippingMethodStatus = async (req, res) => {
    try {
        const shippingMethod = await ShippingMethod.findByPk(req.params.id);
        if (!shippingMethod) {
            const error = new Error("Shipping method not found");
            error.statusCode = 404;
            throw error;
        }
        
        const { id: updated_by } = req.user;
        
        await shippingMethod.update({
            is_enabled: !shippingMethod.is_enabled,
            updated_by
        });
        
        return successResponse(res, shippingMethod, `Shipping method ${shippingMethod.is_enabled ? 'enabled' : 'disabled'} successfully`);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Update method order for multiple shipping methods
module.exports.updateMethodOrder = async (req, res) => {
    try {
        const { method_orders } = req.body; // Array of {id, method_order}
        
        if (!Array.isArray(method_orders) || method_orders.length === 0) {
            const error = new Error("Method orders array is required");
            error.statusCode = 400;
            throw error;
        }
        
        const { id: updated_by } = req.user;
        
        // Simple approach for small dataset
        const updatePromises = method_orders.map(({ id, method_order }) => {
            return ShippingMethod.update(
                { method_order, updated_by },
                { where: { id } }
            );
        });
        
        await Promise.all(updatePromises);
        
        // Fetch updated shipping methods
        const updatedMethods = await ShippingMethod.findAll({
            where: {
                id: method_orders.map(item => item.id)
            },
            order: [['method_order', 'ASC']]
        });
        
        return successResponse(res, updatedMethods, "Method orders updated successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};