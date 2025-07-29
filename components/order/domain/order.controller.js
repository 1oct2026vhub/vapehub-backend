const { Sequelize, Op } = require("sequelize");
const moment = require('moment-timezone');
const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const {saveShippingAddress, getVivaAccessToken, createVivaOrder, getVivaAccessTokenByMerchantId} = require("../helper/order.helper")
const { Review, Coupon, CouponUsage, User, Product, ProductVariant, ProductImage, ProductVariantAttribute, Attribute, AttributeTerm, OrderAddress, Cart, ShippingMethod, ProductVariantImage, UserAddress, PaymentMethod, Category, Brand, Flavor,Referral, Order, OrderItem, sequelize, Transaction, ReferralMethod, LoyaltyPointsSettings, MailSubscription, MailSubscriptionSettings} = require("../../../models");
const logger = require("../../../library/logger");
const { v4: uuidv4 } = require('uuid');
const crypto = require("crypto");
const axios = require("axios");
const sendEmail = require('../../../library/sendEmail');
const constants = require('../../../config/constants');
const { createNotification } = require('../../notification/helper/notification.helper');
const dealService = require('../../Cart/helper/deal.service');

module.exports.getOrders = async (req, res) => {
    try {
        const userId = req.user.id; // Get user ID from authenticated token
        const { page = 1, limit = 10 } = req.query; // Default page 1 and 10 items per page
        const offset = (page - 1) * limit;
        // Get user data
        const user = await User.findOne({
            where: { id: userId },
            attributes: ['id', 'first_name', 'last_name', 'email', 'phone', 'receive_promotions']
        });

        if (!user) {
            return errorResponse(res, {}, 'User not found', 404);
        }

        // First get the total count of user's orders excluding failed orders
        const totalCount = await Order.count({
            where: { 
                user_id: userId,
                // status: {
                //     [Op.ne]: 'fail' // Exclude orders with 'fail' status
                // }
            }
        });

        // Then get the paginated orders excluding failed orders
        const orders = await Order.findAll({
            where: { 
                user_id: userId,
                // status: {
                //     [Op.ne]: 'fail' // Exclude orders with 'fail' status
                // }
            },
            attributes: [
                'id', 'order_unique_id', 'total', 'discount_price', 'status', 'createdAt', 'email', 'phone'
            ],
            include: [
                {
                    model: OrderItem,
                    as: 'orderItems',
                    attributes: ['id', 'unit', 'unit_price', 'quantity', 'discount_price', 'total'],
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'slug', 'price'],
                            paranoid: false,
                            include: [
                                {
                                    model: ProductImage,
                                    as: 'ProductImages',
                                    attributes: ['image_url'],
                                    where: { is_primary: true },
                                    required: false
                                }
                            ]
                        },
                        {
                            model: ProductVariant,
                            as: 'variant',
                            attributes: ['id', 'slug', 'price'],
                            paranoid: false,
                            include: [
                                {
                                    model: ProductVariantImage,
                                    as: 'variantImages',
                                    attributes: ['image_url'],
                                    where: { is_primary: true },
                                    required: false
                                }
                            ]
                        }
                    ]
                },
                {
                    model: UserAddress,
                    as: 'shippingAddress',
                    attributes: ['name', 'street', 'town', 'post_code', 'phone']
                },
                {
                    model: UserAddress,
                    as: 'billingAddress',
                    attributes: ['name', 'street', 'town', 'post_code', 'phone']
                },
                {
                    model: OrderAddress,
                    as: 'orderShippingAddress',
                    attributes: ['name', 'last_name', 'street', 'town', 'post_code', 'phone', 'region', 'country']
                },
                {
                    model: OrderAddress,
                    as: 'orderBillingAddress',
                    attributes: ['name', 'last_name', 'street', 'town', 'post_code', 'phone', 'region', 'country']
                },
                {
                    model: ShippingMethod,
                    as: 'shippingMethod',
                    attributes: ['id', 'shipping_method', 'shipping_cost']
                }
            ],
            order: [['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        if (!orders) {
            return errorResponse(res, {}, {message: 'Orders not found'}, 404);
        }
        // Mapping orders to include the image URL for each order item
        const mappedOrders = orders.map(order => {
            // Update order status if needed
            order.orderItems.forEach(item => {
                if (item.variant && item.variant.variantImages && item.variant.variantImages.length > 0) {
                    item.variant.primary_image_url = item.variant.variantImages[0].image_url;
                }
            });
            return order;
        });

        const totalPages = Math.ceil(totalCount / limit);

        successResponse(res, {
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                phone: user.phone,
                receive_promotions: user.receive_promotions
            },
            orders: mappedOrders,
            pagination: {
                total: totalCount,
                page: parseInt(page),
                limit: parseInt(limit),
                total_pages: totalPages
            }
        }, 'Orders fetched successfully', 200);

    } catch (error) {
        console.error("Error fetching orders:", error);
        return errorResponse(res, error, {message: "Failed to fetch orders"});
    }
};


module.exports.placeOrder = async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
        const user_id = req.user.id;
        const { email, phone, couponCode, receive_promotions, shipping_method_id, shipping_address_id, shipping_address, billing_address, useShippingAsBilling, payment_method, loyalty, total, cardNumber, expiryMonth, expiryYear, cvv } = req.body;
        
        // Update user's receive_promotions preference if provided
        if (typeof receive_promotions === 'boolean') {
            await User.update(
                { receive_promotions },
                { where: { id: user_id } }
            );
        }

        // Save Addresses
        const shippingData = { ...shipping_address, shipping_address_id, name: shipping_address.first_name, street: shipping_address.address_line_1 + " " + shipping_address.address_line_2, state: shipping_address.region, town: shipping_address.city, };
        const billingData = { ...billing_address, name: billing_address.first_name, street: billing_address.address_line_1 + " " + billing_address.address_line_2, state: billing_address.region, town: billing_address.city };
        const shippingAddrs = await saveShippingAddress(user_id, shippingData, transaction);
        const billingAddrs = useShippingAsBilling ? shippingAddrs : await saveShippingAddress(user_id, billingData, transaction);
        const payMethod = payment_method.method;

        // Get payment method ID from PaymentMethod model
        const paymentMethodRecord = await PaymentMethod.findOne({
            where: { payment_method: payMethod },
            transaction
        });

        if (!paymentMethodRecord) {
            throw new Error(`Payment method ${payMethod} not found`);
        }

        let wallet_check = {};

        // Fetch Cart Items
        const cartItems = await Cart.findAll({
            where: { user_id },
            include: [
                { model: User, attributes: ["id", "first_name", "last_name", "email", "phone"], as: "user" },
                { 
                    model: Product, 
                    where: { deletedAt: null },
                    include: [
                        { 
                            model: ProductVariant, 
                            as: "variants",
                            where: { deleted_at: null },
                            required: false
                        },
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
                    as: "product" 
                },
            ],
            transaction
        });
        if (!cartItems.length) throw new Error("Cart is empty");
        let subTotal = 0;
        const orderItems = [];
        const orderDetails = [];

        // Transform cart items for deals service
        const transformedCartItems = cartItems.map(item => {
            const variant = item.product.variants.find(v => v.id === item.variant_id);
            return {
                ...item.toJSON(),
                variant: variant || null
            };
        });

        // Calculate deals
        const deals = await dealService.getApplicableDeals(transformedCartItems);
        const dealResult = dealService.calculateDealDiscounts(transformedCartItems, deals);
        const dealsDiscount = dealResult.totalDiscount;
        const applicableDeals = dealResult.appliedDeals;

        for (const item of cartItems) {
            const { product, variant_id, quantity } = item;
            if (!product) throw new Error(`Product ${product.name} not found.`);
            const variant = variant_id ? product.variants.find(v => v.id === variant_id) : null;
            if (variant == null) throw new Error(`Product ${product.name} with variant not found.`);
            // Validate Stock
            if (variant && variant.stock < quantity) throw new Error(`Not enough stock for variant ${variant.slug}.`);
            if (!variant && product.stock_quantity < quantity) throw new Error(`Not enough stock for ${product.name}.`);
            
            const unitPrice = variant ? variant.price : product.price;
            const itemTotal = unitPrice * quantity;
            subTotal += itemTotal;

            // Get item-level deal discount
            const itemDealDiscount = dealResult.itemDiscounts[item.id] || 0;
            const finalItemTotal = itemTotal - itemDealDiscount;

            orderItems.push({
                product_id: item.product_id,
                variant_id: variant_id || null,
                unit: quantity,
                unit_price: unitPrice,
                quantity,
                total: finalItemTotal,
                discount_price: itemDealDiscount
            });

            orderDetails.push({
                product_name: product.name,
                variant_name: variant ? variant.name : null,
                quantity,
                total: finalItemTotal,
                discount: itemDealDiscount,
                variant: variant ? {
                    variant_id: variant.id,
                    slug: variant.slug,
                    price: variant.price,
                    weight: variant.weight,
                    length: variant.length,
                    width: variant.width,
                    height: variant.height,
                    description: variant.description
                } : null
            });
        }
        // Calculate final total after deals
        let calculatedTotal = subTotal - dealsDiscount;
        let coupon = null;
        let discount = 0;
        let referral_flag = false;
        let discountType = null;
        let referralDiscount = 0;
        let referralId = null;
        let coupon_count_flag = false;
        let loyaltyDiscount = 0;
        let loyaltyDiscountType = null;
        let loyalty_flag = false;
        let totalDiscount = 0

        // Apply coupon if provided
        if (couponCode) {
            const referral = await Referral.findOne({
                where: {
                    referral_coupon_code: couponCode,
                    status: {
                        [Op.in]: ['pending', 'completed']
                    }
                }
            });

            if (referral) {
                let referralValue;
                let referralValueType;
                if (referral.status === 'pending'  && referral.referred_user_id === user_id) {
                    referralValue = parseFloat(referral.referral_value);
                    referralValueType = referralValue!=0 ? referral.referral_value_type : 'percentage';

                    // Check minimum purchase for fixed referral value type
                    if (parseFloat(referral.minimum_purchase) && parseFloat(calculatedTotal) < parseFloat(referral.minimum_purchase)) {     //referralValueType === 'fixed' && 
                        referralValue = 0;
                        referralValueType = 'percentage';
                    }

                    // Check maximum purchase for all referral types
                    if (parseFloat(referral.maximum_purchase) && parseFloat(calculatedTotal) > parseFloat(referral.maximum_purchase)) {
                        referralValue = 0;
                        referralValueType = 'percentage';
                    }
                } else if (referral.status === 'completed' && referral.referrer_id === user_id) {
                    const referralMethod = referral.referrer_data;
                    if (referralMethod) {
                        referralValue = parseFloat(referralMethod.referral_value);
                        referralValueType = referralMethod.referral_value_type;

                        // Check minimum purchase for fixed referral value type
                        if (parseFloat(referralMethod.minimum_purchase) && parseFloat(calculatedTotal) < parseFloat(referralMethod.minimum_purchase)) {    //referralValueType === 'fixed' && 
                            referralValue = 0;
                            referralValueType = 'percentage';
                        }

                        // Check maximum purchase for all referral types
                        if (parseFloat(referralMethod.maximum_purchase) && parseFloat(calculatedTotal) > parseFloat(referralMethod.maximum_purchase)) {
                            referralValue = 0;
                            referralValueType = 'percentage';
                        }
                    }
                    else{
                        referralValue = 0;
                        referralValueType = 'percentage';
                    }
                }

                if (referralValue && !isNaN(parseFloat(referralValue))) {
                    referralDiscount = referralValueType === 'percentage' 
                        ? (parseFloat(referralValue) / 100) * calculatedTotal 
                        : referralValue;
                    // Ensure discount doesn't exceed subtotal
                    referralDiscount = Math.min(parseFloat(referralDiscount), parseFloat(calculatedTotal));
                    // calculatedTotal = Math.max(0, calculatedTotal - referralDiscount);
                    totalDiscount +=parseFloat(referralDiscount)
                    referral_flag = true;
                    referralId = referral.id;
                }
                else{
                    referralDiscount = 0;
                }
                discountType = referralValueType;
            }
            else{
                const currentUkTime = moment().tz(process.env.UK_TIMEZONE);
                coupon = await Coupon.findOne({ where: { code: couponCode, status: "active", start_date: { [Op.lte]: currentUkTime }, end_date: { [Op.or]: [{ [Op.gte]: currentUkTime }, { [Op.is]: null }] } } });
                if (coupon && subTotal >= (coupon.minimum_purchase || 0) && (!coupon.usage_limit || coupon.usage_count < coupon.usage_limit)) {
                    userUsedCoupon = await CouponUsage.findOne({ where: { user_id, coupon_id: coupon.id } });
                    const singleUsedCoupon = await CouponUsage.findOne({ where: {coupon_id: coupon.id } });
                    if (!userUsedCoupon) {
                        // For single-use coupons, only calculate if it hasn't been used before
                        if (coupon.is_single_use && !singleUsedCoupon) {
                            let discount_type = 0;
                            if(coupon.discount_type === "percentage"){
                                discount_type = coupon.discount_type;
                            }
                            else if(coupon.discount_type === "fixed_amount"){
                                discount_type = "fixed";
                            }

                            // Calculate discount based on entity type
                            if (coupon.entity_type && coupon.entity_id) {
                                // Filter cart items that match the entity type and ID
                                let applicableItems = [];
                                for (const item of cartItems) {
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

                                // Calculate subtotal for applicable items only
                                const applicableSubtotal = applicableItems.reduce((sum, item) => {
                                    const variant = item.product.variants.find(v => v.id === item.variant_id);
                                    const unitPrice = variant ? variant.price : item.product.price;
                                    return sum + (item.quantity * unitPrice);
                                }, 0);

                                // Calculate discount based on applicable items subtotal
                                if (coupon.discount_type === "percentage") {
                                    discount = (coupon.discount_value / 100) * applicableSubtotal;
                                } else if (coupon.discount_type === "fixed_amount") {
                                    discount = coupon.discount_value;
                                }

                                // Apply maximum discount limit if set
                                if (parseFloat(discount) && parseFloat(coupon.maximum_discount) && parseFloat(discount) > parseFloat(coupon.maximum_discount)) {
                                    discount = parseFloat(coupon.maximum_discount);
                                }

                                // Ensure discount doesn't exceed applicable subtotal
                                if (parseFloat(discount) > parseFloat(applicableSubtotal)) {
                                    discount = applicableSubtotal;
                                }
                            } else {
                                // No entity restriction - apply to entire cart
                            discount = coupon.discount_type === "percentage" ? (parseFloat(coupon.discount_value) / 100) * calculatedTotal : parseFloat(coupon.discount_value);
                            discount = Math.min(parseFloat(discount), parseFloat(coupon.maximum_discount) || parseFloat(calculatedTotal));
                            }
                            totalDiscount +=parseFloat(discount)
                            // calculatedTotal = Math.max(0, calculatedTotal - discount);
                            discountType = discount_type;
                            referralDiscount = parseFloat(discount);
                            coupon_count_flag = true;
                        }
                        // For non-single-use coupons, calculate normally
                        else if (!coupon.is_single_use) {
                            let discount_type = 0;
                            if(coupon.discount_type === "percentage"){
                                discount_type = coupon.discount_type;
                            }
                            else if(coupon.discount_type === "fixed_amount"){
                                discount_type = "fixed";
                            }

                            // Calculate discount based on entity type
                            if (coupon.entity_type && coupon.entity_id) {
                                // Filter cart items that match the entity type and ID
                                let applicableItems = [];
                                for (const item of cartItems) {
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

                                // Calculate subtotal for applicable items only
                                const applicableSubtotal = applicableItems.reduce((sum, item) => {
                                    const variant = item.product.variants.find(v => v.id === item.variant_id);
                                    const unitPrice = variant ? variant.price : item.product.price;
                                    return sum + (item.quantity * unitPrice);
                                }, 0);

                                // Calculate discount based on applicable items subtotal
                                if (coupon.discount_type === "percentage") {
                                    discount = (coupon.discount_value / 100) * applicableSubtotal;
                                } else if (coupon.discount_type === "fixed_amount") {
                                    discount = coupon.discount_value;
                                }

                                // Apply maximum discount limit if set
                                if (parseFloat(discount) && parseFloat(coupon.maximum_discount) && parseFloat(discount) > parseFloat(coupon.maximum_discount)) {
                                    discount = parseFloat(coupon.maximum_discount);
                                }

                                // Ensure discount doesn't exceed applicable subtotal
                                if (parseFloat(discount) > parseFloat(applicableSubtotal)) {
                                    discount = applicableSubtotal;
                                }
                            } else {
                                // No entity restriction - apply to entire cart
                            discount = coupon.discount_type === "percentage" ? (coupon.discount_value / 100) * calculatedTotal : coupon.discount_value;
                            discount = Math.min(discount, coupon.maximum_discount || calculatedTotal);
                            }
                            totalDiscount +=parseFloat(discount)
                            // calculatedTotal = Math.max(0, calculatedTotal - discount);
                            discountType = discount_type;
                            referralDiscount = parseFloat(discount);
                            coupon_count_flag = true;
                        }
                        else {
                            console.log("Coupon validation failed:", {
                                coupon_id: coupon.id,
                                is_single_use: coupon.is_single_use,
                                // single_used: singleUsedCoupon,
                                // user_used: userUsedCoupon
                            });
                        }
                    }
                }
            }
        }

        if(loyalty){
            const settings = await LoyaltyPointsSettings.findOne({
                where: { status: true }
            });
    
            if(settings){
                const user = await User.findOne({
                    where: { id: user_id }
                });
                if(user.loyalty_points >= parseFloat(settings.minimum_points_redemption)){  // && total >= settings.minimum_purchase_amount
                    const points = user.loyalty_points;
                    const loyaltyAmount = parseFloat(settings.loyalty_amount);
                    const loyaltyAmountType = settings.loyalty_amount_type;
                    if(loyaltyAmountType === 'percentage'){
                        loyaltyDiscount = (parseFloat(loyaltyAmount) / 100) * calculatedTotal;
                        // calculatedTotal = Math.max(0, calculatedTotal - loyaltyDiscount);
                        totalDiscount +=parseFloat(loyaltyDiscount)
                    }else{
                        // Only apply loyalty discount if calculated total is greater than loyalty amount
                        if(calculatedTotal > loyaltyAmount){
                            loyaltyDiscount = parseFloat(loyaltyAmount);
                            // calculatedTotal = Math.max(0, calculatedTotal - loyaltyAmount);
                            totalDiscount += parseFloat(loyaltyDiscount)
                            loyalty_flag = true;
                        }
                        // else{
                        //     // If calculated total is less than or equal to loyalty amount, apply only the calculated total
                        //     loyaltyDiscount = calculatedTotal;
                        //     calculatedTotal = 0;
                        //     loyalty_flag = true;
                        //     // return {
                        //     //     statusCode: 400,
                        //     //     message: `Loyalty discount amount (£${loyaltyAmount}) exceeds order total (£${calculatedTotal + loyaltyDiscount}). Only £${loyaltyDiscount} discount applied.`
                        //     // };
                        // }
                    }
                    
                }
            }
        }

        // Check for mail subscription discount (first purchase)
        let mailSubscriptionDiscount = 0;
        let mailSubscriptionDiscountType = null;
        let mailSubscription_flag = false;
        
        const user = await User.findOne({
            where: { id: user_id },
            attributes: ['id', 'email']
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

                    if (discountType === 'percentage') {
                        mailSubscriptionDiscount = (parseFloat(discountAmount) / 100) * calculatedTotal;
                        // calculatedTotal = Math.max(0, calculatedTotal - mailSubscriptionDiscount);
                    } else {
                        mailSubscriptionDiscount = Math.min(parseFloat(discountAmount), parseFloat(calculatedTotal));
                        // calculatedTotal = Math.max(0, calculatedTotal - mailSubscriptionDiscount);
                    }
                    totalDiscount+=parseFloat(mailSubscriptionDiscount)
                    mailSubscriptionDiscountType = discountType;
                    mailSubscription_flag = true;
                }
            }
        }
        if (calculatedTotal > 0) {
            calculatedTotal = calculatedTotal-totalDiscount
        }
        // Apply Shipping Cost
        const shippingMethod = await ShippingMethod.findOne({ where: { id: shipping_method_id }, attributes: ["id", "shipping_cost"] });
        if (shippingMethod) calculatedTotal += shippingMethod.shipping_cost;
        // Ensure Price Integrity
        calculatedTotal = parseFloat(Math.max(0, calculatedTotal).toFixed(2));
        let orderCode = 0;
        let worldpayResponse = {};
        wallet_check.payMethod = payMethod;
        if(payMethod === "VivaWallet"){
            wallet_check.start = true;
            try {
                const accessToken = await getVivaAccessToken();
                wallet_check.accessToken = accessToken;
                orderCode = await createVivaOrder(accessToken,calculatedTotal); // Amount in EUR/USD, etc.
                
                // Check if order code is valid
                if (!orderCode || orderCode === 0) {
                    throw new Error("Failed to generate Viva Wallet order code");
                }
                
                wallet_check.orderCode = orderCode;
            } catch (error) {
                wallet_check.error = true;
                wallet_check.message = error.response?.data || error.message;
                console.log(error);
                await transaction.rollback();
                return errorResponse(res, error, "Failed to process payment with Viva Wallet");
            }
            wallet_check.end = true;
        }
        else if(payMethod === "Worldpay"){
            const generateTransactionReference = () => {
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                let result = '';
                for (let i = 0; i < 16; i++) {
                    result += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                return result;
            };
            orderCode = generateTransactionReference();
            
            const WORLDPAY_USERNAME = process.env.WORLDPAY_USERNAME;
            const WORLDPAY_PASSWORD = process.env.WORLDPAY_PASSWORD;

            // Validate and format country code
            let countryCode = (billing_address.country || 'GB').toUpperCase();
            if (countryCode.length !== 2) {
                countryCode = 'GB'; // Default to GB if invalid
            }
            
            try {
                worldpayResponse = await axios({
                    method: 'POST',
                    url: `${process.env.WORLDPAY_URL}/payment_pages`,
                    headers: {
                        'Content-Type': 'application/vnd.worldpay.payment_pages-v1.hal+json',
                        'User-Agent': 'string',
                        'Authorization': `Basic ${Buffer.from(`${WORLDPAY_USERNAME}:${WORLDPAY_PASSWORD}`).toString('base64')}`
                    },
                    data: {
                        transactionReference: orderCode,
                        merchant: {entity: process.env.WORLDPAY_MERCHANT_ID},
                        narrative: {line1: 'VapeHub Order'},
                        value: {
                            currency: 'GBP',
                            amount: Math.round(calculatedTotal * 100)
                        },
                        description: 'VapeHub Order',
                        billingAddressName: billing_address.first_name,
                        billingAddress: {
                            address1: billing_address.address_line_1,
                            address2: billing_address.address_line_2,
                            address3: billing_address.region,
                            postalCode: billing_address.post_code,
                            city: billing_address.city,
                            state: billing_address.region,
                            countryCode: countryCode
                        },
                        resultURLs: {
                            successURL: `${process.env.FRONTEND_URL}/payment-success?orderCode=${orderCode}&transactionId=${orderCode}&amount=${calculatedTotal}&currency=GBP`,    //&orderId=${order.id}
                            // pendingURL: `${process.env.FRONTEND_URL}/payment/pending`,
                            failureURL: `${process.env.FRONTEND_URL}/payment-failed?orderCode=${orderCode}&transactionId=${orderCode}&amount=${calculatedTotal}&currency=GBP`,    //&orderId=${order.id}
                            errorURL: `${process.env.FRONTEND_URL}/payment-failed?orderCode=${orderCode}&transactionId=${orderCode}&amount=${calculatedTotal}&currency=GBP`,    //&orderId=${order.id}
                            cancelURL: `${process.env.FRONTEND_URL}/payment-failed?orderCode=${orderCode}&transactionId=${orderCode}&amount=${calculatedTotal}&currency=GBP`,    //&orderId=${order.id}
                            expiryURL: `${process.env.FRONTEND_URL}/payment-failed?orderCode=${orderCode}&transactionId=${orderCode}&amount=${calculatedTotal}&currency=GBP`    //&orderId=${order.id}
                        },
                        
                    }
                });

                if (!worldpayResponse.data) {
                    throw new Error('No response data from Worldpay');
                }

            } catch (error) {
                console.error("Worldpay Error:", error.response?.data || error.message);
                throw new Error(error.response?.data?.message || 'Failed to process payment with Worldpay');
            }
        }
        // Generate random digit (0-9) and random alphabet (A-Z)
        const randomDigit = Math.floor(Math.random() * 10);
        const randomAlphabet = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // 65 is ASCII for 'A'
        
        const orderUniqueId = `ORD-${uuidv4().split('-')[0].toUpperCase()}${randomDigit}${randomAlphabet}`;

        // Create Order with deal information
        const order = await Order.create({
            user_id,
            coupon_id: coupon && coupon_count_flag ? coupon.id : null,
            total: calculatedTotal,
            status: "pending",
            order_shipping_address_id: shippingAddrs.id,
            order_billing_address_id: billingAddrs.id,
            shipping_method_id,
            order_unique_id: orderUniqueId,
            order_code: payMethod === "Worldpay" ? orderCode : parseInt(orderCode).toString(),
            shipping_cost: shippingMethod ? shippingMethod.shipping_cost : 0,
            email: email,
            phone: phone,
            sub_total: subTotal,
            deals_discount: dealsDiscount,
            applicable_deals: applicableDeals,
            discount_price: referralDiscount,
            discount_type: discountType,
            referral_id: referralId,
            payment_method_id: paymentMethodRecord.id,
            loyalty_flag: loyalty_flag,
            loyalty_discount: loyaltyDiscount
        }, { transaction });

        await OrderItem.bulkCreate(orderItems.map(item => ({ ...item, order_id: order.id })), { transaction });

        if(couponCode && referral_flag){
            try {
                // First find the referral to ensure it exists and is not locked
                const referral = await Referral.findOne({
                    where: {
                        referral_coupon_code: couponCode
                    },
                    lock: true,
                    transaction
                });

                if (referral) {
                    await referral.update({
                        order_id: order.id
                    }, { transaction });
                }
            } catch (error) {
                console.log("error in place order function while updating referral with order");
            }
        }
        await transaction.commit();
        return successResponse(res, {
            message: "Order placed successfully",
            data: {
                order_code: order.order_code,
                worldpay_url: payMethod === "Worldpay" ? worldpayResponse.data.url : null,
                order_details: {
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    order_code: order.order_code,
                    status: order.status,
                    total: calculatedTotal,
                    created_at: order.created_at,
                    order_items: orderDetails,
                    pricing: {
                        subtotal: subTotal,
                        shipping_cost: shippingMethod ? shippingMethod.shipping_cost : 0,
                        deals_discount: dealsDiscount,
                        coupon_discount: coupon ? discount : 0,
                        referral_discount: referralDiscount,
                        loyalty_discount: loyaltyDiscount,
                        // loyalty_discount_type: loyaltyDiscountType,
                        mail_subscription_discount: mailSubscriptionDiscount,
                        mail_subscription_discount_type: mailSubscriptionDiscountType,
                        total: calculatedTotal
                    },
                    shipping: { address: shippingAddrs },
                    billing: { address: billingAddrs }
                },
                wallet_log: wallet_check
            }
        }, "Success");
    } catch (error) {
        await transaction.rollback();
        return errorResponse(res, error, error.message);
    }
};

module.exports.generateVivaOrdercode = async (req,res)=>{
    try {
        const { cardNumber, expiryMonth, expiryYear, cvv, amount, cardToken } = req.body;
        const accessToken = await getVivaAccessToken();
        const orderCode = await createVivaOrder(accessToken,amount); // Amount in EUR/USD, etc.
        res.json({ success: true, orderCode: orderCode });
    } catch (error) {
        console.log(error)
        res.status(500).json({ success: false, message: error.response?.data || error.message });
    }
}

module.exports.getOrderById = async (req, res) => {
    try {
        const userId = req.user.id; // Get user ID from authenticated token
        const orderId = req.params.id;

        // Get user data
        const user = await User.findOne({
            where: { id: userId },
            attributes: ['id', 'first_name', 'last_name', 'email', 'phone', 'receive_promotions']
        });

        if (!user) {
            return errorResponse(res, {}, 'User not found', 404);
        }
        const order = await Order.findOne({
            where: { 
                id: orderId,
                user_id: userId // Ensure the order belongs to the authenticated user
            },
            attributes: [
                'id', 'order_code', 'order_unique_id', 'total', 'discount_price', 'status', 
                'createdAt', 'email', 'phone', 'referral_id', 'sub_total', 'discount_type',
                'deals_discount', 'applicable_deals', 'loyalty_flag', 'loyalty_discount',
                'mailSubscription_discount'
            ],
            include: [
                {
                    model: OrderItem,
                    as: 'orderItems',
                    attributes: ['id', 'unit', 'unit_price', 'quantity', 'discount_price', 'total'],
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'price', 'slug'],
                            paranoid: false,
                            include: [
                                {
                                    model: ProductImage,
                                    as: 'ProductImages',
                                    attributes: ['image_url'],
                                    where: { is_primary: true },
                                    required: false
                                }
                            ]
                        },
                        {
                            model: ProductVariant,
                            as: 'variant',
                            attributes: ['id', 'slug', 'price'],
                            paranoid: false,
                            include: [
                                {
                                    model: ProductVariantAttribute,
                                    as: 'variantAttributes',
                                    include: [
                                      {
                                        model: Attribute,
                                        as: 'attribute',
                                        attributes: ['id', 'name', 'type'],
                                        paranoid: false
                                      },
                                      {
                                        model: AttributeTerm,
                                        as: 'term',
                                        attributes: ['id', 'name', 'slug'],
                                        paranoid: false
                                      }
                                    ],
                                    paranoid: false
                                  },
                                {
                                    model: ProductVariantImage,
                                    as: 'variantImages',
                                    attributes: ['image_url'],
                                    where: { is_primary: true },
                                    required: false
                                }
                            ]
                        }
                    ]
                },
                {
                    model: UserAddress,
                    as: 'shippingAddress',
                    attributes: ['name', 'last_name', 'street', 'town', 'post_code', 'phone', 'region', 'country']
                },
                {
                    model: UserAddress,
                    as: 'billingAddress',
                    attributes: ['name', 'last_name', 'street', 'town', 'post_code', 'phone', 'region', 'country']
                },
                {
                    model: OrderAddress,
                    as: 'orderShippingAddress',
                    attributes: ['name', 'last_name', 'street', 'town', 'post_code', 'phone', 'region', 'country']
                },
                {
                    model: OrderAddress,
                    as: 'orderBillingAddress',
                    attributes: ['name', 'last_name', 'street', 'town', 'post_code', 'phone', 'region', 'country']
                },
                {
                    model: ShippingMethod,
                    as: 'shippingMethod',
                    attributes: ['id', 'shipping_method', 'shipping_cost']
                },
                {
                    model: Coupon,
                    as: 'coupon',
                    attributes: ['code', 'discount_type', 'discount_value']
                },
                {
                    model: PaymentMethod,
                    as: 'paymentMethod',
                    attributes: ['id', 'payment_method', 'status']
                }
            ]
        });

        if (!order) {
            return errorResponse(res, {}, 'Order not found', 404);
        }
        // Process referral discount if order has a referral_id
        let orderObj = {}
        if(order.referral_id){
            const referral = await Referral.findOne({
                where: {
                    id: order.referral_id
                }
            });
            
            if(referral) {
                if(referral.referred_user_id === userId){
                    orderObj.referral_code = referral.referral_coupon_code;
                    orderObj.referral_value = referral.referral_value;
                    orderObj.referral_value_type = referral.referral_value_type;
                    orderObj.referral_discount = order.discount_price;
                    // Calculate discount price if value type is percentage
                    // if (referral.referral_value_type === 'percentage' && referral.referral_value) {
                    //     orderObj.referral_discount = (parseFloat(referral.referral_value) / 100) * order.sub_total;
                    // } else if (referral.referral_value) {
                    //     orderObj.referral_discount = parseFloat(referral.referral_value);
                    // }
                }
                else if(referral.referrer_id === userId){
                    // const referralMethod = await ReferralMethod.findOne({
                    //     where: {
                    //         primary: true,  // means it is referrer person
                    //         status: 'active',
                    //         refer_type: 'referrer'  //new
                    //     }
                    // });
                    const referralMethod = referral.referrer_data;
                    if(referralMethod) {
                        orderObj.referral_code = referral.referral_coupon_code;
                        orderObj.referral_value = referralMethod.referral_value;
                        orderObj.referral_value_type = referralMethod.referral_value_type;
                        orderObj.referral_discount = order.discount_price;
                        // Calculate discount price if value type is percentage
                        // if (referralMethod.referral_value_type === 'percentage' && referralMethod.referral_value) {
                        //     orderObj.referral_discount = (parseFloat(referralMethod.referral_value) / 100) * order.sub_total;
                        // } else if (referralMethod.referral_value) {
                        //     orderObj.referral_discount = parseFloat(referralMethod.referral_value);
                        // }
                    }
                }
            }
        }
        // Process coupon discount if order has a coupon_id
        else if (order.coupon) {
            const coupon = order.coupon;
            
            // Set coupon data
            orderObj.coupon_code = coupon.code;
            orderObj.coupon_value = coupon.discount_value;
            orderObj.coupon_type = coupon.discount_type;
            orderObj.coupon_discount = order.discount_price;
            // Calculate discount amount based on coupon type
            // if (coupon.discount_type === 'percentage' && coupon.discount_value) {
            //     // Use sub_total if available, otherwise use total
            //     const baseAmount = order.sub_total;
            //     orderObj.coupon_discount = (parseFloat(coupon.discount_value) / 100) * baseAmount;
            // } else if (coupon.discount_type === 'fixed_amount' && coupon.discount_value) {
            //     orderObj.coupon_discount = parseFloat(coupon.discount_value);
            // }
        }

        let orderCouponObject = {}
         if(order.referral_id){
            orderCouponObject.referral = {
                coupon_code: orderObj.referral_code,
                coupon_value: orderObj.referral_value,
                coupon_type: orderObj.referral_value_type,
                coupon_discount: Math.floor((orderObj.referral_discount || 0) * 100) / 100
            }
         }
         if(order.coupon){
            orderCouponObject.referral = {
                coupon_code: orderObj.coupon_code,
                coupon_value: orderObj.coupon_value,
                coupon_type: orderObj.coupon_type,
                coupon_discount: Math.floor((orderObj.coupon_discount || 0) * 100) / 100
            }
         }
        
        // Add primary image URL and deal information to each order item
        order.orderItems.forEach(item => {
            if (item.product && item.product.ProductImages && item.product.ProductImages.length > 0) {
                item.product.primary_image_url = item.product.ProductImages[0].image_url;
            }
            if (item.variant && item.variant.variantImages && item.variant.variantImages.length > 0) {
                item.variant.primary_image_url = item.variant.variantImages[0].image_url;
            }

            // Add deal information to each item
            if (order.applicable_deals) {
                const itemDeals = order.applicable_deals.filter(deal => 
                    deal.items.some(dealItem => dealItem.cart_item_id === item.id)
                );
                
                if (itemDeals.length > 0) {
                    item.deals = itemDeals.map(deal => ({
                        deal_id: deal.deal_id,
                        deal_name: deal.deal_name,
                        discount_amount: deal.discount_amount,
                        original_price: item.unit_price * item.quantity,
                        discounted_price: item.total
                    }));
                }
            }
        });

        successResponse(res, {
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                phone: user.phone,
                receive_promotions: user.receive_promotions
            },
            order: {
                ...order.toJSON(),
                deals_summary: {
                    total_deals_discount: order.deals_discount,
                    applicable_deals: order.applicable_deals
                }
            },
            referral: orderCouponObject.referral,
        }, 'Order fetched successfully', 200);

    } catch (error) {
        console.error("Error fetching order:", error);
        return errorResponse(res, error, {message: "Failed to fetch order"});
    }
};

module.exports.getVivaWalletPaymentDetails = async (req, res) => {
    const userId = req.user.id;
    try {
        const { transactionId } = req.params;
        const accessToken = await getVivaAccessToken();
        // Make request to Viva Wallet API to get transaction details
        const response = await axios.get(
            `${process.env.VIVA_API_BASE_2}/checkout/v2/transactions/${transactionId}`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        const transactionData = response.data;
        // Check if transactionData is empty
        if (!transactionData || Object.keys(transactionData).length === 0) {
            return errorResponse(res, {}, 'No transaction data found', 404);
        }

        // Format the response data
        const paymentDetails = {payment_method: 'vivaWallet', ...transactionData};

        return successResponse(res, paymentDetails, 'Payment details retrieved successfully');
    } catch (error) {
        console.error('Error fetching Viva Wallet payment details:', error);
        
        if (error.response?.status === 404) {
            return errorResponse(res, {}, 'Transaction not found', 404);
        }
        
        return errorResponse(res, error, 'Failed to fetch payment details');
    }
};

module.exports.cancelOrder = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { orderId } = req.params;
        const userId = req.user.id;

        // Find the order by order ID and user ID
        const order = await Order.findOne({
            where: { 
                id: orderId,
                user_id: userId
            },
            include: [
                { model: User, as: 'user' },
            ],
            transaction
        });

        if (!order) {
            await transaction.rollback();
            return errorResponse(res, {}, 'Order not found', 404);
        }

        // Check if order can be cancelled
        if (!order.canBeCancelled()) {
            await transaction.rollback();
            return errorResponse(res, {}, 'Order cannot be cancelled at this stage', 400);
        }

        // Update order status to cancelled
        await order.update({ 
            status: 'cancel'
        }, { transaction });

        // Create order log for cancellation
        await sequelize.models.OrderLog.create({
            order_id: order.id,
            user_id: userId,
            status: 'cancel',
            label: 'Order Cancelled'
        }, { transaction });

        // Create notification for cancellation
        await createNotification({
            userId: userId,
            type: 'order',
            action: 'cancelled',
            data: {
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                reason: 'Viva Wallet Order Cancelled'
            },
            url: '/my-account/orders'
        });

        // Send cancellation email
        const emailData = {
            emailTypes: 'ORDER_CANCELLATION',
            to: order.email,
            context: {
                userName: order.user?.first_name || order.email.split('@')[0],
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                orderDate: order.createdAt.toLocaleDateString(),
                status: 'cancelled',
                reason: 'Cancelled via Viva Wallet'
            }
        };

        await sendEmail(emailData.to, emailData.emailTypes, emailData.context);

        await transaction.commit();

        return successResponse(res, {
            order_id: order.id,
            order_code: order.order_code,
            status: order.status
        }, 'Order cancelled successfully');

    } catch (error) {
        await transaction.rollback();
        console.error('Error cancelling order:', error);
        return errorResponse(res, error, 'Failed to cancel order');
    }
};

module.exports.checkOrderStock = async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
        const { orderId } = req.params;
        const userId = req.user.id;
        // Find the order by order ID and user ID
        const order = await Order.findOne({
            where: { 
                id: orderId,
                user_id: userId
            },
            include: [{
                model: OrderItem,
                as: 'orderItems',
                include: [
                    {
                        model: Product,
                        as: 'product',
                        attributes: ['id', 'name', 'slug']
                    },
                    {
                        model: ProductVariant,
                        as: 'variant',
                        attributes: ['id', 'stock', 'slug']
                    }
                ]
            }],
            transaction
        });
        
        if (!order) {
            await transaction.rollback();
            return errorResponse(res, {}, 'Order not found', 404);
        }
        // Check if coupon has expired
        if (order.coupon_id) {
            const currentUkTime = moment().tz(process.env.UK_TIMEZONE);
            let coupon = await Coupon.findOne({
                where: {
                    id: order.coupon_id,
                    status: "active",
                    start_date: { [Op.lte]: currentUkTime }, // Coupon has started (UK time)
                    end_date: { [Op.or]: [{ [Op.gte]: currentUkTime }, { [Op.is]: null }] }, // Not expired (UK time)
                }
            });
            if (!coupon) {
                orderStatusUpdate()
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
                orderStatusUpdate()
                throw {
                    statusCode: 400,
                    message: 'Already used discount coupon.'
                }
            }
            if (userUsedCoupon) {
                orderStatusUpdate()
                throw {
                    statusCode: 400,
                    message: 'You have already used discount coupon.'
                }
            }
            if (coupon.usage_limit && (coupon.usage_count >= coupon.usage_limit)) {     // !coupon.is_single_use &&
                orderStatusUpdate()
                throw {
                    statusCode: 400,
                    message: 'This coupon is no longer available — usage limit exceeded.'
                }
            }
            async function orderStatusUpdate(){
                // Update order status to cancelled
                await order.update({ 
                    status: 'cancel'
                });

                // Create order log for cancellation
                await sequelize.models.OrderLog.create({
                    order_id: order.id,
                    user_id: userId,
                    status: 'cancel',
                    label: 'Order Cancelled - Coupon Expired'
                });
            }
        }

        let hasInsufficientStock = false;
        const stockIssues = [];

        // Check each order item's quantity against variant stock
        for (const item of order.orderItems) {
            if (item.variant) {
                if (item.quantity > item.variant.stock) {
                    hasInsufficientStock = true;
                    stockIssues.push({
                        product_id: item.product.id,
                        product_name: item.product.name,
                        product_slug: item.product.slug,
                        variant_id: item.variant.id,
                        variant_slug: item.variant.slug,
                        requested_quantity: item.quantity,
                        available_stock: item.variant.stock
                    });
                }
            }
        }

        if (hasInsufficientStock) {
            // Update order status to cancelled
            await order.update({ 
                status: 'cancel'
            }, { transaction });

            // Create order log for cancellation
            await sequelize.models.OrderLog.create({
                order_id: order.id,
                user_id: userId,
                status: 'cancel',
                label: 'Order Cancelled - Insufficient Stock'
            }, { transaction });

            await transaction.commit();

            return errorResponse(res, {
                order_id: order.id,
                status: order.status,
                stock_issues: stockIssues
            }, 'Order cancelled due to insufficient stock', 400);
        }
        
        var merchantId = process.env.VIVA_MERCHANT_ID || '82231a6f-a467-47a4-8674-6e43606f49ce';
        var apiKey = process.env.VIVA_API_KEY || ']kD;D=';
        var credentials = Buffer.from(merchantId + ':' + apiKey).toString('base64');
        const orderDetails = await axios({
                    method: "GET",
                    url: `https://demo.vivapayments.com/api/orders/${order.order_code}`,
                    headers: {
                      "Authorization": "Basic " + credentials,
                    }
        });
        // Check if order state indicates cancellation (StateId 1 or 2)
        if (orderDetails.data && (orderDetails.data.StateId === 1 || orderDetails.data.StateId === 2)) {
            // Update order status to cancelled
            await order.update({ 
                status: 'cancel'
            }, { transaction });

            // Create order log for cancellation
            await sequelize.models.OrderLog.create({
                order_id: order.id,
                user_id: userId,
                status: 'cancel',
                label: 'Order Cancelled - Viva Wallet State'
            }, { transaction });

            await transaction.commit();

            return errorResponse(res, {
                order_id: order.id,
                order_code: order.order_code,
                status: order.status,
                viva_state: orderDetails.data.StateId,
                message: 'Order cancelled due to Viva Wallet state'
            }, 'Order cancelled due to Viva Wallet state', 400);
        }
        await transaction.commit();
        return successResponse(res, {
            order_id: order.id,
            order_code: order.order_code,
            status: order.status,
            message: 'All items are in stock'
        }, 'Stock check successful');

    } catch (error) {
        await transaction.rollback();
        console.error('Error checking order stock:', error);
        
        // If error is 404, update order status to cancel
        if (error.response?.status === 404) {
            try {
                const order = await Order.findOne({
                    where: { 
                        id: req.params.orderId,
                        user_id: req.user.id
                    }
                });

                if (order) {
                    await order.update({ status: 'cancel' });
                    
                    // Create order log for cancellation
                    await sequelize.models.OrderLog.create({
                        order_id: order.id,
                        user_id: req.user.id,
                        status: 'cancel',
                        label: 'Order Cancelled - Viva Wallet Order Not Found'
                    });

                    // // Create notification for cancellation
                    // await createNotification({
                    //     userId: req.user.id,
                    //     type: 'order',
                    //     action: 'cancelled',
                    //     data: {
                    //         orderId: order.id,
                    //         orderUniqueId: order.order_unique_id,
                    //         orderCode: order.order_code,
                    //         reason: 'Viva Wallet Order Not Found'
                    //     },
                    //     url: '/my-account/orders'
                    // });

                    // Send cancellation email
                    // const emailData = {
                    //     emailTypes: 'ORDER_CANCELLATION',
                    //     to: order.email,
                    //     context: {
                    //         userName: order.user?.first_name || order.email.split('@')[0],
                    //         orderId: order.id,
                    //         orderUniqueId: order.order_unique_id,
                    //         orderCode: order.order_code,
                    //         orderDate: order.createdAt.toLocaleDateString(),
                    //         status: 'cancelled',
                    //         reason: 'Viva Wallet Order Not Found'
                    //     }
                    // };

                    // await sendEmail(emailData.to, emailData.emailTypes, emailData.context);
                    return errorResponse(res, {message:'Cannot process this order due to invalid or expired Viva Wallet order code'}, 'Cannot process this order due to invalid or expired Viva Wallet order code', 404);
                }
            } catch (updateError) {
                return errorResponse(res, {message:'Cannot process this order due to invalid or expired Viva Wallet order code'}, 'Cannot process this order due to invalid or expired Viva Wallet order code', 404);
            }
        }
        
        return errorResponse(res, error, 'Failed to check order stock');
    }
};

module.exports.orderCode = async (req, res) => {
    try {
        // const orderInstance = await Order.findOne({
        //     where: { id: req.params.orderCode }
        // });

        // if (orderInstance) {
        //     // Update using instance method to trigger hooks
        //     await orderInstance.update({ status: "processing" });
        // }
        // const orderCode = req.params.orderCode;
        // var merchantId = process.env.VIVA_MERCHANT_ID || '82231a6f-a467-47a4-8674-6e43606f49ce';
        // var apiKey = process.env.VIVA_API_KEY || ']kD;D=';
        // var credentials = Buffer.from(merchantId + ':' + apiKey).toString('base64');
        // const orderDetails = await axios({
        //             method: "GET",
        //             url: `https://demo.vivapayments.com/api/orders/${orderCode}`,
                    
        //             headers: {
        //               "Authorization": "Basic " + credentials,
        //             }
        // });
        const order = await Order.findOne({
            where: { 
                order_unique_id: req.params.orderCode
            },
            include: [
                { model: User, as: 'user' },
                { 
                    model: OrderItem, 
                    as: 'orderItems',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'price']
                        },
                        {
                            model: ProductVariant,
                            as: 'variant',
                            attributes: ['id', 'slug', 'price', 'stock']
                        }
                    ]
                },
                {
                    model: UserAddress,
                    as: 'shippingAddress',
                    attributes: ['name', 'last_name', 'street', 'town', 'post_code', 'phone', 'region', 'country']
                },
                {
                    model: UserAddress,
                    as: 'billingAddress',
                    attributes: ['name', 'last_name', 'street', 'town', 'post_code', 'phone', 'region', 'country']
                },
                {
                    model: OrderAddress,
                    as: 'orderShippingAddress',
                    attributes: ['name', 'last_name', 'street', 'town', 'post_code', 'phone', 'region', 'country']
                },
                {
                    model: OrderAddress,
                    as: 'orderBillingAddress',
                    attributes: ['name', 'last_name', 'street', 'town', 'post_code', 'phone', 'region', 'country']
                },
                {
                    model: ShippingMethod,
                    as: 'shippingMethod',
                    attributes: ['id', 'shipping_method', 'shipping_cost']
                }
            ]
        });
        try {
            console.log(orderResponse);
        } catch (err) {
            console.error('Failed to create ShipStation order:', err);
        }
        res.json(orderResponse)
    } catch (error) {
        console.error('Error processing Viva Wallet webhook:', error);
        return errorResponse(res, error, 'Failed to process webhook');
    }
};