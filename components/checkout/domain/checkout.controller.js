const { Sequelize, Op } = require("sequelize");
const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Coupon, CouponUsage, User, Product, ProductVariant, ProductImage, Cart, Flavor, Order } = require("../../../models");
const logger = require("../../../library/logger");

module.exports.checkout = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { couponCode } = req.body;
        let total = 0
        let subTotal = 0
        const cart = await Cart.findAll({
                        where: { user_id: userId },
                        include: [
                          {
                            model: User,
                            attributes: ["id", "first_name", "last_name", "email", "phone"], // User details
                            as: "user"
                          },
                          {
                            model: Product,
                            attributes: ["id", "name", "price", "discount_price", "stock_quantity"], // Product details
                            as: "product",
                          },
                          {
                            model: ProductVariant,
                            attributes: ["id", "product_id", "slug", "price", "discount_price", "purchase_price", "stock"], // product variant details
                            as: "variant"
                          }
                        ]
                      });
        if (cart.length === 0) {
            throw {
                statusCode: 404,
                message: 'Cart is empty'
            }
        }

        // Calculate subtotal amount
        for (const item of cart) {
            if (!item.variant) {
                return errorResponse(res, {}, "Variant missing", 404); // Stop execution immediately
            }
            subTotal += item.quantity * item.variant.price;
        }
        
        total = subTotal
         // Check if expired
        const coupon = await Coupon.findOne({
            where: {
                code: couponCode,
                status: "active",
                start_date: { [Op.lte]: new Date() }, // Coupon has started
                end_date: { [Op.or]: [{ [Op.gte]: new Date() }, { [Op.is]: null }] }, // Not expired
            }
        });

        if(couponCode && coupon && couponCode === coupon.code){
                if (!coupon.minimum_purchase || (subTotal >= coupon.minimum_purchase)) {
                    if (!coupon.usage_limit || (coupon.usage_count <= coupon.usage_limit)) {
                        // Check minimum purchase requirement
                        
                            const userUsedCoupon = await CouponUsage.findOne({
                                where: { user_id: userId, coupon_id: coupon.id }
                            });
                            if (!userUsedCoupon) {
                                //calculate discount
                                let discount = 0;
                                if (coupon.discount_type === "percentage") {
                                    discount = (coupon.discount_value / 100) * subTotal;
                                    if (coupon.maximum_discount && discount > coupon.maximum_discount) {
                                        discount = coupon.maximum_discount;
                                    }
                                } else if (coupon.discount_type === "fixed_amount") {
                                    discount = coupon.discount_value;
                                }
                                total = Math.max(0, subTotal - discount); // Ensure total doesn't go negative
                            }
    
                    }
                }
            
        }

        const resObj = {
            cart,
            subTotal,
            total
        }
        successResponse(res, resObj, 'Success');
    } catch (error) {
        logger.error(error)
        return errorResponse(res, error, error.message);
    }
}


module.exports.applyCoupon = async (req, res, next) => {
    try {
        const userId = req.user.id ;
        const { couponCode } = req.body;
        let subTotal = 0
        let total = 0
        const cart = await Cart.findAll({
                        where: { user_id: userId },
                        include: [
                          {
                            model: User,
                            attributes: ["id", "first_name", "last_name", "email", "phone"], // User details
                            as: "user"
                          },
                          {
                            model: Product,
                            attributes: ["id", "name", "price", "discount_price", "stock_quantity"], // Product details
                            as: "product"
                          },
                          {
                            model: ProductVariant,
                            attributes: ["id", "product_id", "slug", "price", "discount_price", "purchase_price", "stock"], // // product variant details
                            as: "variant"
                          }
                        ]
                      });

        if (cart.length === 0) {
            throw {
                statusCode: 404,
                message: 'Cart is empty'
            }
        }

        // Calculate subtotal amount
        for (const item of cart) {
            if (!item.variant) {
                return errorResponse(res, {}, "Variant missing", 404); // Stop execution immediately
            }
            subTotal += item.quantity * item.variant.price;
        }
        
        total = subTotal
         // Check if expired
        const coupon = await Coupon.findOne({
            where: {
                code: couponCode,
                status: "active",
                start_date: { [Op.lte]: new Date() }, // Coupon has started
                end_date: { [Op.or]: [{ [Op.gte]: new Date() }, { [Op.is]: null }] }, // Not expired
            }
        }); 

        if (!coupon) {
            throw {
                statusCode: 404,
                message: 'Invalid or expired coupon code'
            }
        }

        const userUsedCoupon = await CouponUsage.findOne({
            where: { user_id: userId, coupon_id: coupon.id }
        });

        //isSingleUse
        // if (coupon.is_single_use) {
            if (userUsedCoupon) {
                throw {
                    statusCode: 400,
                    message: 'You have already used this coupon.'
                }
            }
            
        // }

        // Check usage limit
        if (coupon.usage_limit && (coupon.usage_count >= coupon.usage_limit) ) {
            throw {
                statusCode: 400,
                message: 'Coupon usage limit reached'
            }
        }
        
        // Check minimum purchase requirement
        if (coupon.minimum_purchase && subTotal < coupon.minimum_purchase) {
            throw {
                statusCode: 400,
                message: `Coupon requires a minimum purchase of $${coupon.minimum_purchase}.`
            }
        }      

        //calculate discount
        let discount = 0;

        if(!userUsedCoupon){
            if (coupon.discount_type === "percentage") {
                discount = (coupon.discount_value / 100) * subTotal;
                // Apply maximum discount cap if set
                if (coupon.maximum_discount && discount > coupon.maximum_discount) {
                    discount = coupon.maximum_discount;
                }
            } else if (coupon.discount_type === "fixed_amount") {
                discount = coupon.discount_value;
            }
            total = Math.max(0, subTotal - discount); // Ensure total doesn't go negative
        }
                
        const resObj = {
            subTotal,
            total
        }
        successResponse(res, resObj, 'Success');
    } catch (error) {
        logger.error(error)
        return errorResponse(res, error, error.message);
    }
}