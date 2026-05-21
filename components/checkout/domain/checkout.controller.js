const { Sequelize, Op } = require("sequelize");
const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { Coupon, CouponUsage, User, Product, ProductVariant, UserAddress, ProductImage, Cart, ShippingMethod, PaymentMethod, Order, Referral, ReferralMethod, LoyaltyPointsSettings, MailSubscription, MailSubscriptionSettings, Brand, Category, sequelize } = require("../../../models");
const logger = require("../../../library/logger");
const moment = require('moment-timezone');
const dealService = require('../../Cart/helper/deal.service');
const { createTemporaryUser, findOrCreateTemporaryUser } = require('../../auth/helper/temporaryUser.helper');
const { createGuestUser } = require('../helper/guestCheckout.helper');
const { validateAndCalculateCouponForUser } = require('../helper/coupon.helper');
const { placeOrderLogic } = require('../../order/helper/orderPlacement.helper');
const { calculateShippingCost } = require('../../shippingMethod/helper/shippingMethod.helper');
const constants = require('../../../config/constants');
const { computeShippingAndLoyalty } = require('../../order/helper/loyaltyShippingPricing.helper');

/**
 * Get entity name based on entity type and entity ID
 * @param {string} entityType - The type of entity (product, brand, category)
 * @param {number} entityId - The ID of the entity
 * @returns {Promise<Object|null>} Entity details or null if not found
 */
const getEntityName = async (entityType, entityId) => {
    try {
        if (!entityType || !entityId) {
            return null;
        }

        let entity;
        switch (entityType) {
            case 'product':
                entity = await Product.findByPk(entityId, {
                    attributes: ['id', 'name', 'slug']
                });
                break;
            case 'brand':
                entity = await Brand.findByPk(entityId, {
                    attributes: ['id', 'name', 'slug']
                });
                break;
            case 'category':
                entity = await Category.findByPk(entityId, {
                    attributes: ['id', 'name', 'slug']
                });
                break;
            default:
                return null;
        }

        if (!entity) {
            return null;
        }

        return {
            id: entity.id,
            name: entity.name,
            slug: entity.slug,
            entity_type: entityType
        };
    } catch (error) {
        logger.error('Error getting entity name:', error);
        return null;
    }
};


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
        let dealsDiscount = 0;
        let applicableDeals = [];

        // Run independent queries in parallel
        const [
            cart,
            shippingMethod,
            paymentMethod,
            user,
            loyaltySettings,
            address
        ] = await Promise.all([
            Cart.findAll({
                where: { user_id: userId },
                include: [
                    { model: User, attributes: ["id", "first_name", "last_name", "email", "phone"], as: "user" },
                    { model: Product, attributes: ["id", "name", "price", "discount_price", "stock_quantity"], as: "product", paranoid: false },
                    { model: ProductVariant, attributes: ["id", "product_id", "slug", "price", "discount_price", "purchase_price", "stock", "status", "stock_status", "deleted_at"], as: "variant", paranoid: false }
                ]
            }),
            ShippingMethod.findAll({
                where: { is_enabled: true },
                attributes: ["id", "shipping_method", "shipping_cost", "is_free_shipping", "free_shipping_threshold", "display_text", "is_enabled", "min_order_total", "max_order_total", "shipping_rules"]
            }),
            PaymentMethod.findAll({ where: { status: "active" } }),
            User.findOne({ where: { id: userId }, attributes: ['id', 'email', 'loyalty_points'] }),
            LoyaltyPointsSettings.findOne({ where: { status: true } }),
            UserAddress.findOne({ where: { user_id: userId }, order: [['createdAt', 'DESC']] })
        ]);

        if (cart.length === 0) {
            throw {
                statusCode: 404,
                message: 'Cart is empty'
            }
        }

        // Calculate subtotal amount first (needed for shipping cost calculation)
        for (const item of cart) {
            if (!item.variant || item.variant.deleted_at) {
                const productName = item.product?.name || 'Unknown product';
                const variantName = item.variant?.slug || `Variant ID: ${item.variant_id}` || 'Unknown variant';
                return errorResponse(res, {}, `The selected variant ${variantName} for product ${productName} is no longer available. Please update your cart before proceeding to checkout.`, 404);
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
            totalItems += item.quantity;
        }

        if (!shippingMethod || shippingMethod.length === 0) {
            validityMessage = 'No shipping methods available';
        }

        // Calculate deals (depends on cart)
        const deals = await dealService.getApplicableDeals(cart);
        const dealResult = dealService.calculateDealDiscounts(cart, deals);
        dealsDiscount = dealResult.totalDiscount;
        applicableDeals = dealResult.appliedDeals;

        total = subTotal - dealsDiscount;

        // Process regular coupon if provided
        if (couponCode) {
            const currentUkTime = moment().tz(process.env.UK_TIMEZONE);
            const coupon = await Coupon.findOne({
                where: {
                    code: couponCode,
                    status: "active",
                    start_date: { [Op.lte]: currentUkTime },
                    end_date: { [Op.or]: [{ [Op.gte]: currentUkTime }, { [Op.is]: null }] },
                }
            });

            if (coupon && couponCode === coupon.code) {
                if (!coupon.minimum_purchase || (total >= coupon.minimum_purchase)) {
                    if (!coupon.usage_limit || (coupon.usage_count < coupon.usage_limit)) {
                        const userUsedCoupon = await CouponUsage.findOne({
                            where: { user_id: userId, coupon_id: coupon.id }
                        });
                        if (!userUsedCoupon) {
                            let discount = 0;
                            if (coupon.discount_type === "percentage") {
                                discount = (coupon.discount_value / 100) * total;
                            } else if (coupon.discount_type === "fixed_amount") {
                                discount = coupon.discount_value;
                            }
                            if (parseFloat(discount) && parseFloat(coupon.maximum_discount) && parseFloat(discount) > parseFloat(coupon.maximum_discount)) {
                                discount = coupon.maximum_discount;
                            }
                            if (parseFloat(discount) > parseFloat(total)) {
                                discount = total;
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

        if (!couponCode) {
            validityMessage = '';
        }

        // Mail subscription (depends on user from parallel batch)
        let mailSubscriptionData = null;
        let loyaltyRedemptionInfo = null;
        if (user && user.email) {
            const [mailSubscription, mailSettings] = await Promise.all([
                MailSubscription.findOne({ where: { email: user.email } }),
                MailSubscriptionSettings.findOne({ where: { status: true } })
            ]);
            if (mailSubscription && mailSettings) {
                mailSubscriptionData = {
                    isDiscountUsed: mailSubscription.isDiscountUsed,
                    discount_amount: parseFloat(mailSettings.discount_amount),
                    discount_type: mailSettings.discount_type
                };
            }
        }

        if (loyaltySettings && user) {
            const canRedeem = user.loyalty_points >= loyaltySettings.minimum_points_redemption;
            const pointsNeeded = Math.max(0, loyaltySettings.minimum_points_redemption - user.loyalty_points);
            let redemptionAmount = 0;
            let redemptionType = 'none';

            if (canRedeem) {
                if (loyaltySettings.loyalty_amount_type === 'percentage') {
                    redemptionAmount = loyaltySettings.loyalty_amount;
                    redemptionType = 'percentage';
                } else {
                    redemptionAmount = loyaltySettings.loyalty_amount;
                    redemptionType = 'fixed';
                }
            }

            loyaltyRedemptionInfo = {
                user_points: user.loyalty_points || 0,
                minimum_points_required: loyaltySettings.minimum_points_redemption,
                can_redeem: canRedeem,
                points_needed: pointsNeeded,
                redemption_amount: redemptionAmount,
                redemption_type: redemptionType,
                points_value: loyaltySettings.points_value,
                min_amount_for_loyalty_points: loyaltySettings.min_amount_for_loyalty_points,
                amount_divisor: loyaltySettings.amount_divisor
            };
        }

        total = parseFloat(Math.max(0, total).toFixed(2));
        subTotal = parseFloat(Math.max(0, subTotal).toFixed(2));
        dealsDiscount = Math.floor(dealsDiscount * 100) / 100;

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
            referralMessage,
            mail_subscription_data: mailSubscriptionData,
            loyalty_redemption_info: loyaltyRedemptionInfo,
            deals: {
                total_deals_discount: dealsDiscount,
                applicable_deals: applicableDeals
            }
        }
        successResponse(res, resObj, 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}


module.exports.applyCoupon = async (req, res, next) => {
    try {
        const userId = req.user.id;
        const { couponCode, shippingMethodId, loyalty, points_to_redeem: rawPointsToRedeem } = req.body;
        let subTotal = 0;
        let total = 0;
        let totalItems = 0;
        let shippingCost = 0;
        let dealsDiscount = 0;
        let applicableDeals = [];

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
                    include: [
                        {
                            model: Brand,
                            as: "Brands",
                            attributes: ["id", "name", "slug"],
                            through: { attributes: [] }
                        },
                        {
                            model: Category,
                            as: "Categories",
                            attributes: ["id", "name", "slug"],
                            through: { attributes: [] }
                        }
                    ]
                },
                {
                    model: ProductVariant,
                    attributes: ["id", "product_id", "slug", "price", "discount_price", "purchase_price", "stock"],
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

        // Calculate subtotal amount first
        for (const item of cart) {
            if (!item.variant) {
                return errorResponse(res, {}, `Variant for product ${item.product?.name || 'Unknown'} is not found`, 404);
            }
            subTotal += item.quantity * item.variant.price;
            totalItems += item.quantity;
        }

        // Shipping method loaded after coupon/mail totals (see below)

        // Calculate deals
        const deals = await dealService.getApplicableDeals(cart);
        const dealResult = dealService.calculateDealDiscounts(cart, deals);
        dealsDiscount = dealResult.totalDiscount;
        applicableDeals = dealResult.appliedDeals;
        const itemDiscounts = dealResult.itemDiscounts || {}; // Store item-level deal discounts
        // Apply deal discounts to total
        total = subTotal - dealsDiscount;
        let coupon = null;
        let referral_value = null;
        let referral_value_type = null;
        let discount_amount = 0;
        let responseMessage = '';
        let loyaltyDiscount = 0;
        let loyaltyDiscountType = null;
        let loyaltyRedeem = false;
        let totalDiscount = 0
        let coupon_type = null;
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
                    } else {
                        referralValue = 0;
                        referralValueType = '';
                    }
                }

                if (referralValue && !isNaN(referralValue)) {
                    let referralDiscount = referralValueType === 'percentage' ? (referralValue / 100) * total : referralValue;
                    discount_amount = referralDiscount;
                    // Ensure discount doesn't exceed subtotal
                    referralDiscount = Math.min(parseFloat(referralDiscount), total);
                    totalDiscount += parseFloat(referralDiscount)
                    // total = Math.max(0, total - referralDiscount);
                    responseMessage = 'Referral code applied successfully';
                }
                // coupon = referral.referral_coupon_code;
                coupon = {
                    code : referral.referral_coupon_code,
                    discount_type : referralValueType,
                    discount_value : referralValue
                }
                coupon_type = 'referral';
                referral_value = parseFloat(referralValue);
                referral_value_type = referralValueType;
            } 
            else {

                // Get coupon first without date validation
                coupon = await Coupon.findOne({
                    where: {
                        code: couponCode,
                        status: "active"
                    }
                });

                if (!coupon) {
                    throw {
                        statusCode: 404,
                        message: 'Invalid or expired coupon code'
                    }
                }

                // Get current UK time in 2025-09-16 08:45:00 format (no timezone)
                const currentTime = new Date();
                const currentUKTime = new Date(currentTime.toLocaleString("en-US", {timeZone: "Europe/London"}));
                const currentUKTimeFormatted = currentUKTime.getFullYear() + '-' +
                    String(currentUKTime.getMonth() + 1).padStart(2, '0') + '-' +
                    String(currentUKTime.getDate()).padStart(2, '0') + ' ' +
                    String(currentUKTime.getHours()).padStart(2, '0') + ':' +
                    String(currentUKTime.getMinutes()).padStart(2, '0') + ':' +
                    String(currentUKTime.getSeconds()).padStart(2, '0');

                // Get coupon dates in 2025-09-16 08:45:00 format (no timezone)
                const startDateFormatted = coupon.start_date ? coupon.start_date.toISOString().slice(0, 19).replace('T', ' ') : null;
                const endDateFormatted = coupon.end_date ? coupon.end_date.toISOString().slice(0, 19).replace('T', ' ') : null;

                // Check if coupon has started
                if (startDateFormatted && currentUKTimeFormatted < startDateFormatted) {
                    throw {
                        statusCode: 404,
                        message: 'Coupon has not started yet',
                        currentUKTime: currentUKTimeFormatted,
                        startDate: startDateFormatted,
                        endDate: endDateFormatted,
                        note: 'Current UK time is before coupon start date'
                    }
                }

                // Check if coupon has expired
                if (endDateFormatted && currentUKTimeFormatted > endDateFormatted) {
                    throw {
                        statusCode: 404,
                        message: 'Coupon has expired',
                        currentUKTime: currentUKTimeFormatted,
                        startDate: startDateFormatted,
                        endDate: endDateFormatted,
                        note: 'Current UK time is after coupon end date'
                    }
                }
                if(coupon.coupon_user !== null && coupon.coupon_user !== userId){
                    throw {
                        statusCode: 400,
                        message: 'This coupon is not valid for you.'
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
                        message: 'This coupon is no longer available — usage limit exceeded.'
                        // message: 'Already used this coupon.'
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

                // Check entity type validation if coupon has entity_type and entity_id
                if (coupon.entity_type && coupon.entity_id) {
                    let hasMatchingEntity = false;
                    let entityDetails = null;
                    
                    // Get entity details for better error message
                    entityDetails = await getEntityName(coupon.entity_type, coupon.entity_id);
                    
                    for (const item of cart) {
                        if (!item.product) continue;
                        
                        switch (coupon.entity_type) {
                            case 'product':
                                if (item.product.id === parseInt(coupon.entity_id)) {
                                    hasMatchingEntity = true;
                                    break;
                                }
                                break;
                            case 'brand':
                                if (item.product.Brands && item.product.Brands.some(brand => brand.id === parseInt(coupon.entity_id))) {
                                    hasMatchingEntity = true;
                                    break;
                                }
                                break;
                            case 'category':
                                if (item.product.Categories && item.product.Categories.some(category => category.id === parseInt(coupon.entity_id))) {
                                    hasMatchingEntity = true;
                                    break;
                                }
                                break;
                        }
                        
                        if (hasMatchingEntity) break;
                    }
                    
                    if (!hasMatchingEntity) {
                        const entityName = entityDetails ? entityDetails.name : coupon.entity_type;
                        throw {
                            statusCode: 400,
                            message: `This discount applies to ${coupon.entity_type} ${entityName} only. Your cart doesn't match the required items.`
                        }
                    }
                }

                // Calculate discount based on entity type
                let discount = 0;
                let discount_type = '';
                let coupon_discount_value = 0;
                let applicableItems = [];

                if (coupon.entity_type && coupon.entity_id) {
                    // Filter cart items that match the entity type and ID
                    for (const item of cart) {
                        if (!item.product) continue;
                        
                        let isApplicable = false;
                        switch (coupon.entity_type) {
                            case 'product':
                                if (item.product.id === parseInt(coupon.entity_id)) {
                                    isApplicable = true;
                                }
                                break;
                            case 'brand':
                                if (item.product.Brands && item.product.Brands.some(brand => brand.id === parseInt(coupon.entity_id))) {
                                    isApplicable = true;
                                }
                                break;
                            case 'category':
                                if (item.product.Categories && item.product.Categories.some(category => category.id === parseInt(coupon.entity_id))) {
                                    isApplicable = true;
                                }
                                break;
                        }
                        
                        if (isApplicable) {
                            applicableItems.push(item);
                        }
                    }

                    // Calculate subtotal for applicable items only (after deal discounts)
                    const applicableSubtotal = applicableItems.reduce((sum, item) => {
                        const originalPrice = item.quantity * item.variant.price;
                        const dealDiscount = itemDiscounts[item.id] || 0; // Get deal discount for this item
                        const priceAfterDeal = originalPrice - dealDiscount;
                        return sum + priceAfterDeal;
                    }, 0);
                    // Calculate discount based on applicable items subtotal
                    if (coupon.discount_type === "percentage") {
                        discount = (parseFloat(coupon.discount_value) / 100) * applicableSubtotal;
                        coupon_discount_value = parseFloat(coupon.discount_value);
                        discount_type = 'percentage';
                        discount_amount = (parseFloat(coupon.discount_value) / 100) * applicableSubtotal;
                    } else if (coupon.discount_type === "fixed_amount") {
                        discount = parseFloat(coupon.discount_value);
                        coupon_discount_value = parseFloat(coupon.discount_value);
                        discount_type = 'fixed';
                        discount_amount = parseFloat(coupon.discount_value);
                        
                    }
                    // Apply maximum discount limit if set
                    if (parseFloat(discount) && parseFloat(coupon.maximum_discount) && parseFloat(discount) > parseFloat(coupon.maximum_discount)) {
                        discount = parseFloat(coupon.maximum_discount);
                        discount_amount = parseFloat(coupon.maximum_discount);
                    }

                    // Ensure discount doesn't exceed applicable subtotal
                    if (parseFloat(discount) > parseFloat(applicableSubtotal)) {
                        discount = applicableSubtotal;
                        discount_amount = applicableSubtotal;
                    }
                    // Apply discount to total
                    totalDiscount+=parseFloat(discount)
                    // total = Math.max(0, total - discount);
                    referral_value = parseFloat(discount);
                    referral_value_type = discount_type;
                    responseMessage = `Coupon applied successfully to ${coupon.entity_type} items`;
                } else {
                    // No entity restriction - apply to entire cart
                    if (coupon.discount_type === "percentage") {
                        discount = (parseFloat(coupon.discount_value) / 100) * total;
                        coupon_discount_value = parseFloat(coupon.discount_value);
                        discount_type = 'percentage';
                        discount_amount = (parseFloat(coupon.discount_value) / 100) * total;
                    } else if (coupon.discount_type === "fixed_amount") {
                        discount = parseFloat(coupon.discount_value);
                        coupon_discount_value = parseFloat(coupon.discount_value);
                        discount_type = 'fixed';
                        discount_amount = parseFloat(coupon.discount_value);
                    }

                    // Apply maximum discount limit if set
                    if (parseFloat(discount) && parseFloat(coupon.maximum_discount) && parseFloat(discount) > parseFloat(coupon.maximum_discount)) {
                        discount = parseFloat(coupon.maximum_discount);
                    }

                    if (parseFloat(discount) > parseFloat(total)) {
                        discount = total;
                    }
                    totalDiscount += parseFloat(discount)
                    // total = Math.max(0, total - discount);
                    referral_value = parseFloat(discount);
                    referral_value_type = discount_type;
                    responseMessage = 'Coupon applied successfully';
                }
                coupon_type = 'coupon';
            }
        }
        // Check for mail subscription discount (first purchase)
        let mailSubscriptionDiscount = 0;
        let mailSubscriptionDiscountType = null;
        let mailSubscriptionData = null;
        const user = await User.findOne({
            where: { id: userId },
            attributes: ['id', 'email', 'loyalty_points']
        });

        if (user && user.email) {
            // Check if user has mail subscription and hasn't used discount yet
            const mailSubscription = await MailSubscription.findOne({
                where: { 
                    email: user.email,
                    isDiscountUsed: false,
                    // subscribed: true
                }
            });

            if (mailSubscription) {
                // Get active mail subscription settings
                const mailSettings = await MailSubscriptionSettings.findOne({
                    where: { 
                        status: true
                    }
                });

                if (mailSettings && mailSettings.discount_amount > 0) {
                    const discountAmount = mailSettings.discount_amount;
                    const discountType = mailSettings.discount_type;

                    // Set mail_subscription_data
                    mailSubscriptionData = {
                        isDiscountUsed: false,
                        discount_amount: parseFloat(discountAmount),
                        discount_type: discountType
                    };

                    if (discountType === 'percentage') {
                        mailSubscriptionDiscount = (parseFloat(discountAmount) / 100) * total;
                        totalDiscount += parseFloat(mailSubscriptionDiscount)
                        // total = Math.max(0, total - mailSubscriptionDiscount);
                    } else {
                        mailSubscriptionDiscount = Math.min(parseFloat(discountAmount), total);
                        totalDiscount += parseFloat(mailSubscriptionDiscount)
                        // total = Math.max(0, total - mailSubscriptionDiscount);
                    }
                    mailSubscriptionDiscountType = discountType;
                }
            }
        }
        
        // Apply totalDiscount to total (coupon/referral/mail only — loyalty applied via computeShippingAndLoyalty)
        if (totalDiscount > 0) {
            total = Math.max(0, total - totalDiscount);
        }
        const merchandiseBeforeLoyalty = parseFloat(Math.max(0, total).toFixed(2));

        const shippingMethod = shippingMethodId
            ? await ShippingMethod.findOne({
                where: { id: shippingMethodId, is_enabled: true },
                attributes: ["id", "shipping_method", "shipping_cost", "is_enabled", "is_free_shipping", "free_shipping_threshold", "min_order_total", "max_order_total", "shipping_rules"],
            })
            : null;

        const loyaltySettings = await LoyaltyPointsSettings.findOne({ where: { status: true } });
        const pointsBalance = user ? parseInt(user.loyalty_points, 10) || 0 : 0;
        let pointsRequested = Math.max(0, Math.floor(Number(rawPointsToRedeem) || 0));
        if (loyalty && pointsRequested === 0 && loyaltySettings) {
            pointsRequested = pointsBalance;
        }

        const freeShipThreshold =
            (constants.checkout && constants.checkout.FREE_SHIPPING_MERCHANDISE_GBP) || 30;

        const pricing = computeShippingAndLoyalty({
            merchandiseTotalAfterDealsCouponsMail: merchandiseBeforeLoyalty,
            shippingMethod,
            userLoyaltyPoints: pointsBalance,
            pointsToRedeem: pointsRequested,
            pointsValue: loyaltySettings ? parseFloat(loyaltySettings.points_value) || 0 : 0,
            loyaltyAmountType: loyaltySettings ? loyaltySettings.loyalty_amount_type : null,
            loyaltyAmount: loyaltySettings ? parseFloat(loyaltySettings.loyalty_amount) : 0,
            minimumPointsRedemption: loyaltySettings ? loyaltySettings.minimum_points_redemption : 0,
            minimumPurchaseAmountForRedemption: loyaltySettings ? parseFloat(loyaltySettings.minimum_purchase_amount) || 0 : 0,
            freeShippingThresholdGbp: freeShipThreshold,
        });

        if (pricing.shippingCost === null && shippingMethod) {
            throw {
                statusCode: 400,
                message: "Selected shipping method is not available for this order",
            };
        }

        loyaltyDiscount = pricing.loyaltyDiscount;
        loyaltyDiscountType = pricing.pointsUsed > 0 ? "points" : null;
        loyaltyRedeem = pricing.pointsUsed > 0;
        shippingCost = pricing.shippingCost === null ? 0 : pricing.shippingCost;
        total = pricing.grandTotal !== null ? pricing.grandTotal : 0;
        total = parseFloat(Math.max(0, total).toFixed(2));
        subTotal = parseFloat(Math.max(0, subTotal).toFixed(2));
        referral_value = Math.floor(referral_value * 100) / 100;
        discount_amount = Math.floor(discount_amount * 100) / 100;
        dealsDiscount = Math.floor(dealsDiscount * 100) / 100;

        // Get entity details if coupon has entity restrictions
        let couponEntityDetails = null;
        let applicableItems = [];
        if (coupon && coupon.entity_type && coupon.entity_id) {
            couponEntityDetails = await getEntityName(coupon.entity_type, coupon.entity_id);
            
            // Get applicable items for response
            for (const item of cart) {
                if (!item.product) continue;
                
                let isApplicable = false;
                switch (coupon.entity_type) {
                    case 'product':
                        if (item.product.id === parseInt(coupon.entity_id)) {
                            isApplicable = true;
                        }
                        break;
                    case 'brand':
                        if (item.product.Brands && item.product.Brands.some(brand => brand.id === parseInt(coupon.entity_id))) {
                            isApplicable = true;
                        }
                        break;
                    case 'category':
                        if (item.product.Categories && item.product.Categories.some(category => category.id === parseInt(coupon.entity_id))) {
                            isApplicable = true;
                        }
                        break;
                }
                
                if (isApplicable) {
                    applicableItems.push({
                        cart_item_id: item.id,
                        product_id: item.product.id,
                        product_name: item.product.name,
                        variant_id: item.variant.id,
                        quantity: item.quantity,
                        price: item.variant.price,
                        subtotal: item.quantity * item.variant.price
                    });
                }
            }
        }

        const resObj = {
            totalItems,
            shippingCost,
            subTotal,
            total,
            coupon,
            coupon_type,
            coupon_entity: couponEntityDetails,
            coupon_applicable_items: applicableItems,
            referral_value: referral_value,
            referral_value_type,
            discount_amount,
            loyalty_discount: loyaltyDiscount,
            loyalty_discount_type: loyaltyDiscountType,
            loyalty_redeem: loyaltyRedeem,
            loyalty_points_used: pricing.pointsUsed,
            payment_required: pricing.paymentRequired,
            mail_subscription_discount: mailSubscriptionDiscount,
            mail_subscription_discount_type: mailSubscriptionDiscountType,
            mail_subscription_data: mailSubscriptionData,
            deals: {
                total_deals_discount: dealsDiscount,
                applicable_deals: applicableDeals
            }
        }
        successResponse(res, resObj, responseMessage);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

module.exports.applyCouponForGuest = async (req, res, next) => {
    try {
        const { couponCode, shippingMethodId = 0, loyalty = false, cartItems } = req.body;
        let subTotal = 0;
        let total = 0;
        let totalItems = 0;
        let shippingCost = 0;
        let dealsDiscount = 0;
        let applicableDeals = [];

        // Validate cart items
        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
            throw {
                statusCode: 404,
                message: 'Cart is empty'
            };
        }

        // Fetch product and variant details for cart items
        const enrichedCartItems = [];
        for (const item of cartItems) {
            const { product_id, variant_id, quantity } = item;
            
            if (!product_id || !quantity) {
                continue;
            }

            const product = await Product.findOne({
                where: { id: product_id },
                attributes: ["id", "name", "price", "discount_price", "stock_quantity"],
                include: [
                    {
                        model: Brand,
                        as: "Brands",
                        attributes: ["id", "name", "slug"],
                        through: { attributes: [] }
                    },
                    {
                        model: Category,
                        as: "Categories",
                        attributes: ["id", "name", "slug"],
                        through: { attributes: [] }
                    }
                ],
                paranoid: false
            });

            if (!product) {
                throw {
                    statusCode: 404,
                    message: `Product with ID ${product_id} not found`
                };
            }

            let variant = null;
            if (variant_id) {
                variant = await ProductVariant.findOne({
                    where: { id: variant_id },
                    attributes: ["id", "product_id", "slug", "price", "discount_price", "purchase_price", "stock"],
                    paranoid: false
                });

                if (!variant) {
                    throw {
                        statusCode: 404,
                        message: `Variant for product ${product.name} is not found`
                    };
                }
            } else {
                // Use product price if no variant
                variant = { price: product.price };
            }

            enrichedCartItems.push({
                product,
                variant,
                quantity
            });

            subTotal += quantity * variant.price;
            totalItems += quantity;
        }

        // Calculate shipping cost
        if (shippingMethodId) {
            const shippingMethod = await ShippingMethod.findOne({
                where: { 
                    id: shippingMethodId,
                    is_enabled: true  // Only allow enabled shipping methods
                },
                attributes: ["id", "shipping_method", "shipping_cost", "is_enabled", "is_free_shipping", "free_shipping_threshold", "min_order_total", "max_order_total", "shipping_rules"],
            });

            if (shippingMethod) {
                shippingCost = calculateShippingCost(shippingMethod, subTotal);
                if (shippingCost === null) {
                    // Don't default to 0 - shipping method is not applicable
                    throw {
                        statusCode: 400,
                        message: "Selected shipping method is not available for this order"
                    };
                }
            } else {
                throw {
                    statusCode: 404,
                    message: "Shipping method not found or disabled"
                };
            }
        }

        // Calculate deals
        // Create mapping between enrichedCartItems and temporary IDs for deal discount tracking
        const itemIdMap = new Map(); // Maps enrichedCartItems index to temporary ID
        const mockCart = enrichedCartItems.map((item, index) => {
            const tempId = `guest_${index}`;
            itemIdMap.set(index, tempId);
            return {
                id: tempId, // Temporary ID for mapping
                product: item.product,
                variant: item.variant,
                product_id: item.product.id,
                variant_id: item.variant ? item.variant.id : null,
                quantity: item.quantity
            };
        });
        const deals = await dealService.getApplicableDeals(mockCart);
        const dealResult = dealService.calculateDealDiscounts(mockCart, deals);
        dealsDiscount = dealResult.totalDiscount;
        applicableDeals = dealResult.appliedDeals;
        const itemDiscounts = dealResult.itemDiscounts || {}; // Store item-level deal discounts
        // Apply deal discounts to total
        total = subTotal - dealsDiscount;

        // Process coupon if provided
        let coupon = null;
        let discount_amount = 0;
        let responseMessage = '';
        let coupon_type = null;

        if (couponCode) {
            // Normalize coupon code
            const normalizedCouponCode = 
                couponCode &&
                couponCode !== '$undefined' &&
                couponCode !== 'undefined' &&
                couponCode !== 'null'
                    ? couponCode
                    : undefined;

            if (normalizedCouponCode) {
                // Check if it's a referral coupon first
                const referral = await Referral.findOne({
                    where: {
                        referral_coupon_code: normalizedCouponCode,
                        status: {
                            [Op.in]: ['pending', 'completed']
                        }
                    },
                    attributes: ['id', 'referrer_id', 'referral_code', 'referral_coupon_code', 'email', 'status', 'referral_value', 'referral_value_type', 'minimum_purchase', 'maximum_purchase']
                });

                if (referral) {
                    // For guests, we can't track usage, so we validate basic requirements
                    if (parseFloat(referral.minimum_purchase) && parseFloat(total) < parseFloat(referral.minimum_purchase)) {
                        throw {
                            statusCode: 400,
                            message: `Minimum purchase amount of £${referral.minimum_purchase} required to apply this referral discount.`
                        };
                    }

                    if (referral.maximum_purchase !== null && referral.maximum_purchase !== undefined && parseFloat(referral.maximum_purchase) > 0 && parseFloat(total) > parseFloat(referral.maximum_purchase)) {
                        throw {
                            statusCode: 400,
                            message: `Order total exceeds the maximum purchase limit of £${referral.maximum_purchase} for this referral discount.`
                        };
                    }

                    let referralValue = parseFloat(referral.referral_value);
                    let referralValueType = referral.referral_value_type;

                    if (referralValue && !isNaN(referralValue)) {
                        let referralDiscount = referralValueType === 'percentage' ? (referralValue / 100) * total : referralValue;
                        discount_amount = Math.min(parseFloat(referralDiscount), total);
                        responseMessage = 'Referral code applied successfully';
                    }

                    coupon = {
                        code: referral.referral_coupon_code,
                        discount_type: referralValueType,
                        discount_value: referralValue
                    };
                    coupon_type = 'referral';
                } else {
                    // Regular coupon validation
                    const currentTime = new Date();
                    const currentUKTime = new Date(currentTime.toLocaleString("en-US", {timeZone: "Europe/London"}));
                    const currentUKTimeFormatted = currentUKTime.getFullYear() + '-' +
                        String(currentUKTime.getMonth() + 1).padStart(2, '0') + '-' +
                        String(currentUKTime.getDate()).padStart(2, '0') + ' ' +
                        String(currentUKTime.getHours()).padStart(2, '0') + ':' +
                        String(currentUKTime.getMinutes()).padStart(2, '0') + ':' +
                        String(currentUKTime.getSeconds()).padStart(2, '0');

                    coupon = await Coupon.findOne({
                        where: {
                            code: normalizedCouponCode,
                            status: "active"
                        }
                    });

                    if (!coupon) {
                        throw {
                            statusCode: 404,
                            message: 'Invalid or expired coupon code'
                        };
                    }

                    // Check date validity
                    const startDateFormatted = coupon.start_date ? coupon.start_date.toISOString().slice(0, 19).replace('T', ' ') : null;
                    const endDateFormatted = coupon.end_date ? coupon.end_date.toISOString().slice(0, 19).replace('T', ' ') : null;

                    if (startDateFormatted && currentUKTimeFormatted < startDateFormatted) {
                        throw {
                            statusCode: 404,
                            message: 'Coupon has not started yet'
                        };
                    }

                    if (endDateFormatted && currentUKTimeFormatted > endDateFormatted) {
                        throw {
                            statusCode: 404,
                            message: 'Coupon has expired'
                        };
                    }

                    // Check usage limit (but not user-specific usage for guests)
                    if (coupon.usage_limit && (coupon.usage_count >= coupon.usage_limit)) {
                        throw {
                            statusCode: 400,
                            message: 'This coupon is no longer available — usage limit exceeded.'
                        };
                    }

                    // Check minimum purchase
                    if (parseFloat(coupon.minimum_purchase) && parseFloat(subTotal) < parseFloat(coupon.minimum_purchase)) {
                        throw {
                            statusCode: 400,
                            message: `Coupon requires a minimum purchase of £${coupon.minimum_purchase}.`
                        };
                    }

                    // Check entity type validation
                    if (coupon.entity_type && coupon.entity_id) {
                        let hasMatchingEntity = false;
                        
                        for (const item of enrichedCartItems) {
                            if (!item.product) continue;
                            
                            switch (coupon.entity_type) {
                                case 'product':
                                    if (item.product.id === parseInt(coupon.entity_id)) {
                                        hasMatchingEntity = true;
                                        break;
                                    }
                                    break;
                                case 'brand':
                                    if (item.product.Brands && item.product.Brands.some(brand => brand.id === parseInt(coupon.entity_id))) {
                                        hasMatchingEntity = true;
                                        break;
                                    }
                                    break;
                                case 'category':
                                    if (item.product.Categories && item.product.Categories.some(category => category.id === parseInt(coupon.entity_id))) {
                                        hasMatchingEntity = true;
                                        break;
                                    }
                                    break;
                            }
                            
                            if (hasMatchingEntity) break;
                        }
                        
                        if (!hasMatchingEntity) {
                            const entityDetails = await getEntityName(coupon.entity_type, coupon.entity_id);
                            const entityName = entityDetails ? entityDetails.name : coupon.entity_type;
                            throw {
                                statusCode: 400,
                                message: `This discount applies to ${coupon.entity_type} ${entityName} only. Your cart doesn't match the required items.`
                            };
                        }
                    }

                    // Calculate discount
                    let discount = 0;
                    let applicableSubtotal = total;

                    if (coupon.entity_type && coupon.entity_id) {
                        // Calculate subtotal for applicable items only (after deal discounts)
                        applicableSubtotal = enrichedCartItems
                            .map((item, index) => ({ item, index })) // Keep track of original index
                            .filter(({ item }) => {
                                if (!item.product) return false;
                                switch (coupon.entity_type) {
                                    case 'product':
                                        return item.product.id === parseInt(coupon.entity_id);
                                    case 'brand':
                                        return item.product.Brands && item.product.Brands.some(brand => brand.id === parseInt(coupon.entity_id));
                                    case 'category':
                                        return item.product.Categories && item.product.Categories.some(category => category.id === parseInt(coupon.entity_id));
                                    default:
                                        return false;
                                }
                            })
                            .reduce((sum, { item, index }) => {
                                const originalPrice = item.quantity * item.variant.price;
                                const tempId = itemIdMap.get(index); // Get temporary ID for this item
                                const dealDiscount = itemDiscounts[tempId] || 0; // Get deal discount using mapped ID
                                const priceAfterDeal = originalPrice - dealDiscount;
                                return sum + priceAfterDeal;
                            }, 0);
                    }

                    if (coupon.discount_type === "percentage") {
                        discount = (parseFloat(coupon.discount_value) / 100) * applicableSubtotal;
                    } else if (coupon.discount_type === "fixed_amount") {
                        discount = parseFloat(coupon.discount_value);
                    }

                    // Apply maximum discount limit
                    if (parseFloat(discount) && parseFloat(coupon.maximum_discount) && parseFloat(discount) > parseFloat(coupon.maximum_discount)) {
                        discount = parseFloat(coupon.maximum_discount);
                    }

                    // Ensure discount doesn't exceed applicable subtotal
                    if (parseFloat(discount) > parseFloat(applicableSubtotal)) {
                        discount = applicableSubtotal;
                    }

                    discount_amount = parseFloat(discount);
                    coupon_type = 'coupon';
                    responseMessage = coupon.entity_type ? `Coupon applied successfully to ${coupon.entity_type} items` : 'Coupon applied successfully';
                }
            }
        }

        // Note: For guests, we skip loyalty and mail subscription discounts
        // as they require user accounts. These can be applied during actual checkout.

        // Apply discount to total
        if (discount_amount > 0) {
            total = Math.max(0, total - discount_amount);
        }

        total = parseFloat(Math.max(0, total).toFixed(2)) + shippingCost;
        subTotal = parseFloat(Math.max(0, subTotal).toFixed(2));
        discount_amount = Math.floor(discount_amount * 100) / 100;
        dealsDiscount = Math.floor(dealsDiscount * 100) / 100;

        const resObj = {
            totalItems,
            shippingCost,
            subTotal,
            total,
            coupon,
            coupon_type,
            discount_amount,
            deals: {
                total_deals_discount: dealsDiscount,
                applicable_deals: applicableDeals
            }
        };

        successResponse(res, resObj, responseMessage || 'Success');
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
}

/**
 * Guest Checkout - Create temporary user and proceed to checkout
 * This endpoint allows guest users to checkout without registration
 */
module.exports.guestCheckout = async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
        const { email, first_name, last_name, phone, cartItems, couponCode } = req.body;

        // Validate required fields
        if (!email || !first_name || !last_name) {
            throw {
                statusCode: 400,
                message: 'Email, first name, and last name are required'
            };
        }

        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
            throw {
                statusCode: 400,
                message: 'Cart items are required'
            };
        }

        // Step 1: Create temporary user
        const { user: tempUser, accessToken, refreshToken } = await createTemporaryUser({
            email,
            first_name,
            last_name,
            phone
        });

        // Step 2: Migrate cart items from localStorage to database
        for (const item of cartItems) {
            const { product_id, variant_id, quantity } = item;
            
            if (!product_id || !quantity) {
                continue; // Skip invalid items
            }

            // Check if item already exists in cart
            const existingCartItem = await Cart.findOne({
                where: {
                    user_id: tempUser.id,
                    product_id,
                    variant_id: variant_id || null
                },
                transaction
            });

            if (existingCartItem) {
                // Update quantity
                await existingCartItem.update({ quantity }, { transaction });
            } else {
                // Create new cart item
                await Cart.create({
                    user_id: tempUser.id,
                    product_id,
                    variant_id: variant_id || null,
                    quantity
                }, { transaction });
            }
        }

        await transaction.commit();

        // Step 3: Now use the regular checkout logic with the temporary user
        // Set the user in request object for reuse of existing checkout logic
        const originalUser = req.user;
        req.user = tempUser;
        const originalCouponCode = req.body.couponCode;
        req.body.couponCode = couponCode;
        
        // Call the existing checkout method and capture response
        try {
            // We need to intercept the response, so we'll call checkout logic directly
            // but we'll need to handle it differently
            const userId = tempUser.id;
            const { referralCouponCode } = req.body;
            let total = 0;
            let subTotal = 0;
            let totalItems = 0;
            let shippingCost = 0;
            let validityMessage = '';
            let referralDiscount = 0;
            let referralMessage = '';
            let referralPercentage = 0;
            let dealsDiscount = 0;
            let applicableDeals = [];

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
                        paranoid: false
                    },
                    {
                        model: ProductVariant,
                        attributes: ["id", "product_id", "slug", "price", "discount_price", "purchase_price", "stock", "status", "stock_status", "deleted_at"],
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
                where: { is_enabled: true },
                attributes: ["id", "shipping_method", "shipping_cost", "is_free_shipping", "free_shipping_threshold", "display_text"]
            });

            if(!shippingMethod || shippingMethod.length === 0){
                validityMessage = 'No shipping methods available'
            }

            const paymentMethod = await PaymentMethod.findAll({
                where: { status: "active" }
            });

            // Calculate subtotal amount
            for (const item of cart) {
                if (!item.variant || item.variant.deleted_at) {
                    const productName = item.product?.name || 'Unknown product';
                    const variantName = item.variant?.slug || `Variant ID: ${item.variant_id}` || 'Unknown variant';
                    throw {
                        statusCode: 404,
                        message: `The selected variant ${variantName} for product ${productName} is no longer available. Please update your cart before proceeding to checkout.`
                    };
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
                totalItems += item.quantity;
            }

            // Calculate deals
            const deals = await dealService.getApplicableDeals(cart);
            const dealResult = dealService.calculateDealDiscounts(cart, deals);
            dealsDiscount = dealResult.totalDiscount;
            applicableDeals = dealResult.appliedDeals;

            // Apply deal discounts to total
            total = subTotal - dealsDiscount;

            // Process regular coupon if provided
            if (couponCode) {
                const currentUkTime = moment().tz(process.env.UK_TIMEZONE);
                const coupon = await Coupon.findOne({
                    where: {
                        code: couponCode,
                        status: "active",
                        start_date: { [Op.lte]: currentUkTime },
                        end_date: { [Op.or]: [{ [Op.gte]: currentUkTime }, { [Op.is]: null }] },
                    }
                });

                if (coupon && couponCode === coupon.code) {
                    if (!coupon.minimum_purchase || (total >= coupon.minimum_purchase)) {
                        if (!coupon.usage_limit || (coupon.usage_count < coupon.usage_limit)) {
                            const userUsedCoupon = await CouponUsage.findOne({
                                where: { user_id: userId, coupon_id: coupon.id }
                            });
                            if (!userUsedCoupon) {
                                let discount = 0;
                                
                                if (coupon.discount_type === "percentage") {
                                    discount = (coupon.discount_value / 100) * total;
                                } else if (coupon.discount_type === "fixed_amount") {
                                    discount = coupon.discount_value;
                                }
                                if (parseFloat(discount) && parseFloat(coupon.maximum_discount) && parseFloat(discount) > parseFloat(coupon.maximum_discount)) {
                                    discount = coupon.maximum_discount;
                                }
                                if (parseFloat(discount) > parseFloat(total)) {
                                    discount = total;
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

            // Get mail subscription data and loyalty points redemption info
            let mailSubscriptionData = null;
            let loyaltyRedemptionInfo = null;
            const user = await User.findOne({
                where: { id: userId },
                attributes: ['id', 'email', 'loyalty_points']
            });
            
            if (user && user.email) {
                // Get user's mail subscription
                const mailSubscription = await MailSubscription.findOne({
                    where: { 
                        email: user.email
                    }
                });
                if (mailSubscription) {
                    // Get active mail subscription settings
                    const mailSettings = await MailSubscriptionSettings.findOne({
                        where: { 
                            status: true
                        }
                    });
                    if (mailSettings) {
                        mailSubscriptionData = {
                            isDiscountUsed: mailSubscription.isDiscountUsed,
                            discount_amount: parseFloat(mailSettings.discount_amount),
                            discount_type: mailSettings.discount_type
                        };
                    }
                }
            }

            // Get loyalty points redemption information
            const loyaltySettings = await LoyaltyPointsSettings.findOne({
                where: { status: true }
            });

            if (loyaltySettings && user) {
                const canRedeem = user.loyalty_points >= loyaltySettings.minimum_points_redemption;
                const pointsNeeded = Math.max(0, loyaltySettings.minimum_points_redemption - user.loyalty_points);
                let redemptionAmount = 0;
                let redemptionType = 'none';

                if (canRedeem) {
                    if (loyaltySettings.loyalty_amount_type === 'percentage') {
                        redemptionAmount = loyaltySettings.loyalty_amount;
                        redemptionType = 'percentage';
                    } else {
                        redemptionAmount = loyaltySettings.loyalty_amount;
                        redemptionType = 'fixed';
                    }
                }

                loyaltyRedemptionInfo = {
                    user_points: user.loyalty_points || 0,
                    minimum_points_required: loyaltySettings.minimum_points_redemption,
                    can_redeem: canRedeem,
                    points_needed: pointsNeeded,
                    redemption_amount: redemptionAmount,
                    redemption_type: redemptionType,
                    points_value: loyaltySettings.points_value,
                    min_amount_for_loyalty_points: loyaltySettings.min_amount_for_loyalty_points,
                    amount_divisor: loyaltySettings.amount_divisor
                };
            }

            total = parseFloat(Math.max(0, total).toFixed(2));
            subTotal = parseFloat(Math.max(0, subTotal).toFixed(2));
            dealsDiscount = Math.floor(dealsDiscount * 100) / 100;

            const address = await UserAddress.findOne({ 
                where: { user_id: userId },
                order: [['createdAt', 'DESC']]
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
                referralMessage,
                mail_subscription_data: mailSubscriptionData,
                loyalty_redemption_info: loyaltyRedemptionInfo,
                deals: {
                    total_deals_discount: dealsDiscount,
                    applicable_deals: applicableDeals
                },
                // Add tokens for guest checkout
                accessToken,
                refreshToken,
                is_temporary: true
            }
            
            // Restore original request state
            req.user = originalUser;
            req.body.couponCode = originalCouponCode;
            
            return successResponse(res, resObj, 'Success');
        } catch (checkoutError) {
            // Restore original request state
            req.user = originalUser;
            req.body.couponCode = originalCouponCode;
            throw checkoutError;
        }

    } catch (error) {
        await transaction.rollback();
        return errorResponse(res, error, error.message || 'Guest checkout failed');
    }
}

/**
 * Combined guest checkout and order placement
 * Creates temporary user, calculates checkout, and places order in one API call
 */
/**
 * Combined guest checkout and order placement
 * Creates temporary user, calculates checkout, and places order in one API call
 * Processes cartItems directly from request without using Cart table
 */
module.exports.guestCheckoutAndOrder = async (req, res, next) => {
    try {
        const { 
            email, 
            first_name, 
            last_name, 
            phone, 
            cartItems, 
            couponCode,
            // Order-specific fields
            shipping_method_id,
            shipping_address,
            billing_address,
            useShippingAsBilling,
            payment_method,
            loyalty,
            points_to_redeem,
            total,
            receive_promotions
        } = req.body;

        // Debug: log incoming couponCode to inspect value and type
        console.log('guestCheckoutAndOrder couponCode:', couponCode, 'type:', typeof couponCode);

        // Normalise bad coupon values to "no coupon"
        const normalizedCouponCode =
            couponCode &&
            couponCode !== '$undefined' &&
            couponCode !== 'undefined' &&
            couponCode !== 'null'
                ? couponCode
                : undefined;

        // Validate required fields
        if (!email || !first_name || !last_name) {
            throw {
                statusCode: 400,
                message: 'Email, first name, and last name are required'
            };
        }

        if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
            throw {
                statusCode: 400,
                message: 'Cart items are required'
            };
        }

        const totalProvided = total !== undefined && total !== null && total !== '';
        if (!shipping_method_id || !shipping_address || !payment_method || !totalProvided) {
            throw {
                statusCode: 400,
                message: 'Shipping method, shipping address, payment method, and total are required'
            };
        }

        // Step 1: Create temporary user
        const { user: tempUser, accessToken, refreshToken } = await createGuestUser({
            email,
            first_name,
            last_name,
            phone
        });

        // Step 2: Enrich cart items from request (no Cart table needed)
        const enrichedCartItems = [];
        for (const item of cartItems) {
            const { product_id, variant_id, quantity } = item;
            
            if (!product_id || !quantity) {
                continue; // Skip invalid items
            }

            const product = await Product.findOne({
                where: { id: product_id },
                attributes: ["id", "name", "price", "discount_price", "stock_quantity"],
                include: [
                    {
                        model: Brand,
                        as: "Brands",
                        attributes: ["id", "name", "slug"],
                        through: { attributes: [] }
                    },
                    {
                        model: Category,
                        as: "Categories",
                        attributes: ["id", "name", "slug"],
                        through: { attributes: [] }
                    }
                ],
                paranoid: false
            });

            if (!product) {
                throw {
                    statusCode: 404,
                    message: `Product with ID ${product_id} not found`
                };
            }

            let variant = null;
            if (variant_id) {
                variant = await ProductVariant.findOne({
                    where: { id: variant_id },
                    attributes: ["id", "product_id", "slug", "price", "discount_price", "purchase_price", "stock", "status", "stock_status", "deleted_at"],
                    paranoid: false
                });

                if (!variant) {
                    throw {
                        statusCode: 404,
                        message: `Variant for product ${product.name} is not found`
                    };
                }

                if (variant.deleted_at) {
                    throw {
                        statusCode: 404,
                        message: `The selected variant for product ${product.name} is no longer available.`
                    };
                }
            }

            // Validate stock
            if (variant && variant.stock < quantity) {
                throw {
                    statusCode: 409,
                    message: `Not enough stock for ${product.name}. Available: ${variant.stock}, Requested: ${quantity}`
                };
            }

            // Create cart-like structure for compatibility with existing logic
            enrichedCartItems.push({
                product_id,
                variant_id: variant_id || null,
                quantity,
                product,
                variant: variant || { price: product.price, id: null },
                // Add user for compatibility
                user: {
                    id: tempUser.id,
                    first_name: tempUser.first_name,
                    last_name: tempUser.last_name,
                    email: tempUser.email,
                    phone: tempUser.phone
                }
            });
        }

        if (enrichedCartItems.length === 0) {
            throw {
                statusCode: 404,
                message: 'Cart is empty'
            };
        }

        // Step 3: Calculate checkout summary using enriched items
        const userId = tempUser.id;
        let checkoutTotal = 0;
        let subTotal = 0;
        let totalItems = 0;
        let dealsDiscount = 0;
        let applicableDeals = [];

        // Calculate subtotal
        for (const item of enrichedCartItems) {
            const price = item.variant?.price || item.product.price;
            subTotal += item.quantity * price;
            totalItems += item.quantity;
        }

        // Calculate deals
        const deals = await dealService.getApplicableDeals(enrichedCartItems);
        const dealResult = dealService.calculateDealDiscounts(enrichedCartItems, deals);
        dealsDiscount = dealResult.totalDiscount;
        applicableDeals = dealResult.applicableDeals;

        checkoutTotal = subTotal - dealsDiscount;

        // Apply coupon only if a real code is present, using shared helper
        if (normalizedCouponCode) {
            const { coupon, discount } = await validateAndCalculateCouponForUser({
                couponCode: normalizedCouponCode,
                userId,
                subTotal,
                totalBeforeCoupon: checkoutTotal
            });

            if (coupon && discount > 0) {
                checkoutTotal = Math.max(0, checkoutTotal - discount);
            }
        }

        checkoutTotal = parseFloat(Math.max(0, checkoutTotal).toFixed(2));
        subTotal = parseFloat(Math.max(0, subTotal).toFixed(2));

        // Get mail subscription and loyalty info
        let mailSubscriptionData = null;
        let loyaltyRedemptionInfo = null;
        const user = await User.findOne({
            where: { id: userId },
            attributes: ['id', 'email', 'loyalty_points']
        });

        if (user && user.email) {
            const mailSubscription = await MailSubscription.findOne({
                where: { email: user.email }
            });
            if (mailSubscription) {
                const mailSettings = await MailSubscriptionSettings.findOne({
                    where: { status: true }
                });
                if (mailSettings) {
                    mailSubscriptionData = {
                        isDiscountUsed: mailSubscription.isDiscountUsed,
                        discount_amount: parseFloat(mailSettings.discount_amount),
                        discount_type: mailSettings.discount_type
                    };
                }
            }
        }

        const loyaltySettings = await LoyaltyPointsSettings.findOne({
            where: { status: true }
        });

        if (loyaltySettings && user) {
            const canRedeem = user.loyalty_points >= loyaltySettings.minimum_points_redemption;
            const pointsNeeded = Math.max(0, loyaltySettings.minimum_points_redemption - user.loyalty_points);
            let redemptionAmount = 0;
            let redemptionType = 'none';

            if (canRedeem) {
                if (loyaltySettings.loyalty_amount_type === 'percentage') {
                    redemptionAmount = loyaltySettings.loyalty_amount;
                    redemptionType = 'percentage';
                } else {
                    redemptionAmount = loyaltySettings.loyalty_amount;
                    redemptionType = 'fixed';
                }
            }

            loyaltyRedemptionInfo = {
                user_points: user.loyalty_points || 0,
                minimum_points_required: loyaltySettings.minimum_points_redemption,
                can_redeem: canRedeem,
                points_needed: pointsNeeded,
                redemption_amount: redemptionAmount,
                redemption_type: redemptionType,
                points_value: loyaltySettings.points_value,
                min_amount_for_loyalty_points: loyaltySettings.min_amount_for_loyalty_points,
                amount_divisor: loyaltySettings.amount_divisor
            };
        }

        const checkoutSummary = {
            totalItems,
            shippingCost: 0, // Will be calculated in order
            subTotal,
            total: checkoutTotal,
            deals: {
                total_deals_discount: dealsDiscount,
                applicable_deals: applicableDeals
            },
            mail_subscription_data: mailSubscriptionData,
            loyalty_redemption_info: loyaltyRedemptionInfo
        };

        // Step 4: Place order using helper with enriched cart items
        const orderTransaction = await sequelize.transaction();
        try {
            const orderResult = await placeOrderLogic(tempUser.id, {
                email,
                phone,
                couponCode: normalizedCouponCode,
                receive_promotions,
                shipping_address_id: shipping_address.shipping_address_id,
                shipping_address,
                billing_address: billing_address || shipping_address,
                useShippingAsBilling: useShippingAsBilling !== undefined ? useShippingAsBilling : true,
                payment_method,
                loyalty,
                points_to_redeem,
                total,
                shipping_method_id,
                // Pass enriched cart items directly - no Cart table query needed
                cartItems: enrichedCartItems
            }, orderTransaction);

            await orderTransaction.commit();

            // Return combined response
            return successResponse(res, {
                checkout: checkoutSummary,
                order: orderResult,
                tokens: {
                    accessToken,
                    refreshToken
                },
                is_temporary: true
            }, 'Order placed successfully');

        } catch (orderError) {
            await orderTransaction.rollback();
            throw orderError;
        }

    } catch (error) {
        // Log full error details to diagnose 500s like "Assignment to constant variable."
        console.error('guestCheckoutAndOrder error:', error);
        if (error && error.stack) {
            console.error('guestCheckoutAndOrder error stack:', error.stack);
        }

        return errorResponse(res, error, error.message || 'Guest checkout and order failed');
    }
};



