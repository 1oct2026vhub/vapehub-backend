const { ShippingMethod } = require("../../../models");

/**
 * Calculate shipping cost based on order total and shipping method rules
 * @param {Object} shippingMethod - The shipping method object
 * @param {number} orderTotal - The total order amount
 * @returns {number|null} - The calculated shipping cost or null if not applicable
 */s
const calculateShippingCost = (shippingMethod, orderTotal) => {
    // Check if shipping method is marked as free shipping
    if (shippingMethod.is_free_shipping) {
        // If free shipping is enabled, check if threshold is set
        if (shippingMethod.free_shipping_threshold) {
            // Only apply free shipping if order total meets the threshold
            if (orderTotal >= shippingMethod.free_shipping_threshold) {
                return 0;  // ✅ Free shipping when threshold is met
            }
            
            // Order is BELOW threshold - must charge shipping
            // Return the actual shipping cost from database
            const actualCost = parseFloat(shippingMethod.shipping_cost || 0);
            
            // If shipping_cost is 0, method is misconfigured - reject it to prevent £0 shipping bypass
            if (actualCost > 0) {
                return actualCost;  // ✅ Return actual cost (e.g., 3.99)
            } else {
                return null;  // ❌ Misconfigured - method unavailable
            }
        } else {
            // No threshold set, always free shipping
            return 0;
        }
    }

    // Normal paid shipping method (not marked as free shipping)
    return shippingMethod.shipping_cost;
};

/**
 * Get available shipping methods for an order total
 * @param {number} orderTotal - The total order amount
 * @returns {Promise<Array>} - Array of available shipping methods with calculated costs
 */
const getAvailableShippingMethods = async (orderTotal) => {
    try {
        const shippingMethods = await ShippingMethod.findAll({
            where: { is_enabled: true }
        });

        return shippingMethods
            .map(method => ({
                ...method.toJSON(),
                calculated_cost: calculateShippingCost(method, orderTotal)
            }))
            .filter(method => method.calculated_cost !== null)
            .sort((a, b) => a.calculated_cost - b.calculated_cost);
    } catch (error) {
        throw error;
    }
};

/**
 * Calculate final order total with shipping and discounts
 * @param {number} subTotal - The order subtotal
 * @param {number} shippingCost - The shipping cost
 * @param {number} discount - The discount amount
 * @returns {number} - The final order total
 */
const calculateFinalTotal = (subTotal, shippingCost, discount = 0) => {
    const total = Math.max(0, subTotal - discount);
    return parseFloat((total + shippingCost).toFixed(2));
};

module.exports = {
    calculateShippingCost,
    getAvailableShippingMethods,
    calculateFinalTotal
}; 