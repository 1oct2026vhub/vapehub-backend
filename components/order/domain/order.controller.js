const { Sequelize, Op } = require("sequelize");
const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const {saveShippingAddress, getVivaAccessToken, createVivaOrder} = require("../helper/order.helper")
const { Coupon, CouponUsage, User, Product, ProductVariant, ProductImage, Cart, ShippingMethod, ProductVariantImage, UserAddress, PaymentMethod, Category, Flavor, Order, OrderItem, sequelize} = require("../../../models");
const logger = require("../../../library/logger");
const { v4: uuidv4 } = require('uuid');
const crypto = require("crypto");
const axios = require("axios");

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

        // First get the total count of user's orders
        const totalCount = await Order.count({
            where: { user_id: userId }
        });

        // Then get the paginated orders
        const orders = await Order.findAll({
            where: { user_id: userId }, // Fetch only current user's orders
            attributes: [
                'id', 'order_unique_id', 'total', 'discount_price', 'status', 'createdAt'
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
                            attributes: ['id', 'name', 'slug', 'price']
                        },
                        {
                            model: ProductVariant,
                            as: 'variant',
                            attributes: ['id', 'slug', 'price'],
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
        const { email, phone, couponCode, receive_promotions, shipping_method_id, shipping_address_id, shipping_address, billing_address, useShippingAsBilling, payment_method, total, cardNumber, expiryMonth, expiryYear, cvv } = req.body;

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

        
        
        let wallet_check = {};

        // Fetch Cart Items
        const cartItems = await Cart.findAll({
            where: { user_id },
            include: [
                { model: User, attributes: ["id", "first_name", "last_name", "email", "phone"], as: "user" },
                { model: Product, include: [{ model: ProductVariant, as: "variants" }], as: "product" },
            ],
            transaction
        });
        if (!cartItems.length) throw new Error("Cart is empty");
        
        let subTotal = 0;
        const orderItems = [];
        const orderDetails = [];
        const stockUpdates = [];

        for (const item of cartItems) {
            const { product, variant_id, quantity } = item;
            if (!product) throw new Error(`Product ${item.product_id} not found.`);
            const variant = variant_id ? product.variants.find(v => v.id === variant_id) : null;
            // Validate Stock
            if (variant && variant.stock < quantity) throw new Error(`Not enough stock for variant ${variant.id}.`);
            if (!variant && product.stock_quantity < quantity) throw new Error(`Not enough stock for ${product.name}.`);
            
            const unitPrice = variant ? variant.price : product.price;
            subTotal += unitPrice * quantity;
            
            orderItems.push({
                product_id: item.product_id,
                variant_id: variant_id || null,
                unit: quantity,
                unit_price: unitPrice,
                quantity,
                total: unitPrice * quantity
            });

            orderDetails.push({
                product_name: product.name,
                variant_name: variant ? variant.name : null,
                quantity,
                total: unitPrice * quantity,
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
            
            stockUpdates.push({ model: variant ? ProductVariant : Product, updateData: variant ? { stock: sequelize.literal(`stock - ${quantity}`) } : { stock_quantity: sequelize.literal(`stock_quantity - ${quantity}`) }, whereClause: variant ? { id: variant.id, stock: { [Op.gte]: quantity } } : { id: product.id, stock_quantity: { [Op.gte]: quantity } } });
        }

        // Update Stock in Batch
        for (const { model, updateData, whereClause } of stockUpdates) {
            const [updatedStock] = await model.update(updateData, { where: whereClause, transaction });
            if (updatedStock === 0) throw new Error("Stock update failed.");
        }
        
        // Apply Coupon
        let calculatedTotal = subTotal;
        let coupon = null;
        if (couponCode) {
            coupon = await Coupon.findOne({ where: { code: couponCode, status: "active", start_date: { [Op.lte]: new Date() }, end_date: { [Op.or]: [{ [Op.gte]: new Date() }, { [Op.is]: null }] } } });
            if (coupon && subTotal >= (coupon.minimum_purchase || 0) && (!coupon.usage_limit || coupon.usage_count < coupon.usage_limit)) {
                const userUsedCoupon = await CouponUsage.findOne({ where: { user_id, coupon_id: coupon.id } });
                if (!userUsedCoupon) {
                    let discount = coupon.discount_type === "percentage" ? (coupon.discount_value / 100) * subTotal : coupon.discount_value;
                    discount = Math.min(discount, coupon.maximum_discount || subTotal);
                    calculatedTotal = Math.max(0, subTotal - discount);
                }
            }
        }
        
        // Apply Shipping Cost
        const shippingMethod = await ShippingMethod.findOne({ where: { id: shipping_method_id }, attributes: ["id", "shipping_cost"] });
        if (shippingMethod) calculatedTotal += shippingMethod.shipping_cost;
        
        // Ensure Price Integrity
        // if (calculatedTotal !== total) throw { message: "Total price mismatch. Possible price manipulation detected.", statusCode: 400 };
        calculatedTotal = parseFloat(Math.max(0, calculatedTotal).toFixed(2));

        let orderCode = 0;
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

        const orderUniqueId = `ORD-${uuidv4().split('-')[0].toUpperCase()}`;
        // Create Order
        const order = await Order.create({
            user_id,
            coupon_id: coupon ? coupon.id : null,
            total: calculatedTotal,
            status: "pending",
            shipping_address_id: shippingAddrs.id,
            billing_address_id: billingAddrs.id,
            shipping_method_id,
            order_unique_id: orderUniqueId,
            order_code: parseInt(orderCode).toString(),
            shipping_cost: shippingMethod ? shippingMethod.shipping_cost : 0
        }, { transaction });
        await OrderItem.bulkCreate(orderItems.map(item => ({ ...item, order_id: order.id })), { transaction });
        
        if (coupon) {
            // First check if user has already used this coupon
            const [couponUsage, created] = await CouponUsage.findOrCreate({ where: { user_id,  coupon_id: coupon.id }, defaults: { order_id: order.id }, transaction });
            // Only update coupon usage count if this is a new usage
            if (created) {
                await Coupon.update( { usage_count: sequelize.literal("usage_count + 1") }, { where: { id: coupon.id }, transaction });
            }
        }
        
        // else{
            // const PAYMENT_URL = process.env.PAYMENT_URL; //"https://try.access.worldpay.com/api/payments";
            // const ACCOUNT_ID = process.env.ACCOUNT_ID; //"364806707";  // Your Worldpay Account ID
            // const API_KEY = process.env.API_KEY; //"D072A3884FA9DE021EF37D36F07F1338C007F7386F58DF4A1A7DBCF1415328638D22C901";
            
            // const paymentData = {
            //     transactionReference: `TXN-${Date.now()}`,
            //     merchant: { entity: "default" },
            //     instruction: {
            //         method: 'card',
            //         paymentInstrument: {
            //           type: 'plain',
            //           cardHolderName: 'Sherlock Holmes',
            //           cardNumber: '4000000000001091',
            //           expiryDate: {month: 5, year: 2035},
            //           billingAddress: {
            //             address1: '221B Baker Street',
            //             address2: 'Marylebone',
            //             address3: 'Westminster',
            //             postalCode: 'SW1 1AA',
            //             city: 'London',
            //             state: 'Greater London',
            //             countryCode: 'GB'
            //           },
            //           cvc: '123'
            //         },
            //         narrative: {line1: 'trading name'},
            //         value: {
            //           currency: 'GBP',
            //           amount: 42
            //         }
            //     }
            // };
    
            // const response = await axios.post(PAYMENT_URL, paymentData, {
            //     headers: {
            //         'Content-Type': 'application/json',
            //         'WP-Api-Version': '2024-06-01',
            //         Authorization: `Basic ${Buffer.from(`${ACCOUNT_ID}:${API_KEY}`).toString("base64")}`
            //       },
            // });
    
            // console.log("Payment Successful:", response.data);
        // }
        // await Cart.destroy({ where: { user_id }, transaction });
        await transaction.commit();
        return successResponse(res, {
            message: "Order placed successfully",
            data: {
                order_code: orderCode,
                order_details: {
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    order_code: order.order_code,
                    status: order.status,
                    total: calculatedTotal,
                    created_at: order.created_at,
                    order_items: orderDetails,
                    // order_code: orderCode,
                    pricing: {
                        subtotal: subTotal,
                        shipping_cost: shippingMethod ? shippingMethod.shipping_cost : 0,
                        discount: coupon ? coupon.discount_value : 0,
                        total: calculatedTotal
                    },
                    shipping: { address: shippingAddrs }
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


// module.exports.handleVivaWebhook = async (req, res)=>{
//     const VIVA_WALLET_SECRET = "your_viva_wallet_secret";
//     // Function to verify webhook signature
//     function verifySignature(req) {
//         const signature = req.headers["x-viva-signature"]; // Correct header name
//         const payload = req.rawBody;
//         const hmac = crypto.createHmac("sha256", VIVA_WALLET_SECRET).update(payload).digest("hex");
//         return signature === hmac;
//     }
//     if (!verifySignature(req)) {
//         return res.status(401).send("Invalid signature");
//     }   
//     const eventData = req.body;
//     console.log("Received Viva Wallet Webhook:", eventData);

//     // Extract payment status
//     if (eventData.eventType === "TransactionStatusChanged") {
//         const transactionId = eventData.eventData.TransactionId;
//         const status = eventData.eventData.StatusId;

//         console.log(`Transaction ID: ${transactionId}, Status: ${status}`);
        
//         // Process the payment status here (e.g., update database, send notification, etc.)
//         if (status === "F") {
//             console.log(`Payment successful for Transaction ID: ${transactionId}`);
//             // TODO: Update order/payment status in the database
//             // TODO: Send email/notification to the user
//         } else if (status === "X") {
//             console.log(`Payment failed for Transaction ID: ${transactionId}`);
//             // TODO: Mark payment as failed in the database
//             // TODO: Notify the user and ask for a retry
//         } else if (status === "A") {
//             console.log(`Payment pending for Transaction ID: ${transactionId}`);
//             // TODO: Keep monitoring until final status is received
//         } else {
//             console.log(`⚠️ Unhandled payment status (${status}) for Transaction ID: ${transactionId}`);
//             // TODO: Log or handle unknown statuses
//         }
//     }

//     res.status(200).send("Webhook received");
// }

// module.exports.handleWorldpayWebhook = async (req, res) => {
//     function verifySignature(req) {
//         const signatureHeader = req.headers["x-wp-signature"]; // Correct header
//         if (!signatureHeader) {
//             console.warn("❌ Signature missing");
//             return false;
//         }
    
//         // Compute HMAC SHA-256 signature using Worldpay secret key
//         const computedSignature = crypto.createHmac("sha256", WORLDPAY_SECRET)
//             .update(req.rawBody)
//             .digest("hex");
    
//         return signatureHeader === computedSignature;
//     }
//     if (!verifySignature(req)) {
//         console.error("❌ Invalid signature: Potential tampering detected!");
//         return res.status(401).send("Invalid signature");
//     }

//     const eventData = req.body;
//     console.log("📩 Received Worldpay Webhook:", eventData);

//     // Extract Payment Status
//     if (eventData.paymentStatus) {
//         const transactionId = eventData.orderCode; // Unique transaction ID
//         const status = eventData.paymentStatus; // Payment status

//         console.log(`Transaction ID: ${transactionId}, Status: ${status}`);

//         // ✅ Handle Payment Success
//         if (status === "SUCCESS") {
//             console.log(`Payment successful for Transaction ID: ${transactionId}`);
//             // TODO: Update order/payment status in the database
//             // TODO: Send email/notification to the user
//         } 
//         // ❌ Handle Payment Failure
//         else if (status === "FAILED") {
//             console.log(`Payment failed for Transaction ID: ${transactionId}`);
//             // TODO: Mark payment as failed in the database
//             // TODO: Notify the user and ask for a retry
//         } 
//         // 🔄 Handle Payment Pending
//         else if (status === "PENDING") {
//             console.log(`Payment pending for Transaction ID: ${transactionId}`);
//             // TODO: Keep monitoring until final status is received
//         } 
//         // ⚠️ Handle Other Payment Statuses
//         else {
//             console.log(`Unhandled payment status (${status}) for Transaction ID: ${transactionId}`);
//             // TODO: Log or handle unknown statuses
//         }
//     }
// };

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
                'id', 'order_unique_id', 'total', 'discount_price', 'status', 'createdAt'
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
                    attributes: ['name', 'street', 'town', 'post_code', 'phone', 'region', 'country']
                },
                {
                    model: UserAddress,
                    as: 'billingAddress',
                    attributes: ['name', 'street', 'town', 'post_code', 'phone', 'region', 'country']
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
                }
            ]
        });

        if (!order) {
            return errorResponse(res, {}, 'Order not found', 404);
        }

        // Add primary image URL to each order item
        order.orderItems.forEach(item => {
            if (item.product && item.product.ProductImages && item.product.ProductImages.length > 0) {
                item.product.primary_image_url = item.product.ProductImages[0].image_url;
            }
            if (item.variant && item.variant.variantImages && item.variant.variantImages.length > 0) {
                item.variant.primary_image_url = item.variant.variantImages[0].image_url;
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
            order: order
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

        // Handle successful payment (statusId: F)
        if (transactionData.statusId === "F" && transactionData.orderCode) {
            // Find the order by orderCode
            const order = await Order.findOne({
                where: { user_id: userId, order_code: transactionData.orderCode },
                include: [{ model: User, as: 'user' }]
            });

            if (order) {
                // Update order status to processing
                await order.update({ status: 'processing' });
                
                // Clear the user's cart
                await Cart.destroy({ 
                    where: { user_id: order.user_id }
                });
            }
        }

        // Handle failed payment (statusId: E)
        if (transactionData.statusId === "E") {
            // Find and destroy the order
            const order = await Order.findOne({
                where: {user_id: userId, order_code: transactionData.orderCode }
            });

            if (order) {
                await order.destroy();
            }
        }

        // Format the response data
        const paymentDetails = { ...transactionData};

        return successResponse(res, paymentDetails, 'Payment details retrieved successfully');
    } catch (error) {
        console.error('Error fetching Viva Wallet payment details:', error);
        
        if (error.response?.status === 404) {
            return errorResponse(res, {}, 'Transaction not found', 404);
        }
        
        return errorResponse(res, error, 'Failed to fetch payment details');
    }
};