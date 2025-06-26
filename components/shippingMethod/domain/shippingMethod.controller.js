const { Sequelize, Op } = require("sequelize");
const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Coupon, CouponUsage, User, Product, ProductVariant, Cart, ShippingMethod } = require("../../../models");
const logger = require("../../../library/logger");
const { calculateShippingCost, getAvailableShippingMethods, calculateFinalTotal } = require("../helper/shippingMethod.helper");
const { validationResult } = require("express-validator");

/**
 * Get all shipping methods
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
module.exports.getAllShippingMethods = async (req, res, next) => {
    try {
        const shippingMethods = await ShippingMethod.findAll();

        return successResponse(res, shippingMethods, 'Shipping methods retrieved successfully');
    } catch (error) {
        logger.error('Error in getAllShippingMethods:', error);
        return errorResponse(res, error, 'Failed to retrieve shipping methods');
    }
};

/**
 * Apply shipping method to cart
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
module.exports.shippingMethod = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { couponCode, shippingMethodId } = req.body;
        let total = 0;
        let subTotal = 0;
        let totalItems = 0;
        let shippingCost = 0;
        let validityMessage = '';

        const cart = await Cart.findAll({
            where: { user_id: userId },
            include: [
                {
                    model: User,
                    attributes: ["id", "first_name", "last_name", "email", "phone"],
                    as: "user"
                },
                {
                    model: Product,
                    attributes: ["id", "name", "price", "discount_price", "stock_quantity"],
                    as: "product",
                },
                {
                    model: ProductVariant,
                    attributes: ["id", "product_id", "slug", "price", "discount_price", "purchase_price", "stock"],
                    as: "variant"
                }
            ]
        });

        if (cart.length === 0) {
            const error = new Error('Cart is empty');
            error.statusCode = 404;
            throw error;
        }

        const shippingMethod = await ShippingMethod.findOne({
            where: { id: shippingMethodId },
            attributes: ["id", "shipping_method", "shipping_cost", "is_active", "min_order_total", "max_order_total", "free_shipping_threshold", "shipping_rules"],
        });

        if (shippingMethod) {
            // Calculate subtotal first
            for (const item of cart) {
                if (!item.variant) {
                    return errorResponse(res, {}, "Variant is missing", 404);
                }
                subTotal += item.quantity * item.variant.price;
                totalItems += item.quantity;
            }

            // Calculate shipping cost using the helper function
            shippingCost = calculateShippingCost(shippingMethod, subTotal);
            if (shippingCost === null) {
                return errorResponse(res, {}, "Selected shipping method is not available for this order total", 400);
            }
        }

        total = subTotal;

        // Check if expired
        const coupon = await Coupon.findOne({
            where: {
                code: couponCode,
                status: "active",
                start_date: { [Op.lte]: new Date() },
                end_date: { [Op.or]: [{ [Op.gte]: new Date() }, { [Op.is]: null }] },
            }
        });

        if (couponCode && coupon && couponCode === coupon.code) {
            if (!coupon.minimum_purchase || (subTotal >= coupon.minimum_purchase)) {
                if (!coupon.usage_limit || (coupon.usage_count < coupon.usage_limit)) {
                    const userUsedCoupon = await CouponUsage.findOne({
                        where: { user_id: userId, coupon_id: coupon.id }
                    });
                    if (!userUsedCoupon) {
                        //calculate discount
                        let discount = 0;

                        if (coupon.discount_type === "percentage") {
                            discount = (coupon.discount_value / 100) * subTotal;
                        } else if (coupon.discount_type === "fixed_amount") {
                            discount = coupon.discount_value;
                        }
                        if (parseFloat(discount) && parseFloat(coupon.maximum_discount) && parseFloat(discount) > parseFloat(coupon.maximum_discount)) {
                            discount = coupon.maximum_discount;
                        }
                        if (parseFloat(discount) > parseFloat(subTotal)) {
                            discount = coupon.maximum_discount;
                        }
                        total = Math.max(0, subTotal - discount);
                    } else {
                        validityMessage = 'You have already used this coupon.';
                    }
                } else {
                    validityMessage = 'Coupon usage limit reached';
                }
            } else {
                validityMessage = `Coupon requires a minimum purchase of $${coupon.minimum_purchase}.`;
            }
        } else {
            validityMessage = 'Invalid or expired coupon code';
        }

        if (!couponCode) {
            validityMessage = '';
        }

        // Calculate final total with shipping cost
        total = calculateFinalTotal(total, shippingCost);

        const resObj = {
            totalItems,
            shippingCost,
            subTotal,
            total,
            validityMessage
        }

        successResponse(res, resObj, 'Success');
    } catch (error) {
        logger.error(error);
        return errorResponse(res, error, error.message);
    }
};

/**
 * Get available shipping methods for cart
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
module.exports.getAvailableShippingMethods = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get user's cart
        const cart = await Cart.findOne({
            where: { user_id: userId },
            include: [{ model: CartItem }]
        });

        if (!cart) {
            return res.status(404).json({ message: "Cart not found" });
        }

        // Calculate subtotal
        const subTotal = cart.CartItems.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);

        // Get available shipping methods
        const availableMethods = await getAvailableShippingMethods(subTotal);

        res.json({
            subTotal,
            shippingMethods: availableMethods
        });
    } catch (error) {
        console.error("Error getting available shipping methods:", error);
        res.status(500).json({ message: "Error getting available shipping methods" });
    }
};
