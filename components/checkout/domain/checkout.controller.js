const { Sequelize, Op } = require("sequelize");
const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Coupon, CouponUsage, User, Product, ProductVariant, UserAddress, ProductImage, Cart, ShippingMethod, PaymentMethod, Flavor, Order, Referral, ReferralMethod } = require("../../../models");
const logger = require("../../../library/logger");
const moment = require('moment-timezone');



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
                            paranoid: false
                          },
                          {
                            model: ProductVariant,
                            attributes: ["id", "product_id", "slug", "price", "discount_price", "purchase_price", "stock", "status", "stock_status", "deleted_at"], // product variant details
                            as: "variant",
                            paranoid: false
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
            // Validate quantity
            if (item.quantity !== undefined && item.quantity < 1) {
                throw { message: `Quantity for ${item.product.name} must be at least 1`, statusCode: 400 };
            }
            // Check if cart quantity exceeds variant stock
            if (item.quantity > item.variant.stock) {
                throw {
                    statusCode: 400,
                    message: `Quantity exceeds available stock for ${item.product.name}. Available stock: ${item.variant.stock}`
                }
            }
            subTotal += item.quantity * item.variant.price;
            totalItems += item.quantity
        }
        
        total = subTotal
        // Process regular coupon if provided
        if (couponCode) {
            const currentUkTime = moment().tz(process.env.UK_TIMEZONE);
            const coupon = await Coupon.findOne({
                where: {
                    code: couponCode,
                    status: "active",
                    start_date: { [Op.lte]: currentUkTime }, // Coupon has started (UK time)
                    end_date: { [Op.or]: [{ [Op.gte]: currentUkTime }, { [Op.is]: null }] }, // Not expired (UK time)
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
                        validityMessage = 'This coupon is no longer available — usage limit exceeded.';
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
        let referral_value = null;
        let referral_value_type = null;
        let discount_amount = 0;
        let responseMessage = '';
        if(couponCode){
            // Process referral discount if referral coupon code is provided
            const referral = await Referral.findOne({
                where: {
                    referral_coupon_code: couponCode,
                    status: {
                        [Op.in]: ['pending', 'completed']
                    }
                },
                attributes: ['id', 'referrer_id', 'referral_code', 'referral_coupon_code', 'email', 'points_awarded', 'status', 'referral_value', 'referral_value_type', 'referred_user_id', 'created_at', 'updated_at', 'minimum_purchase', 'maximum_purchase', 'referrer_data']
            });
            if (referral) {
                let referralValue;
                let referralValueType;
                if (referral.status === 'pending' && referral.referred_user_id === userId) {
                    
                    referralValue = parseFloat(referral.referral_value);
                    referralValueType = referralValue!=0 ? referral.referral_value_type : '';
                    // Check minimum purchase for fixed referral value
                    if (parseFloat(referral.minimum_purchase) && parseFloat(total) < parseFloat(referral.minimum_purchase)) {   //referralValueType === 'fixed' && 
                        throw {
                            statusCode: 400,
                            message: `Minimum purchase amount of £${referral.minimum_purchase} required to apply this referral discount.`
                        }
                    }
                    
                    // Check maximum purchase limit
                    if (referral.maximum_purchase !== null && referral.maximum_purchase !== undefined && parseFloat(referral.maximum_purchase) > 0 && parseFloat(total) > parseFloat(referral.maximum_purchase)) {
                        throw {
                            statusCode: 400,
                            message: `Order total exceeds the maximum purchase limit of £${referral.maximum_purchase} for this referral discount.`
                        }
                    }
                } else if (referral.status === 'completed' && referral.referrer_id === userId) {
                    // For completed status, get values from referral method
                    // const referralMethod = await ReferralMethod.findOne({
                    //     where: {
                    //         primary: true,  //primary true means it is referrer person
                    //         status: 'active',
                    //         refer_type: 'referrer'  //new
                    //     }
                    // });
                    const referralMethod = referral.referrer_data;
                    if (referralMethod) {
                        referralValue = parseFloat(referralMethod.referral_value);
                        referralValueType = referralMethod.referral_value_type;

                        // Check minimum purchase only for fixed referral value type
                        if (parseFloat(referralMethod.minimum_purchase) && parseFloat(total) < parseFloat(referralMethod.minimum_purchase)) {  //referralMethod.referral_value_type === 'fixed' && 
                            throw {
                                statusCode: 400,
                                message: `Minimum purchase amount of £${referralMethod.minimum_purchase} required to apply this referral discount.`
                            }
                        }

                        // Check maximum purchase for referrer
                        if (parseFloat(referralMethod.maximum_purchase) && parseFloat(total) > parseFloat(referralMethod.maximum_purchase)) {
                            throw {
                                statusCode: 400,
                                message: `Order total exceeds the maximum purchase limit of £${referralMethod.maximum_purchase} for this referral discount.`
                            }
                        }
                    }
                    else{
                        referralValue = 0;
                        referralValueType = '';
                    }
                }
                if (referralValue && !isNaN(referralValue)) {
                    referralDiscount = referralValueType === 'percentage' ? (referralValue / 100) * total : referralValue;
                    discount_amount = referralDiscount;
                    // Ensure discount doesn't exceed subtotal
                    referralDiscount = Math.min(referralDiscount, total);
                    total = Math.max(0, total - referralDiscount);
                    responseMessage = 'Referral code applied successfully';
                }
                coupon = referral.referral_coupon_code;
                referral_value = parseFloat(referralValue);
                referral_value_type = referralValueType;
            } 
            else {
                // Check if expired
                const currentUkTime = moment().tz(process.env.UK_TIMEZONE);
                coupon = await Coupon.findOne({
                    where: {
                        code: couponCode,
                        status: "active",
                        start_date: { [Op.lte]: currentUkTime }, // Coupon has started (UK time)
                        end_date: { [Op.or]: [{ [Op.gte]: currentUkTime }, { [Op.is]: null }] }, // Not expired (UK time)
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

                const singleUsedCoupon = await CouponUsage.findOne({
                    where: {coupon_id: coupon.id }
                });

                // Check if coupon is single use and has been used by this user
                if (coupon.is_single_use && singleUsedCoupon) {
                    throw {
                        statusCode: 400,
                        message: 'Already used this coupon.'
                    }
                }
                if (userUsedCoupon) {
                    throw {
                        statusCode: 400,
                        message: 'You have already used this coupon.'
                    }
                }

                // Check usage limit
                if (coupon.usage_limit && (coupon.usage_count >= coupon.usage_limit)) {     // !coupon.is_single_use &&
                    throw {
                        statusCode: 400,
                        message: 'This coupon is no longer available — usage limit exceeded.'
                    }
                }

                // Check minimum purchase requirement
                if (parseFloat(coupon.minimum_purchase) && parseFloat(subTotal) < parseFloat(coupon.minimum_purchase)) {
                    throw {
                        statusCode: 400,
                        message: `Coupon requires a minimum purchase of £${coupon.minimum_purchase}.`
                    }
                }

                // Calculate discount
                let discount = 0;
                let discount_type = '';
                let coupon_discount_value = 0;
                if (coupon.discount_type === "percentage") {
                    discount = (coupon.discount_value / 100) * subTotal;
                    coupon_discount_value = coupon.discount_value;
                    discount_type = 'percentage';
                    discount_amount = (coupon.discount_value / 100) * subTotal;;
                } else if (coupon.discount_type === "fixed_amount") {
                    discount = coupon.discount_value;
                    coupon_discount_value = coupon.discount_value;
                    discount_type = 'fixed';
                    discount_amount = coupon.discount_value;
                }

                // Apply maximum discount limit if set
                if (parseFloat(discount) && parseFloat(coupon.maximum_discount) && parseFloat(discount) > parseFloat(coupon.maximum_discount)) {
                    discount = coupon.maximum_discount;
                }

                // Ensure discount doesn't exceed subtotal
                if (parseFloat(discount) > parseFloat(subTotal)) {
                    discount = subTotal;
                }
                total = Math.max(0, subTotal - discount); // Ensure total doesn't go negative
                referral_value = parseFloat(coupon_discount_value);
                referral_value_type = discount_type;
                responseMessage = 'Coupon applied successfully';
            }

        }
        
        total = parseFloat(Math.max(0, total).toFixed(2)) + shippingCost;
        subTotal = parseFloat(Math.max(0, subTotal).toFixed(2));
        referral_value = Math.floor(referral_value * 100) / 100
        discount_amount = Math.floor(discount_amount * 100) / 100
        const resObj = {
            totalItems,
            shippingCost,
            subTotal,
            total,
            coupon,
            referral_value: referral_value,
            referral_value_type,
            discount_amount
        }
        successResponse(res, resObj, responseMessage);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}


