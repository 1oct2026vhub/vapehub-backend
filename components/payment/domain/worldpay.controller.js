const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { User, UserAddress, Order, OrderAddress, OrderItem, Product, ProductVariant, ShippingMethod, Coupon, CouponUsage, Referral, Cart, LoyaltyPointsSettings, ReferralMethod, Transaction, OrderLog, sequelize, LoyaltyPointsHistory, MailSubscription, MailSubscriptionSettings } = require("../../../models");
const { Op } = require('sequelize');
const logger = require('../../../library/logger');
const { createNotification } = require('../../notification/helper/notification.helper');
const sendEmail = require('../../../library/sendEmail');
const axios = require("axios");
const crypto = require("crypto");


const convertAmountToDecimal = (amount, currencyCode) => {
    // Convert amount from pence/cents to pounds/dollars
    const decimalAmount = Math.floor((amount || 0) * 100) / 100;
    return {
        value: parseFloat(decimalAmount),
        currencyCode: currencyCode
    };
};

module.exports.handleWorldpayWebhook = async (req, res) => {
    try {
        // Get raw body data
        let rawData;
        if (req.rawBody) {
            rawData = req.rawBody;
        } else if (req.body && typeof req.body === 'string') {
            rawData = req.body;
        } else if (req.body && Buffer.isBuffer(req.body)) {
            rawData = req.body;
        } else {
            // Try to get raw data from request stream
            const chunks = [];
            for await (const chunk of req) {
                chunks.push(chunk);
            }
            rawData = Buffer.concat(chunks);
        }

        // Parse the webhook data
        let webhookData;
        try {
            if (Buffer.isBuffer(rawData)) {
                webhookData = JSON.parse(rawData.toString('utf8'));
            } else if (typeof rawData === 'string') {
                webhookData = JSON.parse(rawData);
            } else if (typeof rawData === 'object') {
                webhookData = rawData;
            } else {
                throw new Error('Invalid webhook data format');
            }
        } catch (error) {
            
            return errorResponse(res, {}, 'Invalid webhook data format', 400);
        }

        if (req.method === 'POST') {
            // Extract webhook data according to Worldpay's structure
            const {
                eventId,
                eventTimestamp,
                eventDetails: {
                    classification,
                    downstreamReference,
                    transactionReference,
                    type: eventType,
                    date: eventDate,
                    amount,
                    _links,
                    octReference,
                    refund,
                    failureReason
                } = {}
            } = webhookData || {};


            // Find the order using the transaction reference
            const order = await Order.findOne({
                where: { 
                    order_code: transactionReference
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

            if (!order) {
                
                return errorResponse(res, {}, 'Order not found in database', 404);
            }

            // Handle payment status based on event type
            switch (eventType) {
                case 'sentForSettlement':
                    await handleSentForSettlement(order, webhookData);
                    break;
                case 'cancelled':
                    await handleCancelledPayment(order, webhookData);
                    break;
                case 'expired':
                    await handleExpiredPayment(order, webhookData);
                    break;
                // case 'sentForAuthorization':
                //     await handleSentForAuthorization(order, webhookData);
                //     break;
                
                // case 'authorized':
                //     await handleAuthorizedPayment(order, webhookData);
                //     break;
                // case 'sentForSettlement':
                //     await handleSentForSettlement(order, webhookData);
                //     break;
                case 'error':
                    await handlePaymentError(order, webhookData);
                    break;
                // case 'refused':
                //     await handlePaymentRefused(order, webhookData);
                //     break;
                case 'sentForRefund':
                    await handleSentForRefund(order, webhookData);
                    break;
                // case 'refundFailed':
                //     await handleRefundFailed(order, webhookData);
                //     break;
                default:
                    
            }

            // Log the webhook processing completion
            

            // Return success response
            return res.status(200).json({
                message: 'Webhook received and acknowledged',
                eventId: eventId,
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        
        return errorResponse(res, error, 'Failed to process webhook');
    }
};

const handleCancelledPayment = async (order, webhookData) => {
    try {
        // Convert amount from pence to pounds
        const convertedAmount = convertAmountToDecimal(
            order.total,
            webhookData.eventDetails.amount.currencyCode
        );

        // Update order status to cancelled
        // await order.update({ status: 'cancel' });   //, { transaction }

        // Check for existing order log
        const existingOrderLog = await sequelize.models.OrderLog.findOne({
            where: {
                order_id: order.id,
                user_id: order.user_id,
                status: 'cancel'
            }
        });

        if (existingOrderLog) {
            // Update existing order log
            await existingOrderLog.update({
                status: 'cancel',
                label: 'Payment Cancelled via Worldpay',
                additional_info: JSON.stringify({
                    eventId: webhookData.eventId,
                    eventTimestamp: webhookData.eventTimestamp,
                    eventDate: webhookData.eventDetails.date,
                    transactionId: webhookData.eventDetails.transactionReference,
                    downstreamReference: webhookData.eventDetails.downstreamReference,
                    amount: convertedAmount.value,
                    currency: convertedAmount.currencyCode,
                    type: webhookData.eventDetails.type,
                    classification: webhookData.eventDetails.classification,
                    paymentLink: webhookData.eventDetails._links?.payment?.href
                })
            });

            
        } else {
            // Create new order log
            await sequelize.models.OrderLog.create({
                order_id: order.id,
                user_id: order.user_id,
                status: 'cancel',
                label: 'Payment Cancelled via Worldpay',
                additional_info: JSON.stringify({
                    eventId: webhookData.eventId,
                    eventTimestamp: webhookData.eventTimestamp,
                    eventDate: webhookData.eventDetails.date,
                    transactionId: webhookData.eventDetails.transactionReference,
                    downstreamReference: webhookData.eventDetails.downstreamReference,
                    amount: convertedAmount.value,
                    currency: convertedAmount.currencyCode,
                    type: webhookData.eventDetails.type,
                    classification: webhookData.eventDetails.classification,
                    paymentLink: webhookData.eventDetails._links?.payment?.href
                })
            });

            
        }

        // Check for existing transaction
        const existingTransaction = await sequelize.models.Transaction.findOne({
            where: {
                orderId: order.id,
                userId: order.user_id,
                referenceNumber: webhookData.eventDetails.transactionReference,
                // status: 'CANCELLED'
            }
        });

        if (existingTransaction) {
            // Update existing transaction
            await existingTransaction.update({
                status: 'CANCELLED',
                amount: convertedAmount.value,
                currency: convertedAmount.currencyCode,
                notes: 'Payment cancelled',
                metadata: {
                    eventId: webhookData.eventId,
                    eventTimestamp: webhookData.eventTimestamp,
                    eventDate: webhookData.eventDetails.date,
                    type: webhookData.eventDetails.type,
                    classification: webhookData.eventDetails.classification,
                    paymentLink: webhookData.eventDetails._links?.payment?.href
                }
            });

            
        } else {
            // Create new transaction record
            await sequelize.models.Transaction.create({
                userId: order.user_id,
                orderId: order.id,
                paymentMethod: 'worldpay',
                transactionType: 'PURCHASE',
                amount: convertedAmount.value,
                currency: convertedAmount.currencyCode,
                status: 'CANCELLED',
                referenceNumber: webhookData.eventDetails.transactionReference,
                notes: 'Payment cancelled',
                metadata: {
                    eventId: webhookData.eventId,
                    eventTimestamp: webhookData.eventTimestamp,
                    eventDate: webhookData.eventDetails.date,
                    type: webhookData.eventDetails.type,
                    classification: webhookData.eventDetails.classification,
                    paymentLink: webhookData.eventDetails._links?.payment?.href
                }
            });

            
        }

        // Create cancelled notification
        // await createNotification({
        //     userId: order.user_id,
        //     type: 'payment',
        //     action: 'cancelled',
        //     data: {
        //         amount: convertedAmount.value,
        //         currency: convertedAmount.currencyCode,
        //         orderId: order.id,
        //         orderUniqueId: order.order_unique_id,
        //         orderCode: order.order_code,
        //         reason: 'Cancelled via Worldpay'
        //     },
        //     title: 'Payment Cancelled',
        //     url: '/my-account/orders'
        // });

        // Create admin notification for cancelled payment
        // await createNotification({
        //     type: 'payment',
        //     action: 'cancelled',
        //     data: {
        //         amount: convertedAmount.value,
        //         currency: convertedAmount.currencyCode,
        //         orderId: order.id,
        //         orderUniqueId: order.order_unique_id,
        //         orderCode: order.order_code,
        //         customerEmail: order.user?.email,
        //         reason: 'Payment cancelled via Worldpay'
        //     },
        //     title: 'Payment Cancelled',
        //     url: '/admin/orders',
        //     is_admin: true
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
        //         amount: convertedAmount.value,
        //         currency: convertedAmount.currencyCode,
        //         message: 'Payment has been cancelled',
        //         eventId: webhookData.eventId,
        //         transactionReference: webhookData.eventDetails.transactionReference,
        //         eventDate: webhookData.eventDetails.date,
        //         supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com'
        //     }
        // };

        // await sendEmail(emailData.to, emailData.emailTypes, emailData.context);
        

        
        return webhookData.eventDetails.transactionReference
    } catch (error) {
        
        throw error;
    }
};

const handleExpiredPayment = async (order, webhookData) => {
    try {
        // Convert amount from pence to pounds
        const convertedAmount = convertAmountToDecimal(
            order.total,
            webhookData.eventDetails.amount.currencyCode
        );

        // Update order status to expired
        await order.update({ status: 'fail' });   //, { transaction }

        // Create order log for expired payment
        await sequelize.models.OrderLog.create({
            order_id: order.id,
            user_id: order.user_id,
            status: 'expired',
            label: 'Payment Expired via Worldpay',
            additional_info: JSON.stringify({
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                transactionId: webhookData.eventDetails.transactionReference,
                downstreamReference: webhookData.eventDetails.downstreamReference,
                amount: convertedAmount.value,
                currency: convertedAmount.currencyCode,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links?.payment?.href
            })
        });

        // Check for existing transaction
        const existingTransaction = await sequelize.models.Transaction.findOne({
            where: {
                referenceNumber: webhookData.eventDetails.transactionReference
            }
        });

        if (existingTransaction) {
            // Update existing transaction
            await existingTransaction.update({
                status: 'FAILED',
                amount: convertedAmount.value,
                currency: convertedAmount.currencyCode,
                notes: 'Payment expired',
                metadata: {
                    eventId: webhookData.eventId,
                    eventTimestamp: webhookData.eventTimestamp,
                    eventDate: webhookData.eventDetails.date,
                    type: webhookData.eventDetails.type,
                    classification: webhookData.eventDetails.classification,
                    paymentLink: webhookData.eventDetails._links?.payment?.href
                }
            });

            
        } else {
            // Create new transaction record
            await sequelize.models.Transaction.create({
                userId: order.user_id,
                orderId: order.id,
                paymentMethod: 'worldpay',
                transactionType: 'PURCHASE',
                amount: convertedAmount.value,
                currency: convertedAmount.currencyCode,
                status: 'FAILED',
                referenceNumber: webhookData.eventDetails.transactionReference,
                notes: 'Payment expired',
                metadata: {
                    eventId: webhookData.eventId,
                    eventTimestamp: webhookData.eventTimestamp,
                    eventDate: webhookData.eventDetails.date,
                    type: webhookData.eventDetails.type,
                    classification: webhookData.eventDetails.classification,
                    paymentLink: webhookData.eventDetails._links?.payment?.href
                }
            });

            
        }

        // Create expired notification
        await createNotification({
            userId: order.user_id,
            type: 'payment',
            action: 'expired',
            data: {
                amount: convertedAmount.value,
                currency: convertedAmount.currencyCode,
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                reason: 'Expired via Worldpay'
            },
            title: 'Payment Expired',
            url: '/my-account/orders'
        });

        // Create admin notification for expired payment
        await createNotification({
            type: 'payment',
            action: 'expired',
            data: {
                amount: convertedAmount.value,
                currency: convertedAmount.currencyCode,
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                customerEmail: order.user?.email,
                reason: 'Payment expired via Worldpay'
            },
            title: 'Payment Expired',
            url: '/admin/orders',
            is_admin: true
        });

        // Send expiration email
        const emailData = {
            emailTypes: 'ORDER_EXPIRATION',
            to: order.email,
            context: {
                userName: order.user?.first_name || order.email.split('@')[0],
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                orderDate: order.createdAt.toLocaleDateString(),
                status: 'expired',
                amount: convertedAmount.value,
                currency: convertedAmount.currencyCode,
                message: 'Payment has expired',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference,
                eventDate: webhookData.eventDetails.date,
                supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com'
            }
        };

        // await sendEmail(emailData.to, emailData.emailTypes, emailData.context);
        

        
        return webhookData.eventDetails.transactionReference
    } catch (error) {
        
        throw error;
    }
};

const handleSentForAuthorization = async (order, webhookData) => {
    const transaction = await sequelize.transaction();
    try {
        // Update order status to pending
        await order.update({ status: 'pending' }, { transaction });

        // Check for existing order log
        const existingOrderLog = await sequelize.models.OrderLog.findOne({
            where: {
                order_id: order.id,
                user_id: order.user_id
            }
        });

        if (existingOrderLog) {
            // Update existing order log
            await existingOrderLog.update({
                status: 'pending',
                label: 'Payment Sent for Settlement via Worldpay',
                additional_info: JSON.stringify({
                    eventId: webhookData.eventId,
                    eventTimestamp: webhookData.eventTimestamp,
                    eventDate: webhookData.eventDetails.date,
                    transactionReference: webhookData.eventDetails.transactionReference,
                    downstreamReference: webhookData.eventDetails.downstreamReference,
                    amount: webhookData.eventDetails.amount.value,
                    currency: webhookData.eventDetails.amount.currencyCode,
                    type: webhookData.eventDetails.type,
                    classification: webhookData.eventDetails.classification,
                    paymentLink: webhookData.eventDetails._links.payment.href
                })
            });

            
        } else {
            // Create new order log
            await sequelize.models.OrderLog.create({
                order_id: order.id,
                user_id: order.user_id,
                status: 'pending',
                label: 'Payment Sent for Settlement via Worldpay',
                additional_info: JSON.stringify({
                    eventId: webhookData.eventId,
                    eventTimestamp: webhookData.eventTimestamp,
                    eventDate: webhookData.eventDetails.date,
                    transactionReference: webhookData.eventDetails.transactionReference,
                    downstreamReference: webhookData.eventDetails.downstreamReference,
                    amount: webhookData.eventDetails.amount.value,
                    currency: webhookData.eventDetails.amount.currencyCode,
                    type: webhookData.eventDetails.type,
                    classification: webhookData.eventDetails.classification,
                    paymentLink: webhookData.eventDetails._links.payment.href
                })
            });

            
        }

        // Check for existing transaction
        const existingTransaction = await sequelize.models.Transaction.findOne({
            where: {
                orderId: order.id,
                userId: order.user_id
            }
        });

        if (existingTransaction) {
            // Update existing transaction
            await existingTransaction.update({
                paymentMethod: 'worldpay',
                transactionType: 'PURCHASE',
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                status: 'SETTLING',
                referenceNumber: webhookData.eventDetails.transactionReference,
                notes: 'Payment sent for settlement',
                metadata: {
                    eventId: webhookData.eventId,
                    eventTimestamp: webhookData.eventTimestamp,
                    eventDate: webhookData.eventDetails.date,
                    type: webhookData.eventDetails.type,
                    classification: webhookData.eventDetails.classification,
                    paymentLink: webhookData.eventDetails._links.payment.href
                }
            });

            
        } else {
            // Create new transaction record
            await sequelize.models.Transaction.create({
                userId: order.user_id,
                orderId: order.id,
                paymentMethod: 'worldpay',
                transactionType: 'PURCHASE',
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                status: 'SETTLING',
                referenceNumber: webhookData.eventDetails.transactionReference,
                notes: 'Payment sent for settlement',
                metadata: {
                    eventId: webhookData.eventId,
                    eventTimestamp: webhookData.eventTimestamp,
                    eventDate: webhookData.eventDetails.date,
                    type: webhookData.eventDetails.type,
                    classification: webhookData.eventDetails.classification,
                    paymentLink: webhookData.eventDetails._links.payment.href
                }
            });

            
        }

        // Create settlement notification
        await createNotification({
            userId: order.user_id,
            type: 'payment',
            action: 'authorization_requested',
            data: {
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                orderId: order.id,
                relatedId: order.id,
                message: 'Payment authorization requested from card issuer',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference
            }
        });

        // Send authorization email
        const emailData = {
            emailTypes: 'PAYMENT_AUTHORIZATION',
            to: order.user.email,
            context: {
                userName: order.user.first_name || order.user.email.split('@')[0],
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                orderDate: order.createdAt.toLocaleDateString(),
                status: 'pending',
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                message: 'Payment authorization requested from card issuer',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference,
                eventDate: webhookData.eventDetails.date
            }
        };

        await sendEmail(emailData.to, emailData.emailTypes, emailData.context);

        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        
        throw error;
    }
};

const handleSentForSettlement = async (order, webhookData) => {
    try {
        // Convert amount from pence to pounds
        const convertedAmount = convertAmountToDecimal(
            order.total,
            webhookData.eventDetails.amount.currencyCode
        );

        // Update order status to processing
        // await order.update({ status: 'processing' });
        

        // Create order log for successful payment
        const existingOrderLog = await sequelize.models.OrderLog.findOne({
            where: {
                order_id: order.id,
                user_id: order.user_id,
                status: 'processing'
            }
        });

        if (existingOrderLog) {
            // Update existing order log
            await existingOrderLog.update({
                // status: 'processing',
                // label: 'Payment Successful via Worldpay',
                additional_info: JSON.stringify({
                    eventId: webhookData.eventId,
                    eventTimestamp: webhookData.eventTimestamp,
                    eventDate: webhookData.eventDetails.date,
                    transactionId: webhookData.eventDetails.transactionReference,
                    downstreamReference: webhookData.eventDetails.downstreamReference,
                    amount: convertedAmount.value,
                    currency: convertedAmount.currencyCode,
                    type: webhookData.eventDetails.type,
                    classification: webhookData.eventDetails.classification,
                    paymentLink: webhookData.eventDetails._links?.payment?.href
                })
            });

            
        } else {
            // Create new order log
            await sequelize.models.OrderLog.create({
                order_id: order.id,
                user_id: order.user_id,
                status: 'processing',
                label: 'Payment Successful via Worldpay',
                additional_info: JSON.stringify({
                    eventId: webhookData.eventId,
                    eventTimestamp: webhookData.eventTimestamp,
                    eventDate: webhookData.eventDetails.date,
                    transactionId: webhookData.eventDetails.transactionReference,
                    downstreamReference: webhookData.eventDetails.downstreamReference,
                    amount: convertedAmount.value,
                    currency: convertedAmount.currencyCode,
                    type: webhookData.eventDetails.type,
                    classification: webhookData.eventDetails.classification,
                    paymentLink: webhookData.eventDetails._links?.payment?.href
                })
            });

            
        }

        

        // for (const item of order.orderItems) {
        //     if (item.variant) {
        //         // Update variant stock
        //         await ProductVariant.update(
        //             { stock: sequelize.literal(`stock - ${item.quantity}`) },
        //             { 
        //                 where: { 
        //                     id: item.variant.id,
        //                     stock: { [Op.gte]: item.quantity }
        //                 }
        //             }
        //         );
        //         
        //     } else {
        //         // Update product stock
        //         await Product.update(
        //             { stock_quantity: sequelize.literal(`stock_quantity - ${item.quantity}`) },
        //             { 
        //                 where: { 
        //                     id: item.product_id,
        //                     stock_quantity: { [Op.gte]: item.quantity }
        //                 }
        //             }
        //         );
        //         
        //     }
        // }

        // if (order.coupon_id) {
        //     

        //     try {
        //         // Check if coupon usage already exists for this user and coupon
        //         const existingCouponUsage = await CouponUsage.findOne({
        //             where: {
        //                 user_id: order.user_id,
        //                 coupon_id: order.coupon_id
        //             }
        //         });

        //         if (!existingCouponUsage) {
        //             // Only update usage count and create usage entry if it doesn't exist
        //             await Coupon.update(
        //                 { usage_count: sequelize.literal("usage_count + 1") },
        //                 { where: { id: order.coupon_id } }
        //             );

        //             // Create coupon usage entry
        //             await CouponUsage.create({
        //                 user_id: order.user_id,
        //                 coupon_id: order.coupon_id,
        //                 order_id: order.id,
        //                 used_at: new Date()
        //             });

        //             
        //         } else {
        //             
        //         }
        //     } catch (error) {
        //         
        //         // Don't throw the error, just log it and continue
        //     }
        // }

        // Clear the user's cart
        // await Cart.destroy({ 
        //     where: { user_id: order.user_id }
        // });
        

        // const referral = await Referral.findOne({
        //     where: {
        //         id: order.referral_id,
        //         status: {
        //             [Op.in]: ['pending', 'completed']
        //         }
        //     },
        //     include: [{
        //         model: User,
        //         as: 'referrer',
        //         attributes: ['id', 'referral_points', 'email']
        //     }]
        // });
        
        // if (referral) {
        //     
        // }

        // if (referral && referral.status === 'pending' && referral.referred_user_id === order.user_id) {
        //     // Update referral record
        //     await referral.update({
        //         status: 'completed'
        //     });

        //     // Get the referral method to get discount details
        //     // const referralMethod = await sequelize.models.ReferralMethod.findOne({
        //     //     where: { 
        //     //         primary: true, 
        //     //         status: 'active',
        //     //         refer_type: 'referrer'
        //     //     }
        //     // });
        //     const referralMethod = referral.referrer_data;
        //     const discountText = referralMethod.referral_value_type === 'percentage' 
        //         ? `${referralMethod.referral_value}%` 
        //         : `£${referralMethod.referral_value}`;

        //     // Send email to referrer about their reward
        //     const referrerEmail = referral.referrer.email;
        //     const username = referrerEmail.split('@')[0];

        //     const data = {
        //         emailTypes: 'REFERRER_REWARD',
        //         to: referrerEmail,
        //         context: {
        //             userName: username,
        //             referralLink: `${process.env.FRONTEND_URL}/my-account/referrals`,
        //             token: referral.referral_coupon_code,
        //             referralValue: referralMethod.referral_value,
        //             referralValueType: referralMethod.referral_value_type === 'percentage' ? '%' : '',
        //             emailContent1: "Congratulations! Your referral has made their first purchase.",
        //             emailContent2: `You've earned a ${discountText} discount! Use the coupon code below to claim your reward.`
        //         },
        //         referralMethod: referralMethod,
        //         attachments: ""
        //     };
            
        //     await sendEmail(data.to, data.emailTypes, data.context, data.attachments);

        //     // Create notification for referrer
        //     await createNotification({
        //         userId: referral.referrer_id,
        //         type: 'system',
        //         action: 'alert',
        //         data: {
        //             message: `You have a new referral code ${referral.referral_coupon_code} with ${discountText} discount waiting to be claimed`
        //         },
        //         title: 'Referral',
        //         url: '/my-account/referrals'
        //     });
        //     // Create notification for admin about successful referral purchase
        //     await createNotification({
        //         type: 'system',
        //         action: 'alert',
        //         data: {
        //             message: `Referred user ${order.user.email} has made their first purchase using referral code from ${referral.referrer.email}. Order #${order.order_unique_id}`
        //         },
        //         title: 'Referral Purchase Completed',
        //         url: '/admin/orders',
        //         is_admin: true
        //     });
        // }
        // else if (referral && referral.status === 'completed' && referral.referrer_id === order.user_id) {
        //     // Update referral record
        //     await referral.update({
        //         status: 'applied'
        //     });

        //     // Create notification for admin about referrer using their coupon
        //     await createNotification({
        //         type: 'system',
        //         action: 'alert',
        //         data: {
        //             message: `Referrer ${order.user.email} has used their referral coupon for Order #${order.order_unique_id}`
        //         },
        //         title: 'Referral Coupon Used',
        //         url: '/admin/orders',
        //         is_admin: true
        //     });

        //     // Create notification for the referrer about using their coupon
        //     await createNotification({
        //         userId: order.user_id,
        //         type: 'system',
        //         action: 'alert',
        //         data: {
        //             message: `Your referral coupon has been successfully applied to Order #${order.order_unique_id}`
        //         },
        //         title: 'Referral Coupon Applied',
        //         url: `/order-details/${order.id}`
        //     });
        // }

        // Check for existing transaction
        const existingTransaction = await sequelize.models.Transaction.findOne({
            where: {
                orderId: order.id,
                userId: order.user_id,
                status: 'COMPLETED'
            }
        });

        if (existingTransaction) {
            // Update existing transaction
            await existingTransaction.update({
                paymentMethod: 'worldpay',
                transactionType: 'PURCHASE',
                amount: convertedAmount.value,
                currency: convertedAmount.currencyCode,
                status: 'COMPLETED',
                referenceNumber: webhookData.eventDetails.transactionReference,
                notes: 'Payment completed successfully',
                metadata: {
                    eventId: webhookData.eventId,
                    eventTimestamp: webhookData.eventTimestamp,
                    eventDate: webhookData.eventDetails.date,
                    type: webhookData.eventDetails.type,
                    classification: webhookData.eventDetails.classification,
                    paymentLink: webhookData.eventDetails._links?.payment?.href
                }
            });

            
        } else {
            // Create new transaction record
            await sequelize.models.Transaction.create({
                userId: order.user_id,
                orderId: order.id,
                paymentMethod: 'worldpay',
                transactionType: 'PURCHASE',
                amount: convertedAmount.value,
                currency: convertedAmount.currencyCode,
                status: 'COMPLETED',
                referenceNumber: webhookData.eventDetails.transactionReference,
                notes: 'Payment completed successfully',
                metadata: {
                    eventId: webhookData.eventId,
                    eventTimestamp: webhookData.eventTimestamp,
                    eventDate: webhookData.eventDetails.date,
                    type: webhookData.eventDetails.type,
                    classification: webhookData.eventDetails.classification,
                    paymentLink: webhookData.eventDetails._links?.payment?.href
                }
            });

            
        }

        // Create success notification
        // await createNotification({
        //     userId: order.user_id,
        //     type: 'payment',
        //     action: 'success',
        //     data: {
        //         amount: convertedAmount.value,
        //         currency: convertedAmount.currencyCode,
        //         orderId: order.id,
        //         relatedId: order.id,
        //     },
        //     url: '/my-account/orders'
        // });

        // // Create success notification
        // await createNotification({
        //     userId: order.user_id,
        //     type: 'order',
        //     action: 'created',
        //     data: {
        //         amount: convertedAmount.value,
        //         orderId: order.id,
        //         orderUniqueId: order.order_unique_id,
        //         relatedId: order.id,
        //         reason: `Order created via Worldpay`
        //     },
        //     url: `/order-details/${order.id}`
        // });

        // // Create admin notification for new order
        // await createNotification({
        //     type: 'order',
        //     action: 'created',
        //     data: {
        //         amount: convertedAmount.value,
        //         orderId: order.id,
        //         orderUniqueId: order.order_unique_id,
        //         customerEmail: order.user.email,
        //         relatedId: order.id,
        //         reason: `New order placed via Worldpay`
        //     },
        //     title: 'New Order Placed',
        //     url: '/admin/orders',
        //     is_admin: true
        // });

        // Send success email
        // const emailData = {
        //     emailTypes: 'ORDER_CONFIRMATION',
        //     to: order.user.email,
        //     context: {
        //         userName: order.user.first_name || order.user.email.split('@')[0],
        //         orderId: order.id,
        //         orderUniqueId: order.order_unique_id,
        //         orderCode: order.order_code,
        //         orderDate: order.createdAt.toLocaleDateString(),
        //         status: order.status,
        //         shippingMethod: order.shippingMethod?.shipping_method || '',
        //         shippingCost: order.shipping_cost || 0,
        //         totalAmount: order.total || 0,
        //         discountPrice: order.discount_price || 0,
        //         items: order.orderItems.map(item => ({
        //             name: item.variant ? `${item.product?.name || ''} - ${item.variant?.slug || ''}` : item.product?.name || '',
        //             quantity: item.quantity || 0,
        //             price: item.unit_price || 0,
        //             total: item.total || 0
        //         })),
        //         shippingAddress: order.orderShippingAddress ? {
        //             name: order.orderShippingAddress.name || '',
        //             last_name: order.orderShippingAddress.last_name || '',
        //             street: order.orderShippingAddress.street || '',
        //             town: order.orderShippingAddress.town || '',
        //             region: order.orderShippingAddress.region || '',
        //             post_code: order.orderShippingAddress.post_code || '',
        //             country: order.orderShippingAddress.country || '',
        //             phone: order.orderShippingAddress.phone || ''
        //         } : null,
        //         billingAddress: order.orderBillingAddress ? {
        //             name: order.orderBillingAddress.name || '',
        //             last_name: order.orderBillingAddress.last_name || '',
        //             street: order.orderBillingAddress.street || '',
        //             town: order.orderBillingAddress.town || '',
        //             region: order.orderBillingAddress.region || '',
        //             post_code: order.orderBillingAddress.post_code || '',
        //             country: order.orderBillingAddress.country || '',
        //             phone: order.orderBillingAddress.phone || ''
        //         } : null,
        //         paymentMethod: 'Worldpay',
        //         transactionId: webhookData.eventDetails.transactionReference || '',
        //         amount: convertedAmount.value,
        //         currency: convertedAmount.currencyCode
        //     }
        // };

        // await sendEmail(emailData.to, emailData.emailTypes, emailData.context);
        

        
        return webhookData.eventDetails.transactionReference
    } catch (error) {
        
        throw error;
    }
};

// const handleAuthorizedPayment = async (order, webhookData) => {
//     try {
//         const convertedAmount = convertAmountToDecimal(
//             order.total,
//             webhookData.eventDetails.amount.currencyCode
//         );
//         // Update order status to settling
//         await order.update({ status: 'pending' });

//         // Check for existing order log
//         const existingOrderLog = await sequelize.models.OrderLog.findOne({
//             where: {
//                 order_id: order.id,
//                 user_id: order.user_id
//             }
//         });

//         if (existingOrderLog) {
//             // Update existing order log
//             await existingOrderLog.update({
//                 status: 'pending',
//                 label: 'Payment Sent for Settlement via Worldpay',
//                 additional_info: JSON.stringify({
//                     eventId: webhookData.eventId,
//                     eventTimestamp: webhookData.eventTimestamp,
//                     eventDate: webhookData.eventDetails.date,
//                     transactionReference: webhookData.eventDetails.transactionReference,
//                     downstreamReference: webhookData.eventDetails.downstreamReference,
//                     amount: convertedAmount.value,
//                     currency: convertedAmount.currencyCode,
//                     type: webhookData.eventDetails.type,
//                     classification: webhookData.eventDetails.classification,
//                     paymentLink: webhookData.eventDetails._links.payment.href
//                 })
//             });

//             
//         } else {
//             // Create new order log
//             await sequelize.models.OrderLog.create({
//                 order_id: order.id,
//                 user_id: order.user_id,
//                 status: 'pending',
//                 label: 'Payment Sent for Settlement via Worldpay',
//                 additional_info: JSON.stringify({
//                     eventId: webhookData.eventId,
//                     eventTimestamp: webhookData.eventTimestamp,
//                     eventDate: webhookData.eventDetails.date,
//                     transactionReference: webhookData.eventDetails.transactionReference,
//                     downstreamReference: webhookData.eventDetails.downstreamReference,
//                     amount: convertedAmount.value,
//                     currency: convertedAmount.currencyCode,
//                     type: webhookData.eventDetails.type,
//                     classification: webhookData.eventDetails.classification,
//                     paymentLink: webhookData.eventDetails._links.payment.href
//                 })
//             });

//             
//         }

//         // Check for existing transaction
//         const existingTransaction = await sequelize.models.Transaction.findOne({
//             where: {
//                 orderId: order.id,
//                 userId: order.user_id
//             }
//         });

//         if (existingTransaction) {
//             // Update existing transaction
//             await existingTransaction.update({
//                 paymentMethod: 'worldpay',
//                 transactionType: 'PURCHASE',
//                 amount: convertedAmount.value,
//                 currency: convertedAmount.currencyCode,
//                 status: 'PENDING',
//                 referenceNumber: webhookData.eventDetails.transactionReference,
//                 notes: 'Payment sent for settlement',
//                 metadata: {
//                     eventId: webhookData.eventId,
//                     eventTimestamp: webhookData.eventTimestamp,
//                     eventDate: webhookData.eventDetails.date,
//                     type: webhookData.eventDetails.type,
//                     classification: webhookData.eventDetails.classification,
//                     paymentLink: webhookData.eventDetails._links.payment.href
//                 }
//             });

//             
//         } else {
//             // Create new transaction record
//             await sequelize.models.Transaction.create({
//                 userId: order.user_id,
//                 orderId: order.id,
//                 paymentMethod: 'worldpay',
//                 transactionType: 'PURCHASE',
//                 amount: convertedAmount.value,
//                 currency: convertedAmount.currencyCode,
//                 status: 'PENDING',
//                 referenceNumber: webhookData.eventDetails.transactionReference,
//                 notes: 'Payment sent for settlement',
//                 metadata: {
//                     eventId: webhookData.eventId,
//                     eventTimestamp: webhookData.eventTimestamp,
//                     eventDate: webhookData.eventDetails.date,
//                     type: webhookData.eventDetails.type,
//                     classification: webhookData.eventDetails.classification,
//                     paymentLink: webhookData.eventDetails._links.payment.href
//                 }
//             });

//             
//         }

//         // Create settlement notification
//         await createNotification({
//             userId: order.user_id,
//             type: 'payment',
//             action: 'settlement_initiated',
//             data: {
//                 amount: convertedAmount.value,
//                 currency: convertedAmount.currencyCode,
//                 orderId: order.id,
//                 relatedId: order.id,
//                 message: 'Payment sent for settlement',
//                 eventId: webhookData.eventId,
//                 transactionReference: webhookData.eventDetails.transactionReference
//             }
//         });

//     } catch (error) {
//         throw error;
//     }
// };

const handlePaymentError = async (order, webhookData) => {
    try {
        // Convert amount from pence to pounds
        const convertedAmount = convertAmountToDecimal(
            order.total,
            webhookData.eventDetails.amount.currencyCode
        );

        // Update order status to failed
        await order.update({ status: 'fail' });   //, { transaction }

        // Create order log for failed payment
        await sequelize.models.OrderLog.create({
            order_id: order.id,
            user_id: order.user_id,
            status: 'fail',
            label: 'Payment Failed via Worldpay',
            additional_info: JSON.stringify({
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                transactionId: webhookData.eventDetails.transactionReference,
                downstreamReference: webhookData.eventDetails.downstreamReference,
                amount: convertedAmount.value,
                currency: convertedAmount.currencyCode,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links?.payment?.href
            })
        });

        // Check for existing transaction
        const existingTransaction = await sequelize.models.Transaction.findOne({
            where: {
                referenceNumber: webhookData.eventDetails.transactionReference
            }
        });

        if (existingTransaction) {
            // Update existing transaction
            await existingTransaction.update({
                status: 'FAILED',
                amount: convertedAmount.value,
                currency: convertedAmount.currencyCode,
                notes: 'Payment failed',
                metadata: {
                    eventId: webhookData.eventId,
                    eventTimestamp: webhookData.eventTimestamp,
                    eventDate: webhookData.eventDetails.date,
                    type: webhookData.eventDetails.type,
                    classification: webhookData.eventDetails.classification,
                    paymentLink: webhookData.eventDetails._links?.payment?.href
                }
            });

            
        } else {
            // Create new transaction record
            await sequelize.models.Transaction.create({
                userId: order.user_id,
                orderId: order.id,
                paymentMethod: 'worldpay',
                transactionType: 'PURCHASE',
                amount: convertedAmount.value,
                currency: convertedAmount.currencyCode,
                status: 'FAILED',
                referenceNumber: webhookData.eventDetails.transactionReference,
                notes: 'Payment failed',
                metadata: {
                    eventId: webhookData.eventId,
                    eventTimestamp: webhookData.eventTimestamp,
                    eventDate: webhookData.eventDetails.date,
                    type: webhookData.eventDetails.type,
                    classification: webhookData.eventDetails.classification,
                    paymentLink: webhookData.eventDetails._links?.payment?.href
                }
            });

            
        }

        // Create failed notification
        await createNotification({
            userId: order.user_id,
            type: 'payment',
            action: 'failed',
            data: {
                amount: convertedAmount.value,
                currency: convertedAmount.currencyCode,
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                reason: 'Failed via Worldpay'
            },
            title: 'Payment Failed',
            url: '/my-account/orders'
        });

        // Create admin notification for failed payment
        await createNotification({
            type: 'payment',
            action: 'failed',
            data: {
                amount: convertedAmount.value,
                currency: convertedAmount.currencyCode,
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                customerEmail: order.user?.email,
                reason: 'Payment failed via Worldpay'
            },
            title: 'Payment Failed',
            url: '/admin/orders',
            is_admin: true
        });

        // Send failure email
        const emailData = {
            emailTypes: 'ORDER_CANCELLATION',
            to: order.user.email,
            context: {
                userName: order.user?.first_name || order.email?.split('@')[0] || 'Customer',
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                orderDate: order.createdAt ? order.createdAt.toLocaleDateString() : new Date().toLocaleDateString(),
                status: 'cancelled',
                message: 'Payment error occurred. Please try again.',
                reason: 'Payment error occurred via Worldpay',
                eventId: webhookData.eventId || 'N/A',
                transactionReference: webhookData.eventDetails?.transactionReference || 'N/A',
                eventDate: webhookData.eventDetails?.date || new Date().toISOString(),
                retryPaymentLink: `${process.env.FRONTEND_URL || 'https://vapehub.com'}/payment/retry/${order.order_code}`
            }
        };

        try {
            

        await sendEmail(emailData.to, emailData.emailTypes, emailData.context);
            
            
            
        } catch (emailError) {
            
        }

        
        return webhookData.eventDetails.transactionReference
    } catch (error) {
        
        throw error;
    }
};

const handlePaymentRefused = async (order, webhookData) => {
    const transaction = await sequelize.transaction();
    try {
        // Update order status to refused
        await order.update({ status: 'refused' }, { transaction });

        // Create order log for payment refusal
        await sequelize.models.OrderLog.create({
            order_id: order.id,
            user_id: order.user_id,
            status: 'refused',
            label: 'Payment Refused via Worldpay',
            additional_info: JSON.stringify({
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                transactionReference: webhookData.eventDetails.transactionReference,
                downstreamReference: webhookData.eventDetails.downstreamReference,
                octReference: webhookData.eventDetails.octReference,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links.payment.href
            })
        }, { transaction });

        // Create refused transaction record
        await sequelize.models.Transaction.create({
            userId: order.user_id,
            orderId: order.id,
            paymentMethod: 'worldpay',
            transactionType: 'PURCHASE',
            status: 'REFUSED',
            referenceNumber: webhookData.eventDetails.transactionReference,
            notes: 'Payment refused by third party',
            metadata: {
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                octReference: webhookData.eventDetails.octReference,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links.payment.href
            }
        }, { transaction });

        // Create refusal notification
        await createNotification({
            userId: order.user_id,
            type: 'payment',
            action: 'refused',
            data: {
                orderId: order.id,
                relatedId: order.id,
                message: 'Payment was refused by the payment provider',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference,
                octReference: webhookData.eventDetails.octReference
            }
        });

        // Send refusal email
        const emailData = {
            emailTypes: 'PAYMENT_REFUSED',
            to: order.user.email,
            context: {
                userName: order.user.first_name || order.user.email.split('@')[0],
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                orderDate: order.createdAt.toLocaleDateString(),
                status: 'refused',
                message: 'Payment was refused by the payment provider',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference,
                octReference: webhookData.eventDetails.octReference,
                eventDate: webhookData.eventDetails.date,
                retryPaymentLink: `${process.env.FRONTEND_URL}/payment/retry/${order.order_code}`,
                supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com'
            }
        };

        await sendEmail(emailData.to, emailData.emailTypes, emailData.context);

        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

const handleSentForRefund = async (order, webhookData) => {
    try {
        // Convert amount from pence to pounds
        const convertedAmount = convertAmountToDecimal(
            webhookData.eventDetails.amount.value,
            webhookData.eventDetails.amount.currencyCode
        );

        // Update order status to refunded
        await order.update({ status: 'refunded' });

        // Create order log for refund processing
        await sequelize.models.OrderLog.create({
            order_id: order.id,
            user_id: order.user_id,
            status: 'refunded',
            label: 'Refund Processed via Worldpay',
            additional_info: JSON.stringify({
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                transactionReference: webhookData.eventDetails.transactionReference,
                downstreamReference: webhookData.eventDetails.downstreamReference,
                octReference: webhookData.eventDetails.octReference,
                refundAuthorization: webhookData.eventDetails.refund.onlineRefundAuthorization,
                amount: convertedAmount.value,
                currency: convertedAmount.currencyCode,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links?.payment?.href
            })
        });

        // Restore stock for refunded items
        for (const item of order.orderItems) {
            if (item.variant) {
                const variant = await ProductVariant.findByPk(item.variant.id);
                if (!variant) continue;

                const newStock = variant.stock + item.quantity;
                const updateData = { stock: newStock };

                if (newStock <= 0) {
                    updateData.stock_status = 'out_of_stock';
                }

                await ProductVariant.update(
                    updateData,
                    {
                        where: {
                            id: item.variant.id
                        }
                    }
                );
                
            } else {
                // Restore product stock
                await Product.update(
                    { stock_quantity: sequelize.literal(`stock_quantity + ${item.quantity}`) },
                    { 
                        where: { 
                            id: item.product_id
                        }
                    }
                );
                
            }
        }

        // Handle coupon usage reversal if applicable
        if (order.coupon_id) {
            try {
                // Check if coupon usage exists for this order
                const existingCouponUsage = await CouponUsage.findOne({
                    where: {
                        user_id: order.user_id,
                        coupon_id: order.coupon_id,
                        order_id: order.id
                    }
                });

                if (existingCouponUsage) {
                    // Decrease coupon usage count
                    await Coupon.update(
                        { usage_count: sequelize.literal("usage_count - 1") }, 
                        { where: { id: order.coupon_id } }
                    );
                    
                    // Remove coupon usage entry
                    await CouponUsage.destroy({
                        where: {
                            user_id: order.user_id,
                            coupon_id: order.coupon_id,
                            order_id: order.id
                        }
                    });

                    
                }
            } catch (error) {
                
                // Don't throw the error, just log it and continue
            }
        }

        // Create refund transaction record
        await sequelize.models.Transaction.create({
            userId: order.user_id,
            orderId: order.id,
            paymentMethod: 'worldpay',
            transactionType: 'REFUND',
            amount: convertedAmount.value,
            currency: convertedAmount.currencyCode,
            status: 'REFUNDED',
            referenceNumber: `${webhookData.eventDetails.transactionReference}_REFUND_${webhookData.eventDetails.octReference || Date.now()}`,
            notes: 'Refund processed successfully',
            metadata: {
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                octReference: webhookData.eventDetails.octReference,
                refundAuthorization: webhookData.eventDetails.refund.onlineRefundAuthorization,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                paymentLink: webhookData.eventDetails._links?.payment?.href
            }
        });

        // Create refund notification for customer
        await createNotification({
            userId: order.user_id,
            type: 'payment',
            action: 'refunded',
            data: {
                amount: convertedAmount.value,
                currency: convertedAmount.currencyCode,
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                reason: 'Refund has been processed successfully',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference,
                refundAuthorization: webhookData.eventDetails.refund.onlineRefundAuthorization
            },
            title: 'Payment Refunded',
            url: '/my-account/orders'
        });

        // Create admin notification for refund
        await createNotification({
            type: 'payment',
            action: 'refunded',
            data: {
                amount: convertedAmount.value,
                currency: convertedAmount.currencyCode,
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                customerEmail: order.user?.email,
                reason: 'Refund has been processed successfully',
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference,
                refundAuthorization: webhookData.eventDetails.refund.onlineRefundAuthorization
            },
            title: 'Payment Refunded',
            url: '/admin/orders',
            is_admin: true
        });

        // Send refund confirmation email
        const emailData = {
            emailTypes: 'REFUND_CONFIRMATION',
            to: order.user.email,
            context: {
                userName: order.user.first_name || order.user.email.split('@')[0],
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                orderDate: order.createdAt ? order.createdAt.toLocaleDateString() : new Date().toLocaleDateString(),
                status: 'refunded',
                refundAmount: convertedAmount.value || 0,
                refundCurrency: convertedAmount.currencyCode || 'GBP',
                transactionId: webhookData.eventDetails?.transactionReference || 'N/A',
                refundAuthorization: webhookData.eventDetails?.refund?.onlineRefundAuthorization || 'N/A',
                octReference: webhookData.eventDetails?.octReference || 'N/A',
                reason: 'Refund processed successfully via Worldpay',
                currentDate: new Date().toLocaleDateString()
            }
        };

        try {
            

        await sendEmail(emailData.to, emailData.emailTypes, emailData.context);
            
            
            
        } catch (emailError) {
            
        }

        

        return webhookData.eventDetails.transactionReference;

    } catch (error) {
        
        throw error;
    }
};

const handleRefundFailed = async (order, webhookData) => {
    try {
        // Update order status to refund_failed
        await order.update({ status: 'refund_failed' });

        // Create order log for refund failure
        await sequelize.models.OrderLog.create({
            order_id: order.id,
            user_id: order.user_id,
            status: 'refund_failed',
            label: 'Refund Failed via Worldpay',
            additional_info: JSON.stringify({
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                transactionReference: webhookData.eventDetails.transactionReference,
                downstreamReference: webhookData.eventDetails.downstreamReference,
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification,
                refusalCode: webhookData.eventDetails.refund.refusal.code,
                refusalDescription: webhookData.eventDetails.refund.refusal.description
            })
        });

        // Create refund failed transaction record
        await sequelize.models.Transaction.create({
            userId: order.user_id,
            orderId: order.id,
            paymentMethod: 'worldpay',
            transactionType: 'REFUND',
            amount: webhookData.eventDetails.amount.value,
            currency: webhookData.eventDetails.amount.currencyCode,
            status: 'REFUND_FAILED',
            referenceNumber: webhookData.eventDetails.transactionReference,
            notes: `Refund failed: ${webhookData.eventDetails.refund.refusal.description}`,
            metadata: {
                eventId: webhookData.eventId,
                eventTimestamp: webhookData.eventTimestamp,
                eventDate: webhookData.eventDetails.date,
                refusalCode: webhookData.eventDetails.refund.refusal.code,
                refusalDescription: webhookData.eventDetails.refund.refusal.description,
                type: webhookData.eventDetails.type,
                classification: webhookData.eventDetails.classification
            }
        });

        // Create refund failed notification
        await createNotification({
            userId: order.user_id,
            type: 'payment',
            action: 'refund_failed',
            data: {
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                orderId: order.id,
                relatedId: order.id,
                message: `Refund failed: ${webhookData.eventDetails.refund.refusal.description}`,
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference,
                refusalCode: webhookData.eventDetails.refund.refusal.code
            }
        });

        // Send refund failed email
        const emailData = {
            emailTypes: 'REFUND_FAILED',
            to: order.user.email,
            context: {
                userName: order.user.first_name || order.user.email.split('@')[0],
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                orderDate: order.createdAt.toLocaleDateString(),
                status: 'refund_failed',
                amount: webhookData.eventDetails.amount.value,
                currency: webhookData.eventDetails.amount.currencyCode,
                message: `Refund failed: ${webhookData.eventDetails.refund.refusal.description}`,
                eventId: webhookData.eventId,
                transactionReference: webhookData.eventDetails.transactionReference,
                refusalCode: webhookData.eventDetails.refund.refusal.code,
                refusalDescription: webhookData.eventDetails.refund.refusal.description,
                eventDate: webhookData.eventDetails.date,
                supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com'
            }
        };

        await sendEmail(emailData.to, emailData.emailTypes, emailData.context);

        await transaction.commit();
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

module.exports.handleWorldpayPaymentSuccess = async (req, res) => {
    try {
        // Log function entry with request details
        
        
        
        
        const { orderCode, currency, amount } = req.body;
        const order = await Order.findOne({
            where: { 
                order_code: orderCode
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

        if (!order) {
            return errorResponse(res, {}, 'Order not found in database', 404);
        }

        // Update order status to processing and set ordered to true
        await order.update({ 
            status: 'processing',
            ordered: true
        });

        // Create order log for successful payment
        const existingOrderLog = await sequelize.models.OrderLog.findOne({
            where: {
                order_id: order.id,
                user_id: order.user_id,
                status: 'processing'
            }
        });

        if (existingOrderLog) {
            // Update existing order log
            await existingOrderLog.update({
                status: 'processing',
                label: 'Payment Successful via Worldpay',
                // additional_info: JSON.stringify({
                //     eventId: webhookData.eventId,
                //     eventTimestamp: webhookData.eventTimestamp,
                //     eventDate: webhookData.eventDetails.date,
                //     transactionId: webhookData.eventDetails.transactionReference,
                //     downstreamReference: webhookData.eventDetails.downstreamReference,
                //     amount: convertedAmount.value,
                //     currency: convertedAmount.currencyCode,
                //     type: webhookData.eventDetails.type,
                //     classification: webhookData.eventDetails.classification,
                //     paymentLink: webhookData.eventDetails._links?.payment?.href
                // })
            });
        } else {
            // Create new order log
            await sequelize.models.OrderLog.create({
                order_id: order.id,
                user_id: order.user_id,
                status: 'processing',
                label: 'Payment Successful via Worldpay',
                // additional_info: JSON.stringify({
                //     eventId: webhookData.eventId,
                //     eventTimestamp: webhookData.eventTimestamp,
                //     eventDate: webhookData.eventDetails.date,
                //     transactionId: webhookData.eventDetails.transactionReference,
                //     downstreamReference: webhookData.eventDetails.downstreamReference,
                //     amount: convertedAmount.value,
                //     currency: convertedAmount.currencyCode,
                //     type: webhookData.eventDetails.type,
                //     classification: webhookData.eventDetails.classification,
                //     paymentLink: webhookData.eventDetails._links?.payment?.href
                // })
            });

        }

        for (const item of order.orderItems) {
            if (item.variant) {
                const variant = await ProductVariant.findByPk(item.variant.id);
                if (!variant) continue;

                const newStock = variant.stock - item.quantity;
                const updateData = { stock: newStock };

                if (newStock <= 0) {
                    updateData.stock_status = 'out_of_stock';
                }

                await ProductVariant.update(
                    updateData,
                    {
                        where: {
                            id: item.variant.id,
                            stock: { [Op.gte]: item.quantity }
                        }
                    }
                );
            } else {
                // Update product stock
                await Product.update(
                    { stock_quantity: sequelize.literal(`stock_quantity - ${item.quantity}`) },
                    { 
                        where: { 
                            id: item.product_id,
                            stock_quantity: { [Op.gte]: item.quantity }
                        }
                    }
                );
            }
        }

        if (order.coupon_id) {
            try {
                // Check if coupon usage already exists for this user and coupon
                const existingCouponUsage = await CouponUsage.findOne({
                    where: {
                        user_id: order.user_id,
                        coupon_id: order.coupon_id
                    }
                });

                if (!existingCouponUsage) {
                    // Only update usage count and create usage entry if it doesn't exist
                    await Coupon.update(
                        { usage_count: sequelize.literal("usage_count + 1") },
                        { where: { id: order.coupon_id } }
                    );

                    // Create coupon usage entry
                    await CouponUsage.create({
                        user_id: order.user_id,
                        coupon_id: order.coupon_id,
                        order_id: order.id,
                        used_at: new Date()
                    });
                } else {
                    
                }
            } catch (error) {
                
                
                
                // Don't throw the error, just log it and continue
            }
        }
        
        if(order.loyalty_flag){
            const settings = await LoyaltyPointsSettings.findOne({
                where: { status: true }
            });
    
            if(settings){
                const user = await User.findOne({
                    where: { id: order.user_id }
                });
                if(parseFloat(user.loyalty_points) >= parseFloat(settings.minimum_points_redemption)){  // && total >= settings.minimum_purchase_amount
                    const redeemedPoints = user.loyalty_points;
                    await user.update({
                        loyalty_points: sequelize.literal(`loyalty_points - ${settings.minimum_points_redemption}`)
                    });
                    // Add loyalty points redemption history
                    await LoyaltyPointsHistory.create({
                        user_id: user.id,
                        type: 'redeemed',
                        points: Math.abs(redeemedPoints),
                        order_id: order.id || null,
                        description: 'Points redeemed',
                        timestamp: new Date()
                    });
                }
                await user.update({
                    loyalty_points: sequelize.literal(`loyalty_points + ${settings.points_value}`)
                });
            }
        }
        if(!order.loyalty_flag){

            const loyaltySettings = await LoyaltyPointsSettings.findOne({
                where: { status: true }
            });
            if(loyaltySettings){
                // Check if order subtotal is above minimum amount for loyalty points
                const orderSubtotal = order.total;  //order.sub_total || 
                const minAmountForLoyaltyPoints = loyaltySettings.min_amount_for_loyalty_points || 0;
                
                if (parseFloat(orderSubtotal) >= parseFloat(minAmountForLoyaltyPoints)) {
                    let pointsToAdd;
                    if (loyaltySettings.amount_divisor && parseFloat(loyaltySettings.amount_divisor) > 0) {
                        pointsToAdd = Math.floor(parseFloat(orderSubtotal) / parseFloat(loyaltySettings.amount_divisor));
                    } else {
                        pointsToAdd = parseFloat(loyaltySettings.points_value);
                    }
                    if (pointsToAdd > 0) {
                        await User.update({
                            loyalty_points: sequelize.literal(`loyalty_points + ${pointsToAdd}`)
                        }, {
                            where: {
                                id: order.user_id
                            }
                        });
                    }
                }
            }
        }
        // Handle mail subscription discount
        const mailSubscription = await MailSubscription.findOne({
            where: { 
                email: order.user.email,
                isDiscountUsed: false,
                subscribed: true
            }
        });

        if (mailSubscription) {
            const mailSettings = await MailSubscriptionSettings.findOne({
                where: { status: true }
            });

            if (mailSettings) {
                // Calculate the discount amount
                let discount = 0;
                if (mailSettings.discount_type === 'percentage') {
                    discount = (order.sub_total * parseFloat(mailSettings.discount_amount)) / 100;
                } else if (mailSettings.discount_type === 'fixed') {
                    discount = parseFloat(mailSettings.discount_amount);
                }
                // Ensure discount does not exceed order sub_total
                discount = Math.min(discount, order.sub_total);
                order.mailSubscription_discount = discount;
                await order.save();

                // Mark discount as used
                await mailSubscription.update({
                    isDiscountUsed: true
                });

                // Create notification for user about applied discount
                await createNotification({
                    userId: order.user_id,
                    type: 'system',
                    action: 'alert',
                    data: {
                        message: `Mail subscription discount of ${mailSettings.discount_type === 'percentage' ? mailSettings.discount_amount + '%' : '£' + mailSettings.discount_amount} applied to your first order!`
                    },
                    title: 'Mail Subscription Discount Applied',
                    url: `/order-details/${order.id}`
                });

                // Create admin notification about applied discount
                await createNotification({
                    type: 'system',
                    action: 'alert',
                    data: {
                        message: `Mail subscription discount applied to order #${order.order_unique_id} for user ${order.user.email}`
                    },
                    title: 'Mail Subscription Discount Applied',
                    url: '/admin/orders',
                    is_admin: true
                });
            }
        }
        
        // Clear the user's cart (hard delete to avoid unique constraint issues)
        await Cart.destroy({ 
            where: { user_id: order.user_id },
            force: true  // Hard delete to completely remove records
        });

        const referral = await Referral.findOne({
            where: {
                id: order.referral_id,
                status: {
                    [Op.in]: ['pending', 'completed']
                }
            },
            include: [{
                model: User,
                as: 'referrer',
                attributes: ['id', 'referral_points', 'email']
            }]
        });
        
        const ReferralUser = await Referral.findOne({
            where: {referred_user_id: order.user_id},
            include: [{
                model: User,
                as: 'referrer',
                attributes: ['id', 'referral_points', 'email']
            }]
        });
        const inactiveReferralMethod = await ReferralMethod.findOne({
            where: { 
                status: 'active',
                // primary: true,  //primary true and refer_type = 'referral' means it is referred person    //previous is false  
                refer_type: 'referral'  //new
            },
            attributes: ['id', 'referral_value_type', 'referral_value', 'minimum_purchase', 'maximum_purchase', 'refer_type']
        });
        
        if(!inactiveReferralMethod && ReferralUser && ReferralUser.status === 'pending' && ReferralUser.referred_user_id === order.user_id){
            if (order.referral_id) {
                await ReferralUser.update({
                    status: 'completed'
                });
                const referrerUserMethod = ReferralUser.referrer_data;
                const discountText = referrerUserMethod.referral_value_type === 'percentage' 
                    ? `${referrerUserMethod.referral_value}%` 
                    : `£${referrerUserMethod.referral_value}`;

                // Send email to referrer about their reward
                const referrerEmail = ReferralUser.referrer.email;
                const username = referrerEmail.split('@')[0];

                const data = {
                emailTypes: 'REFERRER_REWARD',
                to: referrerEmail,
                context: {
                    userName: username,
                    referralLink: `${process.env.FRONTEND_URL}/my-account/referrals`,
                    token: ReferralUser.referral_coupon_code,
                    referralValue: referrerUserMethod.referral_value,
                    referralValueType: referrerUserMethod.referral_value_type === 'percentage' ? '%' : '',
                    emailContent1: "Congratulations! Your referral has made their first purchase.",
                    emailContent2: `You've earned a ${discountText} discount! Use the coupon code below to claim your reward.`
                },
                referralMethod: referrerUserMethod,
                attachments: ""
                };
            
                await sendEmail(data.to, data.emailTypes, data.context, data.attachments);
                // Create notification for referrer
                await createNotification({
                    userId: ReferralUser.referrer_id,
                    type: 'system',
                    action: 'alert',
                    data: {
                        message: `You have a new referral code ${ReferralUser.referral_coupon_code} with ${discountText} discount waiting to be claimed`
                    },
                    title: 'Referral',
                    url: '/my-account/referrals'
                });
                // Create notification for admin about successful referral purchase
                await createNotification({
                    type: 'system',
                    action: 'alert',
                    data: {
                        message: `Referred user ${order.user.email} has made their first purchase using referral code from ${ReferralUser.referrer.email}. Order #${order.order_unique_id}`
                    },
                    title: 'Referral Purchase Completed',
                    url: '/admin/orders',
                    is_admin: true
                });
            }
        }
        else if (referral && referral.status === 'pending' && referral.referred_user_id === order.user_id) {
            // Update referral record
            await referral.update({
                status: 'completed'
            });

            // Get the referral method to get discount details
            // const referralMethod = await sequelize.models.ReferralMethod.findOne({
            //     where: { 
            //         primary: true, 
            //         status: 'active',
            //         refer_type: 'referrer'
            //     }
            // });
            const referralMethod = referral.referrer_data;
            const discountText = referralMethod.referral_value_type === 'percentage' 
                ? `${referralMethod.referral_value}%` 
                : `£${referralMethod.referral_value}`;

            // Send email to referrer about their reward
            const referrerEmail = referral.referrer.email;
            const username = referrerEmail.split('@')[0];

            const data = {
                emailTypes: 'REFERRER_REWARD',
                to: referrerEmail,
                context: {
                    userName: username,
                    referralLink: `${process.env.FRONTEND_URL}/my-account/referrals`,
                    token: referral.referral_coupon_code,
                    referralValue: referralMethod.referral_value,
                    referralValueType: referralMethod.referral_value_type === 'percentage' ? '%' : '',
                    emailContent1: "Congratulations! Your referral has made their first purchase.",
                    emailContent2: `You've earned a ${discountText} discount! Use the coupon code below to claim your reward.`
                },
                referralMethod: referralMethod,
                attachments: ""
            };
            
            await sendEmail(data.to, data.emailTypes, data.context, data.attachments);

            // Create notification for referrer
            await createNotification({
                userId: referral.referrer_id,
                type: 'system',
                action: 'alert',
                data: {
                    message: `You have a new referral code ${referral.referral_coupon_code} with ${discountText} discount waiting to be claimed`
                },
                title: 'Referral',
                url: '/my-account/referrals'
            });
            // Create notification for admin about successful referral purchase
            await createNotification({
                type: 'system',
                action: 'alert',
                data: {
                    message: `Referred user ${order.user.email} has made their first purchase using referral code from ${referral.referrer.email}. Order #${order.order_unique_id}`
                },
                title: 'Referral Purchase Completed',
                url: '/admin/orders',
                is_admin: true
            });
        }
        else if (referral && referral.status === 'completed' && referral.referrer_id === order.user_id) {
            // Update referral record
            await referral.update({
                status: 'applied'
            });

            // Create notification for admin about referrer using their coupon
            await createNotification({
                type: 'system',
                action: 'alert',
                data: {
                    message: `Referrer ${order.user.email} has used their referral coupon for Order #${order.order_unique_id}`
                },
                title: 'Referral Coupon Used',
                url: '/admin/orders',
                is_admin: true
            });

            // Create notification for the referrer about using their coupon
            await createNotification({
                userId: order.user_id,
                type: 'system',
                action: 'alert',
                data: {
                    message: `Your referral coupon has been successfully applied to Order #${order.order_unique_id}`
                },
                title: 'Referral Coupon Applied',
                url: `/order-details/${order.id}`
            });
        }

        // Check for existing transaction
        const existingTransaction = await sequelize.models.Transaction.findOne({
            where: {
                orderId: order.id,
                userId: order.user_id,
                status: 'COMPLETED'
            }
        });

        if (existingTransaction) {
            // Update existing transaction
            await existingTransaction.update({
                paymentMethod: 'worldpay',
                transactionType: 'PURCHASE',
                amount: amount,
                currency: currency,
                status: 'COMPLETED',
                referenceNumber: orderCode,
                notes: 'Payment completed successfully',
                // metadata: {
                //     eventId: webhookData.eventId,
                //     eventTimestamp: webhookData.eventTimestamp,
                //     eventDate: webhookData.eventDetails.date,
                //     type: webhookData.eventDetails.type,
                //     classification: webhookData.eventDetails.classification,
                //     paymentLink: webhookData.eventDetails._links?.payment?.href
                // }
            });
        } else {
            // Create new transaction record
            await sequelize.models.Transaction.create({
                userId: order.user_id,
                orderId: order.id,
                paymentMethod: 'worldpay',
                transactionType: 'PURCHASE',
                amount: amount,
                currency: currency,
                status: 'COMPLETED',
                referenceNumber: orderCode,
                notes: 'Payment completed successfully',
                // metadata: {
                //     eventId: webhookData.eventId,
                //     eventTimestamp: webhookData.eventTimestamp,
                //     eventDate: webhookData.eventDetails.date,
                //     type: webhookData.eventDetails.type,
                //     classification: webhookData.eventDetails.classification,
                //     paymentLink: webhookData.eventDetails._links?.payment?.href
                // }
            });
        }

        // Create success notification
        await createNotification({
            userId: order.user_id,
            type: 'payment',
            action: 'success',
            data: {
                amount: amount,
                currency: currency,
                orderId: order.id,
                relatedId: order.id,
            },
            url: '/my-account/orders'
        });

        // Create success notification
        await createNotification({
            userId: order.user_id,
            type: 'order',
            action: 'created',
            data: {
                amount: amount,
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                relatedId: order.id,
                reason: `Order created via Worldpay`
            },
            url: `/order-details/${order.id}`
        });

        // Create admin notification for new order
        await createNotification({
            type: 'order',
            action: 'created',
            data: {
                amount: amount,
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                customerEmail: order.user.email,
                relatedId: order.id,
                reason: `New order placed via Worldpay`
            },
            title: 'New Order Placed',
            url: '/admin/orders',
            is_admin: true
        });

        // Send success email
        
        
        
        
        const emailData = {
            emailTypes: 'ORDER_CONFIRMATION',
            to: order.user.email,
            context: {
                userName: order.user.first_name || order.user.email.split('@')[0],
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                orderDate: order.createdAt ? order.createdAt.toLocaleDateString() : new Date().toLocaleDateString(),
                status: order.status,
                shippingMethod: order.shippingMethod ? order.shippingMethod.shipping_method : 'Standard Shipping',
                shippingCost: order.shipping_cost || 0,
                totalAmount: order.total || 0,
                discountPrice: order.discount_price || 0,
                loyaltyDiscount: order.loyalty_discount || 0,
                items: order.orderItems ? order.orderItems.map(item => ({
                    name: item.variant ? `${item.product?.name || 'Product'} - ${item.variant?.slug || 'Variant'}` : (item.product?.name || 'Product'),
                    quantity: item.quantity || 0,
                    price: item.unit_price || 0,
                    total: item.total || 0
                })) : [],
                shippingAddress: order.orderShippingAddress ? {
                    name: order.orderShippingAddress.name || '',
                    last_name: order.orderShippingAddress.last_name || '',
                    street: order.orderShippingAddress.street || '',
                    town: order.orderShippingAddress.town || '',
                    region: order.orderShippingAddress.region || '',
                    post_code: order.orderShippingAddress.post_code || '',
                    country: order.orderShippingAddress.country || '',
                    phone: order.orderShippingAddress.phone || ''
                } : {},
                billingAddress: order.orderBillingAddress ? {
                    name: order.orderBillingAddress.name || '',
                    last_name: order.orderBillingAddress.last_name || '',
                    street: order.orderBillingAddress.street || '',
                    town: order.orderBillingAddress.town || '',
                    region: order.orderBillingAddress.region || '',
                    post_code: order.orderBillingAddress.post_code || '',
                    country: order.orderBillingAddress.country || '',
                    phone: order.orderBillingAddress.phone || ''
                } : {},
                paymentMethod: 'Worldpay',
                transactionId: orderCode || 'N/A',
                amount: amount || 0,
                currency: currency || 'GBP',
                ...(order.mailSubscription_discount > 0 && { mailSubscriptionDiscount: order.mailSubscription_discount })
            }
        };

        
        
        

        try {
            
            
            
            
            // Log email environment configuration for WorldPay
            
            
            

            // Log email attempt
            
            
            

            
            
            
            
            const emailResult = await sendEmail(emailData.to, emailData.emailTypes, emailData.context, []);
            
            
            
            
            
            // Log successful email sending
            
            
            
            
        } catch (emailError) {
            
            
            
            
            // Log email failure
            
            
            
            
            // Log the error but don't fail the payment
            // The order processing should continue even if email fails
        }

        return successResponse(res, {
            message: "payment successfull",
            data: {
                order_code: order.order_code,
                payment_method: 'Worldpay',
                order_details: {
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    order_code: order.order_code,
                    status: order.status,
                    amount: amount,
                }}}, "Success");
    } catch (error) {
        // Log the error with comprehensive details
        
        
        
        
        return errorResponse(res, error, error.message);
    }
};

module.exports.handleWorldpayPaymentCancel = async (req, res) => {
    try {
        const { orderCode, currency, amount } = req.body;
        const order = await Order.findOne({
            where: { 
                order_code: orderCode
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

        if (!order) {
            return errorResponse(res, {}, 'Order not found in database', 404);
        }

        // Update order status to cancelled
        await order.update({ status: 'cancel' });   //, { transaction }

        // Check for existing order log
        const existingOrderLog = await sequelize.models.OrderLog.findOne({
            where: {
                order_id: order.id,
                user_id: order.user_id,
                status: 'cancel'
            }
        });

        if (existingOrderLog) {
            // Update existing order log
            await existingOrderLog.update({
                status: 'cancel',
                label: 'Payment Cancelled via Worldpay',
                // additional_info: JSON.stringify({
                //     eventId: webhookData.eventId,
                //     eventTimestamp: webhookData.eventTimestamp,
                //     eventDate: webhookData.eventDetails.date,
                //     transactionId: webhookData.eventDetails.transactionReference,
                //     downstreamReference: webhookData.eventDetails.downstreamReference,
                //     amount: convertedAmount.value,
                //     currency: convertedAmount.currencyCode,
                //     type: webhookData.eventDetails.type,
                //     classification: webhookData.eventDetails.classification,
                //     paymentLink: webhookData.eventDetails._links?.payment?.href
                // })
            });
        } else {
            // Create new order log
            await sequelize.models.OrderLog.create({
                order_id: order.id,
                user_id: order.user_id,
                status: 'cancel',
                label: 'Payment Cancelled via Worldpay',
                // additional_info: JSON.stringify({
                //     eventId: webhookData.eventId,
                //     eventTimestamp: webhookData.eventTimestamp,
                //     eventDate: webhookData.eventDetails.date,
                //     transactionId: webhookData.eventDetails.transactionReference,
                //     downstreamReference: webhookData.eventDetails.downstreamReference,
                //     amount: convertedAmount.value,
                //     currency: convertedAmount.currencyCode,
                //     type: webhookData.eventDetails.type,
                //     classification: webhookData.eventDetails.classification,
                //     paymentLink: webhookData.eventDetails._links?.payment?.href
                // })
            });

            
        }

        // Check for existing transaction
        const existingTransaction = await sequelize.models.Transaction.findOne({
            where: {
                orderId: order.id,
                userId: order.user_id,
                referenceNumber: orderCode,
                // status: 'CANCELLED'
            }
        });
        if (existingTransaction) {
            // Update existing transaction
            await existingTransaction.update({
                status: 'CANCELLED',
                amount: amount,
                currency: currency,
                notes: 'Payment cancelled',
                // metadata: {
                //     eventId: webhookData.eventId,
                //     eventTimestamp: webhookData.eventTimestamp,
                //     eventDate: webhookData.eventDetails.date,
                //     type: webhookData.eventDetails.type,
                //     classification: webhookData.eventDetails.classification,
                //     paymentLink: webhookData.eventDetails._links?.payment?.href
                // }
            });

            
        } else {
            // Create new transaction record
            await sequelize.models.Transaction.create({
                userId: order.user_id,
                orderId: order.id,
                paymentMethod: 'worldpay',
                transactionType: 'PURCHASE',
                amount: amount,
                currency: currency,
                status: 'CANCELLED',
                referenceNumber: orderCode,
                notes: 'Payment cancelled',
                // metadata: {
                //     eventId: webhookData.eventId,
                //     eventTimestamp: webhookData.eventTimestamp,
                //     eventDate: webhookData.eventDetails.date,
                //     type: webhookData.eventDetails.type,
                //     classification: webhookData.eventDetails.classification,
                //     paymentLink: webhookData.eventDetails._links?.payment?.href
                // }
            });

            
        }

        // Create cancelled notification
        await createNotification({
            userId: order.user_id,
            type: 'payment',
            action: 'cancelled',
            data: {
                amount: amount,
                currency: currency,
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                reason: 'Cancelled via Worldpay'
            },
            title: 'Payment Cancelled',
            url: '/my-account/orders'
        });

        // Create admin notification for cancelled payment
        await createNotification({
            type: 'payment',
            action: 'cancelled',
            data: {
                amount: amount,
                currency: currency,
                orderId: order.id,
                orderUniqueId: order.order_unique_id,
                orderCode: order.order_code,
                customerEmail: order.user?.email,
                reason: 'Payment cancelled via Worldpay'
            },
            title: 'Payment Cancelled',
            url: '/admin/orders',
            is_admin: true
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
                amount: amount,
                currency: currency,
                message: 'Payment has been cancelled',
                // eventId: webhookData.eventId,
                transactionReference: orderCode,
                // eventDate: webhookData.eventDetails.date,
                supportEmail: process.env.SUPPORT_EMAIL || 'support@example.com'
            }
        };

        await sendEmail(emailData.to, emailData.emailTypes, emailData.context);
        

        
        return successResponse(res, {
            message: "payment cancelled",
            data: {
                order_code: order.order_code,
                payment_method: 'Worldpay',
                order_details: {
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    order_code: order.order_code,
                    status: order.status,
                    amount: amount,
                }}}, "Success");
    } catch (error) {
        // Log the main error with comprehensive details
        
        
        
        
        return errorResponse(res, error, error.message);
    }
};