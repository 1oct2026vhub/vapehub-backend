const { Sequelize, Op } = require("sequelize");
const { 
    Cart, 
    User, 
    Product, 
    ProductVariant, 
    Order, 
    OrderItem, 
    Coupon, 
    CouponUsage, 
    Referral, 
    ShippingMethod, 
    PaymentMethod,
    LoyaltyPointsSettings,
    MailSubscription,
    MailSubscriptionSettings,
    Brand,
    Category,
    AbandonedCartFlow,
    sequelize
} = require("../../../models");
const { saveShippingAddress, getVivaAccessToken, createVivaOrder } = require('./order.helper');
const dealService = require('../../Cart/helper/deal.service');
const loyaltyShippingPricing = require('./loyaltyShippingPricing.helper');
const { finalizePointsOnlyOrder } = require('./orderPaymentFinalize.helper');
const {
    buildPaymentSuccessRedirectUrl,
    generatePaymentReference,
} = require('./paymentSuccessUrl.helper');
const constants = require('../../../config/constants');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const GATEWAY_HTTP_TIMEOUT_MS = 20000;

/**
 * Core order placement logic - returns order data without sending HTTP response
 * @param {number} user_id - User ID
 * @param {Object} orderData - Order data
 * @param {Object} transaction - Sequelize transaction
 * @returns {Promise<Object>} Order details
 */
const placeOrderLogic = async (user_id, orderData, transaction) => {
    const { 
        email, 
        phone, 
        couponCode, 
        receive_promotions, 
        shipping_address_id, 
        shipping_address, 
        billing_address, 
        useShippingAsBilling, 
        payment_method, 
        loyalty,
        points_to_redeem: rawPointsToRedeem,
        is_payment_required: clientPaymentRequiredFlag,
        total,
        shipping_method_id: initialShippingMethodId,
        cartItems: providedCartItems // New: accept cart items directly for guest checkout
    } = orderData;

    // Use a mutable copy of shipping method id so we don't reassign a destructured const
    let shippingMethodId = initialShippingMethodId;
    const pointsToRedeemRequest = Math.max(0, Math.floor(Number(rawPointsToRedeem) || 0));

    // Update user's receive_promotions preference if provided
    if (typeof receive_promotions === 'boolean') {
        await User.update(
            { receive_promotions },
            { where: { id: user_id }, transaction }
        );
    }

    // Save Addresses
    const shippingData = { 
        ...shipping_address, 
        shipping_address_id, 
        name: shipping_address.first_name, 
        street: (shipping_address.address_line_1 || '') + " " + (shipping_address.address_line_2 || ''), 
        state: shipping_address.region, 
        town: shipping_address.city 
    };
    const shippingAddrs = await saveShippingAddress(user_id, shippingData, transaction);
    
    // Handle billing address - use shipping address if useShippingAsBilling is true
    let billingAddrs;
    if (useShippingAsBilling) {
        billingAddrs = shippingAddrs;
    } else {
        // Ensure billing_address exists when useShippingAsBilling is false
        if (!billing_address) {
            throw new Error('Billing address is required when useShippingAsBilling is false');
        }
        const billingData = { 
            ...billing_address, 
            name: billing_address.first_name, 
            street: (billing_address.address_line_1 || '') + " " + (billing_address.address_line_2 || ''), 
            state: billing_address.region, 
            town: billing_address.city 
        };
        billingAddrs = await saveShippingAddress(user_id, billingData, transaction);
    }
    const payMethod = payment_method.method;

    // Get payment method ID from PaymentMethod model
    const paymentMethodRecord = await PaymentMethod.findOne({
        where: { payment_method: payMethod },
        transaction
    });

    if (!paymentMethodRecord) {
        throw new Error(`Payment method ${payMethod} not found`);
    }

    // Fetch Cart Items - use provided items for guest checkout, otherwise query Cart table
    let cartItems;
    if (providedCartItems && providedCartItems.length > 0) {
        // Guest checkout: use provided cart items directly
        cartItems = providedCartItems;
    } else {
        // Regular checkout: query Cart table
        cartItems = await Cart.findAll({
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
    }
    
    if (!cartItems.length) throw new Error("Cart is empty");
    
    let subTotal = 0;
    const orderItems = [];
    const orderDetails = [];

    // Transform cart items for deals service
    const transformedCartItems = cartItems.map(item => {
        // Handle both Cart model instances and plain objects from guest checkout
        let variant;
        if (item.variant && item.variant.id) {
            // Guest checkout: variant is already attached
            variant = item.variant;
        } else if (item.product?.variants) {
            // Regular checkout: find variant from product.variants array
            variant = item.product.variants.find(v => v.id === item.variant_id);
        }
        
        return {
            ...(item.toJSON ? item.toJSON() : item),
            variant: variant || null
        };
    });

    // Calculate deals
    const deals = await dealService.getApplicableDeals(transformedCartItems);
    const dealResult = dealService.calculateDealDiscounts(transformedCartItems, deals);
    const dealsDiscount = dealResult.totalDiscount;
    const applicableDeals = dealResult.appliedDeals;

    for (const item of cartItems) {
        // Handle both Cart model instances and plain objects
        const product = item.product;
        const variant_id = item.variant_id;
        const quantity = item.quantity;
        
        if (!product) throw new Error(`Product not found.`);
        
        // Get variant - handle both Cart model and plain object structures
        let variant;
        if (item.variant && item.variant.id) {
            // Guest checkout: variant is already attached
            variant = item.variant;
        } else if (product.variants) {
            // Regular checkout: find from variants array
            variant = variant_id ? product.variants.find(v => v.id === variant_id) : null;
        }
        
        // If variant_id is provided, variant must exist
        if (variant_id && variant == null) {
            throw new Error(`Product ${product.name} with variant not found.`);
        }
        
        // Validate Stock
        if (variant && variant.stock < quantity) {
            throw new Error(`Not enough stock for variant ${variant.slug || variant_id}.`);
        }
        if (!variant && product.stock_quantity < quantity) {
            throw new Error(`Not enough stock for ${product.name}.`);
        }
        
        const unitPrice = variant ? variant.price : product.price;
        const itemTotal = unitPrice * quantity;
        subTotal += itemTotal;

        // Get item-level deal discount - handle both Cart model and plain object
        const itemId = item.id || item.product_id; // Use product_id as fallback for guest items
        const itemDealDiscount = dealResult.itemDiscounts?.[itemId] || 0;
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
            variant_name: variant ? (variant.slug || variant.name) : null,
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
    let totalDiscount = 0;

    // Apply coupon if provided
    if (couponCode) {
        const referral = await Referral.findOne({
            where: {
                referral_coupon_code: couponCode,
                status: {
                    [Op.in]: ['pending', 'completed']
                }
            },
            transaction
        });

        if (referral) {
            let referralValue;
            let referralValueType;
            if (referral.status === 'pending' && referral.referred_user_id === user_id) {
                referralValue = parseFloat(referral.referral_value);
                referralValueType = referralValue != 0 ? referral.referral_value_type : 'percentage';

                if (parseFloat(referral.minimum_purchase) && parseFloat(calculatedTotal) < parseFloat(referral.minimum_purchase)) {
                    referralValue = 0;
                    referralValueType = 'percentage';
                }

                if (parseFloat(referral.maximum_purchase) && parseFloat(calculatedTotal) > parseFloat(referral.maximum_purchase)) {
                    referralValue = 0;
                    referralValueType = 'percentage';
                }
            } else if (referral.status === 'completed' && referral.referrer_id === user_id) {
                const referralMethod = referral.referrer_data;
                if (referralMethod) {
                    referralValue = parseFloat(referralMethod.referral_value);
                    referralValueType = referralMethod.referral_value_type;

                    if (parseFloat(referralMethod.minimum_purchase) && parseFloat(calculatedTotal) < parseFloat(referralMethod.minimum_purchase)) {
                        referralValue = 0;
                        referralValueType = 'percentage';
                    }

                    if (parseFloat(referralMethod.maximum_purchase) && parseFloat(calculatedTotal) > parseFloat(referralMethod.maximum_purchase)) {
                        referralValue = 0;
                        referralValueType = 'percentage';
                    }
                } else {
                    referralValue = 0;
                    referralValueType = 'percentage';
                }
            }

            if (referralValue && !isNaN(parseFloat(referralValue))) {
                referralDiscount = referralValueType === 'percentage' 
                    ? (parseFloat(referralValue) / 100) * calculatedTotal 
                    : referralValue;
                referralDiscount = Math.min(parseFloat(referralDiscount), parseFloat(calculatedTotal));
                totalDiscount += parseFloat(referralDiscount);
                referral_flag = true;
                referralId = referral.id;
            } else {
                referralDiscount = 0;
            }
            discountType = referralValueType;
        } else {
            // Get coupon first without date validation
            coupon = await Coupon.findOne({ 
                where: { 
                    code: couponCode, 
                    status: "active"
                },
                transaction
            });

            if (coupon) {
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
                    coupon = null; // Mark as invalid
                }

                // Check if coupon has expired
                if (endDateFormatted && currentUKTimeFormatted > endDateFormatted) {
                    coupon = null; // Mark as invalid
                }
            }

            if (coupon && subTotal >= (coupon.minimum_purchase || 0) && (!coupon.usage_limit || coupon.usage_count < coupon.usage_limit)) {
                const userUsedCoupon = await CouponUsage.findOne({ where: { user_id, coupon_id: coupon.id }, transaction });
                const singleUsedCoupon = await CouponUsage.findOne({ where: { coupon_id: coupon.id }, transaction });
                
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
                        totalDiscount += parseFloat(discount);
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
                        totalDiscount += parseFloat(discount);
                        discountType = discount_type;
                        referralDiscount = parseFloat(discount);
                        coupon_count_flag = true;
                    } else {
                        console.log("Coupon validation failed:", {
                            coupon_id: coupon.id,
                            is_single_use: coupon.is_single_use,
                        });
                    }
                }
            }
        }
    }

    // Mail subscription discount
    let mailSubscriptionDiscount = 0;
    let mailSubscriptionDiscountType = null;
    let mailSubscription_flag = false;

    const user = await User.findOne({
        where: { id: user_id },
        attributes: ['id', 'email'],
        transaction
    });
    
    if (user && user.email) {
        const mailSubscription = await MailSubscription.findOne({
            where: { 
                email: user.email,
                isDiscountUsed: false,
            },
            transaction
        });

        if (mailSubscription) {
            const mailSettings = await MailSubscriptionSettings.findOne({
                where: { status: true },
                transaction
            });

            if (mailSettings && parseFloat(mailSettings.discount_amount) > 0) {
                const discountAmount = mailSettings.discount_amount;
                const discountType = mailSettings.discount_type;

                if (discountType === 'percentage') {
                    mailSubscriptionDiscount = (parseFloat(discountAmount) / 100) * calculatedTotal;
                } else {
                    mailSubscriptionDiscount = Math.min(parseFloat(discountAmount), parseFloat(calculatedTotal));
                }
                totalDiscount += parseFloat(mailSubscriptionDiscount);
                mailSubscriptionDiscountType = discountType;
                mailSubscription_flag = true;
            }
        }
    }

    const merchandiseBeforeLoyalty =
        calculatedTotal > 0
            ? parseFloat(Math.max(0, calculatedTotal - totalDiscount).toFixed(2))
            : 0;

    const shippingMethod = await ShippingMethod.findOne({
        where: {
            id: shippingMethodId,
            is_enabled: true,
        },
        attributes: ["id", "shipping_cost", "is_enabled", "is_free_shipping", "free_shipping_threshold", "min_order_total", "max_order_total", "shipping_rules"],
        transaction,
    });

    const loyaltySettings = await LoyaltyPointsSettings.findOne({
        where: { status: true },
        transaction,
    });

    const userForLoyalty = await User.findOne({
        where: { id: user_id },
        attributes: ['id', 'email', 'loyalty_points'],
        transaction,
    });
    const pointsBalance = userForLoyalty ? parseInt(userForLoyalty.loyalty_points, 10) || 0 : 0;
    let pointsRequested = pointsToRedeemRequest;
    const useFullBalanceRedemption = Boolean(loyalty && pointsToRedeemRequest === 0);
    if (useFullBalanceRedemption && loyaltySettings) {
        pointsRequested = pointsBalance;
    }

    const freeShipThreshold =
        (constants.checkout && constants.checkout.FREE_SHIPPING_MERCHANDISE_GBP) || 30;

    const pricing = loyaltyShippingPricing.computeShippingAndLoyalty({
        merchandiseTotalAfterDealsCouponsMail: merchandiseBeforeLoyalty,
        shippingMethod,
        userLoyaltyPoints: pointsBalance,
        pointsToRedeem: pointsRequested,
        pointsValue: loyaltySettings ? parseFloat(loyaltySettings.points_value) || 0 : 0,
        loyaltyAmountType: loyaltySettings ? loyaltySettings.loyalty_amount_type : null,
        loyaltyAmount: loyaltySettings ? parseFloat(loyaltySettings.loyalty_amount) : 0,
        minimumPointsRedemption: loyaltySettings ? loyaltySettings.minimum_points_redemption : 0,
        minimumPurchaseAmountForRedemption: loyaltySettings
            ? parseFloat(loyaltySettings.minimum_purchase_amount) || 0
            : 0,
        freeShippingThresholdGbp: freeShipThreshold,
        fullRedemption: useFullBalanceRedemption,
    });

    if (pricing.shippingCost === null && shippingMethod) {
        throw {
            statusCode: 400,
            message: 'Selected shipping method is not available for this order',
        };
    }

    loyaltyDiscount = pricing.loyaltyDiscount;
    const loyaltyPointsUsed = pricing.pointsUsed;
    loyalty_flag = pricing.pointsUsed > 0;

    let shippingCostUsed = pricing.shippingCost === null ? 0 : pricing.shippingCost;
    if (pricing.shippingCost === null && shippingMethod) {
        shippingMethodId = null;
        shippingCostUsed = 0;
    } else if (!shippingMethod) {
        shippingMethodId = null;
        shippingCostUsed = 0;
    }

    calculatedTotal = pricing.grandTotal !== null ? pricing.grandTotal : 0;
    calculatedTotal = parseFloat(Math.max(0, calculatedTotal).toFixed(2));
    const serverPaymentRequired = pricing.paymentRequired && calculatedTotal > 0;
    const skipGateway = !serverPaymentRequired;

    const clientSaysNoPayment = clientPaymentRequiredFlag === false;
    if (clientSaysNoPayment && serverPaymentRequired) {
        throw {
            statusCode: 400,
            message: 'Payment is required for this order',
        };
    }

    const deferFinalizeToPaymentSuccess = skipGateway && clientSaysNoPayment;

    let orderCode = 0;
    let worldpayResponse = {};

    if (!skipGateway && payMethod === "VivaWallet") {
        try {
            const accessToken = await getVivaAccessToken();
            orderCode = await createVivaOrder(accessToken, calculatedTotal);
            if (!orderCode || orderCode === 0) {
                throw new Error("Failed to generate Viva Wallet order code");
            }
        } catch (error) {
            throw new Error("Failed to process payment with Viva Wallet: " + error.message);
        }
    } else if (!skipGateway && payMethod === "Worldpay") {
        orderCode = generatePaymentReference();

        const WORLDPAY_USERNAME = process.env.WORLDPAY_USERNAME;
        const WORLDPAY_PASSWORD = process.env.WORLDPAY_PASSWORD;

        const billingAddrForPayment = useShippingAsBilling ? shipping_address : (billing_address || shipping_address);

        let countryCode = (billingAddrForPayment.country || shipping_address.country || 'GB').toUpperCase();
        if (countryCode.length !== 2) {
            countryCode = 'GB';
        }

        try {
            worldpayResponse = await axios({
                method: 'POST',
                url: `${process.env.WORLDPAY_URL}/payment_pages`,
                timeout: GATEWAY_HTTP_TIMEOUT_MS,
                headers: {
                    'Content-Type': 'application/vnd.worldpay.payment_pages-v1.hal+json',
                    'User-Agent': 'string',
                    'Authorization': `Basic ${Buffer.from(`${WORLDPAY_USERNAME}:${WORLDPAY_PASSWORD}`).toString('base64')}`,
                },
                data: {
                    transactionReference: orderCode,
                    merchant: { entity: process.env.WORLDPAY_MERCHANT_ID },
                    narrative: { line1: 'VapeHub Order' },
                    value: {
                        currency: 'GBP',
                        amount: Math.round(calculatedTotal * 100),
                    },
                    description: 'VapeHub Order',
                    billingAddressName: billingAddrForPayment.first_name,
                    billingAddress: {
                        address1: billingAddrForPayment.address_line_1,
                        address2: billingAddrForPayment.address_line_2 || '',
                        address3: billingAddrForPayment.region,
                        postalCode: billingAddrForPayment.post_code,
                        city: billingAddrForPayment.city,
                        state: billingAddrForPayment.region,
                        countryCode: countryCode,
                    },
                    resultURLs: {
                        successURL: buildPaymentSuccessRedirectUrl(orderCode, calculatedTotal),
                        failureURL: `${process.env.FRONTEND_URL}/payment-failed?orderCode=${orderCode}&transactionId=${orderCode}&amount=${calculatedTotal}&currency=GBP`,
                        errorURL: `${process.env.FRONTEND_URL}/payment-failed?orderCode=${orderCode}&transactionId=${orderCode}&amount=${calculatedTotal}&currency=GBP`,
                        cancelURL: `${process.env.FRONTEND_URL}/payment-failed?orderCode=${orderCode}&transactionId=${orderCode}&amount=${calculatedTotal}&currency=GBP`,
                        expiryURL: `${process.env.FRONTEND_URL}/payment-failed?orderCode=${orderCode}&transactionId=${orderCode}&amount=${calculatedTotal}&currency=GBP`,
                    },
                },
            });

            if (!worldpayResponse.data) {
                throw new Error('No response data from Worldpay');
            }
        } catch (error) {
            console.error('Worldpay payment_pages error status:', error.response?.status);
            console.error('Worldpay payment_pages error data:', error.response?.data);

            let worldpayMessage;
            const data = error.response?.data;

            if (typeof data === 'string') {
                worldpayMessage = data;
            } else if (data && typeof data === 'object') {
                worldpayMessage =
                    data.message ||
                    data.error?.message ||
                    data.error_description ||
                    JSON.stringify(data);
            }

            throw new Error(worldpayMessage || 'Failed to process payment with Worldpay');
        }
    } else if (skipGateway) {
        orderCode = generatePaymentReference();
        worldpayResponse = {};
    }

    const randomDigit = Math.floor(Math.random() * 10);
    const randomAlphabet = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const orderUniqueId = `ORD-${uuidv4().split('-')[0].toUpperCase()}${randomDigit}${randomAlphabet}`;

    const order = await Order.create({
        user_id,
        coupon_id: coupon && coupon_count_flag ? coupon.id : null,
        total: calculatedTotal,
        status: "pending",
        order_shipping_address_id: shippingAddrs.id,
        order_billing_address_id: billingAddrs.id,
        shipping_method_id: shippingMethodId ? shippingMethodId : null,
        order_unique_id: orderUniqueId,
        order_code: skipGateway
            ? String(orderCode)
            : (payMethod === "Worldpay" ? orderCode : parseInt(String(orderCode), 10).toString()),
        // Store the actual shipping cost that was applied to this order
        shipping_cost: shippingCostUsed,
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
        loyalty_discount: loyaltyDiscount,
        loyalty_points_used: loyaltyPointsUsed,
        mailSubscription_discount: mailSubscriptionDiscount ? mailSubscriptionDiscount : 0
    }, { transaction });

    if (user_id) {
        const olderPendingOrders = await Order.findAll({
            where: {
                user_id,
                status: constants.orderStatus.PENDING,
                id: { [Op.ne]: order.id }
            },
            attributes: ['id'],
            transaction,
            lock: true
        });

        const supersededMessage = `Superseded by new checkout order_id=${order.id}`;
        const supersededAt = new Date();
        for (const row of olderPendingOrders) {
            await AbandonedCartFlow.update(
                {
                    status: 'superseded',
                    cancelled_at: supersededAt,
                    last_error: supersededMessage
                },
                {
                    where: {
                        order_id: row.id,
                        status: { [Op.notIn]: ['recovered', 'cancelled', 'superseded'] }
                    },
                    transaction
                }
            );

            const previousPending = await Order.findByPk(row.id, { transaction, lock: true });
            if (previousPending && previousPending.status === constants.orderStatus.PENDING) {
                await previousPending.update(
                    { status: constants.orderStatus.CANCEL },
                    { transaction }
                );
            }
        }
    }

    const registeredUser = user_id
        ? await User.findOne({
            where: {
                id: user_id,
                is_temporary: false
            },
            attributes: ['id'],
            transaction
        })
        : null;

    if (registeredUser) {
        await AbandonedCartFlow.findOrCreate({
            where: { order_id: order.id },
            defaults: {
                user_id: user_id || null,
                order_unique_id: order.order_unique_id || null,
                customer_email: order.email || null,
                status: 'entered'
            },
            transaction
        });
    }

    await OrderItem.bulkCreate(orderItems.map(item => ({ ...item, order_id: order.id })), { transaction });

    if (skipGateway && !deferFinalizeToPaymentSuccess) {
        await finalizePointsOnlyOrder(order.id, transaction);
    }

    await order.reload({ transaction });

    if (couponCode && referral_flag) {
        try {
            const referral = await Referral.findOne({
                where: { referral_coupon_code: couponCode },
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

    const redirect_url = skipGateway
        ? buildPaymentSuccessRedirectUrl(order.order_code, order.total)
        : null;

    return {
        order_code: order.order_code,
        worldpay_url: !skipGateway && payMethod === "Worldpay" ? worldpayResponse.data?.url : null,
        is_payment_required: serverPaymentRequired,
        payment_required: serverPaymentRequired,
        finalize_deferred: deferFinalizeToPaymentSuccess,
        redirect_url,
        payment_success_url: redirect_url,
        loyalty_points_used: loyaltyPointsUsed,
        ...loyaltyShippingPricing.loyaltyPricingResponseFields(pricing),
        order_details: {
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            order_code: order.order_code,
            status: order.status,
            is_payment_required: serverPaymentRequired,
            payment_required: serverPaymentRequired,
            finalize_deferred: deferFinalizeToPaymentSuccess,
            redirect_url,
            payment_success_url: redirect_url,
            total: calculatedTotal,
            created_at: order.created_at,
            order_items: orderDetails,
            pricing: {
                subtotal: subTotal,
                shipping_cost: shippingCostUsed,
                deals_discount: dealsDiscount,
                coupon_discount: coupon ? discount : 0,
                referral_discount: referralDiscount,
                loyalty_discount: loyaltyDiscount,
                loyalty_points_used: loyaltyPointsUsed,
                ...loyaltyShippingPricing.loyaltyPricingResponseFields(pricing),
                mail_subscription_discount: mailSubscriptionDiscount,
                mail_subscription_discount_type: mailSubscriptionDiscountType,
                total: calculatedTotal,
            },
            shipping: { address: shippingAddrs },
            billing: { address: billingAddrs },
        },
    };
};

module.exports = {
    placeOrderLogic
};

