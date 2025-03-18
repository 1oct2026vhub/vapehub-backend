const { Sequelize, Op } = require("sequelize");
const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const {saveShippingAddress, getVivaAccessToken, createVivaOrder, getVivaTransactionToken} = require("../helper/order.helper")
const { Coupon, CouponUsage, User, Product, ProductVariant, ProductImage, Cart, ShippingMethod, PaymentMethod, Category, Flavor, Order, OrderItem, sequelize} = require("../../../models");
const logger = require("../../../library/logger");


module.exports.placeOrder = async (req, res, next) => {
    const transaction = await sequelize.transaction();
    try {
        const user_id = req.user.id;
        const { email, phone, couponCode, shipping_method_id, shipping_address, billing_address, useShippingAsBilling, payment_method, total } = req.body;

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
        if (!cartItems.length) throw { message: "Cart is empty", statusCode: 400 };
        
        let subTotal = 0;
        const orderItems = [];
        const orderDetails = [];
        const stockUpdates = [];

        for (const item of cartItems) {
            const { product, variant_id, quantity } = item;
            if (!product) throw { message: `Product ${item.product_id} not found.`, statusCode: 404 };
            const variant = variant_id ? product.variants.find(v => v.id === variant_id) : null;
            
            // Validate Stock
            if (variant && variant.stock < quantity) throw { message: `Not enough stock for variant ${variant.id}.`, statusCode: 409 };
            if (!variant && product.stock_quantity < quantity) throw { message: `Not enough stock for ${product.name}.`, statusCode: 409 };
            
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
            if (updatedStock === 0) throw { message: "Stock update failed.", statusCode: 404 };
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
        
        // Create Order
        const order = await Order.create({
            user_id,
            coupon_id: coupon ? coupon.id : null,
            total: calculatedTotal,
            status: "pending",
            shipping_address_id: shippingAddrs.id,
            billing_address_id: billingAddrs.id,
            shipping_method_id
        }, { transaction });
        
        await OrderItem.bulkCreate(orderItems.map(item => ({ ...item, order_id: order.id })), { transaction });
        
        if (coupon) {
            await Coupon.update({ usage_count: sequelize.literal("usage_count + 1") }, { where: { id: coupon.id }, transaction });
            await CouponUsage.findOrCreate({ where: { user_id, coupon_id: coupon.id }, defaults: { order_id: order.id }, transaction });
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
        //     const response = await axios.post(
        //         "https://api.worldpay.com/v1/orders",
        //         {
        //             amount: amount * 100, // Amount in cents (e.g., $10.00)
        //             currencyCode: "USD",
        //             paymentMethod: { encryptedData },
        //             merchantCode: "YOUR_MERCHANT_CODE",
        //             orderDescription: "Product Purchase",
        //         },
        //         {
        //             headers: {
        //                 Authorization: "YOUR WORLDPAY API KEY",
        //                 "Content-Type": "application/json",
        //             },
        //         }
        //     );
        // }
        await transaction.commit();
        return successResponse(res, {
            message: "Order placed successfully",
            data: {
                order_details: {
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