const { Sequelize, Op } = require("sequelize");
const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const {saveShippingAddress, getVivaAccessToken, createVivaOrder} = require("../helper/order.helper")
const { Coupon, CouponUsage, User, Product, ProductVariant, ProductImage, Cart, ShippingMethod, ProductVariantImage, UserAddress, PaymentMethod, Category, Flavor, Order, OrderItem, sequelize} = require("../../../models");
const logger = require("../../../library/logger");
const { v4: uuidv4 } = require('uuid');
const crypto = require("crypto");

module.exports.getOrders = async (req, res) => {
    try {
        const userId = req.user.id; // Get user ID from authenticated token

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
                            attributes: ['id', 'name', 'price']
                        },
                        {
                            model: ProductVariant,
                            as: 'variant',
                            attributes: ['id', 'slug', 'price'],
                            include: [
                                {
                                    model: ProductVariantImage, // Include product variant images
                                    as: 'variantImages',
                                    attributes: ['image_url'],  // Select the image_url from the variant images
                                    where: { is_primary: true }, // Get the primary image for each variant
                                    required: false // Allow orders to fetch variants even if no primary image exists
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
            order: [['createdAt', 'DESC']]
        });

        if (!orders) {
            return errorResponse(res, {}, {message: 'Orders not found'}, 404);
        }

        // Mapping orders to include the image URL for each order item
        const mappedOrders = orders.map(order => {
            order.orderItems.forEach(item => {
                if (item.variant && item.variant.variantImages && item.variant.variantImages.length > 0) {
                    // Set the primary image URL on the product variant
                    item.variant.primary_image_url = item.variant.variantImages[0].image_url;
                }
            });
            return order;
        });

        successResponse(res, mappedOrders,  'Orders fetched successfully', 200);

    } catch (error) {
        console.error("Error fetching orders:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch orders",
            error: error.message
        });
    }
};


module.exports.placeOrder = async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
        const user_id = req.user.id;
        const { email, phone, couponCode, shipping_method_id, shipping_address, billing_address, useShippingAsBilling, payment_method, total, cardNumber, expiryMonth, expiryYear, cvv } = req.body;

        // Save Addresses
        const shippingData = { ...shipping_address, name: shipping_address.first_name, street: shipping_address.address_line_1 + " " + shipping_address.address_line_2, state: shipping_address.region, town: shipping_address.city };
        const billingData = { ...billing_address, name: billing_address.first_name, street: billing_address.address_line_1 + " " + billing_address.address_line_2, state: billing_address.region, town: billing_address.city };
        const shippingAddrs = await saveShippingAddress(user_id, shippingData, transaction);
        const billingAddrs = useShippingAsBilling ? shippingAddrs : await saveShippingAddress(user_id, billingData, transaction);
        const payMethod = payment_method.method;

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
            order_unique_id: orderUniqueId
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
        // if(payMethod === "VivaWallet"){
        //     const accessToken = await getVivaAccessToken(payMethod);
        //     const orderCode = await createVivaOrder(accessToken, 10.00); // Amount in EUR/USD, etc.
        //     const transactionId = await getVivaTransactionToken(accessToken, orderCode);
    
        //     const response = await axios.post(
        //         "https://api.vivapayments.com/nativecheckout/v2/transactions",
        //         {
        //             amount: 1000, // Amount in cents (10.00 EUR/USD)
        //             transactionId: transactionId,
        //             preauth: false,
        //             cardToken: req.body.cardToken
        //         },
        //         {
        //             headers: {
        //             Authorization: `Bearer ${accessToken}`,
        //             "Content-Type": "application/json"
        //         }
        //         }
        //     );
        // }
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
        await Cart.destroy({ where: { user_id }, transaction });
        await transaction.commit();
        return successResponse(res, {
            message: "Order placed successfully",
            data: {
                order_details: {
                    order_id: order.order_unique_id,
                    status: order.status,
                    total: calculatedTotal,
                    created_at: order.created_at,
                    order_items: orderDetails,
                    pricing: {
                        subtotal: subTotal,
                        shipping_cost: shippingMethod ? shippingMethod.shipping_cost : 0,
                        discount: coupon ? coupon.discount_value : 0,
                        total: calculatedTotal
                    },
                    shipping: { address: shippingAddrs }
                }
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
        console.log("orderCode>>>>", orderCode)
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