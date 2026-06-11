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
    sequelize
} = require("../../../models");
const { saveShippingAddress, getVivaAccessToken, createVivaOrder } = require('./order.helper');
const dealService = require('../../Cart/helper/deal.service');
const { calculateShippingCost } = require('../../shippingMethod/helper/shippingMethod.helper');
const {
    createWorldpayPaymentPage,
    generateTransactionReference
} = require('./worldpay.helper');
const { v4: uuidv4 } = require('uuid');

const PENDING_WORLDPAY_ORDER_TTL_HOURS = Number(process.env.WORLDPAY_PENDING_ORDER_TTL_HOURS) || 24;

const normalizeCartLines = (lines) =>
    [...lines]
        .map((line) => ({
            product_id: line.product_id,
            variant_id: line.variant_id ?? null,
            quantity: line.quantity
        }))
        .sort((a, b) => {
            const keyA = `${a.product_id}:${a.variant_id}:${a.quantity}`;
            const keyB = `${b.product_id}:${b.variant_id}:${b.quantity}`;
            return keyA.localeCompare(keyB);
        });

const cartMatchesOrder = (orderItems, newOrderItems) => {
    const existing = normalizeCartLines(orderItems);
    const incoming = normalizeCartLines(newOrderItems);
    if (existing.length !== incoming.length) {
        return false;
    }
    return existing.every((line, index) =>
        line.product_id === incoming[index].product_id &&
        line.variant_id === incoming[index].variant_id &&
        line.quantity === incoming[index].quantity
    );
};

const buildPlaceOrderResponse = ({
    order,
    worldpayUrl,
    payMethod,
    orderDetails,
    shippingAddrs,
    billingAddrs,
    pricing,
    reusedPendingOrder = false
}) => ({
    order_code: order.order_code,
    worldpay_url: payMethod === 'Worldpay' ? worldpayUrl : null,
    reused_pending_order: reusedPendingOrder,
    order_details: {
        order_id: order.id,
        order_unique_id: order.order_unique_id,
        order_code: order.order_code,
        status: order.status,
        total: pricing.total,
        created_at: order.createdAt || order.created_at,
        order_items: orderDetails,
        pricing,
        shipping: { address: shippingAddrs },
        billing: { address: billingAddrs }
    }
});

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
        total, 
        shipping_method_id: initialShippingMethodId,
        cartItems: providedCartItems // New: accept cart items directly for guest checkout
    } = orderData;

    // Use a mutable copy of shipping method id so we don't reassign a destructured const
    let shippingMethodId = initialShippingMethodId;

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

    // Loyalty points logic
    if (loyalty) {
        const settings = await LoyaltyPointsSettings.findOne({
            where: { status: true },
            transaction
        });

        if (settings) {
            const user = await User.findOne({
                where: { id: user_id },
                transaction
            });
            if (user.loyalty_points >= parseFloat(settings.minimum_points_redemption) && calculatedTotal >= parseFloat(settings.minimum_purchase_amount)) {
                const points = user.loyalty_points;
                const loyaltyAmount = parseFloat(settings.loyalty_amount);
                const loyaltyAmountType = settings.loyalty_amount_type;
                if (loyaltyAmountType === 'percentage') {
                    loyaltyDiscount = (parseFloat(loyaltyAmount) / 100) * calculatedTotal;
                    totalDiscount += parseFloat(loyaltyDiscount);
                    loyalty_flag = true;
                } else {
                    if (calculatedTotal > parseFloat(loyaltyAmount)) {
                        loyaltyDiscount = parseFloat(loyaltyAmount);
                        totalDiscount += parseFloat(loyaltyDiscount);
                        loyalty_flag = true;
                    } else {
                        // If total is less than or equal to loyalty amount, apply only the total
                        loyaltyDiscount = calculatedTotal;
                        throw {
                            statusCode: 400,
                            message: `Loyalty discount amount (£${loyaltyAmount}) exceeds order total (£${calculatedTotal}).`
                        };
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

    if (calculatedTotal > 0) {
        calculatedTotal = calculatedTotal - totalDiscount;
    }

    // Track the actual shipping cost used for this order
    let shippingCostUsed = 0;

    // Apply Shipping Cost
    const shippingMethod = await ShippingMethod.findOne({ 
        where: { 
            id: shippingMethodId,
            is_enabled: true  // Only allow enabled shipping methods
        }, 
        attributes: ["id", "shipping_cost", "is_enabled", "is_free_shipping", "free_shipping_threshold", "min_order_total", "max_order_total", "shipping_rules"],
        transaction 
    });
    if (shippingMethod) {
        // Use helper function to calculate shipping cost based on order total before shipping
        const orderTotalBeforeShipping = calculatedTotal;
        const calculatedShippingCost = calculateShippingCost(shippingMethod, orderTotalBeforeShipping);
        if (calculatedShippingCost !== null) {
            shippingCostUsed = parseFloat(calculatedShippingCost);
            calculatedTotal += shippingCostUsed;
        } else {
            // Shipping method not applicable, set to null
            shippingMethodId = null;
        }
    } else {
        shippingMethodId = null;
    }

    // Ensure Price Integrity
    calculatedTotal = parseFloat(Math.max(0, calculatedTotal).toFixed(2));

    const pricing = {
        subtotal: subTotal,
        shipping_cost: shippingCostUsed,
        deals_discount: dealsDiscount,
        coupon_discount: coupon ? discount : 0,
        referral_discount: referralDiscount,
        loyalty_discount: loyaltyDiscount,
        mail_subscription_discount: mailSubscriptionDiscount,
        mail_subscription_discount_type: mailSubscriptionDiscountType,
        total: calculatedTotal
    };

    // Payment processing
    let orderCode = 0;
    let worldpayUrl = null;
    let reusedPendingOrder = false;
    let order = null;

    if (payMethod === "VivaWallet") {
        try {
            const accessToken = await getVivaAccessToken();
            orderCode = await createVivaOrder(accessToken, calculatedTotal);
            if (!orderCode || orderCode === 0) {
                throw new Error("Failed to generate Viva Wallet order code");
            }
        } catch (error) {
            throw new Error("Failed to process payment with Viva Wallet: " + error.message);
        }
    } else if (payMethod === "Worldpay") {
        const billingAddrForPayment = useShippingAsBilling ? shipping_address : (billing_address || shipping_address);
        let countryCode = (billingAddrForPayment.country || shipping_address.country || 'GB').toUpperCase();
        if (countryCode.length !== 2) {
            countryCode = 'GB';
        }

        const pendingSince = new Date(Date.now() - PENDING_WORLDPAY_ORDER_TTL_HOURS * 60 * 60 * 1000);
        const existingPending = await Order.findOne({
            where: {
                user_id,
                status: 'pending',
                payment_method_id: paymentMethodRecord.id,
                createdAt: { [Op.gte]: pendingSince }
            },
            include: [{ model: OrderItem, as: 'orderItems' }],
            order: [['createdAt', 'DESC']],
            lock: transaction.LOCK.UPDATE,
            transaction
        });

        const canReusePendingOrder = existingPending &&
            cartMatchesOrder(existingPending.orderItems, orderItems) &&
            Math.abs(parseFloat(existingPending.total) - calculatedTotal) < 0.01;

        if (canReusePendingOrder) {
            reusedPendingOrder = true;
            order = existingPending;
            orderCode = existingPending.order_code;

            const { paymentUrl } = await createWorldpayPaymentPage({
                transactionReference: orderCode,
                calculatedTotal,
                billingAddrForPayment,
                countryCode,
                logContext: { userId: user_id, reusedPendingOrder: true, orderId: order.id }
            });
            worldpayUrl = paymentUrl;
        } else {
            orderCode = generateTransactionReference();

            const { paymentUrl } = await createWorldpayPaymentPage({
                transactionReference: orderCode,
                calculatedTotal,
                billingAddrForPayment,
                countryCode,
                logContext: { userId: user_id, reusedPendingOrder: false }
            });
            worldpayUrl = paymentUrl;
        }
    }

    if (!reusedPendingOrder) {
        const randomDigit = Math.floor(Math.random() * 10);
        const randomAlphabet = String.fromCharCode(65 + Math.floor(Math.random() * 26));
        const orderUniqueId = `ORD-${uuidv4().split('-')[0].toUpperCase()}${randomDigit}${randomAlphabet}`;

        order = await Order.create({
            user_id,
            coupon_id: coupon && coupon_count_flag ? coupon.id : null,
            total: calculatedTotal,
            status: "pending",
            order_shipping_address_id: shippingAddrs.id,
            order_billing_address_id: billingAddrs.id,
            shipping_method_id: shippingMethodId ? shippingMethodId : null,
            order_unique_id: orderUniqueId,
            order_code: payMethod === "Worldpay" ? orderCode : parseInt(orderCode).toString(),
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
            mailSubscription_discount: mailSubscriptionDiscount ? mailSubscriptionDiscount : 0
        }, { transaction });

        await OrderItem.bulkCreate(orderItems.map(item => ({ ...item, order_id: order.id })), { transaction });

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
    } else {
        pricing.subtotal = parseFloat(order.sub_total);
        pricing.shipping_cost = parseFloat(order.shipping_cost || 0);
        pricing.deals_discount = parseFloat(order.deals_discount || 0);
        pricing.coupon_discount = 0;
        pricing.referral_discount = parseFloat(order.discount_price || 0);
        pricing.loyalty_discount = parseFloat(order.loyalty_discount || 0);
        pricing.mail_subscription_discount = parseFloat(order.mailSubscription_discount || 0);
        pricing.total = parseFloat(order.total);
    }

    return buildPlaceOrderResponse({
        order,
        worldpayUrl,
        payMethod,
        orderDetails,
        shippingAddrs,
        billingAddrs,
        pricing,
        reusedPendingOrder
    });
};

module.exports = {
    placeOrderLogic
};

