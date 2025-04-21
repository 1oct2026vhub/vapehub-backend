const { errorResponse, successResponse } = require("../../../utils/responseUtils");
const { getVivaAccessToken, createVivaOrder } = require("../helper/payment.helper");
const { Order, OrderItem, Product, ProductVariant, sequelize } = require("../../../models");
const logger = require("../../../library/logger");
const crypto = require("crypto");
const { createNotification } = require('../../notification/helper/notification.helper');
const sendEmail = require('../../../library/sendEmail');

module.exports.handleVivaWalletWebhook = async (req, res) => {
    try {
        const webhookData = req.body;
        
        // Verify webhook signature if needed
        // const signature = req.headers['x-viva-signature'];
        // if (!verifySignature(signature, webhookData)) {
        //     return errorResponse(res, {}, 'Invalid webhook signature', 401);
        // }

        // Check if this is an order update event
        if (webhookData.EventTypeId == 4865) {
        

            const { EventData } = webhookData;
            const { OrderCode, IsCancelled } = EventData;

            // Find the order in our database
            const order = await Order.findOne({
                where: { 
                    order_code: OrderCode.toString()
                },
                include: [
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
                }
                ]
            });

            if (!order) {
                return errorResponse(res, {}, 'Order not found in database', 404);
            }

            // Handle cancelled order
            if (IsCancelled) {
                // Update order status to cancelled
                await order.update({ 
                    status: 'cancel'
                });

                // Create order log for cancellation
                await sequelize.models.OrderLog.create({
                    order_id: order.id,
                    user_id: order.user_id,
                    status: 'cancel',
                    label: 'Order Cancelled via Viva Wallet'
                });

                // Create notification for cancellation
                await createNotification({
                    userId: order.user_id,
                    type: 'order',
                    action: 'cancelled',
                    data: {
                        orderId: order.id,
                        orderCode: order.order_code,
                        reason: 'Cancelled via Viva Wallet'
                    }
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
            }

            // Return success response
            return successResponse(res, {
                message: 'Webhook processed successfully',
                orderId: order.id,
                orderCode: order.order_code,
                status: order.status
            });

        }

    } catch (error) {
        console.error('Error processing Viva Wallet webhook:', error);
        return errorResponse(res, error, 'Failed to process webhook');
    }
};

