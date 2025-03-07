const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { ShippingMethod } = require("../../../../models");
const { Op } = require("sequelize");

// Create a shipping method
module.exports.createShippingMethod = async (req, res) => {
    try {
        const { shipping_method, api_key, api_secret } = req.body
        const { id: updated_by } = req.user
        const shippingMethod = await ShippingMethod.create({ shipping_method, api_key, api_secret, updated_by });
        return successResponse(res, shippingMethod, "", 201)
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Get all shipping methods
module.exports.getAllShippingMethods = async (req, res) => {
    try {
        const shippingMethods = await ShippingMethod.findAll();
        return successResponse(res, shippingMethods)
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Get a shipping method by ID
module.exports.getShippingMethodById = async (req, res) => {
    try {
        const shippingMethod = await ShippingMethod.findByPk(req.params.id);
        if (!shippingMethod) {
            throw {
                statusCode: 404,
                message: "Not found"
            }
        }
        return successResponse(res, shippingMethod)

    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Update a shipping method
module.exports.updateShippingMethod = async (req, res) => {

    try {
        const shippingMethod = await ShippingMethod.findByPk(req.params.id);
        if (!shippingMethod) {
            throw {
                statusCode: 404,
                message: "Not found"
            }
        };
        const { shipping_method, api_key, api_secret } = req.body
        const { id: updated_by } = req.user
        const updatedFields = {
            ...(shipping_method && { shipping_method }),
            ...(api_key && { api_key }),
            ...(api_secret && { api_secret }),
            ...(updated_by && { updated_by }),
        }
        await shippingMethod.update(updatedFields);
        return successResponse(res, shippingMethod)
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

// Delete a shipping method
module.exports.deleteShippingMethod = async (req, res) => {
    try {
        const shippingMethod = await ShippingMethod.findByPk(req.params.id);
        if (!shippingMethod) {
            throw {
                statusCode: 404,
                message: "Not found"
            }
        };

        await shippingMethod.destroy();
        return successResponse(res, { message: "Deleted successfully" })
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};


// Restore shipping method
module.exports.restoreShippingMethod = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Find the deleted shipping method (with paranoid: false to include soft-deleted records)
        const shippingMethod = await ShippingMethod.findByPk(id, { paranoid: false });

        if (!shippingMethod) {
            throw { statusCode: 404, message: 'Shipping method not found' };
        }

        if (!shippingMethod.deletedAt) {
            return successResponse(res, shippingMethod, 'Shipping method is already active');
        }

        await shippingMethod.restore(); // Restore the soft-deleted record

        successResponse(res, shippingMethod, 'Shipping method restored successfully');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};