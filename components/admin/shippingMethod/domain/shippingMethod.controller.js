const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { ShippingMethod } = require("../../../../models");
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
            shipping_cost, 
            min_order_total,
            max_order_total,
            free_shipping_threshold,
            shipping_rules,
            is_active,
            api_key, 
            api_secret 
        } = req.body;
        
        const { id: updated_by } = req.user;
        
        const shippingMethod = await ShippingMethod.create({ 
            shipping_method, 
            description, 
            shipping_cost, 
            min_order_total,
            max_order_total,
            free_shipping_threshold,
            shipping_rules,
            is_active,
            api_key, 
            api_secret, 
            updated_by 
        });
        
        return successResponse(res, shippingMethod, "", 201);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Get all shipping methods
module.exports.getAllShippingMethods = async (req, res) => {
    try {
        const shippingMethods = await ShippingMethod.findAll({
            where: { is_active: true }
        });
        return successResponse(res, shippingMethods);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Get a shipping method by ID
module.exports.getShippingMethodById = async (req, res) => {
    try {
        const shippingMethod = await ShippingMethod.findByPk(req.params.id);
        if (!shippingMethod) {
            const error = new Error("Not found");
            error.statusCode = 404;
            throw error;
        }
        return successResponse(res, shippingMethod);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Update a shipping method
module.exports.updateShippingMethod = async (req, res) => {
    try {
        const shippingMethod = await ShippingMethod.findByPk(req.params.id);
        if (!shippingMethod) {
            const error = new Error("Not found");
            error.statusCode = 404;
            throw error;
        }
        
        const { 
            shipping_method, 
            description, 
            shipping_cost, 
            min_order_total,
            max_order_total,
            free_shipping_threshold,
            shipping_rules,
            is_active,
            api_key, 
            api_secret 
        } = req.body;
        
        const { id: updated_by } = req.user;
        
        const updatedFields = {
            ...(shipping_method && { shipping_method }),
            ...(description && { description }),
            ...(shipping_cost && { shipping_cost }),
            ...(min_order_total !== undefined && { min_order_total }),
            ...(max_order_total !== undefined && { max_order_total }),
            ...(free_shipping_threshold !== undefined && { free_shipping_threshold }),
            ...(shipping_rules && { shipping_rules }),
            ...(is_active !== undefined && { is_active }),
            ...(api_key && { api_key }),
            ...(api_secret && { api_secret }),
            updated_by
        };
        
        await shippingMethod.update(updatedFields);
        return successResponse(res, shippingMethod);
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
            where: { is_active: true }
        });

        const availableShippingMethods = shippingMethods
            .map(method => ({
                ...method.toJSON(),
                calculated_cost: calculateShippingCost(method, order_total)
            }))
            .filter(method => method.calculated_cost !== null)
            .sort((a, b) => a.calculated_cost - b.calculated_cost);

        return successResponse(res, availableShippingMethods);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Delete a shipping method
module.exports.deleteShippingMethod = async (req, res) => {
    try {
        const shippingMethod = await ShippingMethod.findByPk(req.params.id);
        if (!shippingMethod) {
            const error = new Error("Not found");
            error.statusCode = 404;
            throw error;
        }
        await shippingMethod.destroy();
        return successResponse(res, { message: "Deleted successfully" });
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
        successResponse(res, shippingMethod, 'Shipping method restored successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};