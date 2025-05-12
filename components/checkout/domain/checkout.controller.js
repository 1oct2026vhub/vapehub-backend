const { Sequelize, Op } = require("sequelize");
const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Coupon, CouponUsage, User, Product, ProductVariant, UserAddress, ProductImage, Cart, ShippingMethod, PaymentMethod, Flavor, Order, Referral, ReferralMethod } = require("../../../models");
const logger = require("../../../library/logger");



module.exports.checkout = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { couponCode, referralCouponCode } = req.body;
        let total = 0;
        let subTotal = 0;
        let totalItems = 0;
        let shippingCost = 0;
        let validityMessage = '';
        let referralDiscount = 0;
        let referralMessage = '';
        let referralPercentage = 0;
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
        // Fetch ShippingMethod separately
        const shippingMethod = await ShippingMethod.findAll({
            attributes: ["id", "shipping_method", "shipping_cost"]
        });

        if(!shippingMethod || shippingMethod.length === 0){
            validityMessage = 'No shipping methods available'
        }

        const paymentMethod = await PaymentMethod.findAll({
            where: { status: "active" }
        });
        // Calculate subtotal amount
        for (const item of cart) {
            if (!item.variant) {
                return errorResponse(res, {}, "Variant is missing", 404); // Stop execution immediately
            }
            subTotal += item.quantity * item.variant.price;
            totalItems += item.quantity
        }
        
        total = subTotal

        // Process referral discount if referral coupon code is provided
        if (referralCouponCode) {
            const referralResult = await processReferralDiscount(referralCouponCode);
            if (referralResult.referral?.ReferralMethod?.referral_value_type === 'percentage') {
                referralPercentage = referralResult.discount;
                referralDiscount = (referralPercentage / 100) * subTotal;
            } else {
                referralDiscount = referralResult.discount;
            }
            referralMessage = referralResult.message;
            total = Math.max(0, total - referralDiscount);
        }

        // Process regular coupon if provided
        if (couponCode) {
            const coupon = await Coupon.findOne({
                where: {
                    code: couponCode,
                    status: "active",
                    start_date: { [Op.lte]: new Date() },
                    end_date: { [Op.or]: [{ [Op.gte]: new Date() }, { [Op.is]: null }] },
                }
            });

            if (coupon && couponCode === coupon.code) {
                if (!coupon.minimum_purchase || (subTotal >= coupon.minimum_purchase)) {
                    if (!coupon.usage_limit || (coupon.usage_count < coupon.usage_limit)) {
                        const userUsedCoupon = await CouponUsage.findOne({
                            where: { user_id: userId, coupon_id: coupon.id }
                        });
                        if (!userUsedCoupon) {
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
                            total = Math.max(0, total - discount);
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
        }

        if(!couponCode){
            validityMessage = ''
        }
        total = parseFloat(Math.max(0, total).toFixed(2));
        subTotal = parseFloat(Math.max(0, subTotal).toFixed(2));
        const address = await UserAddress.findOne({ 
            where: { user_id: userId },
            order: [['createdAt', 'DESC']] // Get the most recently created address
        });
        const resObj = {
            cart,
            shippingMethod,
            paymentMethod,
            address,
            totalItems,
            shippingCost,
            subTotal,
            total,
            validityMessage,
            referralDiscount,
            referralMessage
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
        const { couponCode, shippingMethodId } = req.body;
        let subTotal = 0
        let total = 0
        let totalItems = 0;
        let shippingCost = 0;
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

        const shippingMethod = await ShippingMethod.findOne({
            where: { id: shippingMethodId },
            attributes: ["id", "shipping_method", "shipping_cost"], // Selecting only necessary fields
        });

        if (shippingMethod) {
            shippingCost = shippingMethod.shipping_cost
        }
        // Calculate subtotal amount
        for (const item of cart) {
            if (!item.variant) {
                return errorResponse(res, {}, "Variant is missing", 404); // Stop execution immediately
            }
            subTotal += item.quantity * item.variant.price;
            totalItems += item.quantity
        }
        
        total = subTotal
        let coupon = null;
        if(couponCode){
            // Process referral discount if referral coupon code is provided
            const referral = await Referral.findOne({
                where: {
                    referral_coupon_code: couponCode
                },
                attributes: ['id', 'referrer_id', 'referral_code', 'referral_coupon_code', 'email', 'points_awarded', 'status', 'created_at', 'updated_at']
            });
        
            if (referral) {
                // Fetch active referral method independently
                const referralMethod = await ReferralMethod.findOne({
                    where: { 
                        status: 'active',
                        primary: true // Get the primary active method
                    }
                });
                if (referralMethod) {
                    if (referralMethod.referral_value_type === 'percentage') {
                        referralPercentage = parseFloat(referralMethod.referral_value);
                    referralDiscount = (referralPercentage / 100) * subTotal;
                } else if (referralMethod.referral_value_type === 'fixed') {
                    referralDiscount = parseFloat(referralMethod.referral_value);
                }
                referralMessage = 'Referral discount applied successfully';
                total = Math.max(0, total - referralDiscount);
                } else {
                    referralMessage = 'No active referral method found';
                }
                coupon = couponCode;
            } 
            else {
                // Check if expired
                coupon = await Coupon.findOne({
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
                    } else if (coupon.discount_type === "fixed_amount") {
                        discount = coupon.discount_value;
                    }
                    if (parseFloat(discount) && parseFloat(coupon.maximum_discount) && parseFloat(discount) > parseFloat(coupon.maximum_discount)) {
                        discount = coupon.maximum_discount;
                    }
                    if(parseFloat(discount) > parseFloat(subTotal)){
                        discount = coupon.maximum_discount
                    }
                    total = Math.max(0, subTotal - discount); // Ensure total doesn't go negative
                }
            }

        }
        

        
        total = parseFloat(Math.max(0, total).toFixed(2)) + shippingCost;
        subTotal = parseFloat(Math.max(0, subTotal).toFixed(2));
        const resObj = {
            totalItems,
            shippingCost,
            subTotal,
            total,
            coupon
        }
        successResponse(res, resObj, 'Success');
    } catch (error) {
        logger.error(error)
        return errorResponse(res, error, error.message);
    }
}


