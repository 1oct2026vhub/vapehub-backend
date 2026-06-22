const {
    Order,
    OrderItem,
    User,
    Product,
    ProductVariant,
    ProductVariantAttribute,
    Attribute,
    AttributeTerm,
    ShippingMethod,
    OrderAddress,
    sequelize,
} = require('../../../../models');
const { Op } = require('sequelize');
const { orderStatus } = require('../../../../config/constants');
const { createNotification } = require('../../../notification/helper/notification.helper');
const { createShipStationOrder } = require('../../shipStation/domain/shipStation.controller');

const BULK_ORDER_INCLUDES = [
    {
        model: User,
        as: 'user',
        attributes: ['id', 'first_name', 'last_name', 'email'],
        paranoid: false
    },
    {
        model: OrderItem,
        as: 'orderItems',
        attributes: ['id', 'product_id', 'variant_id', 'quantity', 'unit_price', 'unit'],
        include: [
            {
                model: Product,
                as: 'product',
                paranoid: false,
                attributes: ['id', 'name', 'sku', 'slug']
            },
            {
                model: ProductVariant,
                as: 'variant',
                paranoid: false,
                attributes: ['id', 'stock', 'sku', 'slug', 'weight'],
                include: [
                    {
                        model: ProductVariantAttribute,
                        as: 'variantAttributes',
                        paranoid: false,
                        attributes: ['id', 'variant_id', 'attribute_id', 'term_id'],
                        include: [
                            {
                                model: Attribute,
                                as: 'attribute',
                                paranoid: false,
                                attributes: ['id', 'name']
                            },
                            {
                                model: AttributeTerm,
                                as: 'term',
                                paranoid: false,
                                attributes: ['id', 'attribute_id', 'name']
                            }
                        ]
                    }
                ]
            }
        ]
    },
    {
        model: ShippingMethod,
        as: 'shippingMethod',
        attributes: ['id', 'shipping_method', 'shipping_cost', 'service_code', 'carrier_code', 'requestedShippingService']
    },
    {
        model: OrderAddress,
        as: 'orderShippingAddress',
        attributes: ['id', 'name', 'last_name', 'street', 'town', 'region', 'post_code', 'phone']
    },
    {
        model: OrderAddress,
        as: 'orderBillingAddress',
        attributes: ['id', 'name', 'last_name', 'street', 'town', 'region', 'post_code', 'phone']
    }
];

function getOrderCustomerEmail(order) {
    return order.user?.email || order.email || null;
}

async function safeRollback(transaction) {
    if (transaction && !transaction.finished) {
        await transaction.rollback();
    }
}

async function loadOrderForStatusUpdate(orderId) {
    return Order.findByPk(orderId, { include: BULK_ORDER_INCLUDES });
}

async function processOrderStatusUpdate({
    orderId,
    status,
    userId,
    createLabel = false,
    order: preloadedOrder = null,
}) {
    let order = preloadedOrder;

    if (!order) {
        const preTx = await sequelize.transaction();
        try {
            order = await Order.findByPk(orderId, {
                include: BULK_ORDER_INCLUDES,
                lock: preTx.LOCK.UPDATE,
                transaction: preTx,
            });

            if (!order) {
                await preTx.commit();
                return {
                    success: false,
                    skipped: false,
                    order_id: orderId,
                    error: 'Order not found',
                };
            }

            if (order.status === status) {
                await preTx.commit();
                return {
                    success: true,
                    skipped: true,
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    status,
                    message: 'Order already has the target status',
                    shipstation_data: order.shipstation_order_id
                        ? { order_id: order.shipstation_order_id }
                        : null,
                };
            }

            await preTx.commit();
        } catch (err) {
            await safeRollback(preTx);
            throw err;
        }
    } else if (order.status === status) {
        return {
            success: true,
            skipped: true,
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            status,
            message: 'Order already has the target status',
            shipstation_data: order.shipstation_order_id
                ? { order_id: order.shipstation_order_id }
                : null,
        };
    }

    let shipStationResponse = null;
    if (status === orderStatus.PACKED) {
        if (order.shipstation_order_id) {
            shipStationResponse = { orderResponse: { orderId: order.shipstation_order_id } };
        } else {
            if (!getOrderCustomerEmail(order)) {
                return {
                    success: false,
                    skipped: false,
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    error: 'Invalid order data: missing customer email',
                    status: order.status,
                };
            }

            try {
                shipStationResponse = await createShipStationOrder(order, { createLabel });
            } catch (shipStationError) {
                const errorMsg = shipStationError.message || shipStationError.toString();
                return {
                    success: false,
                    skipped: false,
                    order_id: order.id,
                    order_unique_id: order.order_unique_id,
                    error: `Failed to create ShipStation order: ${errorMsg}`,
                    status: order.status,
                };
            }
        }
    }

    const transaction = await sequelize.transaction();
    try {
        const locked = await Order.findByPk(orderId, {
            include: BULK_ORDER_INCLUDES,
            lock: transaction.LOCK.UPDATE,
            transaction,
        });

        if (!locked) {
            await transaction.commit();
            return {
                success: false,
                skipped: false,
                order_id: orderId,
                error: 'Order not found',
            };
        }

        if (locked.status === status) {
            await transaction.commit();
            return {
                success: true,
                skipped: true,
                order_id: locked.id,
                order_unique_id: locked.order_unique_id,
                status,
                message: 'Order already has the target status',
                shipstation_data: shipStationResponse ? {
                    order_id: shipStationResponse.orderResponse?.orderId,
                } : (locked.shipstation_order_id ? { order_id: locked.shipstation_order_id } : null),
            };
        }

        await locked.update({
            status,
            updated_by: userId
        }, {
            isAdmin: true,
            userId: userId,
            transaction
        });

        if (status === orderStatus.CANCEL) {
            for (const item of locked.orderItems) {
                if (item.variant) {
                    await item.variant.increment('stock', {
                        by: item.quantity
                    }, { transaction });
                }
            }
        }

        await transaction.commit();

        await createNotification({
            userId: locked.user_id,
            type: 'system',
            action: 'alert',
            data: {
                message: `Your order #${locked.order_unique_id} status has been updated to ${status}`
            },
            title: 'Order Status Updated',
            url: `/order-details/${locked.id}`
        });

        return {
            success: true,
            skipped: false,
            order_id: locked.id,
            order_unique_id: locked.order_unique_id,
            status,
            shipstation_data: shipStationResponse ? {
                order_id: shipStationResponse.orderResponse?.orderId,
                label_data: shipStationResponse.labelResponse ? {
                    shipment_id: shipStationResponse.labelResponse.shipmentId,
                    tracking_number: shipStationResponse.labelResponse.trackingNumber,
                    shipment_cost: shipStationResponse.labelResponse.shipmentCost
                } : null
            } : null
        };
    } catch (orderError) {
        await safeRollback(transaction);
        return {
            success: false,
            skipped: false,
            order_id: order.id,
            order_unique_id: order.order_unique_id,
            error: orderError.message,
            status: order.status,
        };
    }
}

async function loadOrdersForStatusUpdate(orderIds) {
    return Order.findAll({
        where: { id: { [Op.in]: orderIds } },
        include: BULK_ORDER_INCLUDES
    });
}

module.exports = {
    BULK_ORDER_INCLUDES,
    loadOrderForStatusUpdate,
    loadOrdersForStatusUpdate,
    processOrderStatusUpdate,
    getOrderCustomerEmail,
};
